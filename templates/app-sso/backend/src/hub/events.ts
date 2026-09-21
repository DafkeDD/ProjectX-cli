import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../env.js'
import { control } from '../db/control.js'
import type { Db } from '../db/sql.js'
import { deleteSessionsFor, deleteSessionsOfOrg } from '../auth/sessions.js'
import { fetchEvents, type HubEvent } from './client.js'

/**
 * Events van de hub: licenties, organisaties en gebruikers. Ze komen binnen
 * via de webhook (POST /hub/events) én we halen ze op bij het opstarten en
 * elke minuut. Elk event wordt precies één keer verwerkt (processed_events).
 */
const MAX_AGE_SECONDS = 300

/** Klopt de handtekening van de hub? (HMAC-SHA256 over "<tijd>.<body>") */
export function verifySignature(body: string, timestamp: unknown, signature: unknown): boolean {
    if (typeof timestamp !== 'string' || typeof signature !== 'string') return false
    const age = Math.abs(Date.now() / 1000 - Number(timestamp))
    if (!Number.isFinite(age) || age > MAX_AGE_SECONDS) return false
    const mine = createHmac('sha256', env.oidc.webhookSecret()).update(`${timestamp}.${body}`).digest('hex')
    const a = Buffer.from(mine)
    const b = Buffer.from(signature)
    return a.length === b.length && timingSafeEqual(a, b)
}

/** Nog niet verwerkt? Dan meteen vastleggen dat we het nu doen. */
async function claim(db: Db, event: HubEvent): Promise<boolean> {
    const result = await db.query(
        'insert into processed_events (id, type) values ($1, $2) on conflict (id) do nothing',
        [event.id, event.type]
    )
    return (result.rowCount ?? 0) > 0
}

/** Wat elk soort event betekent voor deze app. */
async function apply(db: Db, event: HubEvent): Promise<void> {
    const data = event.data as {
        account_id?: string
        org_id?: string
        tenant_key?: string
        name?: string
        license?: Record<string, unknown>
    }
    const orgId = data.org_id ?? null

    switch (event.type) {
        case 'organization.updated':
            if (data.tenant_key && data.name) {
                await db.query('update tenants set name = $2, updated_at = now() where tenant_key = $1', [
                    data.tenant_key,
                    data.name
                ])
            }
            break

        // Licenties (fase 2b): bewaren bij de tenant, zodat de app ze kan lezen.
        case 'license.granted':
        case 'license.updated':
        case 'license.suspended':
        case 'license.revoked':
            if (data.tenant_key) {
                await db.query('update tenants set license = $2, updated_at = now() where tenant_key = $1', [
                    data.tenant_key,
                    data.license ?? null
                ])
            }
            break

        // Geen toegang meer: de sessies van die gebruiker sluiten.
        case 'seat.revoked':
        case 'membership.removed':
            if (data.account_id) await deleteSessionsFor(data.account_id, orgId, db)
            break

        case 'user.disabled':
        case 'user.sessions_revoked':
            if (data.account_id) await deleteSessionsFor(data.account_id, null, db)
            break

        case 'organization.disabled':
            if (orgId) await deleteSessionsOfOrg(orgId, db)
            break

        default:
            // Onbekend event: enkel vastleggen dat we het gezien hebben.
            break
    }
}

/**
 * Eén event verwerken (uit de webhook of opgehaald). Vastleggen dát we het
 * verwerken en het verwerken zelf zitten in één transactie: gaat er iets mis,
 * dan is het alsof er niets gebeurd is en komt het event later opnieuw.
 */
export async function handleEvent(event: HubEvent): Promise<void> {
    // Van een andere app? Niet verwerken.
    if (event.appKey && event.appKey !== env.oidc.clientId()) return
    await control.tx(async tx => {
        if (!(await claim(tx, event))) return
        await apply(tx, event)
    })
}

/**
 * Alles ophalen wat we gemist hebben (bij het opstarten en elke minuut). De
 * teller schuift pas op als een event echt verwerkt is.
 */
export async function syncEvents(): Promise<number> {
    const cursor = await control.one<{ last_event_id: string | null }>('select last_event_id from event_cursor')
    let after = cursor?.last_event_id ?? null
    const events = await fetchEvents(after)
    let done = 0
    for (const event of events) {
        await handleEvent(event)
        after = event.id
        done++
        await control.query('update event_cursor set last_event_id = $1, updated_at = now()', [after])
    }
    return done
}

/** Start de ophaal-lus (elke minuut). */
export function startEventSync(): void {
    const run = () =>
        void syncEvents().catch(error => console.error('Events ophalen van de hub mislukt:', String(error)))
    run()
    setInterval(run, 60_000).unref()
}
