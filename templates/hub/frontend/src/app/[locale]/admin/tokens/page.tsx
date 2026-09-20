import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import HubShell from '@/components/hub/HubShell'
import TokensAdmin, { type RegistrationToken } from '@/components/hub/TokensAdmin'
import { redirect } from '@/i18n/navigation'
import { serverApi } from '@/lib/api.server'
import { requireMe } from '@/lib/session'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Hub.admin')
    return { title: t('title') }
}

/** Beheerpaneel: registratietokens (enkel voor beheerders). */
export default async function TokensPage() {
    const me = await requireMe()
    if (!me.account.is_admin) redirect({ href: '/', locale: await getLocale() })
    const tokens = await serverApi.get<RegistrationToken[]>('/api/admin/registration-tokens', { cache: 'no-store' })
    return (
        <HubShell me={me}>
            <TokensAdmin initial={tokens} />
        </HubShell>
    )
}
