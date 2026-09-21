import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { orCancel } from '../../utils/prompt.js'
import { protectFile } from '../../utils/guard.js'
import { runQuiet } from '../../utils/exec.js'
import { withProgress } from '../../utils/progress.js'
import { formatAll } from '../../utils/prettier.js'
import type { PackageManager } from '../../types.js'
import type { I18nConfig } from '../i18n.js'
import { AGENTS_RULES, DOCS_SSO, ENV_OIDC, ENV_PUBLIC_URL, envBlock, FRONTEND_AGENTS, REWRITES } from './templates.js'

/** Map met de bestanden voor een app die op een hub aansluit. */
const TEMPLATES = fileURLToPath(new URL('../../../templates/app-sso', import.meta.url))

/** Waar de hub draait en waarmee we ons mogen aansluiten. */
export interface HubConnection {
    /** Issuer zoals de hub zich noemt, bv. http://localhost:3000/oidc */
    issuer: string
    token: string
}

/** Wat de hub teruggeeft na het aansluiten. */
export interface RegisteredApp {
    clientId: string
    clientSecret: string
    webhookSecret: string
}

interface Discovery {
    issuer?: string
    authorization_endpoint?: string
    token_endpoint?: string
}

/** Haalt .well-known op; probeert ook met /oidc erachter. */
async function discover(input: string): Promise<{ issuer: string } | string> {
    const base = input.replace(/\/+$/, '')
    const candidates = base.endsWith('/oidc') ? [base] : [base, `${base}/oidc`]
    let last = 'onbekende fout'
    for (const candidate of candidates) {
        try {
            const response = await fetch(`${candidate}/.well-known/openid-configuration`, {
                signal: AbortSignal.timeout(8000)
            })
            if (!response.ok) {
                last = `HTTP ${response.status}`
                continue
            }
            const doc = (await response.json()) as Discovery
            if (!doc.issuer || !doc.authorization_endpoint || !doc.token_endpoint) {
                last = 'dat is geen OIDC-server'
                continue
            }
            return { issuer: doc.issuer }
        } catch (error) {
            last = error instanceof Error ? error.message : String(error)
        }
    }
    return last
}

/** Vraagt naar de hub en het registratietoken, en test meteen de verbinding. */
export async function askHubConnection(): Promise<HubConnection> {
    p.log.info(
        `De app sluit zich aan op een SSO-hub die al draait. ${pc.dim('Het registratietoken (pxr_...) komt uit het beheerpaneel van die hub.')}`
    )
    for (;;) {
        const url = orCancel(
            await p.text({
                message: 'Adres van de hub?',
                placeholder: 'http://localhost:3000',
                validate: value =>
                    /^https?:\/\/.+/.test(value.trim()) ? undefined : 'Een adres met http:// of https://'
            })
        )
        const token = orCancel(
            await p.text({
                message: 'Registratietoken?',
                placeholder: 'pxr_...',
                validate: value => (value.trim().startsWith('pxr_') ? undefined : 'Een token dat met pxr_ begint.')
            })
        )

        const s = p.spinner()
        s.start('Hub testen')
        const found = await discover(url.trim())
        if (typeof found === 'string') {
            s.stop('Hub niet bereikbaar')
            p.log.warn(`${url} antwoordt niet als OIDC-server (${found}).`)
            continue
        }
        s.stop(`Hub gevonden ${pc.dim(found.issuer)}`)
        return { issuer: found.issuer, token: token.trim() }
    }
}

export const ssoLabel = (connection: HubConnection) => `aansluiten op ${connection.issuer}`

/**
 * Sluit de app aan bij de hub (in de stijl van RFC 7591): de hub geeft
 * client_id, client_secret en het geheim voor de webhook terug.
 */
export async function registerWithHub(
    connection: HubConnection,
    input: { appKey: string; appName: string; publicUrl: string; webhookUrl: string | null }
): Promise<RegisteredApp> {
    const api = connection.issuer.replace(/\/oidc$/, '')
    const response = await fetch(`${api}/api/apps/register`, {
        method: 'POST',
        headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
            client_id: input.appKey,
            client_name: input.appName,
            redirect_uris: [`${input.publicUrl}/auth/callback`],
            post_logout_redirect_uris: [`${input.publicUrl}/`],
            ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {})
        }),
        signal: AbortSignal.timeout(15000)
    })
    const body = (await response.json().catch(() => ({}))) as {
        client_id?: string
        client_secret?: string
        webhook_secret?: string
        error?: string
    }
    if (!response.ok || !body.client_id || !body.client_secret) {
        const reasons: Record<string, string> = {
            invalidToken: 'het registratietoken is ongeldig, verlopen, ingetrokken of opgebruikt',
            appKeyTaken: `er is al een app met de sleutel "${input.appKey}" op deze hub`,
            invalidMetadata: 'de hub aanvaardt deze gegevens niet (adres of naam van de app)'
        }
        throw new Error(
            `Aansluiten bij de hub is niet gelukt: ${reasons[body.error ?? ''] ?? `HTTP ${response.status}`}.`
        )
    }
    return {
        clientId: body.client_id,
        clientSecret: body.client_secret,
        webhookSecret: body.webhook_secret ?? ''
    }
}

/** Kopieert een map uit templates/app-sso naar het project. */
function copyDir(from: string, to: string): void {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const src = path.join(from, entry.name)
        const dest = path.join(to, entry.name)
        if (entry.isDirectory()) {
            fs.mkdirSync(dest, { recursive: true })
            copyDir(src, dest)
        } else {
            fs.mkdirSync(path.dirname(dest), { recursive: true })
            fs.copyFileSync(src, dest)
        }
    }
}

function append(file: string, text: string): void {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    fs.writeFileSync(file, `${current.trimEnd()}\n${text}`, 'utf8')
}

export interface SsoBackendOptions {
    backend: 'nestjs' | 'express'
    issuer: string
    app: RegisteredApp
    /** Publiek adres van de app (frontend, of de backend zonder frontend). */
    publicUrl: string
}

/**
 * De backend van een aangesloten app: inloggen via de hub, sessies, de tenant
 * bij de eerste login en de events van de hub.
 */
export function applySsoBackend(target: string, options: SsoBackendOptions): void {
    const nest = options.backend === 'nestjs'
    copyDir(path.join(TEMPLATES, 'backend'), target)
    copyDir(path.join(TEMPLATES, nest ? 'nest' : 'express'), target)

    // env.ts: het OIDC-blok erbij.
    const envFile = path.join(target, 'src', 'env.ts')
    let env = fs.readFileSync(envFile, 'utf8').replace(/\r\n/g, '\n')
    env = env.replace(
        '/**\n * Alle instellingen op één plek',
        `${ENV_PUBLIC_URL}\n/**\n * Alle instellingen op één plek`
    )
    env = env.replace(/\n\} as const/, `${ENV_OIDC}\n} as const`)
    if (!env.includes('OIDC_ISSUER')) throw new Error('src/env.ts: het OIDC-blok kon er niet in.')
    fs.writeFileSync(envFile, env, 'utf8')

    // Opstarten: sessies opruimen, events ophalen, (Nest) rawBody voor de webhook.
    const startupFile = path.join(target, 'src', nest ? 'main.ts' : 'index.ts')
    let startup = fs.readFileSync(startupFile, 'utf8').replace(/\r\n/g, '\n')
    startup = startup.replace(
        /(import \{ env \} from '\.\/env\.js'\n)/,
        `$1import { cleanupSessions } from './auth/sessions.js'\nimport { startEventSync } from './hub/events.js'\n`
    )
    const boot = `// Verlopen sessies opruimen en events van de hub ophalen (nu en elke minuut).
    await cleanupSessions()
    setInterval(() => void cleanupSessions().catch(() => {}), 3600_000).unref()
    startEventSync()
`
    if (nest) {
        startup = startup.replace(
            'const app = await NestFactory.create(AppModule)',
            '// rawBody: nodig om de handtekening van de hub-events te controleren.\n    const app = await NestFactory.create(AppModule, { rawBody: true })'
        )
        startup = startup.replace('    await app.listen(env.port)', `    ${boot}\n    await app.listen(env.port)`)
        registerModules(target)
    } else {
        startup = startup
            .replace(
                'app.use(express.json())',
                `app.use(\n    express.json({\n        // De ruwe body bewaren: de handtekening van de hub gaat over de tekst zelf.\n        verify: (req, _res, buffer) => {\n            ;(req as unknown as { rawBody?: string }).rawBody = buffer.toString('utf8')\n        }\n    })\n)`
            )
            .replace(
                "app.use('/health', healthRouter)",
                "app.use('/health', healthRouter)\napp.use('/auth', authRouter)\napp.use('/hub', hubRouter)"
            )
            .replace(
                /(import \{ healthRouter \} from '\.\/routes\/health\.js'\n)/,
                `$1import { authRouter } from './routes/auth.js'\nimport { hubRouter } from './routes/hub.js'\n`
            )
            .replace('app.listen(env.port', `${boot.replace(/^ {4}/gm, '')}\napp.listen(env.port`)
    }
    if (!startup.includes('startEventSync')) throw new Error('De backend kon niet aangepast worden voor SSO.')
    fs.writeFileSync(startupFile, startup, 'utf8')

    // .env + uitleg + regels.
    const values = { ...options.app, issuer: options.issuer, publicUrl: options.publicUrl }
    append(path.join(target, '.env'), envBlock(values, true))
    protectFile(path.join(target, '.env'))
    append(path.join(target, '.env.example'), envBlock(values, false))
    fs.mkdirSync(path.join(target, 'docs'), { recursive: true })
    fs.writeFileSync(
        path.join(target, 'docs', 'sso.md'),
        DOCS_SSO({ issuer: options.issuer, clientId: options.app.clientId, publicUrl: options.publicUrl }),
        'utf8'
    )
    const agents = path.join(target, 'AGENTS.md')
    const rules = fs.readFileSync(agents, 'utf8')
    fs.writeFileSync(
        agents,
        rules.includes('## Code-stijl')
            ? rules.replace('## Code-stijl', `${AGENTS_RULES(options.issuer).trim()}\n\n## Code-stijl`)
            : `${rules.trimEnd()}\n${AGENTS_RULES(options.issuer)}`,
        'utf8'
    )
}

/** AuthModule en HubModule in de AppModule van NestJS zetten. */
function registerModules(target: string): void {
    const file = path.join(target, 'src', 'app.module.ts')
    let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    if (source.includes('AuthModule')) return
    const imports = `import { AuthModule } from './auth/auth.module.js'\nimport { HubModule } from './hub/hub.module.js'\n`
    const withImports = source.replace(/(import \{ Module \} from '@nestjs\/common';?\n)/, `$1${imports}`)
    source = withImports !== source ? withImports : imports + source
    const modules = source.replace(/imports:\s*\[([^\]]*)\]/, (_all, current: string) => {
        const list = current.trim() ? `${current.trim()}, AuthModule, HubModule` : 'AuthModule, HubModule'
        return `imports: [${list}]`
    })
    if (modules === source) throw new Error('AuthModule kon niet in src/app.module.ts gezet worden.')
    fs.writeFileSync(file, modules, 'utf8')
}

/**
 * De frontend van een aangesloten app: aanmelden, beschermde pagina's, de
 * gebruiker en zijn organisatie in beeld, en alles via één adres.
 */
export function applySsoFrontend(target: string, i18n: I18nConfig, backendPort: number, ui: boolean): void {
    copyDir(path.join(TEMPLATES, 'frontend'), target)

    // Met ProjectX-UI de UI-versie, anders de gewone; de andere weg.
    const auth = path.join(target, 'src', 'components', 'auth')
    for (const name of ['AuthPanel', 'LinkButton', 'LogoutForm']) {
        const plain = path.join(auth, `${name}.plain.tsx`)
        if (!ui) fs.copyFileSync(plain, path.join(auth, `${name}.tsx`))
        fs.rmSync(plain, { force: true })
    }

    // Teksten in elke gekozen taal.
    const texts = JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'messages.json'), 'utf8')) as Record<string, unknown>
    for (const locale of i18n.locales) {
        const file = path.join(target, 'messages', `${locale}.json`)
        const messages = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
        messages.Auth = texts[locale] ?? texts.en
        fs.writeFileSync(file, JSON.stringify(messages, null, 4) + '\n', 'utf8')
    }

    // next.config.ts: /auth, /api en /health naar de backend.
    const config = path.join(target, 'next.config.ts')
    let source = fs.readFileSync(config, 'utf8')
    if (!source.includes('async rewrites()')) {
        source = source.replace('    /**\n     * Vangnet: de taal', `${REWRITES}    /**\n     * Vangnet: de taal`)
        if (!source.includes('async rewrites()'))
            throw new Error('next.config.ts: rewrites konden niet toegevoegd worden.')
        fs.writeFileSync(config, source, 'utf8')
    }

    // proxy.ts (next-intl) mag /auth en /health niet afhandelen.
    const proxy = path.join(target, 'src', 'proxy.ts')
    const matcher = fs
        .readFileSync(proxy, 'utf8')
        .replace('(?:api|trpc)(?:/|$)|', '(?:api|auth|health|trpc)(?:/|$)|')
        .replace('// Alles behalve /api/..., /trpc/...,', '// Alles behalve /api/..., /auth/..., /health, /trpc/...,')
    if (!matcher.includes('api|auth|health')) throw new Error('src/proxy.ts kon niet aangepast worden.')
    fs.writeFileSync(proxy, matcher, 'utf8')

    // .env: de browser praat met de frontend; die stuurt door naar de backend.
    const internal = `\n# Adres van de backend vanaf de server (doorsturen van /auth, /api, /health + server components).\nAPI_INTERNAL_URL="http://localhost:${backendPort}"\n`
    for (const name of ['.env', '.env.example']) {
        const file = path.join(target, name)
        const env = fs
            .readFileSync(file, 'utf8')
            .replace(
                '# Adres van de backend (API). Gebruik in de code: env.apiUrl.',
                '# Publiek adres van de app (deze frontend). De browser praat altijd met dit adres;\n# /auth, /api en /health gaan door naar de backend. In de code: env.apiUrl.'
            )
        fs.writeFileSync(file, env.trimEnd() + '\n' + internal, 'utf8')
    }

    patchHomePage(target, ui)

    for (const name of ['AGENTS.md', 'PROJECT-RULES.md']) {
        const file = path.join(target, name)
        if (!fs.existsSync(file)) continue
        const rules = fs.readFileSync(file, 'utf8')
        fs.writeFileSync(
            file,
            rules.includes('<!-- END:projectx-rules -->')
                ? rules.replace(
                      '<!-- END:projectx-rules -->',
                      `${FRONTEND_AGENTS.trim()}\n\n<!-- END:projectx-rules -->`
                  )
                : `${rules.trimEnd()}\n${FRONTEND_AGENTS}`,
            'utf8'
        )
    }
}

/** Zet het aanmeldblok op de startpagina (boven het thema-blok). */
function patchHomePage(target: string, ui: boolean): void {
    const file = path.join(target, 'src', 'app', '[locale]', 'page.tsx')
    let page = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

    page = page.replace(
        "import { env } from '@/lib/env'\n",
        "import { env } from '@/lib/env'\nimport AuthPanel from '@/components/auth/AuthPanel'\nimport { noticeOf } from '@/lib/session'\n"
    )
    page = page.replace(
        'export default async function Home() {',
        'export default async function Home({ searchParams }: { searchParams: Promise<{ login?: string }> }) {'
    )
    page = page.replace(
        "    const tTheme = await getTranslations('Theme')\n",
        "    const tTheme = await getTranslations('Theme')\n    const tAuth = await getTranslations('Auth')\n    const { login } = await searchParams\n"
    )

    const uiMarker =
        "                    <div className='flex flex-col items-start gap-3'>\n                        <SectionHeader size='sm' title={tTheme('appearance')} />"
    const plainMarker =
        "                <div className='mt-8'>\n                    <p className='text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase'>\n                        {tTheme('appearance')}"

    if (ui && page.includes(uiMarker)) {
        page = page.replace(
            uiMarker,
            `                    <div className='flex flex-col items-start gap-3'>
                        <SectionHeader size='sm' title={tAuth('title')} />
                        <AuthPanel notice={noticeOf(login)} />
                    </div>

${uiMarker}`
        )
    } else if (!ui && page.includes(plainMarker)) {
        page = page.replace(
            plainMarker,
            `                <div className='mt-8'>
                    <p className='text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase'>
                        {tAuth('title')}
                    </p>
                    <AuthPanel notice={noticeOf(login)} />
                </div>

${plainMarker}`
        )
    } else {
        throw new Error('Aanmelden: de startpagina heeft een onverwachte vorm.')
    }
    fs.writeFileSync(file, page, 'utf8')
}

/**
 * Stap na de databaselaag: de SSO-bestanden in de backend zetten, de tabel
 * sessions migreren en alles formatteren.
 */
export async function setupSso(
    projectDir: string,
    backendDir: string,
    pm: PackageManager,
    options: SsoBackendOptions
): Promise<void> {
    const target = path.join(projectDir, backendDir)
    await withProgress('Inloggen via de SSO-hub', async update => {
        update('Bestanden (auth, hub-events, tenant bij eerste login)')
        applySsoBackend(target, options)

        update('Tabel sessions migreren')
        await runQuiet(pm, ['run', 'db:migrate'], target)

        update('Formatteren')
        await formatAll(pm, target)
    })
    p.log.success(
        `Aangesloten op de hub ${pc.dim(`(${options.issuer} · client_id ${options.app.clientId} · uitleg in backend/docs/sso.md)`)}`
    )
}
