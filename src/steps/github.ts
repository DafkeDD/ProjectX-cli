import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { runQuiet } from '../utils/exec.js'
import { orCancel } from '../utils/prompt.js'
import { withProgress } from '../utils/progress.js'

export interface GithubChoice {
    /** Meteen een repo aanmaken en pushen? */
    push: boolean
    /** Naam van de repo, eventueel met eigenaar: "mijn-app" of "mijn-org/mijn-app". */
    repo: string
    isPrivate: boolean
}

/** "Mijn Super App" -> "mijn-super-app" (geldige GitHub-repo-naam). */
function slugify(name: string): string {
    return (
        name
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'mijn-project'
    )
}

const REPO_PATTERN = /^([A-Za-z0-9-]+\/)?[A-Za-z0-9._-]+$/

/**
 * Laatste vragen: naar GitHub pushen? Zo ja: hoe heet het project (de repo)
 * en privé of openbaar. Zo nee: aan het einde krijg je de commando's.
 */
export async function askGithub(appName: string): Promise<GithubChoice> {
    const fallback = slugify(appName)

    const push = orCancel(await p.confirm({ message: 'Wil je dit naar GitHub pushen?', initialValue: true }))
    if (!push) return { push: false, repo: fallback, isPrivate: true }

    const repo = orCancel(
        await p.text({
            message: `Hoe moet het project op GitHub heten? ${pc.dim('(of eigenaar/naam voor een organisatie)')}`,
            placeholder: fallback,
            defaultValue: fallback,
            validate: value =>
                !value || REPO_PATTERN.test(value.trim())
                    ? undefined
                    : "Enkel letters, cijfers, '.', '_' en '-' (eventueel eigenaar/naam)."
        })
    ).trim()

    const visibility = orCancel(
        await p.select<'private' | 'public'>({
            message: 'Privé of openbaar?',
            initialValue: 'private',
            options: [
                { value: 'private', label: 'Privé' },
                { value: 'public', label: 'Openbaar' }
            ]
        })
    )

    return { push: true, repo: repo || fallback, isPrivate: visibility === 'private' }
}

export function githubLabel(choice: GithubChoice): string {
    return choice.push
        ? `${choice.repo}${pc.dim(`  (${choice.isPrivate ? 'privé' : 'openbaar'}, wordt aangemaakt en gepusht)`)}`
        : `niet pushen${pc.dim('  (je krijgt de commando’s)')}`
}

/** Commando's om zelf een GitHub-project aan te maken en te pushen. */
export function manualSteps(choice: GithubChoice): string {
    const vis = choice.isPrivate ? '--private' : '--public'
    return [
        pc.bold('Met de GitHub CLI (gh):'),
        '  git init',
        '  git add .',
        '  git commit -m "Initial commit"',
        '  git branch -M main',
        `  gh repo create ${choice.repo} ${vis} --source=. --remote=origin --push`,
        '',
        pc.bold('Of via github.com:'),
        `  1. Maak een lege repo aan op ${pc.cyan('https://github.com/new')} (zonder README of .gitignore)`,
        '  2. Daarna, in deze map:',
        '  git init',
        '  git add .',
        '  git commit -m "Initial commit"',
        '  git branch -M main',
        `  git remote add origin https://github.com/<jouw-account>/${choice.repo.split('/').pop()}.git`,
        '  git push -u origin main'
    ].join('\n')
}

/** .gitignore en README.md in de projectmap (submappen hebben hun eigen). */
export function writeRootFiles(projectDir: string, appName: string, dirs: { dir: string; run: string }[]): void {
    const gitignore = path.join(projectDir, '.gitignore')
    if (!fs.existsSync(gitignore)) {
        fs.writeFileSync(
            gitignore,
            [
                '# OS / editor',
                '.DS_Store',
                'Thumbs.db',
                '',
                '# Lokale instellingen (elke app heeft een .env.example)',
                '.env',
                '.env.local',
                '',
                '# Dependencies / build (submappen hebben ook een eigen .gitignore)',
                'node_modules/',
                'dist/',
                '.next/',
                ''
            ].join('\n'),
            'utf8'
        )
    }

    const readme = path.join(projectDir, 'README.md')
    if (!fs.existsSync(readme)) {
        const lines = [`# ${appName}`, '', 'Opgezet met [ProjectX-cli](https://github.com/DafkeDD/ProjectX-cli).', '']
        for (const { dir, run } of dirs) {
            lines.push(`## ${dir}`, '', '```bash', `cd ${dir}`, 'cp .env.example .env', run, '```', '')
        }
        fs.writeFileSync(readme, lines.join('\n'), 'utf8')
    }
}

async function ok(command: string, args: string[], cwd?: string): Promise<boolean> {
    try {
        await runQuiet(command, args, cwd)
        return true
    } catch {
        return false
    }
}

/**
 * Maakt de repo aan op GitHub en pusht. Lukt het niet (gh ontbreekt, niet
 * ingelogd, naam bestaat al), dan krijg je de commando's om het zelf te doen.
 */
export async function pushToGithub(choice: GithubChoice, projectDir: string): Promise<void> {
    if (!choice.push) {
        p.note(manualSteps(choice), 'Zelf naar GitHub pushen')
        return
    }

    if (!(await ok('git', ['--version']))) {
        p.log.warn('git is niet geïnstalleerd — niet gepusht. Installeer git: https://git-scm.com/downloads')
        p.note(manualSteps(choice), 'Zelf naar GitHub pushen')
        return
    }
    if (!(await ok('gh', ['auth', 'status']))) {
        p.log.warn(
            'GitHub CLI (gh) niet gevonden of niet ingelogd — repo niet aangemaakt.\n' +
                `Installeren: ${pc.cyan('winget install --id GitHub.cli')}  ·  inloggen: ${pc.cyan('gh auth login')}`
        )
        p.note(manualSteps(choice), 'Zelf naar GitHub pushen')
        return
    }

    try {
        await withProgress(
            'Git-repo voorbereiden',
            async update => {
                if (!fs.existsSync(path.join(projectDir, '.git'))) await runQuiet('git', ['init'], projectDir)
                await runQuiet('git', ['add', '.'], projectDir)

                // Zonder user.name/user.email weigert git te committen: dan een tijdelijke identiteit.
                const hasIdentity =
                    (await ok('git', ['config', 'user.email'], projectDir)) &&
                    (await ok('git', ['config', 'user.name'], projectDir))
                const id = hasIdentity
                    ? []
                    : ['-c', 'user.name=projectx-cli', '-c', 'user.email=projectx-cli@users.noreply.github.com']
                await runQuiet('git', [...id, 'commit', '-m', 'Initial commit (ProjectX-cli)'], projectDir)
                await runQuiet('git', ['branch', '-M', 'main'], projectDir)

                update(`Repo '${choice.repo}' aanmaken op GitHub en pushen`)
                await runQuiet(
                    'gh',
                    [
                        'repo',
                        'create',
                        choice.repo,
                        choice.isPrivate ? '--private' : '--public',
                        '--source=.',
                        '--remote=origin',
                        '--push'
                    ],
                    projectDir
                )
            },
            20000
        )

        let url = ''
        try {
            const { execSync } = await import('node:child_process')
            url = execSync('git remote get-url origin', { cwd: projectDir, encoding: 'utf8' }).trim()
        } catch {
            // geen URL is niet erg
        }
        p.log.success(`Op GitHub gezet: ${pc.cyan(url.replace(/\.git$/, '') || choice.repo)}`)
    } catch (err) {
        p.log.warn(`Pushen naar GitHub is niet gelukt: ${err instanceof Error ? err.message : String(err)}`)
        p.note(manualSteps(choice), 'Zelf naar GitHub pushen')
    }
}
