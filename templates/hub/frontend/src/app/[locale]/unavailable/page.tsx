import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import AuthShell from '@/components/hub/AuthShell'
import NavButton from '@/components/hub/NavButton'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Hub')
    return { title: t('unavailable.title') }
}

/** Getoond als de backend van de hub niet antwoordt (bv. niet gestart). */
export default async function UnavailablePage() {
    const t = await getTranslations('Hub')
    return (
        <AuthShell title={t('unavailable.title')} description={t('unavailable.description')}>
            <NavButton href='/' block>
                {t('unavailable.retry')}
            </NavButton>
        </AuthShell>
    )
}
