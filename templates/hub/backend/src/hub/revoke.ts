import { hub } from '../db/hub.js'
import { emitToApps } from './events.js'

/**
 * Toegang intrekken. De hub bewaart alles van oidc-provider in oidc_store, dus
 * "overal afmelden" = die rijen weggooien én de apps verwittigen; die sluiten
 * dan hun eigen sessies (event user.sessions_revoked).
 */

/** Alles waarmee dit account nog binnen kan: hub-sessies, OIDC-sessies, grants en tokens. */
const ALL_KINDS = [
    'HubSession',
    'Session',
    'Interaction',
    'Grant',
    'AuthorizationCode',
    'AccessToken',
    'RefreshToken',
    'DeviceCode',
    'BackchannelAuthenticationRequest'
]

export type RevokeReason = 'password_reset' | 'disabled' | 'manual'

export async function revokeAccountAccess(accountId: string, reason: RevokeReason): Promise<void> {
    await hub.query(`delete from oidc_store where payload->>'accountId' = $1 and kind = any($2::text[])`, [
        accountId,
        ALL_KINDS
    ])
    // GrantOrg hoort bij een grant die er nu niet meer is.
    await hub.query(
        `delete from oidc_store where kind = 'GrantOrg'
          and grant_id is not null
          and not exists (select 1 from oidc_store g where g.kind = 'Grant' and g.id = oidc_store.grant_id)`
    )
    await emitToApps({
        type: 'user.sessions_revoked',
        actorId: accountId,
        data: { account_id: accountId, reason }
    })
}

/** Enkel de SSO-sessies van dit account (afmelden bij de hub); grants blijven. */
export async function endOidcSessions(accountId: string): Promise<void> {
    await hub.query("delete from oidc_store where kind = 'Session' and payload->>'accountId' = $1", [accountId])
}

/** De hub-sessie die bij deze cookiewaarde hoort, sluiten (bv. bij afmelden via een app). */
export async function endHubSession(code: string | undefined): Promise<void> {
    if (!code) return
    const { sha256 } = await import('../auth/codes.js')
    await hub.query("delete from oidc_store where kind = 'HubSession' and id = $1", [sha256(code)])
}
