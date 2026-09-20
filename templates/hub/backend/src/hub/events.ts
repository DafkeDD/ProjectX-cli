import { randomBytes } from 'node:crypto'
import { hub } from '../db/hub.js'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** ULID: sorteert op tijd, zodat apps later "alles na id X" kunnen ophalen. */
export function ulid(time = Date.now()): string {
    let out = ''
    for (let i = 9, t = time; i >= 0; i--, t = Math.floor(t / 32)) out = ALPHABET[t % 32] + out
    for (const byte of randomBytes(16)) out += ALPHABET[byte % 32]
    return out
}

/**
 * Schrijft een event in de tabel events (auditlog; vanaf fase 3 ook de
 * wachtrij naar de apps).
 */
export async function recordEvent(input: {
    type: string
    actorId?: string | null
    orgId?: string | null
    appId?: string | null
    data?: Record<string, unknown>
}): Promise<void> {
    await hub.query('insert into events (id, type, app_id, org_id, actor_id, data) values ($1, $2, $3, $4, $5, $6)', [
        ulid(),
        input.type,
        input.appId ?? null,
        input.orgId ?? null,
        input.actorId ?? null,
        input.data ?? {}
    ])
}

/** Zoals een app een event ziet. */
export interface AppEvent {
    id: string
    type: string
    occurredAt: string
    appKey: string
    data: Record<string, unknown>
}

/**
 * Event voor de apps: één rij per app, met een bezorgstatus. Zonder appId gaat
 * het naar alle actieve apps. Apps met een webhook krijgen het opgestuurd; de
 * andere halen het zelf op (GET /api/events?after=).
 */
export async function emitToApps(input: {
    type: string
    orgId?: string | null
    actorId?: string | null
    appId?: string | null
    data?: Record<string, unknown>
}): Promise<void> {
    const apps = input.appId
        ? [{ id: input.appId, webhook_url: null as string | null }]
        : await hub.many<{ id: string; webhook_url: string | null }>(
              "select id, webhook_url from apps where status = 'active'"
          )
    for (const app of apps) {
        await hub.query(
            `insert into events (id, type, app_id, org_id, actor_id, data, delivery)
             values ($1, $2, $3, $4, $5, $6, $7)`,
            [
                ulid(),
                input.type,
                app.id,
                input.orgId ?? null,
                input.actorId ?? null,
                input.data ?? {},
                { state: 'pending', attempts: 0, next_at: new Date().toISOString() }
            ]
        )
    }
}

/** Events van een app ophalen, oudste eerst (alles na `after`). */
export async function eventsForApp(appId: string, after: string | null, limit: number): Promise<AppEvent[]> {
    const rows = await hub.many<{ id: string; type: string; data: Record<string, unknown>; created_at: Date }>(
        `select id, type, data, created_at from events
          where app_id = $1 and delivery is not null and ($2::text is null or id > $2)
          order by id limit $3`,
        [appId, after, limit]
    )
    return rows.map(row => ({
        id: row.id,
        type: row.type,
        occurredAt: row.created_at.toISOString(),
        appKey: appId,
        data: row.data
    }))
}
