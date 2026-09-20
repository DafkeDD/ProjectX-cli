import { getTenant, provisionTenant, type Tenant } from '../db/tenants.js'
import { control } from '../db/control.js'
import { reportTenant } from '../hub/client.js'
import type { Claims } from '../auth/oidc.js'

/**
 * De database van een organisatie bij de EERSTE login aanmaken. Bestaat ze al,
 * dan houden we enkel de naam gelijk met de hub. De hub krijgt het resultaat
 * te horen (tenant.ready / tenant.failed).
 */
export async function ensureTenant(claims: Pick<Claims, 'org_id' | 'org_name' | 'tenant_key'>): Promise<Tenant> {
    const existing = await getTenant(claims.tenant_key)
    if (existing?.status === 'active') {
        if (existing.name !== claims.org_name) {
            await control.query('update tenants set name = $2, updated_at = now() where tenant_key = $1', [
                claims.tenant_key,
                claims.org_name
            ])
        }
        return existing
    }
    if (existing?.status === 'blocked' || existing?.status === 'archived') return existing

    try {
        const tenant = await provisionTenant({ orgId: claims.org_id, name: claims.org_name })
        await reportTenant(claims.org_id, 'ready').catch(() => {})
        return tenant
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await reportTenant(claims.org_id, 'failed', message).catch(() => {})
        throw error
    }
}
