import { Controller, Get, Req, Res, UnauthorizedException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { finishLogin, logout, sessionOf, startLogin } from './flow.js'
import { meOf } from './sessions.js'

/**
 * /auth — inloggen gebeurt bij de SSO-hub; deze app houdt enkel een sessie bij.
 * De frontend stuurt de gebruiker naar /auth/login en leest daarna /auth/me.
 */
@Controller('auth')
export class AuthController {
    /** GET /auth/login?returnTo=/ergens — naar de hub. */
    @Get('login')
    async login(@Req() req: Request, @Res() res: Response) {
        await startLogin(req, res)
    }

    /** GET /auth/switch?returnTo=/ergens — andere organisatie kiezen. */
    @Get('switch')
    async switchOrganization(@Req() req: Request, @Res() res: Response) {
        await startLogin(req, res, 'consent')
    }

    /** GET /auth/callback — de hub stuurt de gebruiker hier terug. */
    @Get('callback')
    async callback(@Req() req: Request, @Res() res: Response) {
        await finishLogin(req, res)
    }

    /** GET /auth/logout — afmelden, hier en bij de hub. */
    @Get('logout')
    async logout(@Req() req: Request, @Res() res: Response) {
        await logout(req, res)
    }

    /** GET /auth/me — wie is er ingelogd, en voor welke organisatie? */
    @Get('me')
    async me(@Req() req: Request) {
        const session = await sessionOf(req)
        if (!session) throw new UnauthorizedException()
        return meOf(session)
    }
}
