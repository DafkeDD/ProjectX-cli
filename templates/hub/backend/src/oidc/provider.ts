import Provider, { type Configuration, type KoaContextWithOIDC } from 'oidc-provider'
import { env } from '../env.js'
import { getAccount } from '../hub/accounts.js'
import { HubAdapter } from './adapter.js'
import { grantOrg, orgClaims } from './grant-org.js'
import { cookieKeys, signingKeys } from './keys.js'

let instance: Provider | null = null

/** De OIDC-server (na createProvider bij het opstarten). */
export function provider(): Provider {
    if (!instance) throw new Error('OIDC-provider is nog niet gestart.')
    return instance
}

const html = (body: string) =>
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body>${body}</body></html>`

/**
 * oidc-provider met alles uit de hub-database. Schermen (inloggen, organisatie
 * kiezen, fouten) zijn pagina's van de frontend, nooit HTML van de provider.
 */
export async function createProvider(): Promise<Provider> {
    const configuration: Configuration = {
        adapter: HubAdapter,
        jwks: await signingKeys(),
        cookies: {
            keys: await cookieKeys(),
            names: { session: 'px_oidc', interaction: 'px_interaction', resume: 'px_resume' },
            long: { signed: true, secure: env.production, sameSite: 'lax' },
            short: { signed: true, secure: env.production, sameSite: 'lax' }
        },

        scopes: ['openid', 'offline_access', 'email', 'profile', 'organization'],
        claims: {
            openid: ['sub'],
            email: ['email', 'email_verified'],
            profile: ['name', 'locale'],
            organization: ['org_id', 'tenant_key', 'org_name', 'org_role']
        },
        // Ook de gevraagde claims in het id-token, niet enkel via userinfo.
        conformIdTokenClaims: false,

        async findAccount(_ctx, sub, token) {
            const account = await getAccount(sub)
            if (!account || account.status !== 'active') return undefined
            return {
                accountId: sub,
                async claims() {
                    const org = await grantOrg((token as { grantId?: string } | undefined)?.grantId, sub)
                    return {
                        sub,
                        email: account.email,
                        email_verified: true,
                        name: account.name,
                        ...(account.locale ? { locale: account.locale } : {}),
                        ...orgClaims(org)
                    }
                }
            }
        },

        async extraTokenClaims(_ctx, token) {
            const t = token as { accountId?: string; grantId?: string }
            if (!t.accountId) return undefined
            return orgClaims(await grantOrg(t.grantId, t.accountId))
        },

        interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },

        responseTypes: ['code'],
        pkce: { required: () => true },
        clientDefaults: {
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'client_secret_basic'
        },

        features: {
            devInteractions: { enabled: false },
            revocation: { enabled: true },
            introspection: { enabled: true },
            rpInitiatedLogout: {
                enabled: true,
                // Geen bevestigingsscherm: meteen afmelden.
                async logoutSource(ctx: KoaContextWithOIDC, form: string) {
                    ctx.body = html(
                        `${form.replace('</form>', '<input type="hidden" name="logout" value="yes"/></form>')}<script>document.forms[0].submit()</script>`
                    )
                },
                async postLogoutSuccessSource(ctx: KoaContextWithOIDC) {
                    ctx.redirect(`${env.frontendUrl}/`)
                }
            }
        },

        ttl: {
            AccessToken: 10 * 60,
            IdToken: 10 * 60,
            AuthorizationCode: 60,
            Interaction: 60 * 60,
            Session: 14 * 24 * 3600,
            Grant: 365 * 24 * 3600,
            RefreshToken: 14 * 24 * 3600
        },

        // Fouten tonen op een pagina van de frontend (vertaald).
        async renderError(ctx, out) {
            const query = new URLSearchParams({ error: String(out.error ?? 'server_error') })
            ctx.redirect(`${env.frontendUrl}/error?${query}`)
        }
    }

    instance = new Provider(env.issuer, configuration)
    // Achter de frontend (Next.js stuurt /oidc door): X-Forwarded-* vertrouwen.
    instance.proxy = true
    return instance
}
