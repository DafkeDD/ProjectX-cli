import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { orCancel } from '../utils/prompt.js'
import { THEME_MESSAGES } from './theme.js'

/** Alle talen waaruit je kan kiezen in de CLI. */
export const AVAILABLE_LOCALES = ['en', 'nl', 'fr', 'de', 'es', 'it', 'pt', 'pl'] as const
export type Locale = (typeof AVAILABLE_LOCALES)[number]

/** Voorgeselecteerd in de vraag; Engels is de voorgestelde standaardtaal. */
export const SUGGESTED_LOCALES: Locale[] = ['en', 'nl', 'fr', 'de']
export const SUGGESTED_DEFAULT: Locale = 'en'

export interface I18nConfig {
    locales: Locale[]
    defaultLocale: Locale
}

export const LOCALE_LABELS: Record<Locale, { label: string; short: string }> = {
    en: { label: 'English', short: 'EN' },
    nl: { label: 'Nederlands', short: 'NL' },
    fr: { label: 'Français', short: 'FR' },
    de: { label: 'Deutsch', short: 'DE' },
    es: { label: 'Español', short: 'ES' },
    it: { label: 'Italiano', short: 'IT' },
    pt: { label: 'Português', short: 'PT' },
    pl: { label: 'Polski', short: 'PL' }
}

/** Vertalingen voor de startpagina. {files} wordt ingevuld met de gekozen talen. */
const MESSAGES: Record<Locale, Record<string, string>> = {
    en: {
        title: 'next-intl works',
        description:
            'This page is fully translated. Pick a language below — the text changes without a full page reload.',
        currentLanguage: 'Current language',
        activeLocale: 'Active locale: {locale}',
        hint: 'Translations live in the messages folder: {files}. Never hard-code visible text.'
    },
    nl: {
        title: 'next-intl werkt',
        description:
            'Deze pagina is volledig vertaald. Kies hieronder een taal — de tekst verandert zonder volledige herlaadbeurt.',
        currentLanguage: 'Huidige taal',
        activeLocale: 'Actieve locale: {locale}',
        hint: 'Vertalingen staan in de map messages: {files}. Zichtbare tekst nooit hard coderen.'
    },
    fr: {
        title: 'next-intl fonctionne',
        description:
            'Cette page est entièrement traduite. Choisissez une langue ci-dessous — le texte change sans rechargement complet.',
        currentLanguage: 'Langue actuelle',
        activeLocale: 'Locale active : {locale}',
        hint: 'Les traductions se trouvent dans le dossier messages : {files}. Ne jamais coder en dur le texte visible.'
    },
    de: {
        title: 'next-intl funktioniert',
        description:
            'Diese Seite ist vollständig übersetzt. Wähle unten eine Sprache — der Text ändert sich ohne kompletten Seitenneuaufbau.',
        currentLanguage: 'Aktuelle Sprache',
        activeLocale: 'Aktives Locale: {locale}',
        hint: 'Übersetzungen liegen im messages-Ordner: {files}. Sichtbaren Text nie hart codieren.'
    },
    es: {
        title: 'next-intl funciona',
        description:
            'Esta página está totalmente traducida. Elige un idioma abajo: el texto cambia sin recargar la página por completo.',
        currentLanguage: 'Idioma actual',
        activeLocale: 'Idioma activo: {locale}',
        hint: 'Las traducciones están en la carpeta messages: {files}. Nunca escribas texto visible directamente en el código.'
    },
    it: {
        title: 'next-intl funziona',
        description:
            "Questa pagina è completamente tradotta. Scegli una lingua qui sotto: il testo cambia senza ricaricare l'intera pagina.",
        currentLanguage: 'Lingua attuale',
        activeLocale: 'Lingua attiva: {locale}',
        hint: 'Le traduzioni si trovano nella cartella messages: {files}. Non scrivere mai testo visibile direttamente nel codice.'
    },
    pt: {
        title: 'next-intl funciona',
        description:
            'Esta página está totalmente traduzida. Escolha um idioma abaixo — o texto muda sem recarregar a página inteira.',
        currentLanguage: 'Idioma atual',
        activeLocale: 'Idioma ativo: {locale}',
        hint: 'As traduções ficam na pasta messages: {files}. Nunca escreva texto visível diretamente no código.'
    },
    pl: {
        title: 'next-intl działa',
        description:
            'Ta strona jest w pełni przetłumaczona. Wybierz język poniżej — tekst zmienia się bez pełnego przeładowania strony.',
        currentLanguage: 'Bieżący język',
        activeLocale: 'Aktywny język: {locale}',
        hint: 'Tłumaczenia znajdują się w folderze messages: {files}. Nigdy nie wpisuj widocznego tekstu na sztywno w kodzie.'
    }
}

const SWITCHER_LABEL: Record<Locale, string> = {
    en: 'Language',
    nl: 'Taal',
    fr: 'Langue',
    de: 'Sprache',
    es: 'Idioma',
    it: 'Lingua',
    pt: 'Idioma',
    pl: 'Język'
}

/**
 * Vraag: welke talen, en welke is de standaard? next-intl zelf is geen vraag —
 * dat komt er altijd bij een Next.js-frontend.
 */
export async function askI18n(): Promise<I18nConfig> {
    const locales = orCancel(
        await p.multiselect<Locale>({
            message: `Welke talen wil je? ${pc.dim('(spatie = aan/uit, enter = bevestigen)')}`,
            initialValues: SUGGESTED_LOCALES,
            required: true,
            options: AVAILABLE_LOCALES.map(code => ({
                value: code,
                label: `${LOCALE_LABELS[code].label}`,
                hint: code
            }))
        })
    )

    // Volgorde zoals in de lijst, niet in de volgorde van aanvinken.
    const ordered = AVAILABLE_LOCALES.filter(l => locales.includes(l))

    const defaultLocale: Locale =
        ordered.length === 1
            ? ordered[0]
            : orCancel(
                  await p.select<Locale>({
                      message: 'Welke taal is de standaard?',
                      initialValue: ordered.includes(SUGGESTED_DEFAULT) ? SUGGESTED_DEFAULT : ordered[0],
                      options: ordered.map(code => ({ value: code, label: LOCALE_LABELS[code].label, hint: code }))
                  })
              )

    return { locales: ordered, defaultLocale }
}

export function i18nLabel(config: I18nConfig): string {
    return `${config.locales.join(', ')}${pc.dim(`  standaard: ${config.defaultLocale}`)}`
}

function write(file: string, content: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content, 'utf8')
}

function removeIfExists(file: string): void {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true })
}

/**
 * Zet next-intl op in een verse create-next-app: App Router met een
 * [locale]-segment, localePrefix 'never' (taal via cookie, niet in de URL).
 * Talen en standaardtaal komen uit askI18n(). De package zelf
 * (next-intl@latest) installeert frontend.ts.
 */
export function setupNextIntl(target: string, { locales, defaultLocale }: I18nConfig): void {
    const src = path.join(target, 'src')
    const appDir = path.join(src, 'app')
    const localeDir = path.join(appDir, '[locale]')
    const localeList = locales.map(l => `'${l}'`).join(', ')

    // De startpagina van create-next-app verhuist naar [locale]. De root-layout
    // blijft bestaan (html/body), zodat er later ook routes zonder taal naast
    // [locale] kunnen leven.
    removeIfExists(path.join(appDir, 'page.tsx'))
    removeIfExists(path.join(appDir, 'page.module.css'))
    // Gegenereerde types in .next verwijzen nog naar app/page.tsx: weg ermee,
    // Next.js maakt ze opnieuw aan bij de eerste dev/build.
    fs.rmSync(path.join(target, '.next'), { recursive: true, force: true })

    write(
        path.join(src, 'i18n', 'routing.ts'),
        `import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
    locales: [${localeList}],
    defaultLocale: '${defaultLocale}',
    // Geen taal in de URL (/about i.p.v. /en/about); de locale gaat via cookie.
    localePrefix: 'never'
})
`
    )

    write(
        path.join(src, 'i18n', 'navigation.ts'),
        `import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
`
    )

    write(
        path.join(src, 'i18n', 'request.ts'),
        `import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
    const requested = await requestLocale
    const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

    return {
        locale,
        messages: (await import(\`../../messages/\${locale}.json\`)).default
    }
})
`
    )

    // Server action die de taalcookie zet. Via de server i.p.v. document.cookie:
    // dat laatste keurt de React-lintregel (react-hooks/immutability) af.
    write(
        path.join(src, 'i18n', 'actions.ts'),
        `'use server'

import { cookies } from 'next/headers'
import { hasLocale } from 'next-intl'
import { routing } from './routing'

/** Zet de gekozen taal in de NEXT_LOCALE-cookie (1 jaar geldig). */
export async function setLocale(locale: string): Promise<void> {
    if (!hasLocale(routing.locales, locale)) return

    const cookieStore = await cookies()
    cookieStore.set('NEXT_LOCALE', locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
}
`
    )

    // Sinds Next.js 16 heet middleware.ts voortaan proxy.ts.
    removeIfExists(path.join(src, 'middleware.ts'))
    removeIfExists(path.join(target, 'middleware.ts'))
    write(
        path.join(src, 'proxy.ts'),
        `import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
    // Alles behalve api, trpc, _next, _vercel en bestanden met een extensie.
    matcher: '/((?!api|trpc|_next|_vercel|.*\\\\..*).*)'
}
`
    )

    for (const f of ['next.config.ts', 'next.config.mjs', 'next.config.js']) {
        removeIfExists(path.join(target, f))
    }
    write(
        path.join(target, 'next.config.ts'),
        `import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

/** Zelfde lijst als in src/i18n/routing.ts. */
const LOCALES = [${localeList}]

const nextConfig: NextConfig = {
    /**
     * Vangnet: de taal hoort NOOIT in de URL.
     *   /nl      -> /
     *   /nl/iets -> /iets
     */
    async redirects() {
        return [
            ...LOCALES.map(locale => ({ source: \`/\${locale}\`, destination: '/', permanent: false })),
            ...LOCALES.map(locale => ({ source: \`/\${locale}/:path*\`, destination: '/:path*', permanent: false }))
        ]
    }
}

const withNextIntl = createNextIntlPlugin()

export default withNextIntl(nextConfig)
`
    )

    // Root-layout: html + body + fonts + thema. De taal komt van next-intl, het
    // thema uit de cookie (server-side, dus geen flits).
    write(
        path.join(appDir, 'layout.tsx'),
        `import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { isTheme, themeClass, THEME_COOKIE, type Theme } from '@/components/theme/theme'
import './globals.css'

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin']
})

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin']
})

export const metadata: Metadata = {
    title: 'App',
    description: 'Next.js + Tailwind CSS + next-intl (${locales.join('/')}) + light/dark'
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    // Routes buiten [locale] hebben geen taalcontext: dan de standaardtaal.
    let locale: string = routing.defaultLocale
    try {
        locale = await getLocale()
    } catch {
        // standaardtaal is prima
    }

    // Themavoorkeur uit de cookie (nooit localStorage). Geen cookie = systeem.
    const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value
    const theme: Theme = isTheme(cookieTheme) ? cookieTheme : 'system'

    const className = [geistSans.variable, geistMono.variable, themeClass(theme), 'h-full antialiased']
        .filter(Boolean)
        .join(' ')

    return (
        <html lang={locale} className={className} suppressHydrationWarning>
            <body className='bg-background text-foreground flex min-h-full flex-col'>
                <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
            </body>
        </html>
    )
}
`
    )

    write(
        path.join(localeDir, 'layout.tsx'),
        `import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'

export function generateStaticParams() {
    return routing.locales.map(locale => ({ locale }))
}

export default async function LocaleLayout({
    children,
    params
}: {
    children: React.ReactNode
    params: Promise<{ locale: string }>
}) {
    const { locale } = await params

    if (!hasLocale(routing.locales, locale)) {
        notFound()
    }

    setRequestLocale(locale)

    return <NextIntlClientProvider>{children}</NextIntlClientProvider>
}
`
    )

    write(
        path.join(localeDir, 'page.tsx'),
        `import { getLocale, getTranslations } from 'next-intl/server'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import ThemeToggle from '@/components/theme/ThemeToggle'

export default async function Home() {
    const t = await getTranslations('HomePage')
    const tTheme = await getTranslations('Theme')
    const locale = await getLocale()

    return (
        <main className='flex flex-1 flex-col items-center justify-center p-8'>
            <div className='w-full max-w-xl border-border bg-card text-card-foreground rounded-xl border p-8 text-center'>
                <h1 className='text-3xl font-semibold tracking-tight'>{t('title')}</h1>
                <p className='text-muted-foreground mt-3 text-sm leading-relaxed'>{t('description')}</p>

                <div className='mt-8'>
                    <p className='text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase'>
                        {t('currentLanguage')}
                    </p>
                    <LocaleSwitcher />
                </div>

                <div className='mt-8'>
                    <p className='text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase'>
                        {tTheme('appearance')}
                    </p>
                    <div className='flex justify-center'>
                        <ThemeToggle />
                    </div>
                </div>

                <p className='text-muted-foreground mt-8 font-mono text-xs'>{t('activeLocale', { locale })}</p>
                <p className='text-muted-foreground mt-2 text-xs'>{t('hint')}</p>
            </div>
        </main>
    )
}
`
    )

    const localeButtons = locales
        .map(l => {
            const meta = LOCALE_LABELS[l]
            return `    { code: '${l}', label: '${meta.label}', short: '${meta.short}' }`
        })
        .join(',\n')

    write(
        path.join(src, 'components', 'LocaleSwitcher.tsx'),
        `'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { setLocale } from '@/i18n/actions'

const LOCALES = [
${localeButtons}
] as const

export default function LocaleSwitcher() {
    const t = useTranslations('LocaleSwitcher')
    const locale = useLocale()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    /**
     * De taal staat nooit in de URL (localePrefix: 'never'). We zetten dus de
     * locale-cookie (server action) en laten de server opnieuw renderen,
     * zonder te navigeren.
     */
    function switchLocale(next: string) {
        if (next === locale) return
        startTransition(async () => {
            await setLocale(next)
            router.refresh()
        })
    }

    return (
        <div className='flex flex-wrap items-center justify-center gap-2' aria-label={t('label')}>
            {LOCALES.map(l => (
                <button
                    key={l.code}
                    type='button'
                    disabled={isPending}
                    onClick={() => switchLocale(l.code)}
                    aria-current={l.code === locale}
                    className={
                        'rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ' +
                        (l.code === locale
                            ? 'border-primary bg-primary text-primary-foreground font-medium'
                            : 'border-border hover:bg-muted')
                    }
                >
                    <span className='mr-1.5 text-xs opacity-70'>{l.short}</span>
                    {l.label}
                </button>
            ))}
        </div>
    )
}
`
    )

    const files = locales.map(l => `${l}.json`).join(', ')
    for (const locale of locales) {
        const home = { ...MESSAGES[locale], hint: MESSAGES[locale].hint.replace('{files}', files) }
        write(
            path.join(target, 'messages', `${locale}.json`),
            JSON.stringify(
                { HomePage: home, LocaleSwitcher: { label: SWITCHER_LABEL[locale] }, Theme: THEME_MESSAGES[locale] },
                null,
                4
            ) + '\n'
        )
    }
}
