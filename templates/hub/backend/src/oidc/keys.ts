import { generateKeyPairSync, randomBytes } from 'node:crypto'
import type { JWK } from 'oidc-provider'
import { decrypt, encrypt } from '../db/crypto.js'
import { hub } from '../db/hub.js'

/**
 * Sleutels van de OIDC-server, bewaard in settings (versleuteld met HUB_SECRET_KEY).
 * De eerste keer worden ze aangemaakt. Zo hebben alle backends dezelfde sleutels
 * en overleven ze een herstart.
 */
async function secret<T>(key: string, create: () => T): Promise<T> {
    const row = await hub.one<{ value: { enc: string } }>('select value from settings where key = $1', [key])
    if (row) return JSON.parse(decrypt(row.value.enc)) as T
    const value = create()
    await hub.query('insert into settings (key, value) values ($1, $2) on conflict (key) do nothing', [
        key,
        { enc: encrypt(JSON.stringify(value)) }
    ])
    // Een tweede backend kan tegelijk gestart zijn: de waarde uit de database wint.
    const saved = await hub.one<{ value: { enc: string } }>('select value from settings where key = $1', [key])
    return JSON.parse(decrypt(saved!.value.enc)) as T
}

/** RS256-ondertekensleutel voor id-tokens (JWKS). */
export const signingKeys = () =>
    secret<{ keys: JWK[] }>('oidc.jwks', () => {
        const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
        const jwk = privateKey.export({ format: 'jwk' }) as JWK
        return { keys: [{ ...jwk, kid: randomBytes(8).toString('hex'), use: 'sig', alg: 'RS256' }] }
    })

/** Sleutels om de cookies van de OIDC-server te ondertekenen. */
export const cookieKeys = () => secret<string[]>('oidc.cookieKeys', () => [randomBytes(32).toString('base64url')])
