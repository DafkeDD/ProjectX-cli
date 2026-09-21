import { createHash, createPublicKey, randomBytes, type KeyObject } from 'node:crypto'
import { verify } from 'node:crypto'
import { env } from '../env.js'
import { tenantKeyFor } from '../db/tenants.js'

/**
 * OIDC-client van deze app: praten met de SSO-hub (authorization code + PKCE).
 * Geen extra package: alles via fetch en node:crypto.
 */
export interface Discovery {
    issuer: string
    authorization_endpoint: string
    token_endpoint: string
    userinfo_endpoint: string
    jwks_uri: string
    end_session_endpoint?: string
    revocation_endpoint?: string
}

const CACHE_MS = 3600_000
let discovered: { at: number; doc: Discovery } | null = null

/** De adressen van de hub (.well-known), een uur lang onthouden. */
export async function discovery(): Promise<Discovery> {
    if (discovered && Date.now() - discovered.at < CACHE_MS) return discovered.doc
    const url = `${env.oidc.issuer}/.well-known/openid-configuration`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`SSO-hub niet bereikbaar (${url}: HTTP ${response.status})`)
    const doc = (await response.json()) as Discovery
    if (doc.issuer !== env.oidc.issuer) throw new Error(`De hub noemt zich ${doc.issuer}, verwacht ${env.oidc.issuer}`)
    checkEndpoints(doc)
    discovered = { at: Date.now(), doc }
    return doc
}

const isLocal = (url: URL) => url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'

/**
 * De adressen uit .well-known moeten van dezelfde hub komen. Anders kan iemand
 * die het antwoord onderschept ons naar zijn eigen token- of sleuteladres
 * sturen — en dan geven we hem ons client secret.
 */
function checkEndpoints(doc: Discovery): void {
    const issuer = new URL(env.oidc.issuer)
    if (issuer.protocol !== 'https:' && !isLocal(issuer)) {
        throw new Error(`De hub moet via https draaien (${env.oidc.issuer}).`)
    }
    for (const [name, value] of Object.entries(doc)) {
        if (!name.endsWith('_endpoint') && name !== 'jwks_uri') continue
        if (typeof value !== 'string') continue
        if (new URL(value).origin !== issuer.origin) {
            throw new Error(`De hub geeft een adres op een andere server op (${name}: ${value}).`)
        }
    }
}

export const randomString = () => randomBytes(32).toString('base64url')

/** PKCE: de hub krijgt enkel de hash van onze geheime waarde te zien. */
export const codeChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

export const SCOPE = 'openid email profile organization offline_access'

export interface AuthorizeInput {
    state: string
    nonce: string
    verifier: string
    /** 'consent' = de gebruiker mag (opnieuw) een organisatie kiezen. */
    prompt?: 'consent' | 'login'
}

/** Het adres waar de browser naartoe moet om in te loggen. */
export async function authorizationUrl(input: AuthorizeInput): Promise<string> {
    const { authorization_endpoint } = await discovery()
    const query = new URLSearchParams({
        client_id: env.oidc.clientId(),
        redirect_uri: env.oidc.callbackUrl,
        response_type: 'code',
        scope: SCOPE,
        state: input.state,
        nonce: input.nonce,
        code_challenge: codeChallenge(input.verifier),
        code_challenge_method: 'S256',
        ...(input.prompt ? { prompt: input.prompt } : {})
    })
    return `${authorization_endpoint}?${query}`
}

export interface Tokens {
    access_token: string
    refresh_token?: string
    id_token: string
    token_type: string
    expires_in: number
}

const basic = () =>
    'Basic ' +
    Buffer.from(`${encodeURIComponent(env.oidc.clientId())}:${encodeURIComponent(env.oidc.clientSecret())}`).toString(
        'base64'
    )

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
    const { token_endpoint } = await discovery()
    const response = await fetch(token_endpoint, {
        method: 'POST',
        headers: { authorization: basic(), 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body)
    })
    const json = (await response.json()) as Tokens & { error?: string; error_description?: string }
    if (!response.ok)
        throw new Error(`Hub weigert de tokens: ${json.error ?? response.status} ${json.error_description ?? ''}`)
    return json
}

/** Code inwisselen voor tokens (na de terugkeer van de hub). */
export const exchangeCode = (code: string, verifier: string) =>
    tokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.oidc.callbackUrl,
        code_verifier: verifier
    })

/** Nieuw access token met het refresh token. */
export const refreshTokens = (refreshToken: string) =>
    tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })

/** Afmelden bij de hub (en daarna terug naar deze app). */
export async function endSessionUrl(idToken: string, redirectTo: string): Promise<string> {
    const { end_session_endpoint } = await discovery()
    if (!end_session_endpoint) return redirectTo
    const query = new URLSearchParams({
        id_token_hint: idToken,
        post_logout_redirect_uri: redirectTo,
        client_id: env.oidc.clientId()
    })
    return `${end_session_endpoint}?${query}`
}

export interface Claims {
    sub: string
    email: string
    email_verified?: boolean
    name: string
    locale?: string
    org_id: string
    tenant_key: string
    org_name: string
    org_role: 'owner' | 'admin' | 'member'
    iss: string
    aud: string | string[]
    azp?: string
    exp: number
    iat?: number
    nonce?: string
}

let keys: { at: number; byKid: Map<string, KeyObject> } | null = null

async function publicKey(kid: string): Promise<KeyObject> {
    if (!keys || Date.now() - keys.at > CACHE_MS || !keys.byKid.has(kid)) {
        const { jwks_uri } = await discovery()
        const response = await fetch(jwks_uri)
        if (!response.ok) throw new Error(`Sleutels van de hub niet op te halen (HTTP ${response.status})`)
        const { keys: jwks } = (await response.json()) as { keys: { kid: string; kty?: string; use?: string }[] }
        keys = {
            at: Date.now(),
            byKid: new Map(
                jwks
                    // Enkel RSA-sleutels om handtekeningen mee na te kijken.
                    .filter(jwk => jwk.kty === 'RSA' && (jwk.use === undefined || jwk.use === 'sig'))
                    .map(jwk => [jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' })])
            )
        }
    }
    const key = keys.byKid.get(kid)
    if (!key) throw new Error(`Onbekende sleutel (kid ${kid}) in het id-token`)
    return key
}

const part = <T>(value: string): T => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T

/**
 * Controleert het id-token: handtekening (RS256, sleutels van de hub),
 * uitgever, ontvanger, vervaldatum en de nonce van dit inlogverzoek.
 */
export async function verifyIdToken(idToken: string, nonce: string): Promise<Claims> {
    const [head, payload, signature] = idToken.split('.')
    if (!head || !payload || !signature) throw new Error('Het id-token klopt niet.')

    const header = part<{ alg: string; kid: string }>(head)
    if (header.alg !== 'RS256') throw new Error(`Handtekening ${header.alg} wordt niet ondersteund (enkel RS256).`)
    const ok = verify(
        'RSA-SHA256',
        Buffer.from(`${head}.${payload}`),
        await publicKey(header.kid),
        Buffer.from(signature, 'base64url')
    )
    if (!ok) throw new Error('De handtekening van het id-token klopt niet.')

    const claims = part<Claims>(payload)
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    const now = Date.now()
    if (claims.iss !== env.oidc.issuer) throw new Error('Het id-token komt van een andere hub.')
    if (!audience.includes(env.oidc.clientId())) throw new Error('Het id-token is voor een andere app.')
    // Meerdere ontvangers: dan moet azp zeggen dat het voor ons bedoeld is.
    if (audience.length > 1 && claims.azp !== env.oidc.clientId()) {
        throw new Error('Het id-token is voor een andere app uitgegeven.')
    }
    if (claims.exp * 1000 < now) throw new Error('Het id-token is verlopen.')
    // 60 seconden speling voor klokverschil.
    if (typeof claims.iat !== 'number' || claims.iat * 1000 > now + 60_000) {
        throw new Error('Het id-token heeft geen geldige uitgiftetijd.')
    }
    if (claims.nonce !== nonce) throw new Error('Het id-token hoort niet bij dit inlogverzoek.')
    if (!claims.sub || !claims.org_id || !claims.tenant_key || !claims.org_role) {
        throw new Error('Het id-token bevat geen organisatie; kies een organisatie bij de hub.')
    }
    // De sleutel van de organisatie moet bij haar id horen: die sleutel kiest de database.
    if (claims.tenant_key !== tenantKeyFor(claims.org_id)) {
        throw new Error('De sleutel van de organisatie klopt niet met haar id.')
    }
    return claims
}
