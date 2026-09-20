'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, Button, Field, Input } from '@/components/ui'
import { useRouter } from '@/i18n/navigation'
import { api } from '@/lib/api'
import AuthShell from './AuthShell'
import { field, useSubmit } from './use-submit'

/** Nieuw wachtwoord kiezen via de link uit de e-mail. */
export default function ResetForm({ token }: { token: string }) {
    const t = useTranslations('Hub')
    const router = useRouter()
    const { pending, error, run } = useSubmit()
    const [done, setDone] = useState(false)

    async function submit(event: React.FormEvent<HTMLElement>) {
        event.preventDefault()
        const form = event.currentTarget as HTMLFormElement
        const ok = await run(() =>
            api.post('/api/auth/reset', { token, password: field(form, 'password') }).then(() => true)
        )
        if (ok) setDone(true)
    }

    if (done) {
        return (
            <AuthShell title={t('reset.doneTitle')} description={t('reset.doneDescription')}>
                <Button block onClick={() => router.replace('/login')}>
                    {t('login.submit')}
                </Button>
            </AuthShell>
        )
    }

    return (
        <AuthShell title={t('reset.title')} description={t('reset.description')} onSubmit={submit}>
            {error && <Alert tone='red'>{error.message}</Alert>}
            <Field label={t('reset.newPassword')} hint={t('common.passwordHint')}>
                <Input name='password' type='password' autoComplete='new-password' required minLength={10} autoFocus />
            </Field>
            <Button type='submit' block loading={pending} disabled={!token}>
                {t('reset.submit')}
            </Button>
        </AuthShell>
    )
}
