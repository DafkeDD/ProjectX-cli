import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { HttpException, HttpStatus } from '@nestjs/common'

// scrypt uit Node zelf — geen extra package. Formaat: scrypt$N$r$p$salt$hash (base64url).
const N = 2 ** 15
const R = 8
const P = 1
const KEYLEN = 32

/**
 * scrypt kost met opzet tijd en geheugen (32 MB, ~100 ms) en draait in de
 * threadpool van Node. Zonder begrenzing legt iemand met wat verzoeken de hele
 * backend plat, dus: hoogstens PARALLEL tegelijk en een korte wachtrij.
 */
const PARALLEL = 2
const MAX_WAITING = 50
let running = 0
const waiting: (() => void)[] = []

function release(): void {
    running--
    waiting.shift()?.()
}

async function withSlot<T>(work: () => Promise<T>): Promise<T> {
    if (running >= PARALLEL) {
        if (waiting.length >= MAX_WAITING) {
            throw new HttpException({ key: 'tooManyRequests' }, HttpStatus.TOO_MANY_REQUESTS)
        }
        await new Promise<void>(resolve => waiting.push(resolve))
    }
    running++
    try {
        return await work()
    } finally {
        release()
    }
}

const derive = (password: string, salt: Buffer, options: ScryptOptions) =>
    withSlot(
        () =>
            new Promise<Buffer>((resolve, reject) =>
                scrypt(
                    password.normalize('NFKC'),
                    salt,
                    KEYLEN,
                    { ...options, maxmem: 64 * 1024 * 1024 },
                    (err, key) => (err ? reject(err) : resolve(key))
                )
            )
    )

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16)
    const hash = await derive(password, salt, { N, r: R, p: P })
    return ['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const [algo, n, r, p, salt, hash] = stored.split('$')
    if (algo !== 'scrypt' || !salt || !hash) return false
    const expected = Buffer.from(hash, 'base64url')
    const actual = await derive(password, Buffer.from(salt, 'base64url'), { N: Number(n), r: Number(r), p: Number(p) })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** Minstens 10 tekens, met een letter en een cijfer. */
export const isStrongPassword = (password: unknown): password is string =>
    typeof password === 'string' &&
    password.length >= 10 &&
    password.length <= 200 &&
    /\p{L}/u.test(password) &&
    /\d/.test(password)

export const isEmail = (email: unknown): email is string =>
    typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
