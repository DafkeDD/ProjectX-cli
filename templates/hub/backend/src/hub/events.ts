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
