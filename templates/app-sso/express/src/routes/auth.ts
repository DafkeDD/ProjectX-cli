import { Router } from 'express'
import { HttpError } from '../errors.js'
import { finishLogin, logout, sessionOf, startLogin } from '../auth/flow.js'
import { meOf } from '../auth/sessions.js'

/**
 * /auth — inloggen gebeurt bij de SSO-hub; deze app houdt enkel een sessie bij.
 * De frontend stuurt de gebruiker naar /auth/login en leest daarna /auth/me.
 */
export const authRouter = Router()

/** GET /auth/login?returnTo=/ergens — naar de hub. */
authRouter.get('/login', (req, res, next) => {
    startLogin(req, res).catch(next)
})

/** GET /auth/switch?returnTo=/ergens — andere organisatie kiezen. */
authRouter.get('/switch', (req, res, next) => {
    startLogin(req, res, 'consent').catch(next)
})

/** GET /auth/callback — de hub stuurt de gebruiker hier terug. */
authRouter.get('/callback', (req, res, next) => {
    finishLogin(req, res).catch(next)
})

/** POST /auth/logout — afmelden, hier en bij de hub (POST: niet van buitenaf te forceren). */
authRouter.post('/logout', (req, res, next) => {
    logout(req, res).catch(next)
})

/** GET /auth/me — wie is er ingelogd, en voor welke organisatie? */
authRouter.get('/me', (req, res, next) => {
    sessionOf(req)
        .then(session => {
            if (!session) throw new HttpError(401)
            res.json(meOf(session))
        })
        .catch(next)
})
