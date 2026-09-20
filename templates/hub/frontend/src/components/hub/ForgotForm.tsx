'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, Button, Field, Input } from '@/components/ui'
import { useRouter } from '@/i18n/navigation'
import { api } from '@/lib/api'
import AuthShell from './AuthShell'
import { field, useSubmit } from './use-submit'

/** Wachtwoord vergeten: altijd dezelfde melding, of het account nu bestaat of niet. */
export default function ForgotForm() {
    const t = useTranslations('Hub')
    const router = useRouter()
    const { pending, error, run } = useSubmit()
    const [sent, setSent] = useState(false)

    async function submit(event: React.FormEvent<HTMLElement>) {
        event.preventDefault()
        const form = event.currentTarget as HTMLFormElement
        if (await run(() => api.post('/api/auth/forgot', { email: field(form, 'email') }).then(() => true)))
            setSent(true)
    }

    const back = (
        <Button variant='link' onClick={() => router.push('/login')}>
            {t('common.backToLogin')}
        </Button>
    )

    if (sent) {
        return <AuthShell title={t('forgot.sentTitle')} description={t('forgot.sentDescription')} footer={back} />
    }

    return (
        <AuthShell title={t('forgot.title')} description={t('forgot.description')} onSubmit={submit} footer={back}>
            {error && <Alert tone='red'>{error.message}</Alert>}
            <Field label={t('common.email')}>
                <Input name='email' type='email' autoComplete='email' required autoFocus />
            </Field>
            <Button type='submit' block loading={pending}>
                {t('forgot.submit')}
            </Button>
        </AuthShell>
    )
}
