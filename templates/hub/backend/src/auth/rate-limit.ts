import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * Eenvoudige rem op inlogpogingen, in het geheugen: hoogstens LIMIT mislukte
 * pogingen per sleutel (e-mail + IP) per WINDOW. Genoeg voor één backend.
 */
const LIMIT = 5
const WINDOW_MS = 15 * 60 * 1000
const failures = new Map<string, { count: number; until: number }>()

export function assertNotLimited(key: string): void {
    const entry = failures.get(key)
    if (entry && entry.until > Date.now() && entry.count >= LIMIT) {
        throw new HttpException({ key: 'tooManyRequests' }, HttpStatus.TOO_MANY_REQUESTS)
    }
}

export function recordFailure(key: string): void {
    const entry = failures.get(key)
    if (!entry || entry.until <= Date.now()) failures.set(key, { count: 1, until: Date.now() + WINDOW_MS })
    else entry.count++
}

export const clearFailures = (key: string) => failures.delete(key)

setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of failures) if (entry.until <= now) failures.delete(key)
}, 60_000).unref()
