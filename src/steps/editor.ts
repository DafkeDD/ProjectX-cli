import fs from 'node:fs'
import path from 'node:path'
import { runQuiet } from '../utils/exec.js'
import type { PackageManager } from '../types.js'

function writeJson(file: string, data: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n', 'utf8')
}

/**
 * ESLint + Prettier laten samenwerken: eslint-config-prettier zet alle
 * ESLint-regels uit die over opmaak gaan, zodat alleen Prettier daarover
 * beslist. Komt als laatste in de flat config.
 */
export async function setupEslintPrettier(pm: PackageManager, target: string, ui = false): Promise<void> {
    fs.writeFileSync(
        path.join(target, 'eslint.config.mjs'),
        `import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
${
    ui
        ? `    // ProjectX-UI (src/components/ui) wordt beheerd vanuit zijn eigen repo: de nieuwe
    // React Compiler-regels (en een paar andere) daar als waarschuwing, zodat je ze ziet maar lint niet faalt.
    // Oplossen hoort in github.com/DafkeDD/ProjectX-ui, daarna: npm run ui -- add --all --force
    {
        files: ['src/components/ui/**'],
        rules: {
            'react-hooks/immutability': 'warn',
            'react-hooks/refs': 'warn',
            'react-hooks/set-state-in-effect': 'warn',
            '@typescript-eslint/no-empty-object-type': 'warn',
            'prefer-const': 'warn'
        }
    },
`
        : ''
}    // Als laatste: zet opmaakregels uit, daar beslist Prettier over.
    prettier,
    globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts'])
])

export default eslintConfig
`,
        'utf8'
    )
    await runQuiet(pm, ['install', '--save-dev', 'eslint-config-prettier@latest'], target)
}

export interface VsCodeApps {
    /** Mappen met ESLint (frontend, Express-backend). */
    eslintDirs: string[]
    /** Map waarvan VS Code de TypeScript-versie gebruikt. */
    tsDir: string
    /** NestJS gebruikt oxlint i.p.v. ESLint. */
    oxlint: boolean
    /** Tailwind-ondersteuning (enkel als er een frontend is). */
    tailwind: boolean
}

/**
 * VS Code-instellingen in de PROJECTMAP (niet in ./frontend of ./backend),
 * want daar open je het project. Bestaat .vscode al, dan laten we het met rust.
 */
export function setupVsCode(projectDir: string, apps: VsCodeApps): boolean {
    const dir = path.join(projectDir, '.vscode')
    const settingsFile = path.join(dir, 'settings.json')
    const extensionsFile = path.join(dir, 'extensions.json')
    if (fs.existsSync(settingsFile) || fs.existsSync(extensionsFile)) return false

    writeJson(settingsFile, {
        // Prettier (met de .prettierrc van elke app) bij elke keer opslaan.
        'editor.defaultFormatter': 'esbenp.prettier-vscode',
        'editor.formatOnSave': true,
        'prettier.requireConfig': true,
        // Lint-fixes bij opslaan.
        'editor.codeActionsOnSave': {
            'source.fixAll.eslint': 'explicit',
            ...(apps.oxlint ? { 'source.fixAll.oxc': 'explicit' } : {})
        },
        'eslint.workingDirectories': apps.eslintDirs.map(d => ({ directory: d, changeProcessCWD: true })),
        ...(apps.tailwind
            ? {
                  // Tailwind v4: @custom-variant, @theme, ... herkennen + suggesties in className.
                  'files.associations': { '*.css': 'tailwindcss' },
                  'tailwindCSS.classFunctions': ['clsx', 'cn']
              }
            : {}),
        // TypeScript van het project gebruiken, niet die van VS Code.
        'typescript.tsdk': `${apps.tsDir}/node_modules/typescript/lib`,
        'typescript.enablePromptUseWorkspaceTsdk': true
    })

    writeJson(extensionsFile, {
        recommendations: [
            'esbenp.prettier-vscode',
            'dbaeumer.vscode-eslint',
            ...(apps.tailwind ? ['bradlc.vscode-tailwindcss'] : []),
            ...(apps.oxlint ? ['oxc.oxc-vscode'] : [])
        ]
    })
    return true
}
