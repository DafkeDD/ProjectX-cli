import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { runQuiet } from '../utils/exec.js'
import { formatAll } from '../utils/prettier.js'
import { orCancel } from '../utils/prompt.js'
import { dbFiles } from '../steps/database/templates.js'
import { SECURITY_HEADERS } from '../steps/i18n.js'
import { HUB_REWRITES } from '../steps/hub/index.js'
import { REWRITES as SSO_REWRITES } from '../steps/sso/templates.js'
import { detectProject, projectLabel, type Project } from './detect.js'

/**
 * `npx projectx-cli update` — zet de nieuwste versie van de bestanden die de
 * CLI beheert in een bestaand project. Wat jij zelf aanpaste, blijft staan
 * tenzij je kiest om te overschrijven; .env wordt nooit aangeraakt.
 */
const HUB_TEMPLATES = fileURLToPath(new URL('../../templates/hub', import.meta.url))
const SSO_TEMPLATES = fileURLToPath(new URL('../../templates/app-sso', import.meta.url))

type Status = 'nieuw' | 'gelijk' | 'gewijzigd'

interface Managed {
    /** Pad zoals de gebruiker het ziet, bv. backend/src/hub/apps.ts */
    label: string
    file: string
    content: string
    status: Status
}

/** Alle bestanden in een map, als relatieve paden. */
function walk(dir: string, base = dir): string[] {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name)
        return entry.isDirectory() ? walk(full, base) : [path.relative(base, full)]
    })
}

const same = (file: string, content: string) =>
    fs.existsSync(file) && fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') === content.replace(/\r\n/g, '\n')

function classify(target: string, relative: string, content: string, prefix: string): Managed {
    const file = path.join(target, relative)
    return {
        label: `${prefix}${relative.split(path.sep).join('/')}`,
        file,
        content,
        status: !fs.existsSync(file) ? 'nieuw' : same(file, content) ? 'gelijk' : 'gewijzigd'
    }
}

/** Welke bestanden hoort dit project van de CLI te krijgen? */
function managedFiles(project: Project): Managed[] {
    const files: Managed[] = []

    if (project.backendDir && (project.database || project.connected)) {
        // De datalaag (src/db, migraties, seeds) komt uit één generator.
        for (const [relative, content] of Object.entries(dbFiles())) {
            // src/env.ts bevat bij een aangesloten app extra blokken: niet overschrijven.
            if (relative === 'src/env.ts') continue
            files.push(classify(project.backendDir, relative, content, 'backend/'))
        }
    }

    if (project.hub && project.backendDir) {
        for (const relative of walk(path.join(HUB_TEMPLATES, 'backend'))) {
            const content = fs.readFileSync(path.join(HUB_TEMPLATES, 'backend', relative), 'utf8')
            files.push(classify(project.backendDir, relative, content, 'backend/'))
        }
    }
    if (project.hub && project.frontendDir) {
        for (const relative of walk(path.join(HUB_TEMPLATES, 'frontend'))) {
            const content = fs.readFileSync(path.join(HUB_TEMPLATES, 'frontend', relative), 'utf8')
            files.push(classify(project.frontendDir, relative, content, 'frontend/'))
        }
    }

    if (project.connected && project.backendDir) {
        const dirs = ['backend', project.backend === 'nestjs' ? 'nest' : 'express']
        for (const dir of dirs) {
            for (const relative of walk(path.join(SSO_TEMPLATES, dir))) {
                const content = fs.readFileSync(path.join(SSO_TEMPLATES, dir, relative), 'utf8')
                files.push(classify(project.backendDir, relative, content, 'backend/'))
            }
        }
    }
    if (project.connected && project.frontendDir) {
        for (const relative of walk(path.join(SSO_TEMPLATES, 'frontend'))) {
            const plain = relative.includes('.plain.')
            // Met ProjectX-UI de gewone versie, anders de .plain-versie.
            if (plain !== !project.ui) continue
            const content = fs.readFileSync(path.join(SSO_TEMPLATES, 'frontend', relative), 'utf8')
            files.push(classify(project.frontendDir, relative.replace('.plain.', '.'), content, 'frontend/'))
        }
    }

    return files
}

/** Ontbrekende vertaalsleutels erbij zetten (bestaande teksten blijven). */
function mergeMessages(project: Project): string[] {
    if (!project.frontendDir) return []
    const source = project.hub
        ? path.join(HUB_TEMPLATES, 'messages.json')
        : project.connected
          ? path.join(SSO_TEMPLATES, 'messages.json')
          : null
    if (!source || !fs.existsSync(source)) return []

    const namespace = project.hub ? 'Hub' : 'Auth'
    const texts = JSON.parse(fs.readFileSync(source, 'utf8')) as Record<string, Record<string, unknown>>
    const changed: string[] = []

    for (const file of fs.readdirSync(path.join(project.frontendDir, 'messages'))) {
        if (!file.endsWith('.json')) continue
        const locale = file.slice(0, -5)
        const fresh = texts[locale] ?? texts.en
        if (!fresh) continue
        const full = path.join(project.frontendDir, 'messages', file)
        const messages = JSON.parse(fs.readFileSync(full, 'utf8')) as Record<string, unknown>
        const before = JSON.stringify(messages[namespace] ?? {})
        messages[namespace] = fill((messages[namespace] as Record<string, unknown>) ?? {}, fresh)
        if (JSON.stringify(messages[namespace]) !== before) {
            fs.writeFileSync(full, JSON.stringify(messages, null, 4) + '\n', 'utf8')
            changed.push(`messages/${file}`)
        }
    }
    return changed
}

/** Alleen ontbrekende sleutels overnemen, nooit bestaande teksten overschrijven. */
function fill(current: Record<string, unknown>, fresh: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...current }
    for (const [key, value] of Object.entries(fresh)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            result[key] = fill((current[key] as Record<string, unknown>) ?? {}, value as Record<string, unknown>)
        } else if (result[key] === undefined) {
            result[key] = value
        }
    }
    return result
}

/** Aanpassingen in bestanden die jij ook bewerkt: alleen toevoegen als ze ontbreken. */
interface Patch {
    label: string
    file: string
    applies: (source: string) => boolean
    apply: (source: string) => string
}

function patches(project: Project): Patch[] {
    const list: Patch[] = []
    const anchor = '    /**\n     * Vangnet: de taal'

    if (project.frontendDir && (project.hub || project.connected)) {
        const config = path.join(project.frontendDir, 'next.config.ts')
        const rewrites = project.hub ? HUB_REWRITES : SSO_REWRITES
        const paths = project.hub ? '/oidc, /api, /interaction' : '/auth, /api, /health'
        list.push({
            label: `frontend/next.config.ts: doorsturen naar de backend (${paths})`,
            file: config,
            applies: source => !source.includes('async rewrites()'),
            apply: source => (source.includes(anchor) ? source.replace(anchor, `${rewrites}${anchor}`) : source)
        })
        list.push({
            label: 'frontend/next.config.ts: veiligheidsheaders (frame-ancestors, nosniff)',
            file: config,
            applies: source => !source.includes('frame-ancestors'),
            apply: source => (source.includes(anchor) ? source.replace(anchor, `${SECURITY_HEADERS}${anchor}`) : source)
        })
    }

    if (project.backendDir && project.connected) {
        const env = path.join(project.backendDir, 'src', 'env.ts')
        list.push({
            label: 'backend/src/env.ts: OIDC-instellingen (OIDC_ISSUER, client, webhook)',
            file: env,
            applies: source => !source.includes('OIDC_ISSUER'),
            apply: source => source
        })
        list.push({
            label: 'backend/src/env.ts: secureCookies (Secure-cookies zodra je op https draait)',
            file: env,
            applies: source => !source.includes('secureCookies'),
            apply: source =>
                source.replace(
                    "    production: process.env.NODE_ENV === 'production',",
                    `    production: process.env.NODE_ENV === 'production',\n    /** Cookies krijgen \`Secure\` zodra de app op https draait. */\n    secureCookies: publicUrl.startsWith('https://') && process.env.ALLOW_INSECURE_COOKIES !== '1',`
                )
        })
    }
    return list
}

/** Kan deze aanpassing automatisch? (het bestand heeft nog de vorm die we verwachten) */
const canApply = (patch: Patch, source: string) => patch.apply(source) !== source

/** Aanpassingen die nog ontbreken, met of zonder automatische oplossing. */
function missingPatches(project: Project): { patch: Patch; auto: boolean }[] {
    return patches(project)
        .filter(patch => fs.existsSync(patch.file) && patch.applies(fs.readFileSync(patch.file, 'utf8')))
        .map(patch => ({ patch, auto: canApply(patch, fs.readFileSync(patch.file, 'utf8')) }))
}

/** Past de aanpassingen toe die automatisch kunnen. */
function applyPatches(items: { patch: Patch; auto: boolean }[]): string[] {
    const done: string[] = []
    for (const { patch, auto } of items) {
        if (!auto) continue
        fs.writeFileSync(patch.file, patch.apply(fs.readFileSync(patch.file, 'utf8')), 'utf8')
        done.push(patch.label)
    }
    return done
}

export async function runUpdate(dir: string, pm: 'npm' = 'npm'): Promise<void> {
    const project = detectProject(dir)
    if (!project.backendDir && !project.frontendDir) {
        p.log.error('Hier staat geen ProjectX-project (geen frontend/ of backend/ met een package.json).')
        return
    }
    p.log.info(`${pc.cyan(path.basename(dir))} — ${projectLabel(project)}`)

    const files = managedFiles(project)
    const fresh = files.filter(file => file.status === 'nieuw')
    const changed = files.filter(file => file.status === 'gewijzigd')
    const equal = files.filter(file => file.status === 'gelijk')

    if (!fresh.length && !changed.length) {
        p.log.success(`Alle bestanden zijn al bij ${pc.dim(`(${equal.length} gecontroleerd)`)}`)
        await finishPatches(project)
        return
    }

    const summary = [
        `${pc.green(`${fresh.length} nieuw`)}  ${pc.yellow(`${changed.length} gewijzigd door jou`)}  ${pc.dim(`${equal.length} al gelijk`)}`,
        '',
        ...fresh.slice(0, 15).map(file => `${pc.green('+')} ${file.label}`),
        ...(fresh.length > 15 ? [pc.dim(`  … en ${fresh.length - 15} andere`)] : []),
        ...changed.slice(0, 15).map(file => `${pc.yellow('~')} ${file.label}`),
        ...(changed.length > 15 ? [pc.dim(`  … en ${changed.length - 15} andere`)] : [])
    ]
    p.note(summary.join('\n'), 'Wat er te doen is')

    const keuze = orCancel(
        await p.select<'nieuw' | 'alles' | 'stop'>({
            message: 'Wat wil je bijwerken?',
            initialValue: changed.length ? 'nieuw' : 'alles',
            options: [
                {
                    value: 'nieuw',
                    label: `Alleen nieuwe bestanden (${fresh.length})`,
                    hint: 'wat jij aanpaste blijft staan'
                },
                {
                    value: 'alles',
                    label: `Alles bijwerken (${fresh.length + changed.length})`,
                    hint: 'jouw wijzigingen in die bestanden gaan verloren'
                },
                { value: 'stop', label: 'Niets doen' }
            ]
        })
    )
    if (keuze === 'stop') {
        p.log.info('Niets gewijzigd.')
        return
    }

    const write = keuze === 'alles' ? [...fresh, ...changed] : fresh
    for (const file of write) {
        fs.mkdirSync(path.dirname(file.file), { recursive: true })
        fs.writeFileSync(file.file, file.content, 'utf8')
    }
    p.log.success(`${write.length} bestand${write.length === 1 ? '' : 'en'} bijgewerkt.`)

    const texts = mergeMessages(project)
    if (texts.length) p.log.success(`Vertalingen aangevuld ${pc.dim(`(${texts.length} bestanden)`)}`)

    // Nieuwe migraties meteen draaien.
    const newMigrations = write.filter(file => file.label.includes('/migrations/'))
    if (newMigrations.length && project.backendDir) {
        const run = orCancel(
            await p.confirm({ message: `${newMigrations.length} nieuwe migratie(s) nu draaien?`, initialValue: true })
        )
        if (run) {
            try {
                await runQuiet(pm, ['run', 'db:migrate'], project.backendDir)
                p.log.success('Database bijgewerkt.')
            } catch (error) {
                p.log.warn(`db:migrate mislukte: ${error instanceof Error ? error.message : error}`)
            }
        }
    }

    for (const target of [project.backendDir, project.frontendDir]) {
        if (target) await formatAll(pm, target).catch(() => {})
    }

    await finishPatches(project)
    p.log.info(`Controleer daarna met ${pc.cyan('npx projectx-cli doctor')} en start je app opnieuw.`)
}

/**
 * Aanpassingen in bestanden die jij ook bewerkt (next.config.ts, env.ts):
 * wat automatisch kan, bieden we aan; de rest tonen we als lijstje.
 */
async function finishPatches(project: Project): Promise<void> {
    const missing = missingPatches(project)
    if (!missing.length) return

    const auto = missing.filter(item => item.auto)
    const manual = missing.filter(item => !item.auto)

    if (auto.length) {
        p.note(auto.map(item => `• ${item.patch.label}`).join('\n'), 'Ontbreekt nog')
        const go = orCancel(
            await p.confirm({ message: `${auto.length} aanpassing(en) nu toepassen?`, initialValue: true })
        )
        if (go) {
            const done = applyPatches(auto)
            p.log.success(`Toegepast: ${done.length} aanpassing${done.length === 1 ? '' : 'en'}.`)
        }
    }
    if (manual.length) {
        p.note(
            [
                'Dit pas je zelf aan (de CLI herkent de vorm van het bestand niet meer):',
                ...manual.map(item => `• ${item.patch.label}`)
            ].join('\n'),
            'Nog met de hand te doen'
        )
    }
}
