'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Alert, Button } from '@/components/ui'
import { useRouter } from '@/i18n/navigation'
import { api } from '@/lib/api'
import AuthShell from './AuthShell'
import { useSubmit } from './use-submit'

/**
 * E-mailadres bevestigen. Bewust met een knop: sommige mailprogramma's openen
 * links vooraf om ze te scannen, en dan zou de link al gebruikt zijn.
 */
export default function VerifyEmail({ token }: { token: string }) {
    const t = useTranslations('Hub')
    const router = useRouter()
    const { pending, error, run } = useSubmit()
    const [done, setDone] = useState(false)

    if (done) {
        return (
            <AuthShell title={t('verify.doneTitle')} description={t('verify.doneDescription')}>
                <Button block onClick={() => router.replace('/')}>
                    {t('common.continue')}
                </Button>
            </AuthShell>
        )
    }

    return (
        <AuthShell title={t('verify.title')} description={t('verify.description')}>
            {error && <Alert tone='red'>{error.message}</Alert>}
            <Button
                block
                loading={pending}
                disabled={!token}
                onClick={async () => {
                    if (await run(() => api.post('/api/auth/verify', { token }))) setDone(true)
                }}
            >
                {t('verify.submit')}
            </Button>
        </AuthShell>
    )
}
