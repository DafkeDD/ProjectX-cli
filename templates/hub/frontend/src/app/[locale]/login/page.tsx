import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import LoginForm from '@/components/hub/LoginForm'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Hub')
    return { title: t('login.title') }
}

export default function LoginPage() {
    return <LoginForm />
}
