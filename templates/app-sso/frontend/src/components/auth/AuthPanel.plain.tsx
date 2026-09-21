import { getTranslations } from 'next-intl/server'
import { getMe, loginUrl, switchUrl, type Notice } from '@/lib/session'
import LinkButton from './LinkButton'
import LogoutForm from './LogoutForm'

/**
 * Wie is er ingelogd? Zo niet: een knop naar de SSO-hub. Zo wel: naam,
 * organisatie en rol, met "andere organisatie" en "afmelden".
 */
export default async function AuthPanel({ returnTo = '/', notice }: { returnTo?: string; notice?: Notice }) {
    const t = await getTranslations('Auth')
    const me = await getMe()

    return (
        <div className='flex flex-col items-start gap-3'>
            {notice && (
                <p className='rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm'>
                    {t(`notice.${notice}`)}
                </p>
            )}
            {me ? (
                <>
                    <p className='text-sm font-medium'>{me.account.name}</p>
                    <p className='text-muted-foreground text-sm'>{me.account.email}</p>
                    <p className='text-sm'>
                        {me.organization.name} · {t(`roles.${me.organization.role}`)} · {me.organization.tenant_key}
                    </p>
                    <div className='flex flex-wrap gap-2'>
                        <LinkButton href={switchUrl(returnTo)} variant='secondary'>
                            {t('switchOrganization')}
                        </LinkButton>
                        <LogoutForm label={t('logout')} />
                    </div>
                </>
            ) : (
                <>
                    <p className='text-sm font-medium'>{t('signedOut')}</p>
                    <p className='text-muted-foreground text-sm'>{t('signedOutDescription')}</p>
                    <LinkButton href={loginUrl(returnTo)}>{t('login')}</LinkButton>
                </>
            )}
        </div>
    )
}
