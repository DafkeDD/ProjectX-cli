import { Controller, ForbiddenException, HttpCode, Post, Req } from '@nestjs/common'
import type { RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import { handleEvent, verifySignature } from './events.js'
import type { HubEvent } from './client.js'

/** POST /hub/events — de hub stuurt hier zijn events naartoe (met handtekening). */
@Controller('hub')
export class HubController {
    @Post('events')
    @HttpCode(204)
    async events(@Req() req: RawBodyRequest<Request>) {
        const body = req.rawBody?.toString('utf8') ?? ''
        if (!verifySignature(body, req.headers['x-projectx-timestamp'], req.headers['x-projectx-signature'])) {
            throw new ForbiddenException()
        }
        await handleEvent(JSON.parse(body) as HubEvent)
    }
}
