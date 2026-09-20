import { createHmac } from 'node:crypto'
import { hub } from '../db/hub.js'
import { webhookSecretOf } from './apps.js'

/**
 * Events opsturen naar de apps met een webhook. Mislukt het, dan proberen we
 * later opnieuw (1 min, 5 min, 30 min, 2 u, daarna elk uur tot 24 u). Apps
 * zonder webhook halen hun events zelf op.
 */
const RETRIES = [60, 300, 1800, 7200]
const HOUR = 3600
const GIVE_UP_AFTER = 24 * 3600
const BATCH = 25

interface Pending {
    id: string
    type: string
    app_id: string
    data: Record<string, unknown>
    created_at: Date
    webhook_url: string | null
    attempts: number
    first_at: string | null
}

/** Handtekening van een webhook: HMAC-SHA256 over "<tijd>.<body>". */
export const signBody = (secret: string, timestamp: string, body: string): string =>
    createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')

const backoff = (attempts: number): number => RETRIES[attempts] ?? HOUR

async function deliver(row: Pending): Promise<void> {
    const body = JSON.stringify({
        id: row.id,
        type: row.type,
        occurredAt: row.created_at.toISOString(),
        appKey: row.app_id,
        data: row.data
    })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const secret = await webhookSecretOf(row.app_id)
    if (!secret || !row.webhook_url) return

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
        const response = await fetch(row.webhook_url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-projectx-timestamp': timestamp,
                'x-projectx-signature': signBody(secret, timestamp, body)
            },
            body,
            signal: controller.signal
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        await hub.query(
            `update events set delivery = delivery || jsonb_build_object('state', 'sent', 'delivered_at', now()::text)
             where id = $1`,
            [row.id]
        )
    } catch (error) {
        const attempts = row.attempts + 1
        const first = row.first_at ? new Date(row.first_at) : new Date()
        const state = Date.now() - first.getTime() > GIVE_UP_AFTER * 1000 ? 'failed' : 'pending'
        await hub.query(
            `update events set delivery = delivery || jsonb_build_object(
                'state', $2::text, 'attempts', $3::int, 'first_at', $4::text,
                'next_at', (now() + make_interval(secs => $5::int))::text,
                'error', $6::text)
             where id = $1`,
            [row.id, state, attempts, first.toISOString(), backoff(row.attempts), String(error).slice(0, 200)]
        )
    } finally {
        clearTimeout(timer)
    }
}

/** Alles wat nu aan de beurt is, opsturen (elke 30 seconden). */
export async function deliverPending(): Promise<void> {
    const rows = await hub.many<Pending & Record<string, unknown>>(
        `select e.id, e.type, e.app_id, e.data, e.created_at, a.webhook_url,
                coalesce((e.delivery->>'attempts')::int, 0) as attempts, e.delivery->>'first_at' as first_at
           from events e join apps a on a.id = e.app_id
          where e.delivery->>'state' = 'pending'
            and coalesce((e.delivery->>'next_at')::timestamptz, e.created_at) <= now()
          order by e.id limit $1`,
        [BATCH]
    )
    for (const row of rows) {
        // Zonder webhook blijft het event klaarstaan om opgehaald te worden.
        if (!row.webhook_url) {
            await hub.query('update events set delivery = delivery || \'{"state":"poll"}\'::jsonb where id = $1', [
                row.id
            ])
            continue
        }
        await deliver(row)
    }
}
