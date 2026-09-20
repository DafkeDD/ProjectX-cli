import { env } from '../env.js'

/**
 * Praten met de SSO-hub als deze app zelf (client_id + client_secret), los van
 * een gebruiker: melden dat een tenant klaar is, events ophalen.
 */
const basic = () =>
    'Basic ' +
    Buffer.from(`${encodeURIComponent(env.oidc.clientId())}:${encodeURIComponent(env.oidc.clientSecret())}`).toString(
        'base64'
    )

/** Adres van de hub-API (zelfde adres als de issuer, zonder /oidc). */
export const hubApi = (path: string) => `${env.oidc.issuer.replace(/\/oidc$/, '')}${path}`

async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(hubApi(path), {
        ...init,
        headers: {
            authorization: basic(),
            ...(init.body ? { 'content-type': 'application/json' } : {}),
            ...init.headers
        }
    })
    if (!response.ok) throw new Error(`Hub antwoordt ${response.status} op ${path}`)
    return response
}

/** Melden dat de database van een organisatie klaar is (of niet). */
export async function reportTenant(orgId: string, status: 'ready' | 'failed', message?: string): Promise<void> {
    await call('/api/apps/tenant', { method: 'POST', body: JSON.stringify({ org_id: orgId, status, message }) })
}

export interface HubEvent {
    id: string
    type: string
    occurredAt: string
    appKey: string
    data: Record<string, unknown>
}

/** Alles wat er na `after` gebeurd is (leeg = vanaf het begin). */
export async function fetchEvents(after: string | null, limit = 200): Promise<HubEvent[]> {
    const query = new URLSearchParams({ limit: String(limit), ...(after ? { after } : {}) })
    const response = await call(`/api/events?${query}`)
    return (await response.json()) as HubEvent[]
}
