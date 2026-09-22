/**
 * Bestanden voor de multitenant-databaselaag in de backend (NestJS én Express).
 * Alles zelf: kale `pg`, geen ORM, geen querybuilder, eigen migratie-runner.
 *
 * Namen (zie het plan):
 *   <appKey>_control            control-database (rol <appKey>_app)
 *   <appKey>_provisioner        rol die tenant-databases en -rollen aanmaakt
 *   <appKey>_t_<naam>_<begin sleutel>  database én rol per tenant
 */

/** src/env.ts met de database-instellingen erbij (vervangt de versie zonder database). */
export const ENV_TS_DB = `import { existsSync } from 'node:fs'

// .env laden zonder extra package. Waarden die al in de omgeving staan
// (bv. in Docker of CI) blijven voorgaan.
if (existsSync('.env')) process.loadEnvFile('.env')

const required = (name: string): string => {
    const value = process.env[name]
    if (!value) throw new Error(\`\${name} ontbreekt in .env\`)
    return value
}

const appKey = process.env.APP_KEY || 'app'

/**
 * Alle instellingen op één plek, met terugvalwaarden.
 * Gebruik overal \`env.*\` — nooit process.env rechtstreeks.
 */
export const env = {
    appName: process.env.APP_NAME || 'App',
    port: Number(process.env.PORT) || 4000,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

    /** Vaste sleutel van de app: voorvoegsel van alle databases en rollen. */
    appKey,
    db: {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        /** control-database + de rol waarmee de app ze gebruikt */
        control: { database: \`\${appKey}_control\`, user: \`\${appKey}_app\`, password: () => required('APP_DB_PASSWORD') },
        /** rol die tenant-databases en -rollen aanmaakt (geen superuser) */
        provisioner: { user: \`\${appKey}_provisioner\`, password: () => required('PROVISIONER_DB_PASSWORD') },
        /** 32 bytes (base64) om de wachtwoorden van tenant-rollen te versleutelen */
        secretKey: () => required('DB_SECRET_KEY')
    }
} as const
`

/** src/db/sql.ts — dunne eigen laag op pg. */
const SQL_TS = `import pg from 'pg'

export type Row = Record<string, unknown>

/**
 * Kleine eigen laag op \`pg\` — geen ORM. Altijd parameters (\`$1\`, \`$2\`)
 * gebruiken, nooit waarden in de SQL-tekst plakken.
 *
 *   const users = await db.many<User>('select * from users where active = $1', [true])
 *   const user = await db.one<User>('select * from users where id = $1', [id])
 *   await db.tx(async tx => { await tx.query('...'); await tx.query('...') })
 */
export interface Db {
    query(text: string, params?: unknown[]): Promise<pg.QueryResult>
    many<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>
    one<T extends Row = Row>(text: string, params?: unknown[]): Promise<T | null>
    tx<R>(work: (tx: Db) => Promise<R>): Promise<R>
}

type Queryable = pg.Pool | pg.PoolClient | pg.Client

function wrap(target: Queryable, pool?: pg.Pool): Db {
    const db: Db = {
        query: (text, params) => target.query(text, params),
        many: async <T extends Row>(text: string, params?: unknown[]) =>
            (await target.query<T>(text, params)).rows,
        one: async <T extends Row>(text: string, params?: unknown[]) =>
            (await target.query<T>(text, params)).rows[0] ?? null,
        tx: async work => {
            // Al in een transactie: een savepoint, zodat een opgevangen fout
            // de buitenste transactie niet in de war stuurt.
            if (!pool) {
                const name = \`sp_\${Math.random().toString(36).slice(2, 10)}\`
                await target.query(\`savepoint \${name}\`)
                try {
                    const result = await work(db)
                    await target.query(\`release savepoint \${name}\`)
                    return result
                } catch (error) {
                    await target.query(\`rollback to savepoint \${name}\`).catch(() => {})
                    throw error
                }
            }
            const client = await pool.connect()
            try {
                await client.query('begin')
                const result = await work(wrap(client))
                await client.query('commit')
                return result
            } catch (error) {
                // Een mislukte rollback mag de echte fout niet verbergen.
                await client.query('rollback').catch(() => {})
                throw error
            } finally {
                client.release()
            }
        }
    }
    return db
}

export const createDb = (pool: pg.Pool): Db => wrap(pool, pool)

/** Alles op één vaste verbinding (bv. een advisory lock die open moet blijven). */
export const onClient = (client: pg.PoolClient | pg.Client): Db => wrap(client)

/** Naam van een database of rol veilig maken voor SQL (enkel a-z, 0-9, _). */
export function ident(name: string): string {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error(\`Ongeldige naam: \${name}\`)
    return \`"\${name}"\`
}

/**
 * Tekstwaarde in SQL zetten voor de paar plaatsen waar geen $1 kan
 * (CREATE ROLE ... PASSWORD). Enkel voor waarden die wij zelf maken: alles
 * buiten letters, cijfers, _ en - wordt geweigerd.
 */
export function literal(value: string): string {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new Error('Ongeldige waarde voor SQL.')
    return \`'\${value}'\`
}
`

/** src/db/crypto.ts — AES-256-GCM voor de wachtwoorden van tenant-rollen. */
const CRYPTO_TS = `import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../env.js'

const key = () => {
    const bytes = Buffer.from(env.db.secretKey(), 'base64')
    if (bytes.length !== 32) throw new Error('DB_SECRET_KEY moet 32 bytes zijn (base64)')
    return bytes
}

/** Versleutelt tekst: "v1:<iv>:<tag>:<data>" (base64). */
export function encrypt(text: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key(), iv)
    const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}

export function decrypt(value: string): string {
    const [version, iv, tag, data] = value.split(':')
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Onbekend versleutelformaat')
    const authTag = Buffer.from(tag, 'base64')
    // Een ingekorte tag maakt vervalsing makkelijker: enkel de volle 16 bytes.
    if (authTag.length !== 16) throw new Error('Onbekend versleutelformaat.')
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

/** Willekeurig wachtwoord zonder tekens die in een URL of SQL lastig zijn. */
export const randomPassword = () => randomBytes(24).toString('base64url')
`

/** src/db/control.ts — de control-database. */
const CONTROL_TS = `import pg from 'pg'
import { env } from '../env.js'
import { createDb } from './sql.js'

/** Verbinding met <appKey>_control, als <appKey>_app. */
export const controlPool = new pg.Pool({
    host: env.db.host,
    port: env.db.port,
    database: env.db.control.database,
    user: env.db.control.user,
    password: env.db.control.password(),
    max: 5
})

export const control = createDb(controlPool)

/** Verbinding als provisioner (op de database "postgres"), enkel om tenants aan te maken. */
export const provisionPool = new pg.Pool({
    host: env.db.host,
    port: env.db.port,
    database: 'postgres',
    user: env.db.provisioner.user,
    password: env.db.provisioner.password(),
    max: 2
})

/** Voor /health: is de control-database bereikbaar? */
export async function controlIsHealthy(): Promise<boolean> {
    try {
        await controlPool.query('select 1')
        return true
    } catch {
        return false
    }
}
`

/** src/db/migrate.ts — eigen migratie-runner. */
const MIGRATE_TS = `import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type pg from 'pg'

/** Map met SQL-migraties: migrations/<kind> (control, tenant of hub). */
const dir = (kind: string) => path.resolve('migrations', kind)

/**
 * Draait alle nog niet uitgevoerde migraties (genummerde .sql-bestanden, in
 * volgorde), elk in een eigen transactie. Een advisory lock zorgt dat twee
 * processen niet tegelijk migreren. Geeft de laatste migratie terug.
 *
 * Regel: migraties zijn altijd achterwaarts compatibel (eerst toevoegen, pas
 * in een latere release oude kolommen weghalen).
 */
export async function runMigrations(pool: pg.Pool, kind: string): Promise<string | null> {
    const client = await pool.connect()
    try {
        await client.query('select pg_advisory_lock(727001)')
        await client.query(
            'create table if not exists migrations (name text primary key, applied_at timestamptz not null default now())'
        )
        const done = new Set((await client.query<{ name: string }>('select name from migrations')).rows.map(r => r.name))
        const files = readdirSync(dir(kind))
            .filter(f => f.endsWith('.sql'))
            .sort()

        for (const file of files) {
            if (done.has(file)) continue
            await client.query('begin')
            try {
                await client.query(readFileSync(path.join(dir(kind), file), 'utf8'))
                await client.query('insert into migrations (name) values ($1)', [file])
                await client.query('commit')
            } catch (error) {
                await client.query('rollback')
                throw new Error(\`Migratie \${kind}/\${file} mislukt: \${error instanceof Error ? error.message : error}\`, {
                    cause: error
                })
            }
        }
        return files.at(-1) ?? null
    } finally {
        await client.query('select pg_advisory_unlock(727001)').catch(() => {})
        client.release()
    }
}
`

/** src/db/pools.ts — een kleine pool per tenant, met bovengrens. */
const POOLS_TS = `import pg from 'pg'
import { env } from '../env.js'
import { control } from './control.js'
import { decrypt } from './crypto.js'
import { createDb, type Db } from './sql.js'

/** Hoogstens zoveel tenant-pools tegelijk open; de langst ongebruikte gaat eerst dicht. */
const MAX_POOLS = 50
/** Per tenant hoogstens zoveel verbindingen. */
const MAX_PER_TENANT = 3
/** Een pool die zo lang niet gebruikt is, gaat dicht. */
const IDLE_MS = 60_000

interface Entry {
    pool: pg.Pool
    db: Db
    lastUsed: number
    /** Wanneer de status van de tenant laatst gecontroleerd is. */
    checkedAt: number
}

/** Zo lang vertrouwen we de status van een tenant zonder ze opnieuw op te vragen. */
const STATUS_MS = 10_000

const pools = new Map<string, Entry>()
/** Pools die op dit moment geopend worden (zodat er maar één per tenant komt). */
const openings = new Map<string, Promise<Db>>()

export class TenantUnavailableError extends Error {
    constructor(
        readonly tenantKey: string,
        readonly status: string
    ) {
        super(\`Tenant \${tenantKey} is niet beschikbaar (status: \${status})\`)
    }
}

/** Opent een pool naar de tenant-database, als de tenant-rol zelf. */
export function openTenantPool(tenant: { db_name: string; db_role: string; db_password: string }): pg.Pool {
    return new pg.Pool({
        host: env.db.host,
        port: env.db.port,
        database: tenant.db_name,
        user: tenant.db_role,
        password: decrypt(tenant.db_password),
        max: MAX_PER_TENANT,
        idleTimeoutMillis: 30_000
    })
}

/**
 * De database van een tenant. Enkel voor actieve tenants — een geblokkeerde
 * tenant geeft een TenantUnavailableError.
 *
 *   const db = await tenantDb(user.tenantKey)
 *   const rows = await db.many('select * from ...')
 */
export async function tenantDb(tenantKey: string): Promise<Db> {
    const cached = pools.get(tenantKey)
    if (cached) {
        cached.lastUsed = Date.now()
        // De status van de tenant wordt regelmatig hercontroleerd: blokkeren
        // (hier of in een ander proces) werkt anders pas als de pool vanzelf dichtgaat.
        if (Date.now() - cached.checkedAt < STATUS_MS) return cached.db
        const status = await tenantStatus(tenantKey)
        if (status !== 'active') {
            await closeTenantPool(tenantKey)
            throw new TenantUnavailableError(tenantKey, status)
        }
        cached.checkedAt = Date.now()
        return cached.db
    }

    // Twee gelijktijdige aanvragen mogen niet elk een pool openen.
    const opening = openings.get(tenantKey)
    if (opening) return opening
    const promise = openEntry(tenantKey).finally(() => openings.delete(tenantKey))
    openings.set(tenantKey, promise)
    return promise
}

/** Status van een tenant volgens de control-database. */
async function tenantStatus(tenantKey: string): Promise<string> {
    const row = await control.one<{ status: string }>('select status from tenants where tenant_key = $1', [tenantKey])
    return row?.status ?? 'unknown'
}

async function openEntry(tenantKey: string): Promise<Db> {
    const tenant = await control.one<{ db_name: string; db_role: string; db_password: string; status: string }>(
        'select db_name, db_role, db_password, status from tenants where tenant_key = $1',
        [tenantKey]
    )
    if (!tenant) throw new TenantUnavailableError(tenantKey, 'unknown')
    if (tenant.status !== 'active') throw new TenantUnavailableError(tenantKey, tenant.status)

    // Plaats maken: de langst ongebruikte pools sluiten.
    while (pools.size >= MAX_POOLS) {
        const [oldest] = [...pools.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)
        if (!oldest) break
        await closeTenantPool(oldest[0])
    }

    const pool = openTenantPool(tenant)
    const entry: Entry = { pool, db: createDb(pool), lastUsed: Date.now(), checkedAt: Date.now() }
    pools.set(tenantKey, entry)
    return entry.db
}

export async function closeTenantPool(tenantKey: string): Promise<void> {
    const entry = pools.get(tenantKey)
    if (!entry) return
    pools.delete(tenantKey)
    await entry.pool.end().catch(() => {})
}

export async function closeAllTenantPools(): Promise<void> {
    await Promise.all([...pools.keys()].map(closeTenantPool))
}

/** Ongebruikte pools regelmatig sluiten. */
setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of pools) {
        if (now - entry.lastUsed > IDLE_MS) void closeTenantPool(key)
    }
}, 15_000).unref()
`

/** src/db/tenants.ts — tenants aanmaken, blokkeren, opvragen. */
const TENANTS_TS = `import { randomUUID } from 'node:crypto'
import { env } from '../env.js'
import { control, controlPool, provisionPool } from './control.js'
import { decrypt, encrypt, randomPassword } from './crypto.js'
import { runMigrations } from './migrate.js'
import { closeTenantPool, openTenantPool } from './pools.js'
import { ident, literal, onClient, type Db } from './sql.js'

export type TenantStatus = 'creating' | 'active' | 'failed' | 'blocked' | 'archived'

export interface Tenant {
    id: string
    tenant_key: string
    name: string
    db_name: string
    db_role: string
    status: TenantStatus
    schema_version: string | null
    error: string | null
    created_at: Date
}

const COLUMNS = 'id, tenant_key, name, db_name, db_role, status, schema_version, error, created_at'

/** tenantKey = de eerste 12 tekens van de organisatie-UUID, zonder streepjes. */
export const tenantKeyFor = (orgId: string) => orgId.replace(/-/g, '').slice(0, 12).toLowerCase()

/** "Praktijk Jansen & Co" -> "praktijk_jansen_co" (voor in een databasenaam). */
export function slugify(value: string): string {
    const slug = value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    return slug || 'org'
}

/**
 * Database- én rolnaam van een tenant: <appKey>_t_<naam>_<begin van de sleutel>,
 * bv. paspoort_t_praktijk_jansen_c20cc7. De naam maakt ze herkenbaar, het
 * stukje sleutel houdt ze uniek (PostgreSQL staat 63 tekens toe).
 */
export function tenantDbName(tenantKey: string, name: string): string {
    const suffix = tenantKey.slice(0, 6)
    const prefix = \`\${env.appKey}_t_\`
    const room = 63 - prefix.length - suffix.length - 1
    return \`\${prefix}\${slugify(name).slice(0, room).replace(/_+$/, '')}_\${suffix}\`
}

export const listTenants = () => control.many<Tenant & Record<string, unknown>>(\`select \${COLUMNS} from tenants order by created_at\`)

export const getTenant = (tenantKey: string) => tenantRow(control, tenantKey)

/** Zelfde als getTenant, maar op een meegegeven verbinding. */
const tenantRow = (db: Db, tenantKey: string) =>
    db.one<Tenant & Record<string, unknown>>(\`select \${COLUMNS} from tenants where tenant_key = $1\`, [tenantKey])

/**
 * Maakt de database van een tenant aan (of werkt een halve aanmaak af).
 * Veilig om opnieuw te draaien, ook gelijktijdig: een advisory lock per tenant
 * laat een tweede poging wachten, en elke stap kijkt eerst wat er al bestaat.
 *
 * Stappen: rij 'creating' -> rol -> database -> migraties -> 'active'.
 * Bij een fout: status 'failed' + foutmelding; opnieuw draaien gaat verder.
 */
export async function provisionTenant(input: { orgId?: string; name: string }): Promise<Tenant> {
    const orgId = input.orgId ?? randomUUID()
    const tenantKey = tenantKeyFor(orgId)

    // De lock-verbinding blijft open zolang we bezig zijn; alle control-queries
    // hieronder lopen daarom OVER die verbinding. Anders vraagt elke query een
    // tweede verbinding en loopt de pool vast zodra er enkele tenants tegelijk
    // aangemaakt worden.
    const lock = await controlPool.connect()
    const db = onClient(lock)
    try {
        await lock.query('select pg_advisory_lock(hashtext($1))', [\`tenant:\${tenantKey}\`])

        // 1. Rij in de control-DB (bestaande rij behoudt haar wachtwoord).
        const password = randomPassword()
        await db.query(
            \`insert into tenants (id, tenant_key, name, db_name, db_role, db_password, status)
             values ($1, $2, $3, $4, $4, $5, 'creating')
             on conflict (tenant_key) do update
                set status = case when tenants.status = 'active' then 'active' else 'creating' end,
                    error = null, updated_at = now()\`,
            [orgId, tenantKey, input.name, tenantDbName(tenantKey, input.name), encrypt(password)]
        )
        const row = await db.one<{ id: string; db_name: string; db_password: string; status: string }>(
            'select id, db_name, db_password, status from tenants where tenant_key = $1',
            [tenantKey]
        )
        // Zelfde sleutel maar een andere organisatie? Nooit dezelfde database delen.
        if (row && row.id !== orgId) {
            throw new Error(\`De sleutel \${tenantKey} is al in gebruik door een andere organisatie.\`)
        }
        if (row?.status === 'active') return (await tenantRow(db, tenantKey)) as Tenant
        // Bestaat de rij al, dan houden we haar databasenaam (ook een oudere naamvorm).
        const name = row!.db_name

        try {
            const secret = decrypt(row!.db_password)

            // 2. Rol: aanmaken of het wachtwoord gelijk zetten met de control-DB.
            const roleExists = await provisionPool.query('select 1 from pg_roles where rolname = $1', [name])
            await provisionPool.query(
                \`\${roleExists.rowCount ? 'alter' : 'create'} role \${ident(name)} login password \${literal(secret)}\`
            )
            // De provisioner moet "SET ROLE" kunnen doen om de rol eigenaar te maken.
            const version = Number((await provisionPool.query('show server_version_num')).rows[0].server_version_num)
            await provisionPool
                .query(
                    version >= 160000
                        ? \`grant \${ident(name)} to current_user with inherit false, set true\`
                        : \`grant \${ident(name)} to current_user\`
                )
                .catch(() => {}) // bestaat al

            // 3. Database (CREATE DATABASE kan niet in een transactie: eerst kijken of ze bestaat).
            const dbExists = await provisionPool.query('select 1 from pg_database where datname = $1', [name])
            if (!dbExists.rowCount) {
                await provisionPool.query(\`create database \${ident(name)} owner \${ident(name)}\`)
            }
            // Enkel de eigen rol mag verbinden. REVOKE moet van de eigenaar komen,
            // anders doet het niets: dus eerst die rol aannemen (op één verbinding).
            const client = await provisionPool.connect()
            try {
                await client.query(\`set role \${ident(name)}\`)
                await client.query(\`revoke connect, temporary on database \${ident(name)} from public\`)
            } finally {
                await client.query('reset role').catch(() => {})
                client.release()
            }

            // 4. Migraties, als de tenant-rol zelf.
            const pool = openTenantPool({ db_name: name, db_role: name, db_password: row!.db_password })
            let schemaVersion: string | null
            try {
                schemaVersion = await runMigrations(pool, 'tenant')
            } finally {
                await pool.end()
            }

            // 5. Klaar.
            await db.query(
                "update tenants set status = 'active', schema_version = $2, error = null, updated_at = now() where tenant_key = $1",
                [tenantKey, schemaVersion]
            )
        } catch (error) {
            await db.query(
                "update tenants set status = 'failed', error = $2, updated_at = now() where tenant_key = $1",
                [tenantKey, error instanceof Error ? error.message : String(error)]
            )
            throw error
        }
        return (await tenantRow(db, tenantKey)) as Tenant
    } finally {
        await lock.query('select pg_advisory_unlock(hashtext($1))', [\`tenant:\${tenantKey}\`]).catch(() => {})
        lock.release()
    }
}

/** Blokkeren: geen toegang meer, de database blijft staan (nooit automatisch verwijderen). */
export async function setTenantStatus(tenantKey: string, status: 'active' | 'blocked' | 'archived'): Promise<void> {
    await control.query('update tenants set status = $2, updated_at = now() where tenant_key = $1', [tenantKey, status])
    if (status !== 'active') await closeTenantPool(tenantKey)
}

/** Migreert alle actieve tenants (bij een release: npm run db:migrate). */
export async function migrateAllTenants(onProgress?: (tenantKey: string, version: string | null) => void): Promise<void> {
    const tenants = await control.many<{ tenant_key: string; db_name: string; db_role: string; db_password: string }>(
        "select tenant_key, db_name, db_role, db_password from tenants where status = 'active' order by created_at"
    )
    for (const tenant of tenants) {
        const pool = openTenantPool(tenant)
        try {
            const version = await runMigrations(pool, 'tenant')
            await control.query(
                "update tenants set schema_version = $2, error = null, updated_at = now() where tenant_key = $1",
                [tenant.tenant_key, version]
            )
            onProgress?.(tenant.tenant_key, version)
        } catch (error) {
            // Eén tenant die faalt, mag de rest niet tegenhouden: noteren en door.
            const message = error instanceof Error ? error.message : String(error)
            await control.query('update tenants set error = $2, updated_at = now() where tenant_key = $1', [
                tenant.tenant_key,
                message
            ])
            onProgress?.(tenant.tenant_key, null)
            console.error(\`Migratie mislukt voor tenant \${tenant.tenant_key}: \${message}\`)
        } finally {
            await pool.end()
        }
    }
}
`

/** src/db/cli.ts — de npm-scripts db:*. */
const CLI_TS = `// Beheer van de database vanaf de commandolijn:
//   npm run db:migrate                     control-DB + alle actieve tenants
//   npm run db:tenant:create -- "Naam"     nieuwe tenant (organisatie) met eigen database
//   npm run db:tenant:list
//   npm run db:tenant:block -- <tenantKey>
//   npm run db:tenant:unblock -- <tenantKey>
//   npm run db:seed -- <tenantKey|all>    bestanden uit seeds/ in een tenant-database
//   npm run db:backup -- <tenantKey|all|control>
//   npm run db:restore -- <tenantKey|control> <bestand>
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { env } from '../env.js'
import { control, controlPool, provisionPool } from './control.js'
import { decrypt } from './crypto.js'
import { runMigrations } from './migrate.js'
import { closeAllTenantPools, openTenantPool } from './pools.js'
import { listTenants, migrateAllTenants, provisionTenant, setTenantStatus } from './tenants.js'

interface TenantRow {
    tenant_key: string
    name: string
    db_name: string
    db_role: string
    db_password: string
}

/** De tenants waar een commando op slaat: één sleutel of 'all'. */
async function pickTenants(key: string | undefined): Promise<TenantRow[]> {
    if (!key) throw new Error('Geef een tenantKey op, of "all".')
    const rows = await control.many<TenantRow & Record<string, unknown>>(
        key === 'all'
            ? "select tenant_key, name, db_name, db_role, db_password from tenants where status = 'active' order by created_at"
            : 'select tenant_key, name, db_name, db_role, db_password from tenants where tenant_key = $1',
        key === 'all' ? [] : [key]
    )
    if (!rows.length) throw new Error(key === 'all' ? 'Geen actieve tenants.' : \`Onbekende tenant: \${key}\`)
    return rows
}

/** pg_dump / pg_restore draaien met het wachtwoord in de omgeving (niet in de argumenten). */
function pgTool(tool: 'pg_dump' | 'pg_restore', args: string[], password: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(tool, args, {
            stdio: ['ignore', 'inherit', 'inherit'],
            env: { ...process.env, PGPASSWORD: password }
        })
        child.on('error', () =>
            reject(new Error(\`\${tool} niet gevonden. Installeer de PostgreSQL client tools (of zet ze in PATH).\`))
        )
        child.on('close', code => (code === 0 ? resolve() : reject(new Error(\`\${tool} stopte met code \${code}.\`))))
    })
}

const BACKUP_DIR = 'backups'
const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)

const [command, ...args] = process.argv.slice(2)

async function main() {
    switch (command) {
        case 'migrate': {
            const version = await runMigrations(controlPool, 'control')
            console.log(\`control-DB: \${version ?? 'geen migraties'}\`)
            await migrateAllTenants((key, v) => console.log(\`tenant \${key}: \${v ?? 'geen migraties'}\`))
            break
        }
        case 'tenant:create': {
            const name = args.join(' ').trim()
            if (!name) throw new Error('Gebruik: npm run db:tenant:create -- "Naam van de organisatie"')
            await runMigrations(controlPool, 'control')
            const tenant = await provisionTenant({ name })
            console.log(\`Tenant aangemaakt: \${tenant.name} (\${tenant.tenant_key}) -> database \${tenant.db_name}\`)
            break
        }
        case 'tenant:list': {
            const tenants = await listTenants()
            if (!tenants.length) console.log('Nog geen tenants.')
            else console.table(tenants.map(t => ({ key: t.tenant_key, naam: t.name, database: t.db_name, status: t.status, schema: t.schema_version })))
            break
        }
        case 'seed': {
            const tenants = await pickTenants(args[0])
            const dir = path.resolve('seeds')
            const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.sql')).sort() : []
            if (!files.length) throw new Error('Geen bestanden in seeds/ (maak bv. seeds/001_demo.sql).')
            for (const tenant of tenants) {
                const pool = openTenantPool(tenant)
                try {
                    for (const file of files) {
                        await pool.query(readFileSync(path.join(dir, file), 'utf8'))
                        console.log(\`\${tenant.tenant_key}: \${file}\`)
                    }
                } finally {
                    await pool.end()
                }
            }
            break
        }
        case 'backup': {
            mkdirSync(BACKUP_DIR, { recursive: true })
            const targets =
                args[0] === 'control'
                    ? [{ db: env.db.control.database, user: env.db.control.user, password: env.db.control.password() }]
                    : (await pickTenants(args[0])).map(t => ({
                          db: t.db_name,
                          user: t.db_role,
                          password: decrypt(t.db_password)
                      }))
            for (const target of targets) {
                const file = path.join(BACKUP_DIR, \`\${target.db}-\${stamp()}.dump\`)
                await pgTool(
                    'pg_dump',
                    ['-h', env.db.host, '-p', String(env.db.port), '-U', target.user, '-d', target.db, '-Fc', '-f', file],
                    target.password
                )
                console.log(\`Back-up: \${file}\`)
            }
            break
        }
        case 'restore': {
            const [key, file] = args
            if (!key || !file) throw new Error('Gebruik: npm run db:restore -- <tenantKey|control> <bestand>')
            const target =
                key === 'control'
                    ? { db: env.db.control.database, user: env.db.control.user, password: env.db.control.password() }
                    : await pickTenants(key).then(rows => ({
                          db: rows[0]!.db_name,
                          user: rows[0]!.db_role,
                          password: decrypt(rows[0]!.db_password)
                      }))
            await pgTool(
                'pg_restore',
                ['-h', env.db.host, '-p', String(env.db.port), '-U', target.user, '-d', target.db, '--clean', '--if-exists', file],
                target.password
            )
            console.log(\`Teruggezet in \${target.db} vanaf \${file}\`)
            break
        }
        case 'tenant:block':
        case 'tenant:unblock': {
            const key = args[0]
            if (!key) throw new Error(\`Gebruik: npm run db:\${command} -- <tenantKey>\`)
            await setTenantStatus(key, command === 'tenant:block' ? 'blocked' : 'active')
            console.log(\`Tenant \${key}: \${command === 'tenant:block' ? 'geblokkeerd' : 'weer actief'}\`)
            break
        }
        default:
            throw new Error(\`Onbekend commando: \${command ?? '(geen)'}\`)
    }
}

main()
    .catch(error => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })
    .finally(async () => {
        await closeAllTenantPools()
        await controlPool.end()
        await provisionPool.end()
    })
`

const CONTROL_MIGRATION = `-- Control-database van de app: welke tenants er zijn en waar hun data staat.
-- (De tabel "migrations" maakt de migratie-runner zelf aan.)

create table tenants (
    id uuid primary key,                 -- id van de organisatie (in de hub)
    tenant_key text not null unique,     -- eerste 12 tekens van id, zonder streepjes
    name text not null,
    db_name text not null unique,        -- <appKey>_t_<naam>_<begin sleutel>
    db_role text not null unique,        -- zelfde naam als de database
    db_password text not null,           -- versleuteld met DB_SECRET_KEY
    status text not null default 'creating'
        check (status in ('creating', 'active', 'failed', 'blocked', 'archived')),
    schema_version text,                 -- laatste tenant-migratie
    license jsonb,                       -- plan, seats, geldig tot (vanaf de hub)
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Events van de hub die al verwerkt zijn (elk event precies één keer).
create table processed_events (
    id text primary key,
    type text not null,
    processed_at timestamptz not null default now()
);
`

const SEED_EXAMPLE = `-- Voorbeeldgegevens voor een tenant-database: npm run db:seed -- <tenantKey|all>
-- Alles hier moet je opnieuw kunnen draaien (gebruik on conflict do nothing).
-- Seeds gaan NOOIT automatisch mee bij het aanmaken van een tenant.

insert into settings (key, value)
values ('demo', '{"klaar": true}')
on conflict (key) do nothing;
`

const TENANT_MIGRATION = `-- Eerste migratie van elke tenant-database.
-- Nieuwe tabellen: nieuw bestand 002_..., 003_... (nooit een bestaand bestand aanpassen).
-- Sleutels altijd als uuid: id uuid primary key default gen_random_uuid()

create table settings (
    key text primary key,
    value jsonb not null,
    updated_at timestamptz not null default now()
);
`

export const DOCS_DATABASE = (appKey: string, docker: boolean) => `# Database

Multitenant PostgreSQL: één **control-database** voor de app en één **database per tenant** (organisatie).
Alles is zelf geschreven op de kale \`pg\`-driver — geen ORM, geen querybuilder.

## Namen

| Wat | Naam |
| --- | --- |
| Control-database | \`${appKey}_control\` |
| Rol van de app (control) | \`${appKey}_app\` |
| Rol die tenants aanmaakt | \`${appKey}_provisioner\` |
| Database én rol per tenant | \`${appKey}_t_<naam>_<begin sleutel>\` (bv. \`${appKey}_t_praktijk_jansen_c20cc7\`) |
${docker ? '| Docker-container (gedeeld door alle projecten) | `projectx-postgres` (netwerk `projectx`, volume `projectx-pgdata`) |\n' : ''}
\`tenantKey\` = de eerste 12 tekens van de organisatie-id, zonder streepjes.

## .env

| Variabele | Inhoud |
| --- | --- |
| \`APP_KEY\` | \`${appKey}\` — voorvoegsel van alle namen |
| \`DB_HOST\` / \`DB_PORT\` | waar PostgreSQL draait |
| \`APP_DB_PASSWORD\` | wachtwoord van \`${appKey}_app\` |
| \`PROVISIONER_DB_PASSWORD\` | wachtwoord van \`${appKey}_provisioner\` |
| \`DB_SECRET_KEY\` | 32 bytes (base64): versleutelt de wachtwoorden van de tenant-rollen |

## Commando's

\`\`\`bash
npm run db:migrate                          # control-DB + alle actieve tenants bijwerken
npm run db:tenant:create -- "Bakkerij Jansen"
npm run db:tenant:list
npm run db:tenant:block -- 3f2a9c1e5b7d     # geen toegang meer (database blijft staan)
npm run db:tenant:unblock -- 3f2a9c1e5b7d
${docker ? 'npm run db:up                              # de gedeelde PostgreSQL-container starten\nnpm run db:down                            # en stoppen\n' : ''}\`\`\`

## In de code

\`\`\`ts
import { tenantDb } from './db/pools.js'

const db = await tenantDb(tenantKey)          // enkel actieve tenants
const rows = await db.many<{ key: string }>('select key from settings where key = $1', ['x'])
await db.tx(async tx => {
    await tx.query('insert into settings (key, value) values ($1, $2)', ['a', { on: true }])
})
\`\`\`

- Altijd parameters (\`$1\`, \`$2\`), nooit waarden in de SQL-tekst.
- Een geblokkeerde of onbekende tenant geeft een \`TenantUnavailableError\`.
- Per tenant hoogstens 3 verbindingen, hoogstens 50 tenant-pools tegelijk; na 60 s ongebruikt gaat een pool dicht.

## Migraties

- \`migrations/control/\` — voor de control-database; draaien ook bij het opstarten van de backend.
- \`migrations/tenant/\` — voor elke tenant-database; bij \`db:migrate\` en bij het aanmaken van een tenant.
- Genummerde \`.sql\`-bestanden (\`002_orders.sql\`, …). Nooit een bestaand bestand aanpassen: altijd een nieuw.
- Achterwaarts compatibel: eerst toevoegen, pas in een latere release oude kolommen weghalen.
- Sleutels als \`uuid primary key default gen_random_uuid()\`.

## Een tenant aanmaken — wat er gebeurt

1. Advisory lock op de tenant: twee gelijktijdige pogingen wachten op elkaar.
2. Rij in \`tenants\` met status \`creating\` (wachtwoord versleuteld).
3. Rol \`${appKey}_t_<naam>_<begin sleutel>\` aanmaken (of het wachtwoord gelijkzetten).
4. Database met dezelfde naam aanmaken als ze nog niet bestaat; \`CONNECT\` enkel voor die rol.
5. Tenant-migraties draaien als die rol.
6. Status \`active\` + schemaversie. Bij een fout: \`failed\` + de fout; opnieuw draaien gaat verder.

Een tenant wordt **nooit automatisch verwijderd**: zonder licentie wordt hij geblokkeerd.
`

export function dbFiles(): Record<string, string> {
    return {
        'src/env.ts': ENV_TS_DB,
        'src/db/sql.ts': SQL_TS,
        'src/db/crypto.ts': CRYPTO_TS,
        'src/db/control.ts': CONTROL_TS,
        'src/db/migrate.ts': MIGRATE_TS,
        'src/db/pools.ts': POOLS_TS,
        'src/db/tenants.ts': TENANTS_TS,
        'src/db/cli.ts': CLI_TS,
        'migrations/control/001_tenants.sql': CONTROL_MIGRATION,
        'migrations/tenant/001_init.sql': TENANT_MIGRATION,
        'seeds/001_voorbeeld.sql': SEED_EXAMPLE
    }
}
