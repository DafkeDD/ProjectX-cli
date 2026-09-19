import fs from 'node:fs'
import path from 'node:path'
import type { Locale } from './i18n.js'

/** Teksten voor de 404-pagina, per taal (komen in messages/<taal>.json onder "NotFound"). */
const NOT_FOUND: Record<Locale, { title: string; description: string; back: string }> = {
    en: {
        title: 'Page not found',
        description: 'The page you are looking for does not exist or has been moved.',
        back: 'Back to home'
    },
    nl: {
        title: 'Pagina niet gevonden',
        description: 'De pagina die je zoekt bestaat niet of is verplaatst.',
        back: 'Terug naar de startpagina'
    },
    fr: {
        title: 'Page introuvable',
        description: 'La page que vous cherchez n’existe pas ou a été déplacée.',
        back: 'Retour à l’accueil'
    },
    de: {
        title: 'Seite nicht gefunden',
        description: 'Die gesuchte Seite existiert nicht oder wurde verschoben.',
        back: 'Zurück zur Startseite'
    },
    es: {
        title: 'Página no encontrada',
        description: 'La página que buscas no existe o se ha movido.',
        back: 'Volver al inicio'
    },
    it: {
        title: 'Pagina non trovata',
        description: 'La pagina che cerchi non esiste o è stata spostata.',
        back: 'Torna alla home'
    },
    pt: {
        title: 'Página não encontrada',
        description: 'A página que procura não existe ou foi movida.',
        back: 'Voltar ao início'
    },
    pl: {
        title: 'Nie znaleziono strony',
        description: 'Strona, której szukasz, nie istnieje lub została przeniesiona.',
        back: 'Wróć na stronę główną'
    }
}

/** De 404 zelf: met ProjectX-UI een EmptyState + Button, anders Tailwind + tokens. */
function view(ui: boolean): string {
    if (ui) {
        return `import { getTranslations } from 'next-intl/server'
import { EmptyState, Icon } from '@/components/ui'
import BackHomeButton from '@/components/BackHomeButton'

/** 404 — vertaald, met ENKEL ProjectX-UI-componenten. */
export default async function NotFoundView() {
    const t = await getTranslations('NotFound')

    return (
        <main className='flex flex-1 flex-col items-center justify-center p-8'>
            <EmptyState
                icon={<Icon name='search' size={22} />}
                title={t('title')}
                description={t('description')}
                action={<BackHomeButton label={t('back')} />}
            />
        </main>
    )
}
`
    }
    return `import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

/** 404 — vertaald, kleuren via de design tokens. */
export default async function NotFoundView() {
    const t = await getTranslations('NotFound')

    return (
        <main className='flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center'>
            <p className='text-muted-foreground font-mono text-sm'>404</p>
            <h1 className='text-2xl font-semibold tracking-tight'>{t('title')}</h1>
            <p className='text-muted-foreground max-w-md text-sm'>{t('description')}</p>
            <Link
                href='/'
                className='bg-primary text-primary-foreground mt-4 rounded-md px-4 py-2 text-sm font-medium hover:opacity-90'
            >
                {t('back')}
            </Link>
        </main>
    )
}
`
}

/**
 * Knop terug naar de startpagina (ProjectX-UI Button).
 * Bewust geen <Button asChild><Link/></Button>: de Button van ProjectX-UI geeft
 * bij asChild meerdere children door aan Slot, en dan rendert er niets.
 */
const BACK_HOME_BUTTON = `'use client'

import { Button, Icon } from '@/components/ui'
import { useRouter } from '@/i18n/navigation'

export default function BackHomeButton({ label }: { label: string }) {
    const router = useRouter()

    return (
        <Button icon={<Icon name='arrowLeft' />} onClick={() => router.push('/')}>
            {label}
        </Button>
    )
}
`

/** Vangt elke onbekende URL binnen [locale] op, zodat de vertaalde not-found toont. */
const CATCH_ALL = `import { notFound } from 'next/navigation'

// Elke URL die niet bestaat komt hier terecht (de taal zit er via de proxy al
// voor), en toont dan src/app/[locale]/not-found.tsx — vertaald.
export default function CatchAll() {
    notFound()
}
`

const LOCALE_NOT_FOUND = `import NotFoundView from '@/components/NotFoundView'

export default NotFoundView
`

/**
 * Fallback voor wat de proxy niet ziet (bv. een ontbrekend bestand met een
 * extensie). Zonder taal uit de URL valt next-intl terug op de standaardtaal;
 * de provider is nodig voor de (client-side) Link.
 */
const ROOT_NOT_FOUND = `import { NextIntlClientProvider } from 'next-intl'
import NotFoundView from '@/components/NotFoundView'

export default function RootNotFound() {
    return (
        <NextIntlClientProvider>
            <NotFoundView />
        </NextIntlClientProvider>
    )
}
`

/** Schrijft de vertaalde 404 en vult messages/<taal>.json aan met "NotFound". */
export function setupNotFound(target: string, locales: Locale[], ui: boolean): void {
    const app = path.join(target, 'src', 'app')
    const write = (file: string, content: string) => {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, content, 'utf8')
    }

    write(path.join(target, 'src', 'components', 'NotFoundView.tsx'), view(ui))
    if (ui) write(path.join(target, 'src', 'components', 'BackHomeButton.tsx'), BACK_HOME_BUTTON)
    write(path.join(app, '[locale]', '[...rest]', 'page.tsx'), CATCH_ALL)
    write(path.join(app, '[locale]', 'not-found.tsx'), LOCALE_NOT_FOUND)
    write(path.join(app, 'not-found.tsx'), ROOT_NOT_FOUND)

    for (const locale of locales) {
        const file = path.join(target, 'messages', `${locale}.json`)
        const messages = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
        messages.NotFound = NOT_FOUND[locale]
        fs.writeFileSync(file, JSON.stringify(messages, null, 4) + '\n', 'utf8')
    }
}
