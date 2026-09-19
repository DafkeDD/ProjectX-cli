import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { runQuiet } from '../utils/exec.js'
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

/** Vraag: ProjectX-UI installeren? */
export async function askProjectxUi(): Promise<boolean> {
    return orCancel(
        await p.confirm({
            message: 'Wil je ProjectX-UI installeren? (68 eigen componenten + design tokens)',
            initialValue: true
        })
    )
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

export async function installProjectxUi(target: string): Promise<UiResult> {
    try {
        const response = await fetch(UI_BIN)
        if (!response.ok) throw new Error(`${UI_BIN} gaf ${response.status}`)

        fs.mkdirSync(path.join(target, 'scripts'), { recursive: true })
        fs.writeFileSync(path.join(target, 'scripts', 'projectx-ui.mjs'), await response.text(), 'utf8')
        fs.writeFileSync(path.join(target, 'scripts', 'ui.mjs'), UI_WRAPPER, 'utf8')
        fs.writeFileSync(path.join(target, 'projectx-ui.json'), JSON.stringify(UI_CONFIG, null, 4) + '\n', 'utf8')

        const cli = path.join('scripts', 'projectx-ui.mjs')
        await runQuiet('node', [cli, 'init', '--yes', '--registry', UI_REGISTRY], target)
        await runQuiet('node', [cli, 'add', '--all', '--registry', UI_REGISTRY], target)

        const pkgFile = path.join(target, 'package.json')
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { scripts?: Record<string, string> }
        pkg.scripts = { ...pkg.scripts, ui: 'node scripts/ui.mjs' }
        fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

        const registry = (await (await fetch(UI_REGISTRY)).json()) as { components?: unknown[] }
        return { ok: true, count: registry.components?.length ?? 0 }
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message.split('\n')[0] : String(err) }
    }
}
