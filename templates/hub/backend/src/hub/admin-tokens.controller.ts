import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { recordEvent } from './events.js'
import { invalid, requireAdmin, text } from './guards.js'
import {
    createToken,
    getToken,
    listTokens,
    renewToken,
    revealToken,
    revokeToken,
    updateToken,
    type TokenInput
} from './registration-tokens.js'

type Body = Record<string, unknown>

/** Invoer controleren: naam verplicht; vervaldatum, maximum en domeinen optioneel. */
function tokenInput(body: Body): TokenInput {
    const name = text(body.name, 100)
    if (!name) throw invalid('badRequest')

    let expiresAt: Date | null = null
    if (body.expiresAt) {
        expiresAt = new Date(String(body.expiresAt))
        if (Number.isNaN(expiresAt.getTime())) throw invalid('badRequest')
    }

    let maxUses: number | null = null
    if (body.maxUses !== undefined && body.maxUses !== null && body.maxUses !== '') {
        maxUses = Number(body.maxUses)
        if (!Number.isInteger(maxUses) || maxUses < 1) throw invalid('badRequest')
    }

    const raw = Array.isArray(body.allowedDomains) ? body.allowedDomains : String(body.allowedDomains ?? '').split(',')
    const allowedDomains = raw.map(d => String(d).trim().toLowerCase()).filter(Boolean)
    if (allowedDomains.some(d => !/^[a-z0-9.-]+$/.test(d))) throw invalid('badRequest')

    return { name, expiresAt, maxUses, allowedDomains }
}

/** /api/admin/registration-tokens — enkel voor beheerders van de hub. */
@Controller('api/admin/registration-tokens')
export class AdminTokensController {
    @Get()
    async list(@Req() req: Request) {
        await requireAdmin(req)
        return listTokens()
    }

    /** Aanmaken: het token komt één keer mee in het antwoord (later via "Tonen"). */
    @Post()
    async create(@Body() body: Body, @Req() req: Request) {
        const admin = await requireAdmin(req)
        const { id, token } = await createToken(tokenInput(body), admin.id)
        await recordEvent({ type: 'registration_token.created', actorId: admin.id, data: { id } })
        return { ...(await getToken(id)), token }
    }

    @Patch(':id')
    async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: Body, @Req() req: Request) {
        const admin = await requireAdmin(req)
        if (!(await updateToken(id, tokenInput(body)))) throw new NotFoundException()
        await recordEvent({ type: 'registration_token.updated', actorId: admin.id, data: { id } })
        return getToken(id)
    }

    /** Het volledige token tonen (staat in de auditlog). */
    @Get(':id/reveal')
    async reveal(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const admin = await requireAdmin(req)
        const token = await revealToken(id)
        if (!token) throw new NotFoundException()
        await recordEvent({ type: 'registration_token.revealed', actorId: admin.id, data: { id } })
        return { token }
    }

    @Post(':id/renew')
    async renew(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const admin = await requireAdmin(req)
        const token = await renewToken(id)
        if (!token) throw new NotFoundException()
        await recordEvent({ type: 'registration_token.renewed', actorId: admin.id, data: { id } })
        return { ...(await getToken(id)), token }
    }

    @Post(':id/revoke')
    async revoke(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const admin = await requireAdmin(req)
        if (!(await revokeToken(id))) throw new NotFoundException()
        await recordEvent({ type: 'registration_token.revoked', actorId: admin.id, data: { id } })
        return getToken(id)
    }
}
