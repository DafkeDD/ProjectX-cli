import { randomBytes, timingSafeEqual } from 'node:crypto'
import { decrypt, encrypt } from '../db/crypto.js'
import { hub } from '../db/hub.js'
import { useToken } from './registration-tokens.js'

/**
 * Apps = OIDC-clients van de hub. Een app sluit zich aan met een
 * registratietoken (fase 3, in de stijl van RFC 7591) of met `hub:app`.
 */
export interface App {
    id: string
    name: string
    client: Record<string, unknown> & { redirect_uris?: string[] }
    webhook_url: string | null
    status: 'active' | 'disabled'
    created_at: Date
}

const APP_KEY_RE = /^[a-z][a-z0-9_]{1,19}$/

const secret = () => randomBytes(32).toString('base64url')

/** Waar mag de hub naartoe sturen? https, of http op de eigen machine. */
export function checkRedirectUris(uris: unknown): string[] | null {
    if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10) return null
    const checked: string[] = []
    for (const raw of uris) {
        if (typeof raw !== 'string' || raw.length > 500) return null
        let url: URL
        try {
            url = new URL(raw)
        } catch {
            return null
        }
        const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null
        if (url.hash) return null
        checked.push(url.toString())
    }
    return checked
}

export const hostsOf = (uris: string[]): string[] => [...new Set(uris.map(u => new URL(u).hostname))]

/**
 * Waar de hub events naartoe stuurt. Alleen https (of http op de eigen machine,
 * voor ontwikkeling): anders kan iemand met een token de hub verzoeken laten
 * doen naar een adres in het interne netwerk.
 */
export function checkWebhookUrl(value: unknown): string | null {
    const checked = checkRedirectUris([value])
    if (!checked) return null
    const url = new URL(checked[0]!)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    return url.protocol === 'https:' || local ? url.toString() : null
}

export interface RegisterInput {
    /** Het registratietoken (pxr_...). */
    token: string
    /** appKey = client_id; de app kiest hem zelf. */
    appKey: string
    name: string
    redirectUris: string[]
    postLogoutRedirectUris: string[]
    /** Waar de hub events naartoe stuurt (mag leeg: de app haalt ze dan zelf op). */
    webhookUrl: string | null
}

export type RegisterError = 'invalidToken' | 'invalidMetadata' | 'appKeyTaken'

export interface Registered {
    clientId: string
    clientSecret: string
    webhookSecret: string
}

/**
 * Sluit een app aan: token controleren (status, vervaldatum, maximum,
 * toegelaten domeinen), client_id + secrets maken en de rij in apps zetten.
 */
export async function registerApp(input: RegisterInput): Promise<Registered | RegisterError> {
    if (!APP_KEY_RE.test(input.appKey)) return 'invalidMetadata'
    if (!input.name || input.name.length > 100) return 'invalidMetadata'

    const existing = await hub.one<{ id: string }>('select id from apps where id = $1', [input.appKey])
    if (existing) return 'appKeyTaken'

    // Ook de webhook telt mee voor de toegelaten domeinen van het token.
    const hosts = hostsOf([
        ...input.redirectUris,
        ...input.postLogoutRedirectUris,
        ...(input.webhookUrl ? [input.webhookUrl] : [])
    ])
    const tokenId = await useToken(input.token, hosts)
    if (!tokenId) return 'invalidToken'

    const clientSecret = secret()
    const webhookSecret = secret()
    await hub.query(
        `insert into apps (id, name, client, webhook_url, webhook_secret, registration_token_id)
         values ($1, $2, $3, $4, $5, $6)`,
        [
            input.appKey,
            input.name,
            {
                client_name: input.name,
                client_secret: encrypt(clientSecret),
                redirect_uris: input.redirectUris,
                post_logout_redirect_uris: input.postLogoutRedirectUris,
                grant_types: ['authorization_code', 'refresh_token'],
                response_types: ['code'],
                token_endpoint_auth_method: 'client_secret_basic'
            },
            input.webhookUrl,
            encrypt(webhookSecret),
            tokenId
        ]
    )
    return { clientId: input.appKey, clientSecret, webhookSecret }
}

/** De app achter een client_id + client_secret (Basic-authenticatie). */
export async function appByCredentials(clientId: string, clientSecret: string): Promise<App | null> {
    const row = await hub.one<App & { client: { client_secret?: string } } & Record<string, unknown>>(
        "select id, name, client, webhook_url, status, created_at from apps where id = $1 and status = 'active'",
        [clientId]
    )
    if (!row?.client.client_secret) return null
    return sameSecret(decrypt(row.client.client_secret), clientSecret) ? row : null
}

/** Twee geheimen vergelijken zonder dat de tijd iets verraadt. */
function sameSecret(a: string, b: string): boolean {
    const left = Buffer.from(a)
    const right = Buffer.from(b)
    return left.length === right.length && timingSafeEqual(left, right)
}

/** Het webhook-geheim van een app (om de handtekening te zetten). */
export async function webhookSecretOf(appId: string): Promise<string | null> {
    const row = await hub.one<{ webhook_secret: string | null }>('select webhook_secret from apps where id = $1', [
        appId
    ])
    return row?.webhook_secret ? decrypt(row.webhook_secret) : null
}

export const listApps = () =>
    hub.many<App & Record<string, unknown>>(
        'select id, name, client, webhook_url, status, created_at from apps order by created_at'
    )
