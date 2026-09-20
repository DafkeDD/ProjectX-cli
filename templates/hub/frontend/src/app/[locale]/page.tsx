import { getTranslations } from 'next-intl/server'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import HubShell from '@/components/hub/HubShell'
import OrganizationsCard from '@/components/hub/OrganizationsCard'
import { requireMe } from '@/lib/session'

/** Startpagina van de hub: je account en je organisaties. */
export default async function Home() {
    const me = await requireMe()
    const t = await getTranslations('Hub')

    return (
        <HubShell me={me}>
            <Card>
                <CardHeader className='flex flex-col items-start gap-1'>
                    <CardTitle>{t('home.welcome', { name: me.account.name })}</CardTitle>
                    <CardDescription>{t('home.description')}</CardDescription>
                </CardHeader>
            </Card>

            <OrganizationsCard organizations={me.organizations} />
        </HubShell>
    )
}
