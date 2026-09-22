import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import pg from 'pg'
import { detectProject, projectLabel, readEnv, type Project } from './detect.js'

/**
 * `npx projectx-cli doctor` — kijkt of dit project kan draaien: instellingen,
 * poorten, database, migraties en (bij een aangesloten app) de hub.
 */
type State = 'ok' | 'warn' | 'fail'

interface Check {
    state: State
    what: string
    detail?: string
    hint?: string
}

const line = (check: Check): string => {
    const mark = check.state === 'ok' ? pc.green('✓') : check.state === 'warn' ? pc.yellow('!') : pc.red('✗')
    const detail = check.detail ? pc.dim(`  ${check.detail}`) : ''
    return `${mark} ${check.what}${detail}${check.hint ? `\n   ${pc.dim(`→ ${check.hint}`)}` : ''}`
}

/** Luistert er iets op die poort? */
function portInUse(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const socket = net.connect({ host: '127.0.0.1', port, timeout: 800 })
        socket.on('connect', () => {
            socket.destroy()
            resolve(true)
        })
        socket.on('error', () => resolve(false))
        socket.on('timeout', () => {
            socket.destroy()
            resolve(false)
        })
    })
}

async function checkEnvFile(dir: string, label: string, required: string[], secrets = false): Promise<Check[]> {
    const file = path.join(dir, '.env')
    if (!fs.existsSync(file)) {
        return [{ state: 'fail', what: `${label}/.env`, detail: 'ontbreekt', hint: 'kopieer .env.example naar .env' }]
    }
    const values = readEnv(file)
    const missing = required.filter(key => !values[key])
    const checks: Check[] = [
        missing.length === 0
            ? { state: 'ok', what: `${label}/.env`, detail: `${Object.keys(values).length} waarden` }
            : { state: 'fail', what: `${label}/.env`, detail: `leeg: ${missing.join(', ')}` }
    ]
    // Alleen zinvol waar er geheimen in staan (de backend).
    if (secrets && process.platform !== 'win32') {
        const mode = fs.statSync(file).mode & 0o777
        if (mode & 0o077) {
            checks.push({
                state: 'warn',
                what: `${label}/.env is leesbaar voor anderen`,
                detail: `rechten ${mode.toString(8)}`,
                hint: `chmod 600 ${label}/.env`
            })
        }
    }
    return checks
}

async function checkDatabase(backendDir: string, project: Project): Promise<Check[]> {
    const env = readEnv(path.join(backendDir, '.env'))
    const host = env.DB_HOST || 'localhost'
    const port = Number(env.DB_PORT) || 5432
    const database = project.hub ? 'projectx_hub' : `${env.APP_KEY}_control`
    const user = project.hub ? 'projectx_hub' : `${env.APP_KEY}_app`
    const password = project.hub ? env.HUB_DB_PASSWORD : env.APP_DB_PASSWORD
    if (!password) return [{ state: 'fail', what: 'Database', detail: 'geen wachtwoord in .env' }]

    const client = new pg.Client({ host, port, database, user, password, connectionTimeoutMillis: 4000 })
    try {
        await client.connect()
    } catch (error) {
        return [
            {
                state: 'fail',
                what: `Database ${database}`,
                detail: error instanceof Error ? error.message : String(error),
                hint: 'draait PostgreSQL, en klopt het wachtwoord in .env?'
            }
        ]
    }
    const checks: Check[] = [{ state: 'ok', what: `Database ${database}`, detail: `${host}:${port} als ${user}` }]
    try {
        // Migraties: wat staat er op schijf, en wat is toegepast?
        const kind = project.hub ? 'hub' : 'control'
        const dir = path.join(backendDir, 'migrations', kind)
        const files = fs.existsSync(dir)
            ? fs
                  .readdirSync(dir)
                  .filter(f => f.endsWith('.sql'))
                  .sort()
            : []
        const { rows } = await client.query<{ name: string }>('select name from migrations order by name')
        const applied = new Set(rows.map(row => row.name))
        const open = files.filter(file => !applied.has(file))
        checks.push(
            open.length === 0
                ? { state: 'ok', what: 'Migraties', detail: `${files.length} toegepast` }
                : {
                      state: 'fail',
                      what: 'Migraties',
                      detail: `nog te draaien: ${open.join(', ')}`,
                      hint: 'npm run db:migrate in ./backend'
                  }
        )
        if (!project.hub) {
            const tenants = await client.query<{ status: string; count: string }>(
                'select status, count(*)::text as count from tenants group by status'
            )
            const parts = tenants.rows.map(row => `${row.count} ${row.status}`)
            checks.push({ state: 'ok', what: 'Tenants', detail: parts.join(', ') || 'nog geen' })
            const failed = tenants.rows.find(row => row.status === 'failed')
            if (failed) {
                checks.push({
                    state: 'warn',
                    what: 'Tenants met een fout',
                    detail: `${failed.count} stuks`,
                    hint: 'npm run db:tenant:list toont de foutmelding'
                })
            }
        }
    } catch (error) {
        checks.push({
            state: 'warn',
            what: 'Migraties',
            detail: error instanceof Error ? error.message : String(error)
        })
    } finally {
        await client.end().catch(() => {})
    }
    return checks
}

async function checkHub(backendDir: string): Promise<Check[]> {
    const env = readEnv(path.join(backendDir, '.env'))
    const issuer = (env.OIDC_ISSUER || '').replace(/\/+$/, '')
    if (!issuer) return [{ state: 'fail', what: 'SSO-hub', detail: 'OIDC_ISSUER ontbreekt' }]

    const checks: Check[] = []
    try {
        const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
            signal: AbortSignal.timeout(6000)
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const doc = (await response.json()) as { issuer?: string }
        checks.push(
            doc.issuer === issuer
                ? { state: 'ok', what: 'SSO-hub bereikbaar', detail: issuer }
                : { state: 'fail', what: 'SSO-hub', detail: `noemt zich ${doc.issuer}`, hint: 'pas OIDC_ISSUER aan' }
        )
    } catch (error) {
        return [
            {
                state: 'fail',
                what: 'SSO-hub bereikbaar',
                detail: error instanceof Error ? error.message : String(error),
                hint: 'draait de hub, en klopt OIDC_ISSUER?'
            }
        ]
    }

    // Client-gegevens uitproberen op de events-API van de hub.
    if (env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET) {
        const api = issuer.replace(/\/oidc$/, '')
        const basic = Buffer.from(
            `${encodeURIComponent(env.OIDC_CLIENT_ID)}:${encodeURIComponent(env.OIDC_CLIENT_SECRET)}`
        ).toString('base64')
        try {
            const response = await fetch(`${api}/api/events?limit=1`, {
                headers: { authorization: `Basic ${basic}` },
                signal: AbortSignal.timeout(6000)
            })
            checks.push(
                response.ok
                    ? { state: 'ok', what: 'App is aangesloten', detail: `client_id ${env.OIDC_CLIENT_ID}` }
                    : {
                          state: 'fail',
                          what: 'App is aangesloten',
                          detail: `hub antwoordt ${response.status}`,
                          hint: 'client_id/secret kloppen niet meer — sluit opnieuw aan'
                      }
            )
        } catch (error) {
            checks.push({
                state: 'warn',
                what: 'App is aangesloten',
                detail: error instanceof Error ? error.message : String(error)
            })
        }
    }
    return checks
}

export async function runDoctor(dir: string): Promise<void> {
    const project = detectProject(dir)
    if (!project.frontendDir && !project.backendDir) {
        p.log.error('Hier staat geen ProjectX-project (geen frontend/ of backend/ met een package.json).')
        return
    }
    p.log.info(`${pc.cyan(path.basename(dir))} — ${projectLabel(project)}`)

    const checks: Check[] = []
    const [major] = process.versions.node.split('.')
    checks.push(
        Number(major) >= 22
            ? { state: 'ok', what: 'Node.js', detail: `v${process.versions.node}` }
            : { state: 'fail', what: 'Node.js', detail: `v${process.versions.node}`, hint: 'minstens Node 22' }
    )

    if (project.frontendDir) {
        const env = readEnv(path.join(project.frontendDir, '.env'))
        checks.push(...(await checkEnvFile(project.frontendDir, 'frontend', ['NEXT_PUBLIC_APP_NAME'])))
        const port = Number(env.PORT) || 3000
        checks.push({
            state: 'ok',
            what: `Frontend-poort ${port}`,
            detail: (await portInUse(port)) ? 'in gebruik (draait al?)' : 'vrij'
        })
    }

    if (project.backendDir) {
        const required = project.hub
            ? ['HUB_DB_PASSWORD', 'HUB_SECRET_KEY']
            : project.database
              ? ['APP_DB_PASSWORD', 'PROVISIONER_DB_PASSWORD', 'DB_SECRET_KEY']
              : []
        if (project.connected) required.push('OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'HUB_WEBHOOK_SECRET')
        checks.push(...(await checkEnvFile(project.backendDir, 'backend', required, true)))

        const env = readEnv(path.join(project.backendDir, '.env'))
        const port = Number(env.PORT) || 4000
        checks.push({
            state: 'ok',
            what: `Backend-poort ${port}`,
            detail: (await portInUse(port)) ? 'in gebruik (draait al?)' : 'vrij'
        })

        if (project.database || project.hub) checks.push(...(await checkDatabase(project.backendDir, project)))
        if (project.connected) checks.push(...(await checkHub(project.backendDir)))
    }

    p.note(checks.map(line).join('\n'), 'Controle')
    const failed = checks.filter(check => check.state === 'fail').length
    const warned = checks.filter(check => check.state === 'warn').length
    if (failed) p.log.error(`${failed} probleem${failed === 1 ? '' : 'en'} gevonden.`)
    else if (warned) p.log.warn(`Alles draait, met ${warned} aandachtspunt${warned === 1 ? '' : 'en'}.`)
    else p.log.success('Alles in orde.')
}
