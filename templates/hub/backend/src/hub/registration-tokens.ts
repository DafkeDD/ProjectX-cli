import { randomBytes } from 'node:crypto'
import { decrypt, encrypt } from '../db/crypto.js'
import { hub } from '../db/hub.js'
import { sha256 } from '../auth/codes.js'

/**
 * Registratietokens: een app sluit zich ermee aan bij de hub (RFC 7591).
 * Het token staat versleuteld, zodat een beheerder het achteraf nog kan tonen.
 */
export interface RegistrationToken {
    id: string
    name: string
    hint: string
    expires_at: Date | null
    max_uses: number | null
    uses: number
    allowed_domains: string[]
    status: 'active' | 'revoked'
    created_by_name: string | null
    created_at: Date
    updated_at: Date
    apps: string[]
}

const newToken = () => `pxr_${randomBytes(32).toString('base64url')}`

const SELECT = `select t.id, t.name, t.hint, t.expires_at, t.max_uses, t.uses, t.allowed_domains, t.status,
       a.name as created_by_name, t.created_at, t.updated_at,
       coalesce((select array_agg(p.id order by p.id) from apps p where p.registration_token_id = t.id), '{}') as apps
  from registration_tokens t left join accounts a on a.id = t.created_by`

export const listTokens = () =>
    hub.many<RegistrationToken & Record<string, unknown>>(`${SELECT} order by t.created_at desc`)

export const getToken = (id: string) =>
    hub.one<RegistrationToken & Record<string, unknown>>(`${SELECT} where t.id = $1`, [id])

export interface TokenInput {
    name: string
    expiresAt: Date | null
    maxUses: number | null
    allowedDomains: string[]
}

export async function createToken(input: TokenInput, createdBy: string | null): Promise<{ id: string; token: string }> {
    const token = newToken()
    const row = await hub.one<{ id: string }>(
        `insert into registration_tokens (name, token, token_hash, hint, expires_at, max_uses, allowed_domains, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [
            input.name,
            encrypt(token),
            sha256(token),
            token.slice(-4),
            input.expiresAt,
            input.maxUses,
            input.allowedDomains,
            createdBy
        ]
    )
    return { id: row!.id, token }
}

export async function updateToken(id: string, input: TokenInput): Promise<boolean> {
    const result = await hub.query(
        `update registration_tokens set name = $2, expires_at = $3, max_uses = $4, allowed_domains = $5, updated_at = now()
         where id = $1`,
        [id, input.name, input.expiresAt, input.maxUses, input.allowedDomains]
    )
    return (result.rowCount ?? 0) > 0
}

/** Het volledige token (enkel voor beheerders, via "Tonen"). */
export async function revealToken(id: string): Promise<string | null> {
    const row = await hub.one<{ token: string }>('select token from registration_tokens where id = $1', [id])
    return row ? decrypt(row.token) : null
}

/** Nieuw token: het oude werkt meteen niet meer; aangesloten apps blijven werken. */
export async function renewToken(id: string): Promise<string | null> {
    const token = newToken()
    const result = await hub.query(
        `update registration_tokens set token = $2, token_hash = $3, hint = $4, status = 'active', updated_at = now()
         where id = $1`,
        [id, encrypt(token), sha256(token), token.slice(-4)]
    )
    return result.rowCount ? token : null
}

export async function revokeToken(id: string): Promise<boolean> {
    const result = await hub.query(
        "update registration_tokens set status = 'revoked', updated_at = now() where id = $1",
        [id]
    )
    return (result.rowCount ?? 0) > 0
}

/**
 * Is dit token nu bruikbaar om een app aan te sluiten? (fase 3: dynamische
 * client-registratie). Verhoogt meteen het aantal keer gebruikt.
 */
export async function useToken(token: string, redirectHosts: string[]): Promise<string | null> {
    return hub.tx(async tx => {
        const row = await tx.one<{ id: string; allowed_domains: string[] }>(
            `select id, allowed_domains from registration_tokens
             where token_hash = $1 and status = 'active'
               and (expires_at is null or expires_at > now())
               and (max_uses is null or uses < max_uses)
             for update`,
            [sha256(token)]
        )
        if (!row) return null
        const allowed = row.allowed_domains
        if (allowed.length && !redirectHosts.every(host => allowed.some(d => host === d || host.endsWith(`.${d}`))))
            return null
        await tx.query('update registration_tokens set uses = uses + 1 where id = $1', [row.id])
        return row.id
    })
}
