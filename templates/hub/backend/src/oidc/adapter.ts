import type { Adapter, AdapterPayload } from 'oidc-provider'
import { decrypt } from '../db/crypto.js'
import { hub } from '../db/hub.js'

type Row = { payload: AdapterPayload; consumed_at: Date | null; expires_at: Date | null }

const alive = (row: Row | null): AdapterPayload | undefined => {
    if (!row) return undefined
    if (row.expires_at && row.expires_at.getTime() <= Date.now()) return undefined
    return { ...row.payload, ...(row.consumed_at ? { consumed: true } : {}) }
}

/**
 * Opslag voor oidc-provider in één tabel: oidc_store (kind + id).
 * Clients komen uit de tabel apps (een app = een OIDC-client).
 */
export class HubAdapter implements Adapter {
    constructor(private readonly kind: string) {}

    async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
        if (this.kind === 'Client') throw new Error('Clients worden beheerd via de tabel apps.')
        await hub.query(
            `insert into oidc_store (kind, id, payload, grant_id, uid, user_code, expires_at)
             values ($1, $2, $3, $4, $5, $6, $7)
             on conflict (kind, id) do update
                set payload = excluded.payload, grant_id = excluded.grant_id, uid = excluded.uid,
                    user_code = excluded.user_code, expires_at = excluded.expires_at`,
            [
                this.kind,
                id,
                payload,
                payload.grantId ?? null,
                payload.uid ?? null,
                payload.userCode ?? null,
                expiresIn ? new Date(Date.now() + expiresIn * 1000) : null
            ]
        )
    }

    async find(id: string): Promise<AdapterPayload | undefined> {
        if (this.kind === 'Client') return findClient(id)
        return alive(
            await hub.one<Row>('select payload, consumed_at, expires_at from oidc_store where kind = $1 and id = $2', [
                this.kind,
                id
            ])
        )
    }

    async findByUid(uid: string): Promise<AdapterPayload | undefined> {
        return alive(
            await hub.one<Row>('select payload, consumed_at, expires_at from oidc_store where kind = $1 and uid = $2', [
                this.kind,
                uid
            ])
        )
    }

    async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
        return alive(
            await hub.one<Row>(
                'select payload, consumed_at, expires_at from oidc_store where kind = $1 and user_code = $2',
                [this.kind, userCode]
            )
        )
    }

    async consume(id: string): Promise<void> {
        await hub.query('update oidc_store set consumed_at = now() where kind = $1 and id = $2', [this.kind, id])
    }

    async destroy(id: string): Promise<void> {
        await hub.query('delete from oidc_store where kind = $1 and id = $2', [this.kind, id])
    }

    async revokeByGrantId(grantId: string): Promise<void> {
        // Alles van die grant, ook onze eigen GrantOrg-rij.
        await hub.query('delete from oidc_store where grant_id = $1', [grantId])
    }
}

/** Een actieve app als OIDC-client; het secret staat versleuteld in apps.client. */
async function findClient(id: string): Promise<AdapterPayload | undefined> {
    const app = await hub.one<{ client: AdapterPayload & { client_secret?: string } }>(
        "select client from apps where id = $1 and status = 'active'",
        [id]
    )
    if (!app) return undefined
    const { client_secret, ...client } = app.client
    return { ...client, client_id: id, ...(client_secret ? { client_secret: decrypt(client_secret) } : {}) }
}

/** Verlopen rijen opruimen (bij het opstarten en elk uur). */
export async function cleanupOidcStore(): Promise<void> {
    await hub.query('delete from oidc_store where expires_at < now()')
}
