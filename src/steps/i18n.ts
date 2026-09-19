import fs from "node:fs";
import path from "node:path";

/**
 * VASTE REGEL: elke frontend krijgt next-intl, met exact deze 4 talen.
 * Engels is de standaardtaal, en de taal staat nooit in de URL (cookie).
 * Dit is bewust geen vraag in de CLI.
 */
export const LOCALES = ["en", "de", "nl", "fr"] as const;
export const DEFAULT_LOCALE = "en";

const LOCALE_LABELS: Record<string, { label: string; short: string }> = {
  en: { label: "English", short: "EN" },
  de: { label: "Deutsch", short: "DE" },
  nl: { label: "Nederlands", short: "NL" },
  fr: { label: "Français", short: "FR" },
};

/** Vertalingen voor de startpagina. */
const MESSAGES: Record<string, Record<string, string>> = {
  en: {
    title: "next-intl works",
    description: "This page is fully translated. Pick a language below — the text changes without a full page reload.",
    currentLanguage: "Current language",
    activeLocale: "Active locale: {locale}",
    hint: "Translations live in the messages folder: en.json, de.json, nl.json, fr.json. Never hard-code visible text.",
  },
  de: {
    title: "next-intl funktioniert",
    description: "Diese Seite ist vollständig übersetzt. Wähle unten eine Sprache — der Text ändert sich ohne kompletten Seitenneuaufbau.",
    currentLanguage: "Aktuelle Sprache",
    activeLocale: "Aktives Locale: {locale}",
    hint: "Übersetzungen liegen im messages-Ordner: en.json, de.json, nl.json, fr.json. Sichtbaren Text nie hart codieren.",
  },
  nl: {
    title: "next-intl werkt",
    description: "Deze pagina is volledig vertaald. Kies hieronder een taal — de tekst verandert zonder volledige herlaadbeurt.",
    currentLanguage: "Huidige taal",
    activeLocale: "Actieve locale: {locale}",
    hint: "Vertalingen staan in de map messages: en.json, de.json, nl.json, fr.json. Zichtbare tekst nooit hard coderen.",
  },
  fr: {
    title: "next-intl fonctionne",
    description: "Cette page est entièrement traduite. Choisissez une langue ci-dessous — le texte change sans rechargement complet.",
    currentLanguage: "Langue actuelle",
    activeLocale: "Locale active : {locale}",
    hint: "Les traductions se trouvent dans le dossier messages : en.json, de.json, nl.json, fr.json. Ne jamais coder en dur le texte visible.",
  },
};

const SWITCHER_LABEL: Record<string, string> = { en: "Language", de: "Sprache", nl: "Taal", fr: "Langue" };

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function removeIfExists(file: string): void {
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}

/**
 * Zet next-intl op in een verse create-next-app: App Router met een
 * [locale]-segment, localePrefix 'never' (taal via cookie, niet in de URL).
 * De package zelf (next-intl@latest) installeert frontend.ts.
 */
export function setupNextIntl(target: string): void {
  const src = path.join(target, "src");
  const appDir = path.join(src, "app");
  const localeDir = path.join(appDir, "[locale]");
  const localeList = LOCALES.map((l) => `'${l}'`).join(", ");

  // De startpagina van create-next-app verhuist naar [locale]. De root-layout
  // blijft bestaan (html/body), zodat er later ook routes zonder taal naast
  // [locale] kunnen leven.
  removeIfExists(path.join(appDir, "page.tsx"));
  removeIfExists(path.join(appDir, "page.module.css"));
  // Gegenereerde types in .next verwijzen nog naar app/page.tsx: weg ermee,
  // Next.js maakt ze opnieuw aan bij de eerste dev/build.
  fs.rmSync(path.join(target, ".next"), { recursive: true, force: true });

  write(
    path.join(src, "i18n", "routing.ts"),
    `import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
    locales: [${localeList}],
    defaultLocale: '${DEFAULT_LOCALE}',
    // Geen taal in de URL (/about i.p.v. /en/about); de locale gaat via cookie.
    localePrefix: 'never'
})
`,
  );

  write(
    path.join(src, "i18n", "navigation.ts"),
    `import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
`,
  );

  write(
    path.join(src, "i18n", "request.ts"),
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
`,
  );

  // Server action die de taalcookie zet. Via de server i.p.v. document.cookie:
  // dat laatste keurt de React-lintregel (react-hooks/immutability) af.
  write(
    path.join(src, "i18n", "actions.ts"),
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
`,
  );

  // Sinds Next.js 16 heet middleware.ts voortaan proxy.ts.
  removeIfExists(path.join(src, "middleware.ts"));
  removeIfExists(path.join(target, "middleware.ts"));
  write(
    path.join(src, "proxy.ts"),
    `import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
    // Alles behalve api, trpc, _next, _vercel en bestanden met een extensie.
    matcher: '/((?!api|trpc|_next|_vercel|.*\\\\..*).*)'
}
`,
  );

  for (const f of ["next.config.ts", "next.config.mjs", "next.config.js"]) {
    removeIfExists(path.join(target, f));
  }
  write(
    path.join(target, "next.config.ts"),
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
`,
  );

  // Root-layout: html + body + fonts. De taal komt van next-intl.
  write(
    path.join(appDir, "layout.tsx"),
    `import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { getLocale } from 'next-intl/server'
import { routing } from '@/i18n/routing'
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
    description: 'Next.js + Tailwind CSS + next-intl (${LOCALES.join("/")})'
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    // Routes buiten [locale] hebben geen taalcontext: dan de standaardtaal.
    let locale: string = routing.defaultLocale
    try {
        locale = await getLocale()
    } catch {
        // standaardtaal is prima
    }

    return (
        <html lang={locale} className={\`\${geistSans.variable} \${geistMono.variable} h-full antialiased\`}>
            <body className='flex min-h-full flex-col'>{children}</body>
        </html>
    )
}
`,
  );

  write(
    path.join(localeDir, "layout.tsx"),
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
`,
  );

  write(
    path.join(localeDir, "page.tsx"),
    `import { getLocale, getTranslations } from 'next-intl/server'
import LocaleSwitcher from '@/components/LocaleSwitcher'

export default async function Home() {
    const t = await getTranslations('HomePage')
    const locale = await getLocale()

    return (
        <main className='flex flex-1 flex-col items-center justify-center p-8'>
            <div className='w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950'>
                <h1 className='text-3xl font-semibold tracking-tight'>{t('title')}</h1>
                <p className='mt-3 text-sm leading-relaxed text-zinc-500'>{t('description')}</p>

                <div className='mt-8'>
                    <p className='mb-3 text-xs font-medium tracking-wide text-zinc-500 uppercase'>
                        {t('currentLanguage')}
                    </p>
                    <LocaleSwitcher />
                </div>

                <p className='mt-8 font-mono text-xs text-zinc-500'>{t('activeLocale', { locale })}</p>
                <p className='mt-2 text-xs text-zinc-500'>{t('hint')}</p>
            </div>
        </main>
    )
}
`,
  );

  const localeButtons = LOCALES.map((l) => {
    const meta = LOCALE_LABELS[l];
    return `    { code: '${l}', label: '${meta.label}', short: '${meta.short}' }`;
  }).join(",\n");

  write(
    path.join(src, "components", "LocaleSwitcher.tsx"),
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
                            ? 'border-zinc-900 bg-zinc-900 font-medium text-white dark:border-white dark:bg-white dark:text-zinc-900'
                            : 'border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900')
                    }
                >
                    <span className='mr-1.5 text-xs opacity-70'>{l.short}</span>
                    {l.label}
                </button>
            ))}
        </div>
    )
}
`,
  );

  for (const locale of LOCALES) {
    write(
      path.join(target, "messages", `${locale}.json`),
      JSON.stringify({ HomePage: MESSAGES[locale], LocaleSwitcher: { label: SWITCHER_LABEL[locale] } }, null, 4) + "\n",
    );
  }
}
