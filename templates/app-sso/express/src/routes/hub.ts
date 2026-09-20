import { Router } from 'express'
import { HttpError } from '../errors.js'
import type { HubEvent } from '../hub/client.js'
import { handleEvent, verifySignature } from '../hub/events.js'

/** POST /hub/events — de hub stuurt hier zijn events naartoe (met handtekening). */
export const hubRouter = Router()

hubRouter.post('/events', (req, res, next) => {
    const body = (req as { rawBody?: string }).rawBody ?? ''
    if (!verifySignature(body, req.headers['x-projectx-timestamp'], req.headers['x-projectx-signature'])) {
        return next(new HttpError(403))
    }
    handleEvent(JSON.parse(body) as HubEvent)
        .then(() => res.status(204).send())
        .catch(next)
})
