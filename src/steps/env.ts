import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { orCancel } from '../utils/prompt.js'
import { findFreePort } from '../utils/ports.js'

export const DEFAULT_PORT = 3000

export interface AppConfig {
    /** Naam van de app: paginatitel, overal in de UI via env.appName. */
    appName: string
}

/** Vraag: hoe heet de app? Standaard de naam van de projectmap. */
export async function askAppName(projectDir: string): Promise<AppConfig> {
    const fallback = path.basename(projectDir)
    const appName = orCancel(
        await p.text({
            message: 'Hoe heet je app?',
            placeholder: fallback,
            defaultValue: fallback,
            validate: value => (value && /["\n\r]/.test(value) ? 'Geen aanhalingstekens of enters, aub.' : undefined)
        })
    )
    return { appName: appName.trim() || fallback }
}

/**
 * Vraag: op welke poort draait de frontend? Voorstel = de eerste vrije poort
 * vanaf 3000, zodat twee projecten naast elkaar kunnen draaien.
 */
export async function askPort(): Promise<number> {
    const suggested = await findFreePort(DEFAULT_PORT)
    const answer = orCancel(
        await p.text({
            message: `Op welke poort draait de frontend?${suggested !== DEFAULT_PORT ? pc.dim(`  (${DEFAULT_PORT} is bezet)`) : ''}`,
            placeholder: String(suggested),
            defaultValue: String(suggested),
            validate: value => {
                if (!value) return undefined
                const n = Number(value)
                return Number.isInteger(n) && n >= 1024 && n <= 65535 ? undefined : 'Een getal tussen 1024 en 65535.'
            }
        })
    )
    return Number(answer)
}

/** Waarde voor .env: tussen dubbele quotes, zodat spaties en # geen probleem zijn. */
const quote = (value: string) => `"${value}"`

function envFile(appName: string, port: number, example: boolean, apiUrl?: string): string {
    return `# ${example ? 'Voorbeeld — kopieer naar .env en vul in. Dit bestand gaat WEL mee in git.' : 'Lokale instellingen — gaat NIET mee in git (zie .env.example).'}
#
# Gebruik deze waarden in de code altijd via src/lib/env.ts, nooit rechtstreeks
# met process.env.

# Naam van de app: paginatitel, beschrijving, en overal in de UI (env.appName).
# NEXT_PUBLIC_ = ook beschikbaar in de browser. Na een wijziging: dev-server herstarten.
NEXT_PUBLIC_APP_NAME=${quote(appName)}

# Poort voor npm run dev en npm run start (scripts/next.mjs leest hem hier).
PORT=${port}
${
    apiUrl
        ? `
# Adres van de backend (API). Gebruik in de code: env.apiUrl.
NEXT_PUBLIC_API_URL=${quote(apiUrl)}
`
        : ''
}`
}

const envTs = (api: boolean) => `/**
 * Alle instellingen uit .env op één plek, met een terugvalwaarde.
 * Gebruik overal \`env.appName\` / \`env.port\` — nooit process.env rechtstreeks.
 *
 * Let op: NEXT_PUBLIC_-variabelen worden bij het bouwen in de code gezet, dus
 * ze moeten hier letterlijk als process.env.NEXT_PUBLIC_... staan.
 */
export const env = {
    /** Naam van de app (NEXT_PUBLIC_APP_NAME) — ook in client components. */
    appName: process.env.NEXT_PUBLIC_APP_NAME || 'App',
    /** Poort van de frontend (PORT) — alleen op de server. */
    port: Number(process.env.PORT) || ${DEFAULT_PORT}${
        api
            ? `,
    /** Adres van de backend (NEXT_PUBLIC_API_URL). */
    apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'`
            : ''
    }
} as const
`

/**
 * Next.js leest PORT niet uit .env: de server start vóór .env geladen wordt.
 * Dit script laadt .env met Next's eigen loader (@next/env, dezelfde regels:
 * .env, .env.local, .env.development, ...) en start next met -p PORT.
 */
const NEXT_RUNNER = `// Start next dev / next start op de poort uit .env (PORT).
// Next.js zelf leest PORT niet uit .env, daarom dit kleine script.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const [command = 'dev', ...rest] = process.argv.slice(2)

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')
// @next/env komt mee met next: dezelfde .env-regels als Next.js zelf.
const { loadEnvConfig } = createRequire(require.resolve('next/package.json'))('@next/env')
loadEnvConfig(process.cwd(), command === 'dev')

const port = process.env.PORT || '${DEFAULT_PORT}'
const child = spawn(process.execPath, [nextBin, command, '-p', port, ...rest], { stdio: 'inherit' })
child.on('exit', code => process.exit(code ?? 0))
`

/** Schrijft .env, .env.example, src/lib/env.ts en scripts/next.mjs, en past de scripts aan. */
export function setupEnv(target: string, { appName }: AppConfig, port: number, apiUrl?: string): void {
    fs.writeFileSync(path.join(target, '.env'), envFile(appName, port, false, apiUrl), 'utf8')
    fs.writeFileSync(path.join(target, '.env.example'), envFile(appName, port, true, apiUrl), 'utf8')

    fs.mkdirSync(path.join(target, 'src', 'lib'), { recursive: true })
    fs.writeFileSync(path.join(target, 'src', 'lib', 'env.ts'), envTs(Boolean(apiUrl)), 'utf8')

    fs.mkdirSync(path.join(target, 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(target, 'scripts', 'next.mjs'), NEXT_RUNNER, 'utf8')

    // dev/start via het script; build heeft geen poort nodig.
    const pkgFile = path.join(target, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { scripts?: Record<string, string> }
    pkg.scripts = { ...pkg.scripts, dev: 'node scripts/next.mjs dev', start: 'node scripts/next.mjs start' }
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

    // create-next-app negeert .env* — het voorbeeld moet wél mee in git.
    const gitignore = path.join(target, '.gitignore')
    if (fs.existsSync(gitignore)) {
        const content = fs.readFileSync(gitignore, 'utf8')
        if (!content.includes('!.env.example')) {
            fs.writeFileSync(gitignore, content.trimEnd() + '\n!.env.example\n', 'utf8')
        }
    }
}
