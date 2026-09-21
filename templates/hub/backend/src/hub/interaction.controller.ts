import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import type { InteractionResults } from 'oidc-provider'
import { sessionAccount, startSession } from '../auth/session.js'
import { provider } from '../oidc/provider.js'
import { setGrantOrg } from '../oidc/grant-org.js'
import { getAccount, getMembership, listOrganizations } from './accounts.js'
import { recordEvent } from './events.js'
import { invalid } from './guards.js'
import { checkCredentials } from './auth.controller.js'

type Body = Record<string, unknown>

/**
 * Het inlogscherm van een app: oidc-provider stuurt de browser naar
 * /interaction/<uid> (een pagina van de frontend). Die pagina praat met deze
 * endpoints — onder hetzelfde pad, zodat de interactie-cookie meekomt.
 *
 * Stappen (prompt): "login" (wie ben je?) en "consent" (voor welke organisatie?).
 */
@Controller('interaction/:uid')
export class InteractionController {
    /** Wat moet het scherm tonen? */
    @Get('details')
    async details(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const details = await load(req, res)
        const client = await provider().Client.find(String(details.params.client_id))
        const base = {
            uid: details.uid,
            prompt: details.prompt.name,
            client: { id: client?.clientId, name: client?.clientName ?? client?.clientId }
        }

        if (details.prompt.name === 'login') {
            // Al ingelogd in de hub? Dan kan de gebruiker met één klik verder.
            const current = await sessionAccount(req)
            return {
                ...base,
                loginHint: details.params.login_hint ?? null,
                session: current ? { name: current.name, email: current.email } : null
            }
        }

        const accountId = details.session?.accountId
        const account = accountId ? await getAccount(accountId) : null
        return {
            ...base,
            account: account ? { name: account.name, email: account.email } : null,
            organizations: accountId ? await listOrganizations(accountId) : []
        }
    }

    /** Inloggen met e-mail + wachtwoord, of doorgaan met de hub-sessie. */
    @Post('login')
    async login(@Body() body: Body = {}, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const details = await load(req, res)
        if (details.prompt.name !== 'login') throw invalid('interactionExpired')

        let accountId: string
        if (body.useSession === true) {
            const current = await sessionAccount(req)
            if (!current) throw invalid('interactionExpired')
            accountId = current.id
        } else {
            const account = await checkCredentials(body, req)
            accountId = account.id
            await startSession(res, accountId)
        }
        await recordEvent({
            type: 'account.login',
            actorId: accountId,
            data: { via: 'oidc', client: details.params.client_id }
        })
        return finish(req, res, { login: { accountId } })
    }

    /** Organisatie kiezen = toestemming geven voor deze app, voor die organisatie. */
    @Post('confirm')
    async confirm(@Body() body: Body = {}, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
        const details = await load(req, res)
        const accountId = details.session?.accountId
        if (details.prompt.name !== 'consent' || !accountId) throw invalid('interactionExpired')

        const orgId = typeof body.orgId === 'string' ? body.orgId : ''
        // Geen geldige UUID: meteen 400, anders struikelt PostgreSQL erover.
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) throw invalid('badRequest')
        const membership = await getMembership(accountId, orgId)
        if (!membership) throw invalid('badRequest')

        const oidc = provider()
        const grant = details.grantId
            ? await oidc.Grant.find(details.grantId)
            : new oidc.Grant({ accountId, clientId: String(details.params.client_id) })
        if (!grant) throw invalid('interactionExpired')

        // Eigen apps: alles wat gevraagd wordt, wordt toegestaan.
        const missing = details.prompt.details as {
            missingOIDCScope?: string[]
            missingOIDCClaims?: string[]
            missingResourceScopes?: Record<string, string[]>
        }
        if (missing.missingOIDCScope) grant.addOIDCScope(missing.missingOIDCScope.join(' '))
        if (missing.missingOIDCClaims) grant.addOIDCClaims(missing.missingOIDCClaims)
        for (const [indicator, scopes] of Object.entries(missing.missingResourceScopes ?? {})) {
            grant.addResourceScope(indicator, scopes.join(' '))
        }
        const grantId = await grant.save()
        await setGrantOrg(grantId, membership.id)

        return finish(req, res, { consent: details.grantId ? {} : { grantId } })
    }

    /** Annuleren: de app krijgt access_denied. */
    @Post('abort')
    async abort(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
        await load(req, res)
        return finish(req, res, { error: 'access_denied', error_description: 'De gebruiker heeft geannuleerd.' })
    }
}

async function load(req: Request, res: Response) {
    try {
        return await provider().interactionDetails(req, res)
    } catch {
        // Verlopen, of de cookie ontbreekt (bv. andere browser).
        throw invalid('interactionExpired')
    }
}

/** Resultaat doorgeven; de frontend stuurt de browser naar redirectTo. */
async function finish(req: Request, res: Response, result: InteractionResults) {
    const redirectTo = await provider().interactionResult(req, res, result, { mergeWithLastSubmission: false })
    return { redirectTo }
}
