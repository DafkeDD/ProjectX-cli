import { getTranslations } from 'next-intl/server'
import {
    Badge,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui'
import HubShell from '@/components/hub/HubShell'
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

            <Card>
                <CardHeader className='flex flex-col items-start gap-1'>
                    <CardTitle>{t('home.organizations')}</CardTitle>
                    <CardDescription>{t('home.organizationsDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('common.name')}</TableHead>
                                <TableHead>{t('home.kind')}</TableHead>
                                <TableHead>{t('home.role')}</TableHead>
                                <TableHead>{t('home.tenantKey')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {me.organizations.map(org => (
                                <TableRow key={org.id}>
                                    <TableCell strong>{org.name}</TableCell>
                                    <TableCell>
                                        {org.kind === 'person' ? t('common.personal') : t('common.company')}
                                    </TableCell>
                                    <TableCell>
                                        <Badge size='sm' tone={org.role === 'owner' ? 'accent' : 'neutral'}>
                                            {t(`roles.${org.role}`)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge size='sm'>{org.tenant_key}</Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </HubShell>
    )
}
