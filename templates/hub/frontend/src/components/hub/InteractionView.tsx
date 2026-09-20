'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, Badge, Button, Field, Input, ListRow, RowList, Skeleton } from '@/components/ui'
import { useRouter } from '@/i18n/navigation'
import { api, ApiError } from '@/lib/api'
import AuthShell from './AuthShell'
import { field, useSubmit } from './use-submit'

interface Organization {
    id: string
    name: string
    kind: 'person' | 'company'
    role: 'owner' | 'admin' | 'member'
}

type Details =
    | {
          prompt: 'login'
          client: { id: string; name: string }
          loginHint: string | null
          session: { name: string; email: string } | null
      }
    | {
          prompt: 'consent'
          client: { id: string; name: string }
          account: { name: string; email: string } | null
          organizations: Organization[]
      }

/**
 * Het inlogscherm voor apps. oidc-provider stuurt de browser hierheen;
 * stap "login" = wie ben je, stap "consent" = voor welke organisatie.
 * Na elke stap stuurt de backend een redirectTo terug.
 */
export default function InteractionView({ uid }: { uid: string }) {
    const t = useTranslations('Hub')
    const router = useRouter()
    const [details, setDetails] = useState<Details | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [otherAccount, setOtherAccount] = useState(false)
    const { pending, error, run } = useSubmit()
    const autoConfirmed = useRef(false)

    const base = `/interaction/${encodeURIComponent(uid)}`

    useEffect(() => {
        api.get<Details>(`${base}/details`, { cache: 'no-store' })
            .then(setDetails)
            .catch(err => setLoadError(err instanceof ApiError ? err.message : String(err)))
    }, [base])

    async function next(action: string, body: object = {}) {
        const result = await run(() => api.post<{ redirectTo: string }>(`${base}/${action}`, body))
        // Terug naar de OIDC-server, die stuurt verder naar de app.
        if (result) window.location.assign(result.redirectTo)
    }

    // Eén organisatie: niets te kiezen, meteen verder.
    useEffect(() => {
        if (details?.prompt === 'consent' && details.organizations.length === 1 && !autoConfirmed.current) {
            autoConfirmed.current = true
            void next('confirm', { orgId: details.organizations[0]!.id })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [details])

    if (loadError) {
        return (
            <AuthShell title={t('interaction.expiredTitle')}>
                <Alert tone='red'>{loadError}</Alert>
            </AuthShell>
        )
    }

    if (!details) {
        return (
            <AuthShell title={t('interaction.loading')}>
                <Skeleton className='h-10 w-full' />
                <Skeleton className='h-10 w-full' />
            </AuthShell>
        )
    }

    const cancel = (
        <Button variant='ghost' onClick={() => next('abort')} disabled={pending}>
            {t('common.cancel')}
        </Button>
    )

    if (details.prompt === 'login') {
        // Al aangemeld in de hub: met één klik verder.
        if (details.session && !otherAccount) {
            return (
                <AuthShell
                    title={t('interaction.loginTitle', { client: details.client.name })}
                    description={t('interaction.sessionDescription')}
                    footer={cancel}
                >
                    {error && <Alert tone='red'>{error.message}</Alert>}
                    <Button block loading={pending} onClick={() => next('login', { useSession: true })}>
                        {t('interaction.continueAs', { name: details.session.name })}
                    </Button>
                    <Button variant='secondary' block onClick={() => setOtherAccount(true)}>
                        {t('interaction.otherAccount')}
                    </Button>
                </AuthShell>
            )
        }

        return (
            <AuthShell
                title={t('interaction.loginTitle', { client: details.client.name })}
                description={t('interaction.loginDescription')}
                onSubmit={event => {
                    event.preventDefault()
                    const form = event.currentTarget as HTMLFormElement
                    void next('login', { email: field(form, 'email'), password: field(form, 'password') })
                }}
                footer={
                    <div className='flex w-full flex-wrap items-center justify-between gap-2'>
                        <Button variant='link' onClick={() => router.push('/register')}>
                            {t('login.noAccount')}
                        </Button>
                        {cancel}
                    </div>
                }
            >
                {error && <Alert tone='red'>{error.message}</Alert>}
                <Field label={t('common.email')}>
                    <Input
                        name='email'
                        type='email'
                        autoComplete='email'
                        defaultValue={details.loginHint ?? ''}
                        required
                        autoFocus
                    />
                </Field>
                <Field
                    label={t('common.password')}
                    labelAction={
                        <Button variant='link' size='sm' onClick={() => router.push('/forgot')}>
                            {t('login.forgot')}
                        </Button>
                    }
                >
                    <Input name='password' type='password' autoComplete='current-password' required />
                </Field>
                <Button type='submit' block loading={pending}>
                    {t('login.submit')}
                </Button>
            </AuthShell>
        )
    }

    // Stap "consent": organisatie kiezen.
    return (
        <AuthShell
            title={t('interaction.orgTitle')}
            description={t('interaction.orgDescription', { client: details.client.name })}
            footer={cancel}
        >
            {error && <Alert tone='red'>{error.message}</Alert>}
            {details.organizations.length === 0 ? (
                <Alert tone='amber'>{t('interaction.noOrganizations')}</Alert>
            ) : (
                <RowList bordered>
                    {details.organizations.map(org => (
                        <ListRow
                            key={org.id}
                            clickable={!pending}
                            role='button'
                            tabIndex={0}
                            title={org.name}
                            subtitle={org.kind === 'person' ? t('common.personal') : t('common.company')}
                            trailing={<Badge size='sm'>{t(`roles.${org.role}`)}</Badge>}
                            onClick={() => !pending && next('confirm', { orgId: org.id })}
                            onKeyDown={event => {
                                if (event.key === 'Enter' && !pending) void next('confirm', { orgId: org.id })
                            }}
                        />
                    ))}
                </RowList>
            )}
        </AuthShell>
    )
}
