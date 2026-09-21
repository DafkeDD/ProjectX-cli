'use client'

import { useTranslations } from 'next-intl'
import { Button, Icon } from '@/components/ui'
import { useRouter } from '@/i18n/navigation'
import { api } from '@/lib/api'

export default function LogoutButton() {
    const t = useTranslations('Hub')
    const router = useRouter()
    return (
        <Button
            variant='ghost'
            icon={<Icon name='logout' />}
            onClick={async () => {
                // Mislukt de call (backend plat), dan gaan we toch naar het inlogscherm.
                try {
                    await api.post('/api/auth/logout')
                } catch (error) {
                    console.error('Afmelden mislukte bij de backend:', error)
                }
                router.refresh()
                router.replace('/login')
            }}
        >
            {t('common.logout')}
        </Button>
    )
}
