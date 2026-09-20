import { createHash, randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'
import { env } from '../env.js'
import { control } from '../db/control.js'
import { decrypt, encrypt } from '../db/crypto.js'
import { refreshTokens, type Claims, type Tokens } from './oidc.js'

/**
 * Sessie van deze app (cookie px_app): de gebruiker logt in bij de hub, en wij
 * onthouden wie hij is en voor welke organisatie. De cookie bevat enkel een
 * toevalsgetal; alles staat in de control-database (tokens versleuteld).
 */
export const SESSION_COOKIE = 'px_app'
const SESSION_DAYS = 14

export interface Session {
    id: string
    account_id: string
    org_id: string
    tenant_key: string
    org_name: string
    org_role: 'owner' | 'admin' | 'member'
    email: string
    name: string
    id_token: string
    refresh_token: string | null
    access_token: string | null
    access_expires_at: Date | null
    expires_at: Date
}

/** De gebruiker zoals de frontend hem krijgt. */
export interface Me {
    account: { id: string; email: string; name: string }
    organization: { id: string; tenant_key: string; name: string; role: Session['org_role'] }
}

const hash = (value: string) => createHash('sha256').update(value).digest('base64url')

const COLUMNS =
    'id, account_id, org_id, tenant_key, org_name, org_role, email, name, id_token, refresh_token, access_token, access_expires_at, expires_at'

export const meOf = (session: Session): Me => ({
    account: { id: session.account_id, email: session.email, name: session.name },
    organization: {
        id: session.org_id,
        tenant_key: session.tenant_key,
        name: session.org_name,
        role: session.org_role
    }
})

export function readCookie(req: Request, name: string): string | undefined {
    const match = req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
    return match ? decodeURIComponent(match[1]!) : undefined
}

/** Nieuwe sessie na een geslaagde login; zet meteen de cookie. */
export async function startSession(res: Response, claims: Claims, tokens: Tokens): Promise<Session> {
    const value = randomBytes(32).toString('base64url')
    const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000)
    const row = await control.one<Session & Record<string, unknown>>(
        `insert into sessions (id, account_id, org_id, tenant_key, org_name, org_role, email, name,
                               id_token, refresh_token, access_token, access_expires_at, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         returning ${COLUMNS}`,
        [
            hash(value),
            claims.sub,
            claims.org_id,
            claims.tenant_key,
            claims.org_name,
            claims.org_role,
            claims.email,
            claims.name,
            tokens.id_token,
            tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
            encrypt(tokens.access_token),
            new Date(Date.now() + tokens.expires_in * 1000),
            expires
        ]
    )
    res.cookie(SESSION_COOKIE, value, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.production,
        path: '/',
        maxAge: SESSION_DAYS * 24 * 3600 * 1000
    })
    return row!
}

/** De sessie van dit verzoek (of null als er geen geldige is). */
export async function getSession(req: Request): Promise<Session | null> {
    const value = readCookie(req, SESSION_COOKIE)
    if (!value || value.length < 20 || value.length > 100) return null
    const session = await control.one<Session & Record<string, unknown>>(
        `select ${COLUMNS} from sessions where id = $1 and expires_at > now()`,
        [hash(value)]
    )
    if (!session) return null
    await control.query('update sessions set last_seen_at = now() where id = $1', [session.id])
    return session
}

/**
 * Een geldig access token voor de hub-API; vernieuwt het als het bijna
 * verlopen is. Null = de gebruiker moet opnieuw inloggen.
 */
export async function accessTokenOf(session: Session): Promise<string | null> {
    const fresh = session.access_expires_at && session.access_expires_at.getTime() - 30_000 > Date.now()
    if (fresh && session.access_token) return decrypt(session.access_token)
    if (!session.refresh_token) return null
    try {
        const tokens = await refreshTokens(decrypt(session.refresh_token))
        await control.query(
            `update sessions set access_token = $2, access_expires_at = $3,
                    refresh_token = coalesce($4, refresh_token), id_token = coalesce($5, id_token)
             where id = $1`,
            [
                session.id,
                encrypt(tokens.access_token),
                new Date(Date.now() + tokens.expires_in * 1000),
                tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
                tokens.id_token ?? null
            ]
        )
        return tokens.access_token
    } catch {
        // Refresh token ingetrokken (afgemeld, seat weg): sessie sluiten.
        await deleteSession(session.id)
        return null
    }
}

export async function deleteSession(id: string): Promise<void> {
    await control.query('delete from sessions where id = $1', [id])
}

export function clearSessionCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE, { path: '/' })
}

/** Alle sessies van een gebruiker sluiten (bv. na een event van de hub). */
export async function deleteSessionsFor(accountId: string, orgId?: string | null): Promise<number> {
    const result = await control.query(
        `delete from sessions where account_id = $1 and ($2::uuid is null or org_id = $2)`,
        [accountId, orgId ?? null]
    )
    return result.rowCount ?? 0
}

/** Alle sessies van een organisatie sluiten. */
export async function deleteSessionsOfOrg(orgId: string): Promise<number> {
    const result = await control.query('delete from sessions where org_id = $1', [orgId])
    return result.rowCount ?? 0
}

/** Verlopen sessies opruimen (bij het opstarten en elk uur). */
export async function cleanupSessions(): Promise<void> {
    await control.query('delete from sessions where expires_at < now()')
}
