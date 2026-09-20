import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import AuthPanel from '@/components/auth/AuthPanel'
import { requireMe } from '@/lib/session'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Auth')
    return { title: t('dashboard.title') }
}

/**
 * Voorbeeld van een pagina waar je ingelogd voor moet zijn: is er geen sessie,
 * dan gaat de bezoeker meteen naar de SSO-hub en komt hij hier terug.
 */
export default async function Dashboard() {
    const me = await requireMe('/dashboard')
    const t = await getTranslations('Auth')

    return (
        <main className='mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8'>
            <div className='flex flex-col gap-1'>
                <h1 className='text-2xl font-semibold'>{t('dashboard.title')}</h1>
                <p className='text-muted-foreground text-sm'>
                    {t('dashboard.description', { organization: me.organization.name })}
                </p>
            </div>
            <AuthPanel returnTo='/dashboard' />
            <p className='text-muted-foreground text-sm'>
                {t('dashboard.tenant', { key: me.organization.tenant_key })}
            </p>
        </main>
    )
}
