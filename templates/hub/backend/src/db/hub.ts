import pg from 'pg'
import { env } from '../env.js'
import { createDb } from './sql.js'

/** Verbinding met projectx_hub, als de rol projectx_hub. */
export const hubPool = new pg.Pool({
    host: env.db.host,
    port: env.db.port,
    database: env.db.database,
    user: env.db.user,
    password: env.db.password(),
    max: 10
})

export const hub = createDb(hubPool)

/** Voor /health: is de hub-database bereikbaar? */
export async function hubIsHealthy(): Promise<boolean> {
    try {
        await hubPool.query('select 1')
        return true
    } catch {
        return false
    }
}
