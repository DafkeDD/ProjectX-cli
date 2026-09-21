import { existsSync } from 'node:fs'

// .env laden zonder extra package. Waarden die al in de omgeving staan
// (bv. in Docker of CI) blijven voorgaan.
if (existsSync('.env')) process.loadEnvFile('.env')

const required = (name: string): string => {
    const value = process.env[name]
    if (!value) throw new Error(`${name} ontbreekt in .env`)
    return value
}

const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')

/**
 * Alle instellingen op één plek, met terugvalwaarden.
 * Gebruik overal `env.*` — nooit process.env rechtstreeks.
 */
export const env = {
    appName: process.env.APP_NAME || 'ProjectX Hub',
    port: Number(process.env.PORT) || 4000,
    /** Publiek adres van de hub = de frontend (die stuurt /oidc, /api en /interaction door). */
    frontendUrl,
    /** OIDC-issuer: altijd via de frontend, nooit rechtstreeks de backend. */
    issuer: `${frontendUrl}/oidc`,
    production: process.env.NODE_ENV === 'production',
    /**
     * Cookies krijgen `Secure` zodra de hub op https draait — dus ook als
     * NODE_ENV niet gezet is. Op http (ontwikkeling) kan het niet.
     */
    secureCookies: frontendUrl.startsWith('https://') && process.env.ALLOW_INSECURE_COOKIES !== '1',
    /** Links van e-mails ook in de log tonen (enkel voor ontwikkeling). */
    mailDebug: process.env.MAIL_DEBUG === '1',

    db: {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        database: 'projectx_hub',
        user: 'projectx_hub',
        password: () => required('HUB_DB_PASSWORD'),
        /** 32 bytes (base64): versleutelt sleutels, registratietokens en client-secrets. */
        secretKey: () => required('HUB_SECRET_KEY')
    },

    mail: {
        host: process.env.SMTP_HOST || 'localhost',
        port: Number(process.env.SMTP_PORT) || 1025,
        user: process.env.SMTP_USER || '',
        password: process.env.SMTP_PASSWORD || '',
        from: process.env.MAIL_FROM || 'ProjectX Hub <no-reply@localhost>'
    }
} as const
