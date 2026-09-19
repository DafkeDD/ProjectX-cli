import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { runQuiet } from '../../utils/exec.js'
import { withProgress } from '../../utils/progress.js'
import { orCancel } from '../../utils/prompt.js'
import { findFreePort } from '../../utils/ports.js'
import { setupPrettier, formatAll } from '../../utils/prettier.js'
import type { PackageManager } from '../../types.js'
import type { I18nConfig } from '../i18n.js'
import { backendAgents, DEFAULT_BACKEND_PORT, ENV_TS, envFile, i18nFiles, VERSION_TS } from './shared.js'
import { nestFiles, registerHealthModule } from './nest.js'
import { EXPRESS_DEPS, EXPRESS_DEV_DEPS, expressFiles } from './express.js'

/** Submap binnen het project voor de backend. */
export const BACKEND_DIR = 'backend'

export type Backend = 'nestjs' | 'express' | 'none'

/** Vraag: welke backend? NestJS staat bovenaan. */
export async function askBackend(): Promise<Backend> {
    return orCancel(
        await p.select<Backend>({
            message: 'Welke backend wil je?',
            initialValue: 'nestjs',
            options: [
                {
                    value: 'nestjs',
                    label: 'NestJS',
                    hint: 'laatste versie · TypeScript · modules/controllers/services'
                },
                { value: 'express', label: 'Node.js + Express', hint: 'Express 5 · TypeScript · licht en eenvoudig' },
                { value: 'none', label: 'Geen backend' }
            ]
        })
    )
}

/** Vraag: poort van de backend. Voorstel: eerste vrije vanaf 4000 (niet die van de frontend). */
export async function askBackendPort(taken: number[]): Promise<number> {
    let suggested = await findFreePort(DEFAULT_BACKEND_PORT)
    while (taken.includes(suggested)) suggested = await findFreePort(suggested + 1)

    const answer = orCancel(
        await p.text({
            message: `Op welke poort draait de backend?${suggested !== DEFAULT_BACKEND_PORT ? pc.dim(`  (${DEFAULT_BACKEND_PORT} is bezet)`) : ''}`,
            placeholder: String(suggested),
            defaultValue: String(suggested),
            validate: value => {
                if (!value) return undefined
                const n = Number(value)
                if (!Number.isInteger(n) || n < 1024 || n > 65535) return 'Een getal tussen 1024 en 65535.'
                return taken.includes(n) ? 'Die poort gebruikt de frontend al.' : undefined
            }
        })
    )
    return Number(answer)
}

export function backendLabel(backend: Backend, port: number | null): string {
    if (backend === 'none') return 'geen'
    const name = backend === 'nestjs' ? 'NestJS' : 'Node.js + Express'
    return `${name}${pc.dim(`  -> ./${BACKEND_DIR} (poort ${port})`)}`
}

export function checkBackend(backend: Backend, projectDir: string): string | null {
    if (backend === 'none') return null
    const dir = path.join(projectDir, BACKEND_DIR)
    if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
        return `De map "./${BACKEND_DIR}" bestaat al en is niet leeg.`
    }
    return null
}

/** Commando om de backend lokaal te starten. */
export const backendDevCommand = (backend: Backend, pm: PackageManager) =>
    backend === 'nestjs' ? `${pm} run start:dev` : `${pm} run dev`

export interface BackendOptions {
    appName: string
    port: number
    /** Adres van de frontend (CORS); zonder frontend de standaard. */
    frontendUrl: string
    i18n: I18nConfig
}

function writeFiles(target: string, files: Record<string, string>): void {
    for (const [name, content] of Object.entries(files)) {
        const file = path.join(target, name)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, content.endsWith('\n') ? content : content + '\n', 'utf8')
    }
}

/** Voegt scripts toe aan package.json (overschrijft bestaande met dezelfde naam). */
function addScripts(target: string, scripts: Record<string, string>): void {
    const file = path.join(target, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { scripts?: Record<string, string> }
    pkg.scripts = { ...pkg.scripts, ...scripts }
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

/**
 * Stap 2 — de backend in ./backend: NestJS (nest new, laatste versie) of
 * Express 5. Altijd: .env + env.ts, CORS voor de frontend, GET /health,
 * vertaalde foutmeldingen, Prettier (vaste ProjectX-stijl) en AI-regels.
 */
export async function scaffoldBackend(
    backend: Backend,
    projectDir: string,
    pm: PackageManager,
    options: BackendOptions
): Promise<void> {
    if (backend === 'none') return

    const target = path.join(projectDir, BACKEND_DIR)
    const { appName, port, frontendUrl, i18n } = options

    await withProgress(
        backend === 'nestjs' ? 'NestJS installeren (laatste versie)' : 'Express installeren (laatste versie)',
        async update => {
            if (backend === 'nestjs') {
                // Zelf installeren i.p.v. door nest: dan zien we een fout ook echt.
                await runQuiet(
                    'npx',
                    [
                        '--yes',
                        '@nestjs/cli@latest',
                        'new',
                        BACKEND_DIR,
                        '--package-manager',
                        pm,
                        '--skip-git',
                        '--skip-install',
                        '--strict'
                    ],
                    projectDir
                )
                update('Packages installeren')
                await runQuiet(pm, ['install'], target)

                update('Health, CORS en vertaalde fouten')
                writeFiles(target, nestFiles())
                registerHealthModule(target)
            } else {
                fs.mkdirSync(target, { recursive: true })
                writeFiles(target, expressFiles(appName))
                update('Packages installeren')
                await runQuiet(pm, ['install', ...EXPRESS_DEPS], target)
                await runQuiet(pm, ['install', '--save-dev', ...EXPRESS_DEV_DEPS], target)
            }

            update('.env, talen en regels')
            const values = { appName, port, frontendUrl }
            writeFiles(target, {
                '.env': envFile(values, false),
                '.env.example': envFile(values, true),
                'src/env.ts': ENV_TS,
                'src/version.ts': VERSION_TS,
                ...Object.fromEntries(
                    Object.entries(i18nFiles(i18n.locales, i18n.defaultLocale)).map(([f, c]) => [`src/i18n/${f}`, c])
                ),
                'AGENTS.md': backendAgents(backend === 'nestjs' ? 'nestjs' : 'express', i18n.locales),
                'CLAUDE.md': '@AGENTS.md\n'
            })

            // .env niet in git, .env.example wel.
            const gitignore = path.join(target, '.gitignore')
            const ignore = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8') : ''
            if (!/^\.env$/m.test(ignore)) fs.writeFileSync(gitignore, ignore.trimEnd() + '\n.env\n.env.local\n', 'utf8')

            update('Prettier (vaste ProjectX-stijl) en alles formatteren')
            await setupPrettier(pm, target)
            addScripts(target, { format: 'prettier --write .', 'format:check': 'prettier --check .' })
            await formatAll(pm, target)
        },
        60000
    )

    p.log.success(
        `Backend klaar in ./${BACKEND_DIR}` +
            pc.dim(`  (${backend === 'nestjs' ? 'NestJS' : 'Express'} · http://localhost:${port}/health)`)
    )
}
