import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import ResetForm from '@/components/hub/ResetForm'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Hub')
    return { title: t('reset.title') }
}

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
    const { token } = await searchParams
    return <ResetForm token={token ?? ''} />
}
