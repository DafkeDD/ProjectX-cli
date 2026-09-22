// Beheer van de hub vanaf de commandolijn:
//   npm run db:migrate
//   npm run hub:admin -- <e-mail> "<naam>"            beheerder maken (wachtwoord wordt gevraagd)
//   npm run hub:token -- "<naam>"                      registratietoken aanmaken
//   npm run hub:app -- <appKey> "<naam>" <redirect-url>  app handmatig aansluiten (test)
//   npm run hub:seed -- <e-mail> "<naam>" "<organisatie>"  demo-account om mee te testen
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { hub, hubPool } from './hub.js'
import { encrypt } from './crypto.js'
import { runMigrations } from './migrate.js'
import { createAccount, findAccountByEmail } from '../hub/accounts.js'
import { hashPassword, isEmail, isStrongPassword } from '../auth/password.js'
import { createToken } from '../hub/registration-tokens.js'

const [command, ...args] = process.argv.slice(2)

async function ask(question: string): Promise<string> {
    // Wachtwoord via de omgeving (voor scripts) of interactief.
    if (process.env.HUB_ADMIN_PASSWORD) return process.env.HUB_ADMIN_PASSWORD
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try {
        return await rl.question(question)
    } finally {
        rl.close()
    }
}

async function main() {
    await runMigrations(hubPool, 'hub')
    switch (command) {
        case 'migrate':
            console.log('hub-database bijgewerkt')
            break

        case 'admin': {
            const [email, ...nameParts] = args
            const name = nameParts.join(' ').trim() || 'Beheerder'
            if (!isEmail(email)) throw new Error('Gebruik: npm run hub:admin -- <e-mail> "<naam>"')
            const password = await ask('Wachtwoord (min. 10 tekens, letter + cijfer): ')
            if (!isStrongPassword(password))
                throw new Error('Wachtwoord te zwak: minstens 10 tekens, met een letter en een cijfer.')
            const existing = await findAccountByEmail(email)
            if (existing) {
                await hub.query(
                    "update accounts set is_admin = true, status = 'active', password_hash = $2, email_verified_at = coalesce(email_verified_at, now()) where id = $1",
                    [existing.id, await hashPassword(password)]
                )
                console.log(`${email} is nu beheerder.`)
            } else {
                await createAccount({ email, name, password, status: 'active', isAdmin: true })
                console.log(`Beheerder aangemaakt: ${email}`)
            }
            break
        }

        case 'seed': {
            // Demo-account om mee te testen: actief, e-mail bevestigd, eigen organisatie.
            const [email, ...rest] = args
            if (!isEmail(email)) throw new Error('Gebruik: npm run hub:seed -- <e-mail> "<naam>" "<organisatie>"')
            const [name = 'Demo Gebruiker', organization = null] = rest
                .join(' ')
                .split('|')
                .map(part => part.trim())
            if (await findAccountByEmail(email)) throw new Error(`${email} bestaat al.`)
            const password = `Demo${randomBytes(6).toString('base64url')}1`
            const { organization: org } = await createAccount({
                email,
                name,
                password,
                organization,
                status: 'active'
            })
            console.log(`Demo-account: ${email} / ${password}\n  organisatie: ${org.name} (${org.tenant_key})`)
            break
        }

        case 'token': {
            const name = args.join(' ').trim() || 'Registratietoken'
            const { token } = await createToken({ name, expiresAt: null, maxUses: null, allowedDomains: [] }, null)
            console.log(`Registratietoken "${name}": ${token}`)
            break
        }

        case 'app': {
            const [appKey, name, redirect] = args
            if (!appKey || !/^[a-z][a-z0-9_]{1,19}$/.test(appKey) || !name || !redirect) {
                throw new Error('Gebruik: npm run hub:app -- <appKey> "<naam>" <redirect-url>')
            }
            const secret = randomBytes(32).toString('base64url')
            const origin = new URL(redirect).origin
            await hub.query(
                `insert into apps (id, name, client) values ($1, $2, $3)
                 on conflict (id) do update set name = excluded.name, client = excluded.client, updated_at = now()`,
                [
                    appKey,
                    name,
                    {
                        client_name: name,
                        client_secret: encrypt(secret),
                        redirect_uris: [redirect],
                        post_logout_redirect_uris: [`${origin}/`],
                        grant_types: ['authorization_code', 'refresh_token'],
                        response_types: ['code'],
                        token_endpoint_auth_method: 'client_secret_basic'
                    }
                ]
            )
            console.log(`App ${appKey} aangesloten.\n  client_id:     ${appKey}\n  client_secret: ${secret}`)
            break
        }

        default:
            throw new Error(`Onbekend commando: ${command ?? '(geen)'}`)
    }
}

main()
    .catch(error => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })
    .finally(() => hubPool.end())
