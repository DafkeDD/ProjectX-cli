import { getLocale } from 'next-intl/server'
import { redirect } from '@/i18n/navigation'
import { ApiError, serverApi } from '@/lib/api.server'

export interface Organization {
    id: string
    tenant_key: string
    name: string
    kind: 'person' | 'company'
    role: 'owner' | 'admin' | 'member'
}

export interface Me {
    account: { id: string; email: string; name: string; locale: string | null; is_admin: boolean }
    organizations: Organization[]
}

/** Het ingelogde account (server components); niet ingelogd -> /login. */
export async function requireMe(): Promise<Me> {
    try {
        return await serverApi.get<Me>('/api/auth/me', { cache: 'no-store' })
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
            redirect({ href: '/login', locale: await getLocale() })
        }
        throw error
    }
}
