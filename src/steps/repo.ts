import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { runQuiet } from '../utils/exec.js'

/**
 * De projectmap als git-repo: altijd een eerste commit, ook zonder GitHub.
 * Plus .gitattributes (regeleindes), een CI-bestand en een pre-commit hook.
 */

const GITATTRIBUTES = `# Regeleindes: in de repo altijd LF, op Windows in de werkmap wat Windows wil.
# Zonder dit krijg je CRLF in bestanden die de CLI genereert (en rare diffs).
* text=auto eol=lf

# Binaire bestanden nooit aanpassen.
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.webp binary
*.woff binary
*.woff2 binary
*.pdf binary

# Lockfiles: één blok in de diff, geen merge-hulp.
package-lock.json -diff
`

const workflow = (dirs: string[]): string => `# Controleert bij elke push en pull request of alles nog klopt.
name: CI

on:
    push:
        branches: [main]
    pull_request:

jobs:
    check:
        runs-on: ubuntu-latest
        strategy:
            fail-fast: false
            matrix:
                app: [${dirs.map(d => `'${d}'`).join(', ')}]
        defaults:
            run:
                working-directory: \${{ matrix.app }}
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with:
                  node-version: 24
                  cache: npm
                  cache-dependency-path: \${{ matrix.app }}/package-lock.json
            - run: npm ci
            - run: npm run format:check
            - run: npm run lint
            - run: npm run build
`

const preCommit = (dirs: string[]): string => `#!/bin/sh
# Voor het committen: opmaak en lint controleren in de mappen die wijzigen.
# Overslaan kan met: git commit --no-verify
set -e

changed() {
    git diff --cached --name-only | grep -q "^$1/"
}

for app in ${dirs.join(' ')}; do
    if changed "$app"; then
        echo "→ $app: opmaak en lint"
        (cd "$app" && npm run --silent format:check && npm run --silent lint)
    fi
done
`

export interface RepoOptions {
    /** Submappen met een eigen package.json (frontend, backend). */
    dirs: string[]
    /** Wordt er meteen naar GitHub gepusht? Dan commit die stap zelf. */
    pushesToGithub: boolean
}

/** Schrijft .gitattributes, het CI-bestand en de hook. */
export function writeRepoFiles(projectDir: string, dirs: string[]): void {
    const attributes = path.join(projectDir, '.gitattributes')
    if (!fs.existsSync(attributes)) fs.writeFileSync(attributes, GITATTRIBUTES, 'utf8')

    if (dirs.length > 0) {
        const workflows = path.join(projectDir, '.github', 'workflows')
        fs.mkdirSync(workflows, { recursive: true })
        const ci = path.join(workflows, 'ci.yml')
        if (!fs.existsSync(ci)) fs.writeFileSync(ci, workflow(dirs), 'utf8')

        const hooks = path.join(projectDir, '.githooks')
        fs.mkdirSync(hooks, { recursive: true })
        const hook = path.join(hooks, 'pre-commit')
        if (!fs.existsSync(hook)) fs.writeFileSync(hook, preCommit(dirs), { encoding: 'utf8', mode: 0o755 })
    }
}

/**
 * Maakt er een git-repo van met een eerste commit. Bestaat er al een repo of
 * staat er al een commit, dan doen we niets.
 */
export async function initRepo(projectDir: string, options: RepoOptions): Promise<void> {
    if (options.pushesToGithub) return
    try {
        if (!fs.existsSync(path.join(projectDir, '.git'))) {
            await runQuiet('git', ['init', '-b', 'main'], projectDir)
        }
        if (options.dirs.length > 0) {
            await runQuiet('git', ['config', 'core.hooksPath', '.githooks'], projectDir)
        }
        await runQuiet('git', ['add', '.'], projectDir)
        // Zonder ingestelde naam/e-mail faalt commit: dan geven we die eenmalig mee.
        const identity = await hasGitIdentity(projectDir)
        const id = identity
            ? []
            : ['-c', 'user.name=ProjectX', '-c', 'user.email=projectx@localhost', '-c', 'commit.gpgsign=false']
        await runQuiet('git', [...id, 'commit', '-m', 'Initial commit (ProjectX-cli)'], projectDir)
        p.log.success(`Git-repo klaar ${pc.dim('(eerste commit gemaakt; pre-commit controleert opmaak en lint)')}`)
    } catch {
        // Geen git op deze machine, of niets te committen: niet fataal.
        p.log.info(`Git overgeslagen ${pc.dim('(git niet gevonden of niets te committen)')}`)
    }
}

async function hasGitIdentity(projectDir: string): Promise<boolean> {
    try {
        await runQuiet('git', ['config', 'user.email'], projectDir)
        return true
    } catch {
        return false
    }
}
