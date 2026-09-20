import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import InteractionView from '@/components/hub/InteractionView'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Hub')
    return { title: t('login.title'), robots: { index: false } }
}

/** oidc-provider stuurt de browser naar /interaction/<uid> (aanmelden bij een app). */
export default async function InteractionPage({ params }: { params: Promise<{ uid: string }> }) {
    const { uid } = await params
    return <InteractionView uid={uid} />
}
