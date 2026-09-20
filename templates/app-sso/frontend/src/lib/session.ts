import { redirect } from 'next/navigation'
import { ApiError, serverApi } from '@/lib/api.server'

/**
 * De ingelogde gebruiker van deze app. Inloggen gebeurt in de SSO-hub; deze
 * app kent enkel zijn eigen sessie (cookie px_app, gezet door de backend).
 */
export interface Me {
    account: { id: string; email: string; name: string }
    organization: { id: string; tenant_key: string; name: string; role: 'owner' | 'admin' | 'member' }
}

/** Naar de hub om in te loggen; daarna terug naar `returnTo`. */
export const loginUrl = (returnTo = '/') => `/auth/login?returnTo=${encodeURIComponent(returnTo)}`

/** Zelfde, maar met de keuze van een andere organisatie. */
export const switchUrl = (returnTo = '/') => `/auth/switch?returnTo=${encodeURIComponent(returnTo)}`

export const logoutUrl = '/auth/logout'

/** Meldingen die na een mislukte of afgebroken login in de URL staan (?login=...). */
const NOTICES = ['expired', 'tenant', 'access_denied'] as const
export type Notice = (typeof NOTICES)[number] | 'error'

export const noticeOf = (value: unknown): Notice | undefined => {
    if (typeof value !== 'string' || !value) return undefined
    return (NOTICES as readonly string[]).includes(value) ? (value as Notice) : 'error'
}

/** De gebruiker, of null als er niemand ingelogd is (of de backend plat ligt). */
export async function getMe(): Promise<Me | null> {
    try {
        return await serverApi.get<Me>('/auth/me', { cache: 'no-store' })
    } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.code === 'unreachable')) return null
        throw error
    }
}

/** Voor pagina's waar je ingelogd voor moet zijn: anders meteen naar de hub. */
export async function requireMe(returnTo = '/'): Promise<Me> {
    const me = await getMe()
    if (!me) redirect(loginUrl(returnTo))
    return me
}
