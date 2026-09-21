import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import VerifyEmail from '@/components/hub/VerifyEmail'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Hub')
    return { title: t('verify.title'), robots: { index: false } }
}

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
    const { token } = await searchParams
    return <VerifyEmail token={token ?? ''} />
}
