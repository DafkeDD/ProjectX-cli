import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import pg from 'pg'
import { runQuiet } from '../../utils/exec.js'
import { withProgress } from '../../utils/progress.js'
import { orCancel } from '../../utils/prompt.js'
import { findFreePort } from '../../utils/ports.js'
import { formatAll } from '../../utils/prettier.js'
import type { PackageManager } from '../../types.js'
import {
    ADMIN_CONFIG,
    CONTAINER,
    DOCKER_ADMIN_USER,
    composeFiles,
    containerPort,
    containerState,
    dockerAvailable,
    ensureContainer,
    readAdminConfig,
    volumeExists,
    writeAdminConfig,
    type PgAdmin
} from './docker.js'
import { DOCS_DATABASE, dbFiles } from './templates.js'

export type DatabaseMode = 'docker' | 'local'

export interface DatabaseChoice {
    mode: DatabaseMode
    /** Voorvoegsel van alle databases en rollen van deze app. */
    appKey: string
    /** Beheerder (superuser) — enkel om rollen/databases aan te maken, komt NIET in .env. */
    admin: PgAdmin
    /** Docker: moet de beheerder-config nog weggeschreven worden (nieuwe container)? */
    newContainer: boolean
}

/** Wat prepareDatabase aanmaakte en de backend nodig heeft. */
export interface DatabaseSecrets {
    appPassword: string
    provisionerPassword: string
    secretKey: string
}

const APP_KEY_RE = /^[a-z][a-z0-9_]{1,19}$/

/** "Mijn Mooie App!" -> "mijn_mooie_app" */
export function slugAppKey(appName: string): string {
    const slug = appName
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^[^a-z]+/, '')
        .slice(0, 20)
        .replace(/_+$/, '')
    return slug.length >= 2 ? slug : 'app'
}

const password = () => randomBytes(24).toString('base64url')

/** Verbindt als beheerder; geeft de fout terug i.p.v. te gooien. */
async function tryConnect(admin: PgAdmin, database = 'postgres'): Promise<pg.Client | Error> {
    const client = new pg.Client({ ...admin, database, connectionTimeoutMillis: 5000 })
    try {
        await client.connect()
        return client
    } catch (error) {
        await client.end().catch(() => {})
        return error instanceof Error ? error : new Error(String(error))
    }
}

/** Is dit een superuser? (nodig om rollen met CREATEROLE/CREATEDB aan te maken) */
async function isSuperuser(client: pg.Client): Promise<boolean> {
    const { rows } = await client.query<{ rolsuper: boolean }>(
        'select rolsuper from pg_roles where rolname = current_user'
    )
    return rows[0]?.rolsuper === true
}

/** Bestaat er al iets met dit voorvoegsel? */
async function keyInUse(client: pg.Client, appKey: string): Promise<boolean> {
    const { rowCount } = await client.query(
        `select 1 from pg_database where datname = $1
         union all select 1 from pg_roles where rolname in ($2, $3)`,
        [`${appKey}_control`, `${appKey}_app`, `${appKey}_provisioner`]
    )
    return (rowCount ?? 0) > 0
}

async function askLocal(): Promise<PgAdmin> {
    p.log.info(
        `Geef een beheerder (superuser) op. ${pc.dim('Die gebruiken we enkel nu, om rollen en databases aan te maken — hij komt niet in .env.')}`
    )
    for (;;) {
        const host = orCancel(
            await p.text({ message: 'Host van PostgreSQL?', placeholder: 'localhost', defaultValue: 'localhost' })
        )
        const port = orCancel(
            await p.text({
                message: 'Poort?',
                placeholder: '5432',
                defaultValue: '5432',
                validate: v => (!v || /^\d{2,5}$/.test(v) ? undefined : 'Een poortnummer, aub.')
            })
        )
        const user = orCancel(
            await p.text({ message: 'Beheerder?', placeholder: 'postgres', defaultValue: 'postgres' })
        )
        const pass = orCancel(await p.password({ message: `Wachtwoord van ${user}?` }))
        const admin: PgAdmin = { host, port: Number(port), user, password: pass }

        const s = p.spinner()
        s.start('Verbinding testen')
        const client = await tryConnect(admin)
        if (client instanceof Error) {
            s.stop(pc.red(`Geen verbinding: ${client.message}`), 1)
            continue
        }
        const superuser = await isSuperuser(client)
        await client.end()
        if (!superuser) {
            s.stop(pc.red(`${user} is geen superuser — kies een beheerder (bv. postgres).`), 1)
            continue
        }
        s.stop('Verbinding OK')
        return admin
    }
}

/** Docker: bestaande gedeelde container gebruiken of een nieuwe voorbereiden. */
async function askDocker(): Promise<{ admin: PgAdmin; newContainer: boolean }> {
    const state = await containerState()
    const saved = readAdminConfig()

    if (state === 'missing' && (await volumeExists())) {
        // Container weg, data nog niet: het bestaande wachtwoord blijft gelden.
        const port = saved?.port ?? (await findFreePort(5432))
        p.log.info(
            `Container ${pc.cyan(CONTAINER)} wordt opnieuw aangemaakt op het bestaande volume ${pc.dim(`(poort ${port})`)}`
        )
        if (saved) return { admin: { ...saved, port }, newContainer: true }
        const user = orCancel(
            await p.text({
                message: 'Beheerder van de bestaande data?',
                placeholder: DOCKER_ADMIN_USER,
                defaultValue: DOCKER_ADMIN_USER
            })
        )
        const pass = orCancel(await p.password({ message: `Wachtwoord van ${user}?` }))
        return { admin: { host: 'localhost', port, user, password: pass }, newContainer: true }
    }

    if (state === 'missing') {
        // Nieuwe container: poort = eerste vrije vanaf 5432 (een lokale PostgreSQL mag blijven draaien).
        const port = await findFreePort(5432)
        p.log.info(
            `Nieuwe gedeelde container ${pc.cyan(CONTAINER)} ${pc.dim(`(postgres 18, poort ${port}) — alle ProjectX-projecten gebruiken deze.`)}`
        )
        return { admin: { host: 'localhost', port, user: DOCKER_ADMIN_USER, password: password() }, newContainer: true }
    }

    const port = (await containerPort()) ?? saved?.port ?? 5432
    p.log.info(
        `Gedeelde container ${pc.cyan(CONTAINER)} bestaat al ${pc.dim(`(${state === 'running' ? 'draait' : 'gestopt'}, poort ${port})`)}`
    )
    if (saved) return { admin: { ...saved, port }, newContainer: false }

    // Container zonder bewaarde gegevens (bv. andere machine-gebruiker): wachtwoord vragen.
    p.log.warn(`Geen beheerder-gegevens gevonden in ${ADMIN_CONFIG}.`)
    const user = orCancel(
        await p.text({
            message: 'Beheerder van de container?',
            placeholder: DOCKER_ADMIN_USER,
            defaultValue: DOCKER_ADMIN_USER
        })
    )
    const pass = orCancel(await p.password({ message: `Wachtwoord van ${user}?` }))
    return { admin: { host: 'localhost', port, user, password: pass }, newContainer: true }
}

/**
 * Vragen: welke database, waar draait ze, en de appKey.
 * Enkel met een backend (de database hoort bij de backend).
 */
export async function askDatabase(appName: string): Promise<DatabaseChoice | null> {
    const kind = orCancel(
        await p.select<'postgres' | 'none'>({
            message: 'Welke database wil je?',
            initialValue: 'postgres',
            options: [
                { value: 'postgres', label: 'PostgreSQL', hint: 'multitenant: één database per organisatie' },
                { value: 'none', label: 'Geen database' }
            ]
        })
    )
    if (kind === 'none') return null

    let mode: DatabaseMode
    let admin: PgAdmin
    let newContainer = false
    for (;;) {
        mode = orCancel(
            await p.select<DatabaseMode>({
                message: 'Waar draait PostgreSQL?',
                initialValue: 'docker',
                options: [
                    {
                        value: 'docker',
                        label: 'Docker',
                        hint: `gedeelde container ${CONTAINER} + frontend/backend via docker compose`
                    },
                    {
                        value: 'local',
                        label: 'Lokaal',
                        hint: 'een PostgreSQL die al op deze machine (of server) draait'
                    }
                ]
            })
        )
        if (mode === 'local') {
            admin = await askLocal()
            break
        }
        if (!(await dockerAvailable())) {
            p.log.error(
                'Docker draait niet (of is niet geïnstalleerd). Start Docker Desktop en kies opnieuw, of kies Lokaal.'
            )
            continue
        }
        ;({ admin, newContainer } = await askDocker())
        break
    }

    // Kunnen we nu al verbinden? Dan meteen controleren of de sleutel vrij is.
    const probe = mode === 'local' || (await containerState()) === 'running' ? await tryConnect(admin) : null
    const client = probe instanceof pg.Client ? probe : null
    if (mode === 'docker' && probe instanceof Error && !newContainer) {
        p.log.warn(`Verbinden met ${CONTAINER} lukt niet (${probe.message}). Klopt het wachtwoord in ${ADMIN_CONFIG}?`)
    }

    try {
        const fallback = slugAppKey(appName)
        for (;;) {
            const appKey = orCancel(
                await p.text({
                    message: `Sleutel van de app ${pc.dim('(voorvoegsel van alle databases: <sleutel>_control, <sleutel>_t_…)')}`,
                    placeholder: fallback,
                    defaultValue: fallback,
                    validate: v =>
                        !v || APP_KEY_RE.test(v)
                            ? undefined
                            : '2–20 tekens: kleine letters, cijfers en _, beginnend met een letter.'
                })
            )
            if (client && (await keyInUse(client, appKey))) {
                p.log.warn(`Er bestaan al databases of rollen met ${pc.cyan(appKey)}_… — kies een andere sleutel.`)
                continue
            }
            return { mode, appKey, admin, newContainer }
        }
    } finally {
        await client?.end().catch(() => {})
    }
}

export function databaseLabel(db: DatabaseChoice | null): string {
    if (!db) return 'geen'
    const where = db.mode === 'docker' ? `Docker (${CONTAINER})` : `lokaal (${db.admin.host}:${db.admin.port})`
    return `PostgreSQL · ${where}${pc.dim(`  -> ${db.appKey}_control + ${db.appKey}_t_<tenant>`)}`
}

/** Wacht tot PostgreSQL verbindingen aanneemt (een nieuwe container heeft even nodig). */
async function waitForPostgres(admin: PgAdmin, timeoutMs = 90_000): Promise<pg.Client> {
    const until = Date.now() + timeoutMs
    let last: Error = new Error('timeout')
    while (Date.now() < until) {
        const client = await tryConnect(admin)
        if (client instanceof pg.Client) return client
        last = client
        await new Promise(r => setTimeout(r, 1000))
    }
    throw new Error(`PostgreSQL antwoordt niet op ${admin.host}:${admin.port}: ${last.message}`)
}

const lit = (value: string) => `'${value.replace(/'/g, "''")}'`

/**
 * Stap 3a — vóór de rest: container (Docker), rollen en de control-database.
 * Eerst, zodat een probleem met de database opduikt vóór er iets geïnstalleerd is.
 */
export async function prepareDatabase(db: DatabaseChoice): Promise<DatabaseSecrets> {
    const secrets: DatabaseSecrets = {
        appPassword: password(),
        provisionerPassword: password(),
        secretKey: randomBytes(32).toString('base64')
    }
    const k = db.appKey

    await withProgress('Database voorbereiden', async update => {
        if (db.mode === 'docker') {
            update(`Container ${CONTAINER} starten`)
            await ensureContainer(db.admin)
        }
        update('Wachten op PostgreSQL')
        const admin = await waitForPostgres(db.admin)
        // Pas bewaren als de verbinding werkt.
        if (db.mode === 'docker' && db.newContainer) writeAdminConfig(db.admin)
        try {
            if (!(await isSuperuser(admin))) throw new Error(`${db.admin.user} is geen superuser.`)
            if (await keyInUse(admin, k))
                throw new Error(`Er bestaan al databases of rollen met het voorvoegsel ${k}_.`)

            update(`Rollen ${k}_app en ${k}_provisioner`)
            await admin.query(`create role "${k}_app" login password ${lit(secrets.appPassword)}`)
            // De provisioner maakt tenant-databases en -rollen, maar is geen superuser.
            await admin.query(
                `create role "${k}_provisioner" login createdb createrole password ${lit(secrets.provisionerPassword)}`
            )

            update(`Database ${k}_control`)
            await admin.query(`create database "${k}_control" owner "${k}_app"`)
            await admin.query(`revoke connect, temporary on database "${k}_control" from public`)
        } finally {
            await admin.end()
        }
    })
    p.log.success(`Database klaar: ${pc.cyan(`${k}_control`)} ${pc.dim(`(rollen ${k}_app, ${k}_provisioner)`)}`)
    return secrets
}

function writeFiles(target: string, files: Record<string, string>): void {
    for (const [name, content] of Object.entries(files)) {
        const file = path.join(target, name)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, content.endsWith('\n') ? content : content + '\n', 'utf8')
    }
}

function addScripts(target: string, scripts: Record<string, string>): void {
    const file = path.join(target, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { scripts?: Record<string, string> }
    pkg.scripts = { ...pkg.scripts, ...scripts }
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

function envBlock(db: DatabaseChoice, secrets: DatabaseSecrets | null): string {
    const q = (v: string) => `"${v}"`
    return `
# ---- Database (PostgreSQL, multitenant) — zie docs/database.md ----
# Voorvoegsel van alle databases en rollen: ${db.appKey}_control, ${db.appKey}_t_<tenant>.
APP_KEY=${db.appKey}
DB_HOST=${db.mode === 'docker' ? 'localhost' : db.admin.host}
DB_PORT=${db.admin.port}
# Wachtwoord van de rol ${db.appKey}_app (control-database).
APP_DB_PASSWORD=${secrets ? q(secrets.appPassword) : ''}
# Wachtwoord van de rol ${db.appKey}_provisioner (maakt tenant-databases aan).
PROVISIONER_DB_PASSWORD=${secrets ? q(secrets.provisionerPassword) : ''}
# 32 bytes (base64): versleutelt de wachtwoorden van de tenant-rollen. NOOIT wijzigen of verliezen.
DB_SECRET_KEY=${secrets ? q(secrets.secretKey) : ''}
`
}

const DB_AGENTS = (appKey: string) => `## Database — PostgreSQL, multitenant (zie docs/database.md)

- Eén control-database \`${appKey}_control\` + één database per tenant \`${appKey}_t_<tenantKey>\`.
- Geen ORM of querybuilder: \`pg\` via \`src/db/sql.ts\` (\`db.many\`, \`db.one\`, \`db.query\`, \`db.tx\`). Altijd parameters
  (\`$1\`, \`$2\`), nooit waarden in de SQL-tekst plakken. Namen enkel via \`ident()\`.
- Tenant-data: \`const db = await tenantDb(tenantKey)\` (\`src/db/pools.ts\`). Nooit zelf een \`pg.Pool\` aanmaken.
- App-brede data (tenants, licenties, verwerkte events): \`control\` uit \`src/db/control.ts\`.
- Schema wijzigen = een NIEUW genummerd bestand in \`migrations/tenant/\` of \`migrations/control/\` — nooit een bestaand
  bestand aanpassen. Achterwaarts compatibel. Sleutels: \`uuid primary key default gen_random_uuid()\`.
- Tenants worden nooit automatisch verwijderd: blokkeren (\`status = 'blocked'\`).
- Beheer: \`npm run db:migrate\`, \`npm run db:tenant:create -- "Naam"\`, \`db:tenant:list\`, \`db:tenant:block\`,
  \`db:tenant:unblock\`.

`

export interface DatabaseBackendOptions {
    backend: 'nestjs' | 'express'
    backendPort: number
    backendDevCommand: string
    frontendPort: number | null
}

/**
 * Stap 3b — na de backend: de databaselaag in ./backend (+ docker compose).
 */
export async function setupDatabase(
    db: DatabaseChoice,
    secrets: DatabaseSecrets,
    projectDir: string,
    backendDir: string,
    pm: PackageManager,
    options: DatabaseBackendOptions
): Promise<void> {
    const target = path.join(projectDir, backendDir)
    const nest = options.backend === 'nestjs'

    await withProgress('Databaselaag in de backend', async update => {
        update('Bestanden (src/db, migrations, docs)')
        writeFiles(target, {
            ...dbFiles(),
            'docs/database.md': DOCS_DATABASE(db.appKey, db.mode === 'docker'),
            ...healthFiles(nest)
        })
        fs.appendFileSync(path.join(target, '.env'), envBlock(db, secrets), 'utf8')
        fs.appendFileSync(path.join(target, '.env.example'), envBlock(db, null), 'utf8')
        patchStartup(target, nest)

        const agents = path.join(target, 'AGENTS.md')
        const rules = fs.readFileSync(agents, 'utf8')
        fs.writeFileSync(agents, rules.replace('## Code-stijl', DB_AGENTS(db.appKey) + '## Code-stijl'), 'utf8')

        update('pg installeren')
        await runQuiet(pm, ['install', 'pg@latest'], target)
        await runQuiet(pm, ['install', '--save-dev', '@types/pg@latest', 'tsx@latest'], target)

        const cli = 'tsx src/db/cli.ts'
        addScripts(target, {
            'db:migrate': `${cli} migrate`,
            'db:tenant:create': `${cli} tenant:create`,
            'db:tenant:list': `${cli} tenant:list`,
            'db:tenant:block': `${cli} tenant:block`,
            'db:tenant:unblock': `${cli} tenant:unblock`,
            ...(db.mode === 'docker'
                ? { 'db:up': `docker start ${CONTAINER}`, 'db:down': `docker stop ${CONTAINER}` }
                : {})
        })

        if (db.mode === 'docker') {
            update('docker-compose.yml')
            writeFiles(
                projectDir,
                composeFiles({
                    appKey: db.appKey,
                    backendPort: options.backendPort,
                    backendDevCommand: options.backendDevCommand,
                    frontendPort: options.frontendPort
                })
            )
        }

        update('Control-database migreren')
        await runQuiet(pm, ['run', 'db:migrate'], target)

        update('Formatteren')
        await formatAll(pm, target)
    })
    p.log.success(
        `Databaselaag klaar ${pc.dim(`(backend/src/db · migraties · npm run db:* · uitleg in backend/docs/database.md)`)}`
    )
}

/** Health met de status van de database erbij. */
function healthFiles(nest: boolean): Record<string, string> {
    if (nest) {
        return {
            'src/health/health.controller.ts': `import { Controller, Get } from '@nestjs/common'
import { env } from '../env.js'
import { version } from '../version.js'
import { controlIsHealthy } from '../db/control.js'

@Controller('health')
export class HealthController {
    /** GET /health — de frontend toont hiermee of de API (en de database) draait. */
    @Get()
    async check() {
        const database = (await controlIsHealthy()) ? 'ok' : 'down'
        return { status: 'ok', app: env.appName, version, database, time: new Date().toISOString() }
    }
}
`
        }
    }
    return {
        'src/routes/health.ts': `import { Router } from 'express'
import { env } from '../env.js'
import { version } from '../version.js'
import { controlIsHealthy } from '../db/control.js'

export const healthRouter = Router()

/** GET /health — de frontend toont hiermee of de API (en de database) draait. */
healthRouter.get('/', async (_req, res) => {
    const database = (await controlIsHealthy()) ? 'ok' : 'down'
    res.json({ status: 'ok', app: env.appName, version, database, time: new Date().toISOString() })
})
`
    }
}

/** Bij het opstarten eerst de control-database migreren. */
function patchStartup(target: string, nest: boolean): void {
    const file = path.join(target, 'src', nest ? 'main.ts' : 'index.ts')
    let source = fs.readFileSync(file, 'utf8')
    source = source.replace(
        /(import \{ env \} from '\.\/env\.js'\n)/,
        `$1import { controlPool } from './db/control.js'\nimport { runMigrations } from './db/migrate.js'\n`
    )
    const migrate = `// Eerst de control-database bijwerken (migrations/control). Tenants: npm run db:migrate.\nawait runMigrations(controlPool, 'control')\n`
    source = nest
        ? source.replace(
              'async function bootstrap() {\n',
              `async function bootstrap() {\n    ${migrate.replace('\n', '\n    ')}\n`
          )
        : source.replace('app.listen(', `${migrate}\napp.listen(`)
    fs.writeFileSync(file, source, 'utf8')
}

/** Extra uitleg in de README van het project. */
export function appendDatabaseReadme(projectDir: string, db: DatabaseChoice, frontend: boolean): void {
    const file = path.join(projectDir, 'README.md')
    if (!fs.existsSync(file)) return
    const readme = fs.readFileSync(file, 'utf8')
    if (readme.includes('## Database')) return
    const lines = [
        '## Database',
        '',
        `PostgreSQL, multitenant: \`${db.appKey}_control\` + één database per tenant (\`${db.appKey}_t_<tenantKey>\`).`,
        'Alle uitleg: [backend/docs/database.md](backend/docs/database.md).',
        '',
        '```bash',
        'cd backend',
        ...(db.mode === 'docker'
            ? [`npm run db:up                             # gedeelde container ${CONTAINER} starten`]
            : []),
        'npm run db:migrate',
        'npm run db:tenant:create -- "Mijn organisatie"',
        'npm run db:tenant:list',
        '```',
        '',
        ...(db.mode === 'docker'
            ? [
                  '## Alles in Docker',
                  '',
                  `\`docker compose up --build\` start de backend${frontend ? ' en de frontend' : ''} in Docker, op het netwerk van`,
                  `\`${CONTAINER}\`. De apps lezen hun eigen \`.env\`; compose zet enkel \`DB_HOST\`${frontend ? ' en `API_INTERNAL_URL`' : ''}.`,
                  ''
              ]
            : [])
    ]
    fs.writeFileSync(file, readme.trimEnd() + '\n\n' + lines.join('\n'), 'utf8')
}
