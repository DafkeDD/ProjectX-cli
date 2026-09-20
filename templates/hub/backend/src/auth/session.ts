import type { Request, Response } from 'express'
import { env } from '../env.js'
import { hub } from '../db/hub.js'
import { createCode, deleteCode, readCode } from './codes.js'

/**
 * Sessie van de hub zelf (cookie px_session): voor het beheerpaneel en om bij
 * een volgende app meteen door te gaan zonder opnieuw een wachtwoord te typen.
 */
export const SESSION_COOKIE = 'px_session'
const SESSION_DAYS = 30

export interface SessionAccount {
    id: string
    email: string
    name: string
    locale: string | null
    is_admin: boolean
}

export function readCookie(req: Request, name: string): string | undefined {
    const match = req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
    return match ? decodeURIComponent(match[1]!) : undefined
}

export async function startSession(res: Response, accountId: string): Promise<void> {
    const code = await createCode('HubSession', { accountId }, SESSION_DAYS * 24 * 3600)
    res.cookie(SESSION_COOKIE, code, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.production,
        path: '/',
        maxAge: SESSION_DAYS * 24 * 3600 * 1000
    })
    await hub.query('update accounts set last_login_at = now() where id = $1', [accountId])
}

/** Het ingelogde, actieve account van dit verzoek (of null). */
export async function sessionAccount(req: Request): Promise<SessionAccount | null> {
    const session = await readCode<{ accountId: string }>('HubSession', readCookie(req, SESSION_COOKIE))
    if (!session) return null
    return hub.one<SessionAccount & Record<string, unknown>>(
        "select id, email, name, locale, is_admin from accounts where id = $1 and status = 'active'",
        [session.accountId]
    )
}

export async function endSession(req: Request, res: Response): Promise<void> {
    const code = readCookie(req, SESSION_COOKIE)
    if (code) await deleteCode('HubSession', code)
    res.clearCookie(SESSION_COOKIE, { path: '/' })
}
