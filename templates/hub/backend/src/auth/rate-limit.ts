import { HttpException, HttpStatus } from '@nestjs/common'
import type { Request } from 'express'

/**
 * Remmen in het geheugen (genoeg voor één backend; achter meerdere instances
 * hoort dit in de database of in Redis).
 *
 * - `assertNotLimited` / `recordFailure`: mislukte inlogpogingen per e-mail + IP.
 * - `limitByIp`: hoeveel keer één IP een actie mag doen, ongeacht de invoer.
 *   Dat laatste is belangrijk: een aanvaller die telkens een ander e-mailadres
 *   verzint, ontsnapt anders aan elke rem.
 */
const LIMIT = 5
const WINDOW_MS = 15 * 60 * 1000
/** Zoveel sleutels houden we bij; daarboven ruimen we de oudste op (geheugen-DoS). */
const MAX_KEYS = 20_000

interface Bucket {
    count: number
    until: number
}

const buckets = new Map<string, Bucket>()

const tooMany = () => new HttpException({ key: 'tooManyRequests' }, HttpStatus.TOO_MANY_REQUESTS)

function trim(): void {
    if (buckets.size <= MAX_KEYS) return
    const now = Date.now()
    for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key)
    // Nog te groot: de oudste helft eruit.
    if (buckets.size > MAX_KEYS) {
        const oldest = [...buckets.entries()].sort((a, b) => a[1].until - b[1].until)
        for (const [key] of oldest.slice(0, Math.floor(buckets.size / 2))) buckets.delete(key)
    }
}

/** Telt een poging mee en gooit 429 als de teller over de limiet gaat. */
export function assertWithin(key: string, limit: number, windowMs: number): void {
    const now = Date.now()
    const bucket = buckets.get(key)
    if (!bucket || bucket.until <= now) {
        buckets.set(key, { count: 1, until: now + windowMs })
        trim()
        return
    }
    bucket.count++
    if (bucket.count > limit) throw tooMany()
}

/** Rem per IP op een actie, bv. limitByIp(req, 'register', 10). */
export function limitByIp(req: Request, action: string, limit: number, windowMs: number = WINDOW_MS): void {
    assertWithin(`ip:${action}:${req.ip ?? 'onbekend'}`, limit, windowMs)
}

/** Rem op een waarde uit de invoer (bv. één e-mailadres), naast de rem per IP. */
export function limitByValue(action: string, value: string, limit: number, windowMs: number = WINDOW_MS): void {
    assertWithin(`val:${action}:${value.toLowerCase()}`, limit, windowMs)
}

export function assertNotLimited(key: string): void {
    const bucket = buckets.get(`fail:${key}`)
    if (bucket && bucket.until > Date.now() && bucket.count >= LIMIT) throw tooMany()
}

export function recordFailure(key: string): void {
    const now = Date.now()
    const bucket = buckets.get(`fail:${key}`)
    if (!bucket || bucket.until <= now) {
        buckets.set(`fail:${key}`, { count: 1, until: now + WINDOW_MS })
        trim()
    } else bucket.count++
}

export const clearFailures = (key: string) => buckets.delete(`fail:${key}`)

setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key)
}, 60_000).unref()
