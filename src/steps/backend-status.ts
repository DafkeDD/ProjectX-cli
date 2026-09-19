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

/**
 * src/lib/api.ts — één plek om de backend aan te roepen: adres ervoor, cookies
 * mee, JSON in/uit, en een fout van de backend wordt een ApiError met de
 * (al vertaalde) melding.
 */
export const API_TS = `import { env } from './env'

/**
 * Fout van de backend. De backend stuurt { statusCode, error, message } en
 * \`message\` is al vertaald in de taal van de gebruiker.
 *
 *   status  HTTP-status (0 = backend niet bereikbaar)
 *   code    sleutel, bv. 'notFound', 'conflict' — of 'unreachable'
 */
export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string
    ) {
        super(message)
        this.name = 'ApiError'
    }
}

type Query = Record<string, string | number | boolean | null | undefined>

export interface ApiOptions extends Omit<RequestInit, 'method' | 'body'> {
    /** Querystring: { page: 2 } -> ?page=2 (lege waarden worden overgeslagen). */
    query?: Query
    /** Maximale wachttijd in ms (standaard 10 s). */
    timeoutMs?: number
}

/** Extra headers per verzoek — de server-variant stuurt zo de cookies mee. */
type HeaderSource = () => HeadersInit | Promise<HeadersInit>

function buildUrl(path: string, query?: Query): string {
    const base = env.apiUrl.replace(/\\/+$/, '')
    const url = \`\${base}\${path.startsWith('/') ? path : \`/\${path}\`}\`
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined && value !== null) params.set(key, String(value))
    }
    const qs = params.toString()
    return qs ? \`\${url}?\${qs}\` : url
}

export function createApi(extraHeaders?: HeaderSource) {
    async function request<T>(method: string, path: string, body?: unknown, options: ApiOptions = {}): Promise<T> {
        const { query, timeoutMs = 10_000, headers, signal, ...init } = options

        const allHeaders = new Headers(extraHeaders ? await extraHeaders() : undefined)
        new Headers(headers).forEach((value, key) => allHeaders.set(key, value))
        allHeaders.set('Accept', 'application/json')

        const isForm = typeof FormData !== 'undefined' && body instanceof FormData
        if (body !== undefined && !isForm) allHeaders.set('Content-Type', 'application/json')

        let response: Response
        try {
            response = await fetch(buildUrl(path, query), {
                ...init,
                method,
                headers: allHeaders,
                // Cookies mee (taal, later de login).
                credentials: 'include',
                body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
                signal: signal ?? AbortSignal.timeout(timeoutMs)
            })
        } catch (error) {
            throw new ApiError(0, 'unreachable', error instanceof Error ? error.message : String(error))
        }

        if (response.status === 204) return undefined as T

        const data: unknown = response.headers.get('content-type')?.includes('application/json')
            ? await response.json()
            : await response.text()

        if (!response.ok) {
            const problem = (typeof data === 'object' && data !== null ? data : {}) as {
                error?: string
                message?: string
            }
            throw new ApiError(response.status, problem.error ?? 'internal', problem.message ?? response.statusText)
        }
        return data as T
    }

    return {
        get: <T>(path: string, options?: ApiOptions) => request<T>('GET', path, undefined, options),
        post: <T>(path: string, body?: unknown, options?: ApiOptions) => request<T>('POST', path, body, options),
        put: <T>(path: string, body?: unknown, options?: ApiOptions) => request<T>('PUT', path, body, options),
        patch: <T>(path: string, body?: unknown, options?: ApiOptions) => request<T>('PATCH', path, body, options),
        delete: <T>(path: string, options?: ApiOptions) => request<T>('DELETE', path, undefined, options)
    }
}

/**
 * Voor client components ('use client'): de browser stuurt de cookies zelf mee.
 *
 *   const users = await api.get<User[]>('/users')
 *   await api.post('/users', { name })
 */
export const api = createApi()
`

/**
 * src/lib/api.server.ts — voor server components en server actions: daar zijn
 * er geen browser-cookies, dus sturen we ze zelf door (taal, later login).
 */
export const API_SERVER_TS = `import { cookies } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { createApi } from './api'

export { ApiError, type ApiOptions } from './api'

/**
 * Voor server components en server actions (NIET in 'use client'-bestanden):
 * stuurt de cookies van de bezoeker en diens taal mee naar de backend.
 *
 *   const health = await serverApi.get<Health>('/health')
 */
export const serverApi = createApi(async () => {
    const cookieStore = await cookies()
    let locale: string | undefined
    try {
        locale = await getLocale()
    } catch {
        // geen taalcontext: de backend kiest zelf
    }
    return {
        ...(cookieStore.size > 0 ? { cookie: cookieStore.toString() } : {}),
        ...(locale ? { 'accept-language': locale } : {})
    }
})
`

const CHECK = `interface Health {
    status: string
    version: string
}

/** Vraagt GET /health op bij de backend (server-side, max. 1,5 s). */
async function check(): Promise<{ ok: boolean; version?: string }> {
    try {
        const health = await serverApi.get<Health>('/health', { cache: 'no-store', timeoutMs: 1500 })
        return { ok: true, version: health.version }
    } catch {
        return { ok: false }
    }
}`

function component(ui: boolean): string {
    if (ui) {
        return `import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui'
import { serverApi } from '@/lib/api.server'

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
import { serverApi } from '@/lib/api.server'

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
    fs.mkdirSync(path.join(target, 'src', 'lib'), { recursive: true })
    fs.writeFileSync(path.join(target, 'src', 'lib', 'api.ts'), API_TS, 'utf8')
    fs.writeFileSync(path.join(target, 'src', 'lib', 'api.server.ts'), API_SERVER_TS, 'utf8')
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

- **Altijd via de API-helper**, nooit losse \`fetch\` naar de backend:
  - client components: \`import { api, ApiError } from '@/lib/api'\`
  - server components / server actions: \`import { serverApi, ApiError } from '@/lib/api.server'\` (stuurt de cookies en
    de taal van de bezoeker door)
  - \`await api.get<User[]>('/users', { query: { page: 2 } })\`, \`api.post('/users', body)\`, \`put\`, \`patch\`, \`delete\`
- Het adres komt uit \`env.apiUrl\` (\`NEXT_PUBLIC_API_URL\`). Nooit \`http://localhost:4000\` hard coderen.
- Een fout is een \`ApiError\` met \`status\`, \`code\` (bv. \`notFound\`) en een **al vertaalde** \`message\` — toon die.
  \`code === 'unreachable'\` (status 0) = backend niet bereikbaar: toon dan een eigen vertaalde tekst.
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
