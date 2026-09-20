import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { sessionAccount, type SessionAccount } from '../auth/session.js'

/** Het ingelogde account, anders 401. */
export async function requireAccount(req: Request): Promise<SessionAccount> {
    const account = await sessionAccount(req)
    if (!account) throw new UnauthorizedException()
    return account
}

/** Enkel beheerders van de hub, anders 403. */
export async function requireAdmin(req: Request): Promise<SessionAccount> {
    const account = await requireAccount(req)
    if (!account.is_admin) throw new ForbiddenException()
    return account
}

/** Fout met een eigen vertaalsleutel (400). */
export const invalid = (key: string) => new BadRequestException({ key })

/** Tekstveld uit de body: getrimd, verplicht of null. */
export function text(value: unknown, max = 200): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed && trimmed.length <= max ? trimmed : null
}
