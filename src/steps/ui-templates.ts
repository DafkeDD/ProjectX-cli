import fs from 'node:fs'
import path from 'node:path'

/**
 * Startpagina, taalkiezer en themaknop opgebouwd met ENKEL ProjectX-UI-
 * componenten (Card, Badge, Segmented, SectionHeader, Separator, Icon).
 * Tailwind wordt alleen voor layout gebruikt (flex, gap, padding).
 * Overschrijft de varianten die i18n.ts en theme.ts zonder UI schrijven.
 */

const PAGE = `import { getLocale, getTranslations } from 'next-intl/server'
import {
    Badge,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    SectionHeader,
    Separator
} from '@/components/ui'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import ThemeToggle from '@/components/theme/ThemeToggle'
import { routing } from '@/i18n/routing'
import { env } from '@/lib/env'

export default async function Home() {
    const t = await getTranslations('HomePage')
    const tTheme = await getTranslations('Theme')
    const locale = await getLocale()

    return (
        <main className='flex flex-1 flex-col items-center justify-center p-8'>
            <Card className='w-full max-w-xl'>
                <CardHeader className='flex flex-col items-start gap-3'>
                    <Badge tone='accent' dot>
                        {env.appName}
                    </Badge>
                    <CardTitle>{t('title')}</CardTitle>
                    <CardDescription>{t('description')}</CardDescription>
                </CardHeader>

                <CardContent className='flex flex-col gap-6'>
                    {/* Taalkiezer enkel als er iets te kiezen valt. */}
                    {routing.locales.length > 1 && (
                        <div className='flex flex-col items-start gap-3'>
                            <SectionHeader size='sm' title={t('currentLanguage')} />
                            <LocaleSwitcher />
                        </div>
                    )}

                    <div className='flex flex-col items-start gap-3'>
                        <SectionHeader size='sm' title={tTheme('appearance')} />
                        <ThemeToggle />
                    </div>

                    <Separator />
                </CardContent>

                <CardFooter className='flex flex-col items-start gap-2'>
                    <Badge tone='neutral' size='sm'>
                        {t('activeLocale', { locale })}
                    </Badge>
                    <CardDescription>{t('hint')}</CardDescription>
                </CardFooter>
            </Card>
        </main>
    )
}
`

const LOCALE_SWITCHER = `'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Segmented } from '@/components/ui'
import { useRouter } from '@/i18n/navigation'
import { setLocale } from '@/i18n/actions'
import { localeLabels, locales } from '@/i18n/locales'

/** Taalkiezer met Segmented uit ProjectX-UI. */
export default function LocaleSwitcher() {
    const t = useTranslations('LocaleSwitcher')
    const locale = useLocale()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    // Eén taal = niets te kiezen.
    if (locales.length < 2) return null

    /**
     * De taal staat nooit in de URL (localePrefix: 'never'). We zetten dus de
     * locale-cookie (server action) en laten de server opnieuw renderen.
     */
    function switchLocale(next: string) {
        if (next === locale) return
        startTransition(async () => {
            await setLocale(next)
            router.refresh()
        })
    }

    return (
        <Segmented
            aria-label={t('label')}
            value={locale}
            onValueChange={switchLocale}
            options={locales.map(code => ({
                value: code,
                label: localeLabels[code].label,
                disabled: isPending
            }))}
        />
    )
}
`

const THEME_TOGGLE = `'use client'

import { useTranslations } from 'next-intl'
import { Icon, Segmented } from '@/components/ui'
import { useTheme } from './ThemeProvider'
import { isTheme, THEMES, type Theme } from './theme'

const ICONS = { light: 'sun', dark: 'moon', system: 'monitor' } as const satisfies Record<Theme, string>

/** Licht / donker / systeem met Segmented + Icon uit ProjectX-UI. */
export default function ThemeToggle() {
    const t = useTranslations('Theme')
    const { theme, setTheme } = useTheme()

    return (
        <Segmented
            aria-label={t('toggle')}
            value={theme}
            onValueChange={next => isTheme(next) && setTheme(next)}
            options={THEMES.map(value => ({
                value,
                label: t(value),
                icon: <Icon name={ICONS[value]} />
            }))}
        />
    )
}
`

export function writeUiTemplates(target: string): void {
    const src = path.join(target, 'src')
    fs.writeFileSync(path.join(src, 'app', '[locale]', 'page.tsx'), PAGE, 'utf8')
    fs.writeFileSync(path.join(src, 'components', 'LocaleSwitcher.tsx'), LOCALE_SWITCHER, 'utf8')
    fs.writeFileSync(path.join(src, 'components', 'theme', 'ThemeToggle.tsx'), THEME_TOGGLE, 'utf8')
}
