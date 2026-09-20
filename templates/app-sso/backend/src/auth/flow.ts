import type { Request, Response } from 'express'
import { env } from '../env.js'
import { decrypt, encrypt } from '../db/crypto.js'
import { ensureTenant } from '../tenant/ensure.js'
import { authorizationUrl, endSessionUrl, exchangeCode, randomString, verifyIdToken } from './oidc.js'
import { clearSessionCookie, deleteSession, getSession, readCookie, startSession, type Session } from './sessions.js'

/**
 * De inlogstroom van deze app: naar de hub sturen, terugkomen met een code,
 * tokens ophalen en een eigen sessie starten. De app heeft zelf geen
 * wachtwoorden: registreren en inloggen gebeuren in de hub.
 */
const LOGIN_COOKIE = 'px_login'
const LOGIN_MINUTES = 10

interface LoginState {
    state: string
    nonce: string
    verifier: string
    returnTo: string
}

/** Alleen terug naar een pagina van onze eigen frontend. */
export function safeReturnTo(value: unknown): string {
    const path = typeof value === 'string' ? value : '/'
    return path.startsWith('/') && !path.startsWith('//') ? path : '/'
}

const frontend = (path: string) => `${env.frontendUrl}${path}`

/** Stap 1: naar de hub. `prompt: 'consent'` laat een andere organisatie kiezen. */
export async function startLogin(req: Request, res: Response, prompt?: 'consent'): Promise<void> {
    const login: LoginState = {
        state: randomString(),
        nonce: randomString(),
        verifier: randomString(),
        returnTo: safeReturnTo(req.query.returnTo)
    }
    res.cookie(LOGIN_COOKIE, encrypt(JSON.stringify(login)), {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.production,
        path: '/',
        maxAge: LOGIN_MINUTES * 60 * 1000
    })
    res.redirect(await authorizationUrl({ ...login, prompt }))
}

/** De opgeslagen gegevens van het inlogverzoek (of null als de cookie weg of stuk is). */
function readLoginState(cookie: string | undefined): LoginState | null {
    if (!cookie) return null
    try {
        return JSON.parse(decrypt(cookie)) as LoginState
    } catch {
        return null
    }
}

/** Stap 2: terug van de hub — code inwisselen, tenant klaarzetten, sessie starten. */
export async function finishLogin(req: Request, res: Response): Promise<void> {
    const cookie = readCookie(req, LOGIN_COOKIE)
    res.clearCookie(LOGIN_COOKIE, { path: '/' })

    const login = readLoginState(cookie)
    if (!login) return void res.redirect(frontend('/?login=expired'))

    // De gebruiker heeft geannuleerd of de hub geeft een fout.
    if (typeof req.query.error === 'string') {
        return void res.redirect(frontend(`${login.returnTo}?login=${encodeURIComponent(req.query.error)}`))
    }
    if (req.query.state !== login.state || typeof req.query.code !== 'string') {
        return void res.redirect(frontend('/?login=expired'))
    }

    const tokens = await exchangeCode(req.query.code, login.verifier)
    const claims = await verifyIdToken(tokens.id_token, login.nonce)

    // Eerste login van deze organisatie: haar database aanmaken.
    try {
        await ensureTenant(claims)
    } catch (error) {
        console.error('Tenant aanmaken mislukt:', error)
        return void res.redirect(frontend(`${login.returnTo}?login=tenant`))
    }

    // Was er al een sessie (bv. bij het wisselen van organisatie)? Die vervalt nu.
    const previous = await getSession(req)
    if (previous) await deleteSession(previous.id)

    await startSession(res, claims, tokens)
    res.redirect(frontend(login.returnTo))
}

/** Afmelden: onze sessie weg, daarna ook bij de hub. */
export async function logout(req: Request, res: Response): Promise<void> {
    const session = await getSession(req)
    clearSessionCookie(res)
    if (!session) return void res.redirect(frontend('/'))
    await deleteSession(session.id)
    res.redirect(await endSessionUrl(session.id_token, frontend('/')))
}

/** De sessie van dit verzoek, of null. */
export const sessionOf = (req: Request): Promise<Session | null> => getSession(req)
