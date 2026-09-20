import { hub } from '../db/hub.js'
import { getMembership, type Organization } from '../hub/accounts.js'

/**
 * Welke organisatie hoort bij een grant (= login van een account bij een app).
 * oidc-provider kan dat zelf niet bewaren, dus staat het in oidc_store als
 * GrantOrg; bij het intrekken van de grant verdwijnt het mee.
 */
const GRANT_TTL_DAYS = 365

export async function setGrantOrg(grantId: string, orgId: string): Promise<void> {
    await hub.query(
        `insert into oidc_store (kind, id, payload, grant_id, expires_at)
         values ('GrantOrg', $1, $2, $1, now() + make_interval(days => $3))
         on conflict (kind, id) do update set payload = excluded.payload, expires_at = excluded.expires_at`,
        [grantId, { orgId }, GRANT_TTL_DAYS]
    )
}

/** De organisatie van een grant — enkel als het account er (nog) lid van is. */
export async function grantOrg(grantId: string | undefined, accountId: string): Promise<Organization | null> {
    if (!grantId) return null
    const row = await hub.one<{ payload: { orgId: string } }>(
        "select payload from oidc_store where kind = 'GrantOrg' and id = $1 and expires_at > now()",
        [grantId]
    )
    return row ? getMembership(accountId, row.payload.orgId) : null
}

/** Claims over de organisatie, in id-token, userinfo en access token. */
export const orgClaims = (org: Organization | null) =>
    org ? { org_id: org.id, tenant_key: org.tenant_key, org_name: org.name, org_role: org.role } : {}
