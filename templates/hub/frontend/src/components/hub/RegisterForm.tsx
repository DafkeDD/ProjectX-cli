'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, Button, Field, Input } from '@/components/ui'
import { useRouter } from '@/i18n/navigation'
import { api } from '@/lib/api'
import AuthShell from './AuthShell'
import { field, useSubmit } from './use-submit'

/**
 * Registreren kan ENKEL in de hub. Je krijgt meteen een eigen organisatie
 * (je bedrijfsnaam, of je eigen naam als je die leeg laat).
 */
export default function RegisterForm() {
    const t = useTranslations('Hub')
    const router = useRouter()
    const { pending, error, run } = useSubmit()
    const [sentTo, setSentTo] = useState<string | null>(null)
    const [resent, setResent] = useState(false)

    async function submit(event: React.FormEvent<HTMLElement>) {
        event.preventDefault()
        const form = event.currentTarget as HTMLFormElement
        const email = field(form, 'email')
        const ok = await run(() =>
            api.post('/api/auth/register', {
                name: field(form, 'name'),
                email,
                password: field(form, 'password'),
                organization: field(form, 'organization')
            })
        )
        if (ok) setSentTo(email)
    }

    if (sentTo) {
        return (
            <AuthShell
                title={t('register.checkMailTitle')}
                description={t('register.checkMailDescription', { email: sentTo })}
                footer={
                    <Button variant='link' onClick={() => router.push('/login')}>
                        {t('common.backToLogin')}
                    </Button>
                }
            >
                {error && <Alert tone='red'>{error.message}</Alert>}
                {resent && <Alert tone='green'>{t('register.resent')}</Alert>}
                <Button
                    variant='secondary'
                    block
                    loading={pending}
                    onClick={async () => {
                        // Enkel bevestigen als het echt gelukt is.
                        if ((await run(() => api.post('/api/auth/resend', { email: sentTo }))) !== undefined) {
                            setResent(true)
                        }
                    }}
                >
                    {t('register.resend')}
                </Button>
            </AuthShell>
        )
    }

    return (
        <AuthShell
            title={t('register.title')}
            description={t('register.description')}
            onSubmit={submit}
            footer={
                <Button variant='link' onClick={() => router.push('/login')}>
                    {t('register.haveAccount')}
                </Button>
            }
        >
            {error && <Alert tone='red'>{error.message}</Alert>}
            <Field label={t('common.name')}>
                <Input name='name' autoComplete='name' required autoFocus />
            </Field>
            <Field label={t('common.email')}>
                <Input name='email' type='email' autoComplete='email' required />
            </Field>
            <Field label={t('common.password')} hint={t('common.passwordHint')}>
                <Input name='password' type='password' autoComplete='new-password' required minLength={10} />
            </Field>
            <Field label={t('register.organization')} hint={t('register.organizationHint')}>
                <Input name='organization' autoComplete='organization' />
            </Field>
            <Button type='submit' block loading={pending}>
                {t('register.submit')}
            </Button>
        </AuthShell>
    )
}
