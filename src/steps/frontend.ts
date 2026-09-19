import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { runQuiet } from '../utils/exec.js'
import { withProgress } from '../utils/progress.js'
import { orCancel } from '../utils/prompt.js'
import { setupNextIntl, type I18nConfig } from './i18n.js'
import { setupTheme } from './theme.js'
import { iconPackages, setupIcons, type IconLibrary } from './icons.js'
import { setupRules } from './rules.js'
import { setupEslintPrettier, setupVsCode } from './editor.js'
import { setupEnv, type AppConfig } from './env.js'
import { installProjectxUi, UI_COMPONENTS_DIR, type UiChoice, type UiResult } from './ui.js'
import { writeUiTemplates } from './ui-templates.js'
import { setupNotFound } from './notfound.js'
import { setupPrettier, formatAll } from '../utils/prettier.js'
import type { PackageManager } from '../types.js'

/** Submap binnen het project voor de frontend. */
export const FRONTEND_DIR = 'frontend'

export type Frontend = 'nextjs' | 'none'

/** Stap 1 — vraag: welke frontend? */
export async function askFrontend(): Promise<Frontend> {
    return orCancel(
        await p.select<Frontend>({
            message: 'Welke frontend wil je?',
            initialValue: 'nextjs',
            options: [
                {
                    value: 'nextjs',
                    label: 'Next.js + Tailwind CSS',
                    hint: 'laatste versies · next-intl · light/dark'
                },
                { value: 'none', label: 'Geen frontend' }
            ]
        })
    )
}

export function frontendLabel(frontend: Frontend): string {
    return frontend === 'nextjs'
        ? `Next.js + Tailwind CSS + next-intl + light/dark${pc.dim(`  -> ./${FRONTEND_DIR}`)}`
        : 'geen'
}

/** Controle vóór het installeren: ./frontend mag niet al bestaan met inhoud. */
export function checkFrontend(frontend: Frontend, projectDir: string): string | null {
    if (frontend === 'none') return null
    const dir = path.join(projectDir, FRONTEND_DIR)
    if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
        return `De map "./${FRONTEND_DIR}" bestaat al en is niet leeg.`
    }
    return null
}

/**
 * Stap 1 — installatie: Next.js (create-next-app@latest) in ./frontend,
 * Tailwind expliciet op @latest, en altijd next-intl (gekozen talen) en
 * light/dark mode (theme.ts), Prettier en regels voor AI-assistenten.
 */
export interface FrontendOptions {
    i18n: I18nConfig
    icons: IconLibrary
    app: AppConfig
    port: number
    /** ProjectX-UI: null = niet installeren. */
    ui: UiChoice | null
}

export async function scaffoldFrontend(
    frontend: Frontend,
    projectDir: string,
    pm: PackageManager,
    { i18n, icons, app, port, ui }: FrontendOptions
): Promise<void> {
    if (frontend === 'none') {
        p.log.info('Geen frontend gekozen — overgeslagen.')
        return
    }

    const target = path.join(projectDir, FRONTEND_DIR)
    let vscode = false
    /** Resultaat van ProjectX-UI; bij een fout gaat de rest gewoon door met de eigen tokens. */
    let uiResult = null as UiResult | null

    await withProgress(
        'Next.js installeren (laatste versie)',
        async update => {
            await runQuiet(
                'npx',
                [
                    '--yes',
                    'create-next-app@latest',
                    FRONTEND_DIR,
                    '--ts',
                    '--tailwind',
                    '--eslint',
                    '--app',
                    '--src-dir',
                    '--import-alias',
                    '@/*',
                    `--use-${pm}`,
                    // Geen genest git-repo in ./frontend: git hoort op projectniveau.
                    '--disable-git',
                    '--yes'
                ],
                projectDir
            )

            update('Tailwind CSS naar de laatste versie')
            await runQuiet(pm, ['install', '--save-dev', 'tailwindcss@latest', '@tailwindcss/postcss@latest'], target)

            if (ui) {
                update('ProjectX-UI ophalen van GitHub (alle componenten)')
                uiResult = await installProjectxUi(target, ui)
            }
            const withUi = uiResult?.ok === true

            update('next-intl + light/dark mode + iconen opzetten')
            setupTheme(target, icons, withUi)
            setupNextIntl(target, i18n, withUi)
            // Met ProjectX-UI: startpagina, taalkiezer en themaknop ENKEL met UI-componenten.
            if (withUi) writeUiTemplates(target)
            setupNotFound(target, i18n.locales, withUi)
            setupIcons(target, icons)
            await runQuiet(pm, ['install', 'next-intl@latest', ...iconPackages(icons)], target)

            update('.env met app-naam en poort')
            setupEnv(target, app, port)

            update('Regels voor AI-assistenten schrijven')
            setupRules(target, i18n, icons, withUi)

            update('Turbopack controleren')
            ensureTurbopack(target)

            update('Prettier + ESLint + VS Code instellen en alles formatteren')
            await setupPrettier(pm, target)
            await setupEslintPrettier(pm, target, withUi)
            vscode = setupVsCode(projectDir, [FRONTEND_DIR])
            await formatAll(pm, target)
        },
        90000
    )

    const versions = readVersions(target)
    p.log.success(
        `Frontend klaar in ./${FRONTEND_DIR}` +
            pc.dim(
                `  (next ${versions.next ?? '?'}, tailwindcss ${versions.tailwindcss ?? '?'}, next-intl ${versions['next-intl'] ?? '?'}` +
                    ` · talen ${i18n.locales.join(', ')}, standaard ${i18n.defaultLocale})`
            )
    )
    if (uiResult?.ok) {
        p.log.success(
            `ProjectX-UI: ${uiResult.count} componenten (+ afhankelijkheden) in ./${FRONTEND_DIR}/${UI_COMPONENTS_DIR}` +
                pc.dim(`  (import { Button } from '@/components/ui' · bijwerken: npm run ui -- add --all --force)`)
        )
    } else if (uiResult) {
        p.log.warn(
            `ProjectX-UI installeren is niet gelukt: ${uiResult.error}\n` +
                'De frontend gebruikt zijn eigen tokens — verder werkt alles. Later alsnog: draai de CLI opnieuw in een lege map.'
        )
    }
    p.log.info(
        vscode
            ? `VS Code-instellingen in ./.vscode ${pc.dim('(open de projectmap in VS Code en installeer de aanbevolen extensies)')}`
            : `./.vscode bestond al ${pc.dim('— niet overschreven')}`
    )
}

/**
 * Vanaf Next.js 16 is Turbopack de standaard-bundler. Staat er toch nog
 * `--webpack` in de scripts, dan halen we dat weg.
 */
function ensureTurbopack(target: string): void {
    const file = path.join(target, 'package.json')
    if (!fs.existsSync(file)) return
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { scripts?: Record<string, string> }
    if (!pkg.scripts) return

    let changed = false
    for (const [name, script] of Object.entries(pkg.scripts)) {
        const next = script.replace(/\s--webpack\b/, '')
        if (next !== script) {
            pkg.scripts[name] = next
            changed = true
        }
    }
    if (changed) fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

/** Leest de werkelijk geïnstalleerde versies uit node_modules. */
function readVersions(target: string): Record<string, string | undefined> {
    const read = (name: string): string | undefined => {
        try {
            const file = path.join(target, 'node_modules', name, 'package.json')
            return (JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: string }).version
        } catch {
            return undefined
        }
    }
    return { next: read('next'), tailwindcss: read('tailwindcss'), 'next-intl': read('next-intl') }
}
