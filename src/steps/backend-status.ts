import fs from 'node:fs'
import path from 'node:path'
import type { Locale } from './i18n.js'

/** Teksten voor de backend-status op de startpagina ("Backend" in messages). */
const BACKEND: Record<Locale, { title: string; online: string; offline: string }> = {
    en: { title: 'Backend', online: 'Online', offline: 'Not reachable' },
    nl: { title: 'Backend', online: 'Online', offline: 'Niet bereikbaar' },
    fr: { title: 'Backend', online: 'En ligne', offline: 'Injoignable' },
    de: { title: 'Backend', online: 'Online', offline: 'Nicht erreichbar' },
    es: { title: 'Backend', online: 'En línea', offline: 'No disponible' },
    it: { title: 'Backend', online: 'Online', offline: 'Non raggiungibile' },
    pt: { title: 'Backend', online: 'Online', offline: 'Indisponível' },
    pl: { title: 'Backend', online: 'Online', offline: 'Niedostępny' }
}

const CHECK = `/** Vraagt GET /health op bij de backend (server-side, max. 1,5 s). */
async function check(): Promise<{ ok: boolean; version?: string }> {
    try {
        const response = await fetch(\`\${env.apiUrl}/health\`, { cache: 'no-store', signal: AbortSignal.timeout(1500) })
        if (!response.ok) return { ok: false }
        const data = (await response.json()) as { version?: string }
        return { ok: true, version: data.version }
    } catch {
        return { ok: false }
    }
}`

function component(ui: boolean): string {
    if (ui) {
        return `import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui'
import { env } from '@/lib/env'

${CHECK}

/** Toont of de backend bereikbaar is (ProjectX-UI Badge). */
export default async function BackendStatus() {
    const t = await getTranslations('Backend')
    const status = await check()

    return (
        <Badge tone={status.ok ? 'green' : 'red'} dot>
            {status.ok ? t('online') : t('offline')}
            {status.version ? \` · v\${status.version}\` : ''}
        </Badge>
    )
}
`
    }
    return `import { getTranslations } from 'next-intl/server'
import { env } from '@/lib/env'

${CHECK}

/** Toont of de backend bereikbaar is. */
export default async function BackendStatus() {
    const t = await getTranslations('Backend')
    const status = await check()

    return (
        <span className='border-border inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium'>
            <span className={\`h-2 w-2 rounded-full \${status.ok ? 'bg-primary' : 'bg-destructive'}\`} />
            {status.ok ? t('online') : t('offline')}
            {status.version ? \` · v\${status.version}\` : ''}
        </span>
    )
}
`
}

/**
 * Demo op de startpagina: een blok "Backend" met online/niet bereikbaar.
 * Past de (nog niet geformatteerde) page.tsx aan en vult messages aan.
 */
export function setupBackendStatus(target: string, locales: Locale[], ui: boolean): void {
    fs.writeFileSync(path.join(target, 'src', 'components', 'BackendStatus.tsx'), component(ui), 'utf8')

    const pageFile = path.join(target, 'src', 'app', '[locale]', 'page.tsx')
    let page = fs.readFileSync(pageFile, 'utf8')
    page = page.replace(
        "import { env } from '@/lib/env'\n",
        "import { env } from '@/lib/env'\nimport BackendStatus from '@/components/BackendStatus'\n"
    )
    page = page.replace(
        "    const tTheme = await getTranslations('Theme')\n",
        "    const tTheme = await getTranslations('Theme')\n    const tBackend = await getTranslations('Backend')\n"
    )

    const uiMarker =
        "                    <div className='flex flex-col items-start gap-3'>\n                        <SectionHeader size='sm' title={tTheme('appearance')} />"
    const plainMarker =
        "                <div className='mt-8'>\n                    <p className='text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase'>\n                        {tTheme('appearance')}"

    if (ui && page.includes(uiMarker)) {
        page = page.replace(
            uiMarker,
            `                    <div className='flex flex-col items-start gap-3'>
                        <SectionHeader size='sm' title={tBackend('title')} />
                        <BackendStatus />
                    </div>

${uiMarker}`
        )
    } else if (!ui && page.includes(plainMarker)) {
        page = page.replace(
            plainMarker,
            `                <div className='mt-8'>
                    <p className='text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase'>
                        {tBackend('title')}
                    </p>
                    <BackendStatus />
                </div>

${plainMarker}`
        )
    } else {
        throw new Error('Backend-status: startpagina heeft een onverwachte vorm.')
    }
    fs.writeFileSync(pageFile, page, 'utf8')

    for (const locale of locales) {
        const file = path.join(target, 'messages', `${locale}.json`)
        const messages = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
        messages.Backend = BACKEND[locale]
        fs.writeFileSync(file, JSON.stringify(messages, null, 4) + '\n', 'utf8')
    }
}

const API_RULES = `## Backend (API)

- Adres: \`env.apiUrl\` (\`NEXT_PUBLIC_API_URL\` in \`.env\`). Nooit een URL als \`http://localhost:4000\` hard coderen.
- Vanuit de browser altijd met \`credentials: 'include'\`, zodat de taalcookie (en later de login) meegaat.
- Een fout van de API is al vertaald: \`{ statusCode, error, message }\` — toon \`message\`, of vertaal zelf op \`error\`.
- \`GET /health\` gebruikt de startpagina (\`src/components/BackendStatus.tsx\`).
`

/** Voegt de API-afspraken toe aan AGENTS.md (binnen het regelblok) en PROJECT-RULES.md. */
export function appendApiRules(target: string): void {
    const agents = path.join(target, 'AGENTS.md')
    if (fs.existsSync(agents)) {
        const content = fs.readFileSync(agents, 'utf8')
        if (!content.includes('## Backend (API)')) {
            fs.writeFileSync(
                agents,
                content.replace('<!-- END:projectx-rules -->', API_RULES + '\n<!-- END:projectx-rules -->'),
                'utf8'
            )
        }
    }
    const rules = path.join(target, 'PROJECT-RULES.md')
    if (fs.existsSync(rules)) {
        const content = fs.readFileSync(rules, 'utf8')
        if (!content.includes('## Backend (API)'))
            fs.writeFileSync(rules, content.trimEnd() + '\n\n---\n\n' + API_RULES, 'utf8')
    }
}
