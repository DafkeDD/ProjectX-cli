import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Req,
    Res
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { env } from '../env.js'
import { hub } from '../db/hub.js'
import { consumeCode, createCode } from '../auth/codes.js'
import { hashPassword, isEmail, isStrongPassword, verifyPassword } from '../auth/password.js'
import { assertNotLimited, clearFailures, limitByIp, limitByValue, recordFailure } from '../auth/rate-limit.js'
import { endSession, sessionAccount, startSession } from '../auth/session.js'
import { resolveLocale } from '../i18n/i18n.js'
import {
    createAccount,
    findAccountByEmail,
    getAccount,
    getMembership,
    listOrganizations,
    renameOrganization,
    type Account
} from './accounts.js'
import { emitToApps, recordEvent } from './events.js'
import { invalid, requireAccount, text } from './guards.js'
import { endOidcSessions, revokeAccountAccess } from './revoke.js'
import { sendMail } from './mail.js'

type Body = Record<string, unknown>

const DAY = 24 * 3600

async function sendVerification(account: Pick<Account, 'id' | 'email' | 'name' | 'locale'>) {
    const code = await createCode('EmailVerification', { accountId: account.id }, DAY)
    await sendMail(account, 'verify', `${env.frontendUrl}/verify?token=${code}`)
}

/**
 * /api/auth — registreren, bevestigen, inloggen, wachtwoord vergeten.
 * Registreren kan ENKEL hier, in de hub; apps hebben geen eigen registratie.
 */
@Controller('api/auth')
export class AuthController {
    @Post('register')
    @HttpCode(201)
    async register(@Body() body: Body = {}, @Req() req?: Request) {
        limitByIp(req!, 'register', 10)
        const email = text(body.email, 254)
        const name = text(body.name, 100)
        if (!isEmail(email)) throw invalid('invalidEmail')
        if (!name) throw invalid('badRequest')
        if (!isStrongPassword(body.password)) throw invalid('weakPassword')

        // Altijd hetzelfde antwoord: zo kan niemand aftoetsen welke adressen bestaan.
        const existing = await findAccountByEmail(email)
        if (existing) {
            if (existing.status === 'pending') await sendVerification(existing)
            // Bestaat al en is actief: die persoon krijgt een mail dat iemand
            // met zijn adres probeerde te registreren.
            else if (existing.status === 'active') await sendMail(existing, 'exists', `${env.frontendUrl}/forgot`)
            return { status: 'pending' }
        }

        const { account, organization } = await createAccount({
            email,
            name,
            password: body.password,
            locale: resolveLocale(req!.headers),
            organization: text(body.organization, 100)
        })
        await recordEvent({ type: 'account.registered', actorId: account.id, orgId: organization.id })
        await sendVerification(account)
        return { status: 'pending' }
    }

    @Post('verify')
    async verify(@Body() body: Body = {}, @Req() req?: Request, @Res({ passthrough: true }) res?: Response) {
        limitByIp(req!, 'verify', 30)
        const code = await consumeCode<{ accountId: string }>('EmailVerification', body.token)
        if (!code) throw invalid('linkInvalid')
        await hub.query(
            "update accounts set status = 'active', email_verified_at = now(), updated_at = now() where id = $1 and status <> 'disabled'",
            [code.accountId]
        )
        await recordEvent({ type: 'account.verified', actorId: code.accountId })
        // Meteen ingelogd.
        await startSession(res!, code.accountId)
        return { status: 'active' }
    }

    @Post('resend')
    @HttpCode(204)
    async resend(@Body() body: Body = {}, @Req() req?: Request) {
        limitByIp(req!, 'resend', 5)
        const email = text(body.email, 254)
        if (email) limitByValue('resend', email, 3, 3600_000)
        const account = email ? await findAccountByEmail(email) : null
        if (account?.status === 'pending') await sendVerification(account)
    }

    @Post('login')
    async login(@Body() body: Body = {}, @Req() req?: Request, @Res({ passthrough: true }) res?: Response) {
        const account = await checkCredentials(body, req!)
        await startSession(res!, account.id)
        await recordEvent({ type: 'account.login', actorId: account.id, data: { via: 'hub' } })
        return { id: account.id, name: account.name }
    }

    @Post('logout')
    @HttpCode(204)
    async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        // Ook de SSO-sessie: anders logt één klik in een app je meteen weer in.
        const account = await sessionAccount(req)
        await endSession(req, res)
        if (account) await endOidcSessions(account.id)
    }

    @Get('me')
    async me(@Req() req: Request) {
        const account = await requireAccount(req)
        return { account, organizations: await listOrganizations(account.id) }
    }

    /** Organisatie hernoemen (eigenaar of beheerder); de apps krijgen een event. */
    @Patch('organizations/:id')
    async renameOrg(@Param('id', ParseUUIDPipe) id: string, @Body() body: Body, @Req() req: Request) {
        const account = await requireAccount(req)
        const membership = await getMembership(account.id, id)
        if (!membership) throw new ForbiddenException()
        if (membership.role === 'member') throw new ForbiddenException()

        const name = text(body.name, 100)
        if (!name) throw invalid('badRequest')

        await renameOrganization(id, name)
        await recordEvent({ type: 'organization.updated', actorId: account.id, orgId: id, data: { name } })
        await emitToApps({
            type: 'organization.updated',
            orgId: id,
            actorId: account.id,
            data: { name, tenant_key: membership.tenant_key }
        })
        return { ...membership, name }
    }

    @Post('forgot')
    @HttpCode(204)
    async forgot(@Body() body: Body = {}, @Req() req?: Request) {
        limitByIp(req!, 'forgot', 5)
        // Altijd hetzelfde antwoord: zo verraden we niet wie een account heeft.
        const email = text(body.email, 254)
        if (email) limitByValue('forgot', email, 3, 3600_000)
        const account = email ? await findAccountByEmail(email) : null
        if (!account || account.status === 'disabled') return
        const code = await createCode('PasswordReset', { accountId: account.id }, 3600)
        await sendMail(account, 'reset', `${env.frontendUrl}/reset?token=${code}`)
    }

    @Post('reset')
    @HttpCode(204)
    async reset(@Body() body: Body = {}, @Req() req?: Request) {
        limitByIp(req!, 'reset', 20)
        if (!isStrongPassword(body.password)) throw invalid('weakPassword')
        const code = await consumeCode<{ accountId: string }>('PasswordReset', body.token)
        if (!code) throw invalid('linkInvalid')
        const account = await getAccount(code.accountId)
        if (!account || account.status === 'disabled') throw invalid('linkInvalid')
        // Via de link is het e-mailadres ook bewezen.
        await hub.query(
            `update accounts set password_hash = $2, status = 'active',
                    email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
             where id = $1`,
            [account.id, await hashPassword(body.password)]
        )
        // Overal afmelden: hub-sessies, SSO-sessies, grants en tokens weg, en de
        // aangesloten apps sluiten hun eigen sessies (event user.sessions_revoked).
        await revokeAccountAccess(account.id, 'password_reset')
        await recordEvent({ type: 'account.password_reset', actorId: account.id })
    }
}

const dummyHash = hashPassword('geen-echt-wachtwoord-1')

/**
 * E-mail + wachtwoord controleren (ook voor het inloggen vanuit een app).
 * Te veel foute pogingen per e-mail + IP: even geblokkeerd.
 */
export async function checkCredentials(body: Body, req: Request): Promise<Account> {
    const email = text(body.email, 254)
    if (!email || typeof body.password !== 'string') throw invalid('invalidCredentials')
    // Twee remmen: per e-mail + IP op mislukte pogingen, en per IP op het aantal
    // pogingen zelf — anders ontsnapt wie telkens een ander adres verzint.
    // Ruim genoeg voor een kantoor achter één IP, laag genoeg om het rekenwerk
    // van scrypt niet als wapen te laten gebruiken (zie ook password.ts).
    limitByIp(req, 'login', 60)
    const limitKey = `${email.toLowerCase()}|${req.ip}`
    assertNotLimited(limitKey)

    const account = await findAccountByEmail(email)
    // Ook zonder account even lang rekenen: de responstijd verraadt niets.
    const ok = await verifyPassword(body.password, account?.password_hash ?? (await dummyHash))
    if (!account || !ok || account.status === 'disabled') {
        recordFailure(limitKey)
        throw invalid('invalidCredentials')
    }
    clearFailures(limitKey)
    if (account.status === 'pending') throw invalid('emailNotVerified')
    return account
}
