import { getTranslations } from 'next-intl/server'
import { Alert, Badge, SectionHeader } from '@/components/ui'
import { getMe, loginUrl, logoutUrl, switchUrl, type Notice } from '@/lib/session'
import LinkButton from './LinkButton'

/**
 * Wie is er ingelogd? Zo niet: een knop naar de SSO-hub. Zo wel: naam,
 * organisatie en rol, met "andere organisatie" en "afmelden".
 */
export default async function AuthPanel({ returnTo = '/', notice }: { returnTo?: string; notice?: Notice }) {
    const t = await getTranslations('Auth')
    const me = await getMe()

    return (
        <div className='flex flex-col items-start gap-3'>
            {notice && <Alert tone='amber'>{t(`notice.${notice}`)}</Alert>}
            {me ? (
                <>
                    <SectionHeader size='sm' title={me.account.name} description={me.account.email} />
                    <div className='flex flex-wrap items-center gap-2'>
                        <Badge tone='accent'>{me.organization.name}</Badge>
                        <Badge size='sm'>{t(`roles.${me.organization.role}`)}</Badge>
                        <Badge size='sm' tone='neutral'>
                            {me.organization.tenant_key}
                        </Badge>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                        <LinkButton href={switchUrl(returnTo)} variant='secondary' size='sm'>
                            {t('switchOrganization')}
                        </LinkButton>
                        <LinkButton href={logoutUrl} variant='ghost' size='sm'>
                            {t('logout')}
                        </LinkButton>
                    </div>
                </>
            ) : (
                <>
                    <SectionHeader size='sm' title={t('signedOut')} description={t('signedOutDescription')} />
                    <LinkButton href={loginUrl(returnTo)} size='sm'>
                        {t('login')}
                    </LinkButton>
                </>
            )}
        </div>
    )
}
