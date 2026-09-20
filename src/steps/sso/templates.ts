/** Stukken tekst en code die de CLI in een aangesloten app zet. */

/** Blok dat in backend/src/env.ts komt (na de database). */
export const ENV_OIDC = `,

    /** Draait de app in productie? (veilige cookies) */
    production: process.env.NODE_ENV === 'production',

    /** SSO-hub: registreren en inloggen gebeuren daar, niet in deze app. */
    oidc: {
        /** Issuer van de hub, bv. http://localhost:3000/oidc */
        issuer: (process.env.OIDC_ISSUER || '').replace(/\\/+$/, ''),
        clientId: () => required('OIDC_CLIENT_ID'),
        clientSecret: () => required('OIDC_CLIENT_SECRET'),
        /** Waarmee de hub zijn events ondertekent. */
        webhookSecret: () => required('HUB_WEBHOOK_SECRET'),
        /** Publiek adres van deze app: daar stuurt de hub de browser terug. */
        publicUrl,
        callbackUrl: \`\${publicUrl}/auth/callback\`
    }`

/** Regel die boven `export const env` komt. */
export const ENV_PUBLIC_URL = `/** Publiek adres van de app: de frontend, of (zonder frontend) de backend zelf. */
const publicUrl = (process.env.PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\\/+$/, '')
`

/** Waarden in backend/.env. */
export const envBlock = (
    input: { issuer: string; clientId: string; clientSecret: string; webhookSecret: string; publicUrl: string },
    withSecrets: boolean
): string => `
# ---- SSO-hub (OIDC) ----
# Waar de gebruiker inlogt. Registreren kan enkel in de hub.
OIDC_ISSUER="${input.issuer}"
OIDC_CLIENT_ID="${input.clientId}"
OIDC_CLIENT_SECRET="${withSecrets ? input.clientSecret : ''}"
# Waarmee de hub zijn events ondertekent (POST /hub/events).
HUB_WEBHOOK_SECRET="${withSecrets ? input.webhookSecret : ''}"
# Publiek adres van deze app: daar stuurt de hub de browser terug.
PUBLIC_URL="${input.publicUrl}"
`

/** next.config.ts van de frontend: alles via één adres. */
export const REWRITES = `    /**
     * Eén adres voor de bezoeker: /auth (inloggen via de hub), /api en /health
     * gaan door naar de backend. Zo is de sessie-cookie van dezelfde site.
     */
    async rewrites() {
        const backend = (process.env.API_INTERNAL_URL || 'http://localhost:4000').replace(/\\/+$/, '')
        return {
            beforeFiles: [
                { source: '/auth/:path*', destination: \`\${backend}/auth/:path*\` },
                { source: '/api/:path*', destination: \`\${backend}/api/:path*\` },
                { source: '/health', destination: \`\${backend}/health\` }
            ]
        }
    },

`

/** Uitleg in backend/docs/sso.md. */
export const DOCS_SSO = (input: {
    issuer: string
    clientId: string
    publicUrl: string
}): string => `# Inloggen via de SSO-hub

Deze app heeft **geen eigen registratie of wachtwoorden**. De gebruiker logt in bij de hub
(\`${input.issuer}\`); deze app krijgt een token met zijn account **en de gekozen organisatie**.

| Wat | Waarde |
| --- | --- |
| Hub (issuer) | \`${input.issuer}\` |
| client_id van deze app | \`${input.clientId}\` |
| Terugkeeradres | \`${input.publicUrl}/auth/callback\` |
| Sessie-cookie | \`px_app\` (httpOnly), sessies in de tabel \`sessions\` van de control-database |

## Inloggen

| Adres | Wat het doet |
| --- | --- |
| \`GET /auth/login?returnTo=/pagina\` | naar de hub (authorization code + PKCE) |
| \`GET /auth/switch?returnTo=/pagina\` | zelfde, maar de gebruiker mag een andere organisatie kiezen |
| \`GET /auth/callback\` | terug van de hub: tokens ophalen, tenant klaarzetten, sessie starten |
| \`GET /auth/logout\` | sessie hier weg, daarna afmelden bij de hub |
| \`GET /auth/me\` | \`{ account, organization }\` of 401 |

In de backend: \`sessionOf(req)\` geeft de sessie (met \`tenant_key\`, \`org_id\`, \`org_role\`).
Gebruik die \`tenant_key\` om met \`openTenantPool\` in de juiste database te werken.

## Tenant bij de eerste login

Logt iemand van een organisatie voor het eerst in, dan maakt de app haar database aan
(\`ensureTenant\`). Lukt dat niet, dan komt de gebruiker terug met \`?login=tenant\` en meldt
de app \`tenant.failed\` aan de hub.

## Events van de hub

De hub stuurt events naar \`POST /hub/events\` met een handtekening
(\`X-ProjectX-Signature\` = HMAC-SHA256 over \`<tijd>.<body>\`, \`X-ProjectX-Timestamp\` max 5 minuten oud).
Daarnaast haalt de app bij het opstarten en elke minuut op wat hij gemist heeft
(\`GET /api/events?after=\`). Elk event wordt precies één keer verwerkt (tabel \`processed_events\`).

| Event | Wat de app doet |
| --- | --- |
| \`organization.updated\` | naam van de tenant bijwerken |
| \`license.granted\` · \`.updated\` · \`.suspended\` · \`.revoked\` | licentie bij de tenant bewaren |
| \`seat.revoked\` · \`membership.removed\` | sessies van die gebruiker in die organisatie sluiten |
| \`user.disabled\` | alle sessies van die gebruiker sluiten |
| \`organization.disabled\` | alle sessies van die organisatie sluiten |

Eigen afhandeling? Zet ze in \`src/hub/events.ts\` (functie \`apply\`).
`

/** Regels voor AGENTS.md van de backend. */
export const AGENTS_RULES = (issuer: string): string => `
## Inloggen (SSO-hub)

- Deze app heeft **geen eigen registratie of wachtwoorden**: dat is de hub (\`${issuer}\`).
- De sessie komt uit \`sessionOf(req)\` (\`src/auth/flow.ts\`): \`account_id\`, \`org_id\`, \`tenant_key\`, \`org_role\`.
  Nooit zelf cookies of tokens lezen.
- Data van de gebruiker staat in de database van zijn organisatie: \`openTenantPool\` met \`session.tenant_key\`.
- De tenant-database wordt aangemaakt bij de **eerste login** (\`ensureTenant\`), nooit ergens anders.
- Events van de hub afhandelen? Enkel in \`src/hub/events.ts\` (functie \`apply\`); elk event komt hoogstens één keer aan bod.
- Uitleg: \`docs/sso.md\`.
`

/** Regels voor AGENTS.md van de frontend. */
export const FRONTEND_AGENTS = `
## Inloggen (SSO-hub)

- Aanmelden = de bezoeker naar \`/auth/login?returnTo=...\` sturen (gewone link/knop, geen router).
  \`/auth\`, \`/api\` en \`/health\` gaan via \`next.config.ts\` door naar de backend: één adres, dus de cookie werkt.
- Server components: \`getMe()\` (mag null zijn) of \`requireMe('/pagina')\` uit \`@/lib/session\`.
- Toon de gebruiker met \`<AuthPanel />\`; die heeft ook "andere organisatie" en "afmelden".
- Registreren, wachtwoord vergeten en organisaties beheren gebeuren in de hub, niet hier.
`
