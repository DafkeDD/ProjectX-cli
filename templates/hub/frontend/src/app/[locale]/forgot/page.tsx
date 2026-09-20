import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import ForgotForm from '@/components/hub/ForgotForm'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Hub')
    return { title: t('forgot.title') }
}

export default function ForgotPage() {
    return <ForgotForm />
}
