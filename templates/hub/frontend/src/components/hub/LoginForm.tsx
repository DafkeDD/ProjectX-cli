'use client'

import { useTranslations } from 'next-intl'
import { Alert, Button, Field, Input } from '@/components/ui'
import { useRouter } from '@/i18n/navigation'
import { api } from '@/lib/api'
import AuthShell from './AuthShell'
import { field, useSubmit } from './use-submit'

/** Rechtstreeks aanmelden bij de hub (voor het beheerpaneel en je account). */
export default function LoginForm() {
    const t = useTranslations('Hub')
    const router = useRouter()
    const { pending, error, run } = useSubmit()

    async function submit(event: React.FormEvent<HTMLElement>) {
        event.preventDefault()
        const form = event.currentTarget as HTMLFormElement
        const ok = await run(() =>
            api.post('/api/auth/login', { email: field(form, 'email'), password: field(form, 'password') })
        )
        if (ok) {
            router.replace('/')
            router.refresh()
        }
    }

    return (
        <AuthShell
            title={t('login.title')}
            description={t('login.description')}
            onSubmit={submit}
            footer={
                <Button variant='link' onClick={() => router.push('/register')}>
                    {t('login.noAccount')}
                </Button>
            }
        >
            {error && <Alert tone='red'>{error.message}</Alert>}
            <Field label={t('common.email')}>
                <Input name='email' type='email' autoComplete='email' required autoFocus />
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
