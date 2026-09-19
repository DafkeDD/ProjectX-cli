import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runQuiet } from './exec.js'
import type { PackageManager } from '../types.js'

/**
 * DE Prettier-config van ProjectX — altijd deze, letterlijk.
 * Staat in templates/prettierrc.json en wordt ongewijzigd gekopieerd als
 * .prettierrc. Wil je de huisstijl aanpassen, pas dan alleen dat bestand aan.
 */
const PRETTIERRC = fileURLToPath(new URL('../../templates/prettierrc.json', import.meta.url))

const PRETTIER_IGNORE = [
    'node_modules',
    '.next',
    'out',
    'build',
    'dist',
    'coverage',
    'next-env.d.ts',
    // next dev herschrijft zijn eigen blok in AGENTS.md (ongewrapt); Prettier
    // zou daar dan telkens over klagen.
    'AGENTS.md',
    'CLAUDE.md',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    ''
].join('\n')

/** Voegt `format` en `format:check` toe aan package.json. */
function addScripts(targetDir: string): void {
    const file = path.join(targetDir, 'package.json')
    if (!fs.existsSync(file)) return
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { scripts?: Record<string, string> }
    pkg.scripts = { ...pkg.scripts, format: 'prettier --write .', 'format:check': 'prettier --check .' }
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

/**
 * Zet Prettier op in `targetDir`: .prettierrc (letterlijk uit templates/),
 * .prettierignore, scripts en packages (@latest). Formatteren gebeurt apart
 * met formatAll(), als laatste stap.
 */
export async function setupPrettier(pm: PackageManager, targetDir: string): Promise<void> {
    fs.copyFileSync(PRETTIERRC, path.join(targetDir, '.prettierrc'))
    fs.writeFileSync(path.join(targetDir, '.prettierignore'), PRETTIER_IGNORE, 'utf8')
    addScripts(targetDir)

    // De config gebruikt prettier-plugin-tailwindcss, dus die hoort er altijd bij.
    await runQuiet(pm, ['install', '--save-dev', 'prettier@latest', 'prettier-plugin-tailwindcss@latest'], targetDir)
}

/** Zet alle code in de huisstijl — met de lokaal geïnstalleerde Prettier. */
export async function formatAll(pm: PackageManager, targetDir: string): Promise<void> {
    await runQuiet(pm, ['run', 'format'], targetDir)
}
