import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Alert } from '@/components/ui'
import AuthShell from '@/components/hub/AuthShell'
import NavButton from '@/components/hub/NavButton'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Hub')
    return { title: t('error.title') }
}

/** Foutpagina van de OIDC-server (bv. een app met een verkeerde redirect-URL). */
export default async function ErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
    const t = await getTranslations('Hub')
    const { error } = await searchParams
    return (
        <AuthShell title={t('error.title')} description={t('error.description')}>
            {error && <Alert tone='red'>{error.slice(0, 80)}</Alert>}
            <NavButton href='/' block variant='secondary'>
                {t('error.home')}
            </NavButton>
        </AuthShell>
    )
}
