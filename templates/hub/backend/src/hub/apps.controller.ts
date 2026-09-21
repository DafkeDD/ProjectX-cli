import { Body, Controller, Get, Headers, Post, Query, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { limitByIp } from '../auth/rate-limit.js'
import { eventsForApp, recordEvent } from './events.js'
import { appByCredentials, checkRedirectUris, checkWebhookUrl, registerApp, type App } from './apps.js'

type Body = Record<string, unknown>

const str = (value: unknown, max = 200): string | null => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed && trimmed.length <= max ? trimmed : null
}

/** "Bearer pxr_..." uit de Authorization-header. */
const bearer = (header: string | undefined): string | null =>
    header?.startsWith('Bearer ') ? header.slice(7).trim() || null : null

/** De app achter "Basic base64(client_id:client_secret)". */
async function basicApp(header: string | undefined): Promise<App | null> {
    if (!header?.startsWith('Basic ')) return null
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
    const index = decoded.indexOf(':')
    if (index < 1) return null
    return appByCredentials(decodeURIComponent(decoded.slice(0, index)), decodeURIComponent(decoded.slice(index + 1)))
}

/**
 * Endpoints voor de apps zelf (server-naar-server, geen browser):
 * aansluiten met een registratietoken, events ophalen en melden dat de
 * tenant-database klaar is.
 */
@Controller('api')
export class AppsController {
    /**
     * POST /api/apps/register — een app sluit zich aan (in de stijl van RFC 7591).
     * Header: Authorization: Bearer <registratietoken>.
     */
    @Post('apps/register')
    async register(
        @Headers('authorization') authorization: string | undefined,
        @Body() body: Body = {},
        @Req() req?: Request,
        @Res() res?: Response
    ) {
        limitByIp(req!, 'app-register', 10, 3600_000)
        const token = bearer(authorization)
        if (!token) return res!.status(401).json({ error: 'invalidToken' })

        const appKey = str(body.client_id ?? body.app_key, 20)
        const name = str(body.client_name, 100)
        const redirectUris = checkRedirectUris(body.redirect_uris)
        const logoutUris = body.post_logout_redirect_uris ? checkRedirectUris(body.post_logout_redirect_uris) : []
        const webhookUrl = body.webhook_url ? checkWebhookUrl(body.webhook_url) : null
        if (!appKey || !name || !redirectUris || !logoutUris || (body.webhook_url && !webhookUrl))
            return res!.status(400).json({ error: 'invalidMetadata' })

        const result = await registerApp({
            token,
            appKey,
            name,
            redirectUris,
            postLogoutRedirectUris: logoutUris,
            webhookUrl: webhookUrl ?? null
        })
        if (result === 'invalidToken') return res!.status(403).json({ error: 'invalidToken' })
        if (result === 'appKeyTaken') return res!.status(409).json({ error: 'appKeyTaken' })
        if (result === 'invalidMetadata') return res!.status(400).json({ error: 'invalidMetadata' })

        await recordEvent({ type: 'app.registered', appId: result.clientId, data: { name } })
        return res!.status(201).json({
            client_id: result.clientId,
            client_secret: result.clientSecret,
            client_id_issued_at: Math.floor(Date.now() / 1000),
            webhook_secret: result.webhookSecret,
            redirect_uris: redirectUris
        })
    }

    /** GET /api/events?after=&limit= — de app haalt zijn events op (Basic-auth). */
    @Get('events')
    async events(
        @Headers('authorization') authorization: string | undefined,
        @Query('after') after: string | undefined,
        @Query('limit') limit: string | undefined,
        @Res() res: Response
    ) {
        const app = await basicApp(authorization)
        if (!app) return res.status(401).json({ error: 'invalidClient' })
        const max = Math.min(Math.max(Number(limit) || 100, 1), 500)
        res.setHeader('cache-control', 'no-store')
        return res.json(await eventsForApp(app.id, str(after, 40), max))
    }

    /** POST /api/apps/tenant — de app meldt dat een tenant klaar is of mislukt is. */
    @Post('apps/tenant')
    async tenant(
        @Headers('authorization') authorization: string | undefined,
        @Body() body: Body,
        @Res() res: Response
    ) {
        const app = await basicApp(authorization)
        if (!app) return res!.status(401).json({ error: 'invalidClient' })

        const orgId = str(body.org_id, 40)
        const isUuid = orgId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId) : false
        const status = body.status === 'ready' || body.status === 'failed' ? body.status : null
        if (!orgId || !isUuid || !status) return res!.status(400).json({ error: 'invalidMetadata' })

        await recordEvent({
            type: `tenant.${status}`,
            appId: app.id,
            orgId,
            data: { message: str(body.message, 500) ?? undefined }
        })
        return res!.status(204).send()
    }
}
