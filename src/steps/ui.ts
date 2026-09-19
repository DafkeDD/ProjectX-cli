import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { runQuiet } from '../utils/exec.js'
import pc from 'picocolors'
import { orCancel } from '../utils/prompt.js'

/**
 * ProjectX-UI — de eigen componentenbibliotheek (github.com/DafkeDD/ProjectX-ui).
 *
 * Werkt zoals shadcn: de componenten worden als BRONCODE in je project gezet
 * (src/components/ui), geen runtime-dependency. We halen alles over HTTPS van
 * GitHub (raw), niet als git-package — npm 12 blokkeert git-dependencies en
 * dan zou elke latere `npm install` in de frontend mislukken.
 */
export const UI_REPO = 'https://github.com/DafkeDD/ProjectX-ui'
const RAW = 'https://raw.githubusercontent.com/DafkeDD/ProjectX-ui/main'
export const UI_REGISTRY = `${RAW}/registry/index.json`
const UI_BIN = `${RAW}/packages/cli/bin/projectx-ui.mjs`

export const UI_COMPONENTS_DIR = 'src/components/ui'
const UI_CONFIG = {
    componentsDir: UI_COMPONENTS_DIR,
    cssEntry: `${UI_COMPONENTS_DIR}/ui.css`,
    importAlias: '@/components/ui'
}

/** Wat er van ProjectX-UI geïnstalleerd wordt. */
export type UiChoice = { all: true } | { all: false; components: string[] }

interface RegistryComponent {
    name: string
    title: string
    description: string
    category: string
    dependencies?: string[]
}

/**
 * Componenten die de startpagina, de taalkiezer en de themaknop gebruiken.
 * Bij "zelf kiezen" komen die er altijd bij — de app gebruikt ENKEL
 * ProjectX-UI-componenten.
 */
export const REQUIRED_COMPONENTS = ['card', 'badge', 'segmented', 'section-header', 'separator', 'icon']

async function fetchRegistry(): Promise<RegistryComponent[]> {
    const response = await fetch(UI_REGISTRY)
    if (!response.ok) throw new Error(`${UI_REGISTRY} gaf ${response.status}`)
    const registry = (await response.json()) as { components?: RegistryComponent[] }
    return registry.components ?? []
}

/**
 * Vragen over ProjectX-UI, in drie delen:
 *   1. installeren?
 *   2. alles of zelf kiezen?
 *   3. (bij zelf kiezen) aanvinken welke componenten
 * Geeft null terug als ProjectX-UI niet geïnstalleerd wordt.
 */
export async function askProjectxUi(): Promise<UiChoice | null> {
    const install = orCancel(await p.confirm({ message: 'Wil je ProjectX-UI installeren?', initialValue: true }))
    if (!install) return null

    const spinner = p.spinner()
    spinner.start('Componentenlijst ophalen van GitHub')
    let components: RegistryComponent[]
    try {
        components = await fetchRegistry()
        spinner.stop(`ProjectX-UI: ${components.length} componenten beschikbaar`)
    } catch (err) {
        spinner.stop('ProjectX-UI is niet bereikbaar', 1)
        p.log.warn(err instanceof Error ? err.message : String(err))
        const goOn = orCancel(await p.confirm({ message: 'Verder zonder ProjectX-UI?', initialValue: true }))
        if (!goOn) {
            p.cancel('Gestopt.')
            process.exit(0)
        }
        return null
    }

    const mode = orCancel(
        await p.select<'all' | 'pick'>({
            message: 'Welke componenten?',
            initialValue: 'all',
            options: [
                { value: 'all', label: `Alles`, hint: `alle ${components.length}` },
                { value: 'pick', label: 'Zelf kiezen' }
            ]
        })
    )
    if (mode === 'all') return { all: true }

    // Gegroepeerd per categorie, in de volgorde van de registry.
    const groups: Record<string, { value: string; label: string; hint: string }[]> = {}
    for (const c of components) {
        const required = REQUIRED_COMPONENTS.includes(c.name)
        ;(groups[c.category] ??= []).push({
            value: c.name,
            label: c.title,
            hint: required ? 'nodig voor de startpagina' : c.description
        })
    }

    const picked = orCancel(
        await p.groupMultiselect<string>({
            message: `Vink aan wat je wil ${pc.dim('(spatie = aan/uit, enter = bevestigen)')}`,
            options: groups,
            initialValues: REQUIRED_COMPONENTS,
            required: false
        })
    )

    const added = REQUIRED_COMPONENTS.filter(name => !picked.includes(name))
    if (added.length > 0) {
        p.log.info(`Toegevoegd omdat de startpagina ze gebruikt: ${added.join(', ')}`)
    }
    const all = new Set([...picked, ...REQUIRED_COMPONENTS])
    return { all: false, components: components.map(c => c.name).filter(name => all.has(name)) }
}

export function uiLabel(choice: UiChoice | null): string {
    if (!choice) return 'geen'
    return choice.all ? 'ProjectX-UI — alle componenten' : `ProjectX-UI — ${choice.components.length} gekozen`
}

/**
 * Wrapper voor later: `npm run ui -- add button` of `npm run ui -- add --all --force`.
 * Zet de registry (GitHub) en formatteert daarna met Prettier.
 */
const UI_WRAPPER = `// ProjectX-UI bijwerken of componenten toevoegen:
//   npm run ui -- list
//   npm run ui -- add button dialog
//   npm run ui -- add --all --force     (alles opnieuw ophalen)
// De CLI zelf staat in scripts/projectx-ui.mjs (uit ${UI_REPO}).
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const registry = process.env.PROJECTX_UI_REGISTRY || '${UI_REGISTRY}'
const cli = fileURLToPath(new URL('./projectx-ui.mjs', import.meta.url))
const args = process.argv.slice(2)
if (!args.includes('--registry') && args.length > 0) args.push('--registry', registry)

const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)

// Nieuwe of bijgewerkte bestanden in de huisstijl zetten.
if (['add', 'init'].includes(args[0])) {
    spawnSync(process.execPath, [fileURLToPath(import.meta.resolve('prettier/bin/prettier.cjs')), '--write', '${UI_COMPONENTS_DIR}'], {
        stdio: 'inherit'
    })
}
`

/**
 * Haalt ProjectX-UI op en kopieert init + alle componenten.
 * Mislukt het (geen netwerk, repo verplaatst), dan gaat de installatie gewoon
 * verder met de eigen tokens — de functie geeft dan false terug.
 */
export type UiResult = { ok: true; count: number } | { ok: false; error: string }

export async function installProjectxUi(target: string, choice: UiChoice): Promise<UiResult> {
    try {
        const response = await fetch(UI_BIN)
        if (!response.ok) throw new Error(`${UI_BIN} gaf ${response.status}`)

        fs.mkdirSync(path.join(target, 'scripts'), { recursive: true })
        fs.writeFileSync(path.join(target, 'scripts', 'projectx-ui.mjs'), await response.text(), 'utf8')
        fs.writeFileSync(path.join(target, 'scripts', 'ui.mjs'), UI_WRAPPER, 'utf8')
        fs.writeFileSync(path.join(target, 'projectx-ui.json'), JSON.stringify(UI_CONFIG, null, 4) + '\n', 'utf8')

        const cli = path.join('scripts', 'projectx-ui.mjs')
        await runQuiet('node', [cli, 'init', '--yes', '--registry', UI_REGISTRY], target)
        // Afhankelijkheden (bv. button -> spinner) haalt de ProjectX-UI-CLI zelf mee.
        const names = choice.all ? ['--all'] : choice.components
        await runQuiet('node', [cli, 'add', ...names, '--registry', UI_REGISTRY], target)

        const pkgFile = path.join(target, 'package.json')
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { scripts?: Record<string, string> }
        pkg.scripts = { ...pkg.scripts, ui: 'node scripts/ui.mjs' }
        fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

        const count = choice.all ? (await fetchRegistry()).length : choice.components.length
        return { ok: true, count }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message.split('\n')[0] : String(err) }
    }
}
