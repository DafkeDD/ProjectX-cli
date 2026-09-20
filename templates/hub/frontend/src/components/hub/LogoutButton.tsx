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
                await api.post('/api/auth/logout')
                router.replace('/login')
                router.refresh()
            }}
        >
            {t('common.logout')}
        </Button>
    )
}
