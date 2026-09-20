import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { runOutput, runQuiet } from '../../utils/exec.js'
import { withProgress } from '../../utils/progress.js'
import { orCancel } from '../../utils/prompt.js'
import { formatAll } from '../../utils/prettier.js'
import type { PackageManager } from '../../types.js'
import type { I18nConfig } from '../i18n.js'
import { i18nFiles } from '../backend/shared.js'
import { dbFiles } from '../database/templates.js'
import { HUB_DB, type DatabaseChoice } from '../database/index.js'

/** Map met de bestanden van de hub (in de CLI-repo: templates/hub). */
const TEMPLATES = fileURLToPath(new URL('../../../templates/hub', import.meta.url))

export type Sso = 'none' | 'hub' | 'connect'

/** Vraag bovenaan: login via een OIDC-server (SSO)? */
export async function askSso(): Promise<Sso> {
    for (;;) {
        const sso = orCancel(
            await p.select<Sso>({
                message: 'OIDC / SSO?',
                initialValue: 'none',
                options: [
                    { value: 'none', label: 'Geen', hint: 'een app zonder login' },
                    {
                        value: 'hub',
                        label: 'Nieuwe OIDC-server (SSO-hub)',
                        hint: 'registreren, inloggen, organisaties en beheer — eigen frontend + backend + database'
                    },
                    {
                        value: 'connect',
                        label: 'Aansluiten op een bestaande OIDC-server',
                        hint: 'komt in fase 3'
                    }
                ]
            })
        )
        if (sso !== 'connect') return sso
        p.log.warn('Aansluiten op een bestaande hub komt in de volgende fase. Kies voorlopig Geen of een nieuwe hub.')
    }
}

export interface HubAdmin {
    email: string
    name: string
    password: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const strong = (v: string) => v.length >= 10 && /\p{L}/u.test(v) && /\d/.test(v)

/** Vraag: de eerste beheerder van de hub. */
export async function askHubAdmin(): Promise<HubAdmin> {
    p.log.info(`De eerste beheerder van de hub ${pc.dim('(kan inloggen en registratietokens beheren)')}`)
    const email = orCancel(
        await p.text({
            message: 'E-mailadres van de beheerder?',
            validate: v => (v && EMAIL_RE.test(v.trim()) ? undefined : 'Een geldig e-mailadres, aub.')
        })
    ).trim()
    const name = orCancel(
        await p.text({
            message: 'Naam van de beheerder?',
            validate: v => (v?.trim() ? undefined : 'Vul een naam in.')
        })
    ).trim()
    for (;;) {
        const password = orCancel(
            await p.password({
                message: 'Wachtwoord van de beheerder?',
                validate: v => (v && strong(v) ? undefined : 'Minstens 10 tekens, met een letter en een cijfer.')
            })
        )
        const again = orCancel(await p.password({ message: 'Nog een keer?' }))
        if (again === password) return { email, name, password }
        p.log.error('De wachtwoorden zijn niet gelijk.')
    }
}

/** Kopieert een map uit templates/hub naar het project (bestaande bestanden worden overschreven). */
function copyDir(from: string, to: string): void {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const src = path.join(from, entry.name)
        const dest = path.join(to, entry.name)
        if (entry.isDirectory()) {
            fs.mkdirSync(dest, { recursive: true })
            copyDir(src, dest)
        } else {
            fs.copyFileSync(src, dest)
        }
    }
}

function writeFiles(target: string, files: Record<string, string>): void {
    for (const [name, content] of Object.entries(files)) {
        const file = path.join(target, name)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, content.endsWith('\n') ? content : content + '\n', 'utf8')
    }
}

function editPackage(target: string, edit: (pkg: { scripts: Record<string, string> }) => void): void {
    const file = path.join(target, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
    pkg.scripts ??= {}
    edit(pkg)
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

const HUB_ENV = (db: DatabaseChoice, secret: string | null, secretKey: string | null) => `
# ---- Hub-database (PostgreSQL) — zie docs/hub.md ----
DB_HOST=${db.mode === 'docker' ? 'localhost' : db.admin.host}
DB_PORT=${db.admin.port}
# Wachtwoord van de rol ${HUB_DB}.
HUB_DB_PASSWORD=${secret ? `"${secret}"` : ''}
# 32 bytes (base64): versleutelt de ondertekensleutels, registratietokens en client-secrets.
# NOOIT wijzigen of verliezen.
HUB_SECRET_KEY=${secretKey ? `"${secretKey}"` : ''}

# ---- E-mail (SMTP) ----
# In ontwikkeling: Mailpit (localhost:1025, web op :8025) of geen mailserver —
# dan staan de links in de log van de backend.
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM="ProjectX Hub <no-reply@localhost>"
`

const HUB_AGENTS = `## SSO-hub (OIDC-server) — zie docs/hub.md

- Dit is de OIDC-server van alle apps (\`oidc-provider\`, gemount op \`/oidc\`). Registreren kan ENKEL hier.
- Alles in één database \`projectx_hub\` (9 tabellen, \`migrations/hub/\`). Geen ORM: \`hub\` uit \`src/db/hub.ts\`.
- Tijdelijke codes (e-mailbevestiging, wachtwoord vergeten, hub-sessies, GrantOrg) staan in \`oidc_store\`, enkel als
  hash (\`src/auth/codes.ts\`).
- Wachtwoorden: scrypt (\`src/auth/password.ts\`). Geheimen versleuteld met \`HUB_SECRET_KEY\` (\`src/db/crypto.ts\`).
- Belangrijke acties schrijven een event (\`recordEvent\`, tabel \`events\`) — ook voor de auditlog.
- Schermen zijn pagina's van de frontend; de backend geeft enkel JSON (behalve \`/oidc\`).
- Beheer: \`npm run hub:admin -- <e-mail> "<naam>"\`, \`npm run hub:token -- "<naam>"\`,
  \`npm run hub:app -- <appKey> "<naam>" <redirect-url>\`.

`

const HUB_DOCS = (frontendUrl: string, backendPort: number) => `# SSO-hub

De OIDC-server van alle ProjectX-apps. Gebruikers registreren en loggen hier in; apps sturen hun gebruikers hierheen.

| Wat | Waar |
| --- | --- |
| Publiek adres (issuer) | \`${frontendUrl}/oidc\` |
| Discovery | \`${frontendUrl}/oidc/.well-known/openid-configuration\` |
| Backend (enkel intern) | \`http://localhost:${backendPort}\` |
| Database | \`${HUB_DB}\` (rol \`${HUB_DB}\`) |

De frontend stuurt \`/oidc/*\`, \`/api/*\` en \`/interaction/<uid>/<actie>\` door naar de backend: voor de browser is de
hub één adres, dus alle cookies zijn van dezelfde site.

## Aanmelden bij een app

1. De app stuurt de browser naar \`/oidc/auth\` (authorization code + PKCE).
2. oidc-provider stuurt door naar \`/interaction/<uid>\` (pagina van de frontend).
3. Stap **login**: e-mail + wachtwoord — of "Verder als …" als je al in de hub bent aangemeld.
4. Stap **consent**: organisatie kiezen (bij één organisatie gebeurt dat vanzelf). De keuze staat als \`GrantOrg\` in
   \`oidc_store\`.
5. Terug naar de app met een code; de app haalt tokens op.

Claims (scope \`organization\`): \`org_id\`, \`tenant_key\`, \`org_name\`, \`org_role\` — in het id-token, userinfo en het
access token. Andere organisatie kiezen: de app vraagt opnieuw aan met \`prompt=consent\`.

## Tabellen (${HUB_DB})

| Tabel | Inhoud |
| --- | --- |
| \`accounts\` | gebruikers (scrypt-hash, status pending/active/disabled, is_admin) |
| \`organizations\` | tenants; \`tenant_key\` = eerste 12 hex-tekens van de id |
| \`memberships\` | wie in welke organisatie, rol owner/admin/member, \`apps\` = seats |
| \`apps\` | aangesloten apps = OIDC-clients (secret versleuteld) |
| \`licenses\` | licentie per organisatie per app (volgende stap: Mollie) |
| \`registration_tokens\` | tokens om apps aan te sluiten (versleuteld + hash) |
| \`oidc_store\` | alles van oidc-provider + EmailVerification, PasswordReset, HubSession, GrantOrg |
| \`events\` | auditlog (en later de wachtrij naar de apps) |
| \`settings\` | ondertekensleutels en cookie-sleutels (versleuteld) |

## Events (auditlog)

\`account.registered\` · \`account.verified\` · \`account.login\` (via hub of oidc) · \`account.password_reset\` ·
\`registration_token.created\` · \`.updated\` · \`.revealed\` · \`.renewed\` · \`.revoked\`

## Commando's

\`\`\`bash
npm run db:migrate
npm run hub:admin -- jan@voorbeeld.be "Jan"          # beheerder maken of maken tot beheerder
npm run hub:token -- "Klantportaal"                  # registratietoken
npm run hub:app -- demo "Demo" http://localhost:5555/callback   # app handmatig aansluiten (test)
\`\`\`

## E-mail

SMTP uit \`.env\`. Zonder mailserver (ontwikkeling) staan de links in de log van de backend.
`

export interface HubBackendOptions {
    i18n: I18nConfig
    db: DatabaseChoice
    dbPassword: string
    admin: HubAdmin
    frontendUrl: string
    port: number
}

/**
 * De hub-backend: vervangt het voorbeeld van nest new door de OIDC-server,
 * de auth-API en het beheer, met eigen database en eerste beheerder.
 */
export async function applyHubBackend(target: string, pm: PackageManager, o: HubBackendOptions): Promise<string> {
    let firstToken = ''
    await withProgress('SSO-hub: OIDC-server in de backend', async update => {
        update('Bestanden')
        for (const file of ['app.controller.ts', 'app.service.ts', 'app.controller.spec.ts']) {
            fs.rmSync(path.join(target, 'src', file), { force: true })
        }
        fs.rmSync(path.join(target, 'test', 'app.e2e-spec.ts'), { force: true })
        copyDir(path.join(TEMPLATES, 'backend'), target)
        const shared = dbFiles()
        writeFiles(target, {
            'src/db/sql.ts': shared['src/db/sql.ts']!,
            'src/db/crypto.ts': shared['src/db/crypto.ts']!,
            'src/db/migrate.ts': shared['src/db/migrate.ts']!,
            ...Object.fromEntries(
                Object.entries(i18nFiles(o.i18n.locales, o.i18n.defaultLocale, true)).map(([f, c]) => [
                    `src/i18n/${f}`,
                    c
                ])
            ),
            'docs/hub.md': HUB_DOCS(o.frontendUrl, o.port)
        })
        fs.appendFileSync(
            path.join(target, '.env'),
            HUB_ENV(o.db, o.dbPassword, randomBytes(32).toString('base64')),
            'utf8'
        )
        fs.appendFileSync(path.join(target, '.env.example'), HUB_ENV(o.db, null, null), 'utf8')
        const agents = path.join(target, 'AGENTS.md')
        fs.writeFileSync(
            agents,
            fs.readFileSync(agents, 'utf8').replace('## Code-stijl', HUB_AGENTS + '## Code-stijl'),
            'utf8'
        )

        update('oidc-provider, pg en nodemailer installeren')
        await runQuiet(
            pm,
            ['install', 'oidc-provider@latest', 'pg@latest', 'nodemailer@latest', 'express@latest'],
            target
        )
        await runQuiet(
            pm,
            [
                'install',
                '--save-dev',
                '@types/oidc-provider@latest',
                '@types/pg@latest',
                '@types/nodemailer@latest',
                'tsx@latest'
            ],
            target
        )

        const cli = 'tsx src/db/cli.ts'
        editPackage(target, pkg => {
            pkg.scripts.lint = 'oxlint src/'
            delete pkg.scripts['test:e2e']
            Object.assign(pkg.scripts, {
                'db:migrate': `${cli} migrate`,
                'hub:admin': `${cli} admin`,
                'hub:token': `${cli} token`,
                'hub:app': `${cli} app`
            })
        })

        update('Database migreren + eerste beheerder')
        await runQuiet(pm, ['run', 'db:migrate'], target)
        await runOutput(pm, ['run', 'hub:admin', '--', o.admin.email, o.admin.name], target, {
            HUB_ADMIN_PASSWORD: o.admin.password
        })
        const out = await runOutput(pm, ['run', '--silent', 'hub:token', '--', 'Eerste token'], target, {})
        firstToken = out.match(/pxr_[A-Za-z0-9_-]+/)?.[0] ?? ''

        update('Formatteren')
        await formatAll(pm, target)
    })
    p.log.success(`SSO-hub klaar ${pc.dim(`(OIDC op ${o.frontendUrl}/oidc · uitleg in backend/docs/hub.md)`)}`)
    return firstToken
}

const HUB_FRONTEND_AGENTS = `
## SSO-hub (frontend)

- Dit is de frontend van de OIDC-server. \`/oidc\`, \`/api\` en \`/interaction/<uid>/<actie>\` gaan door naar de backend
  (next.config.ts, beforeFiles) — voor de browser is de hub één adres.
- Pagina's: \`/login\`, \`/register\`, \`/verify\`, \`/forgot\`, \`/reset\`, \`/interaction/[uid]\` (aanmelden bij een app),
  \`/error\`, \`/\` (account) en \`/admin/tokens\` (beheer). Teksten in de namespace \`Hub\` van messages/*.json.
- In client components: \`api\` uit \`@/lib/api\` (zelfde adres). In server components: \`requireMe()\` uit
  \`@/lib/session\`.
`

/** Next.config: /oidc, /api en de knoppen van het inlogscherm doorsturen naar de backend. */
const REWRITES = `    /**
     * De hub is één adres: /oidc (de OIDC-server), /api en de knoppen van het
     * inlogscherm (/interaction/<uid>/<actie>) gaan door naar de backend.
     * Zo zijn alle cookies van dezelfde site.
     */
    async rewrites() {
        const backend = (process.env.API_INTERNAL_URL || 'http://localhost:4000').replace(/\\/+$/, '')
        return {
            beforeFiles: [
                { source: '/oidc/:path*', destination: \`\${backend}/oidc/:path*\` },
                { source: '/api/:path*', destination: \`\${backend}/api/:path*\` },
                { source: '/interaction/:uid/:action', destination: \`\${backend}/interaction/:uid/:action\` }
            ]
        }
    },

`

/** De hub-frontend: schermen voor aanmelden, registreren, account en beheer. */
export function applyHubFrontend(target: string, i18n: I18nConfig, backendPort: number): void {
    copyDir(path.join(TEMPLATES, 'frontend'), target)
    fs.rmSync(path.join(target, 'src', 'components', 'BackendStatus.tsx'), { force: true })

    // Teksten van de hub in elke gekozen taal.
    const hub = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'messages.json'), 'utf8')) as Record<string, unknown>
    for (const locale of i18n.locales) {
        const file = path.join(target, 'messages', `${locale}.json`)
        const messages = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
        delete messages.HomePage
        delete messages.Backend
        messages.Hub = hub[locale]
        fs.writeFileSync(file, JSON.stringify(messages, null, 4) + '\n', 'utf8')
    }

    // next.config.ts: doorsturen naar de backend.
    const config = path.join(target, 'next.config.ts')
    let source = fs.readFileSync(config, 'utf8')
    if (!source.includes('async rewrites()')) {
        source = source.replace('    /**\n     * Vangnet: de taal', `${REWRITES}    /**\n     * Vangnet: de taal`)
        if (!source.includes('async rewrites()'))
            throw new Error('next.config.ts: rewrites konden niet toegevoegd worden.')
        fs.writeFileSync(config, source, 'utf8')
    }

    // proxy.ts (next-intl): /oidc en de knoppen van het inlogscherm niet aanraken.
    const proxy = path.join(target, 'src', 'proxy.ts')
    let matcher = fs.readFileSync(proxy, 'utf8')
    matcher = matcher
        .replace('(?:api|trpc)(?:/|$)|', '(?:api|oidc|trpc)(?:/|$)|interaction/[^/]+/|')
        .replace(
            '// Alles behalve /api/..., /trpc/...,',
            '// Alles behalve /api/..., /oidc/..., /trpc/..., /interaction/<uid>/<actie>,'
        )
    if (!matcher.includes('oidc|trpc')) throw new Error('src/proxy.ts: matcher kon niet aangepast worden.')
    fs.writeFileSync(proxy, matcher, 'utf8')

    // .env: de browser praat met de hub zelf; de server met de backend.
    const internal = `\n# Adres van de backend vanaf de server (doorsturen van /oidc, /api, /interaction + server components).\nAPI_INTERNAL_URL="http://localhost:${backendPort}"\n`
    for (const name of ['.env', '.env.example']) {
        const file = path.join(target, name)
        const env = fs
            .readFileSync(file, 'utf8')
            .replace(
                '# Adres van de backend (API). Gebruik in de code: env.apiUrl.',
                '# Publiek adres van de hub (deze frontend). De browser praat altijd met dit adres;\n# /api, /oidc en /interaction gaan door naar de backend. In de code: env.apiUrl.'
            )
        fs.writeFileSync(file, env.trimEnd() + '\n' + internal, 'utf8')
    }

    // Regels: de demo-regel over BackendStatus weg, de hub-regels erbij (binnen het regelblok).
    for (const name of ['AGENTS.md', 'PROJECT-RULES.md']) {
        const file = path.join(target, name)
        if (!fs.existsSync(file)) continue
        let rules = fs
            .readFileSync(file, 'utf8')
            .replace(
                '- `GET /health` gebruikt de startpagina (`src/components/BackendStatus.tsx`).',
                '- `GET /health` van de backend: status van de hub en de database.'
            )
        rules = rules.includes('<!-- END:projectx-rules -->')
            ? rules.replace(
                  '<!-- END:projectx-rules -->',
                  `${HUB_FRONTEND_AGENTS.trim()}\n\n<!-- END:projectx-rules -->`
              )
            : `${rules.trimEnd()}\n${HUB_FRONTEND_AGENTS}`
        fs.writeFileSync(file, rules, 'utf8')
    }
}
