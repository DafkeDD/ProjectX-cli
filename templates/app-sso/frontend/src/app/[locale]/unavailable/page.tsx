import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import LinkButton from '@/components/auth/LinkButton'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Auth')
    return { title: t('unavailable.title'), robots: { index: false } }
}

/** Getoond als de backend van deze app niet antwoordt. */
export default async function Unavailable() {
    const t = await getTranslations('Auth')
    return (
        <main className='mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-4 p-8'>
            <h1 className='text-2xl font-semibold'>{t('unavailable.title')}</h1>
            <p className='text-muted-foreground text-sm'>{t('unavailable.description')}</p>
            <LinkButton href='/'>{t('unavailable.retry')}</LinkButton>
        </main>
    )
}
