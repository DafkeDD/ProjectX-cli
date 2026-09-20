import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

// scrypt uit Node zelf — geen extra package. Formaat: scrypt$N$r$p$salt$hash (base64url).
const N = 2 ** 15
const R = 8
const P = 1
const KEYLEN = 32

const derive = (password: string, salt: Buffer, options: ScryptOptions) =>
    new Promise<Buffer>((resolve, reject) =>
        scrypt(password.normalize('NFKC'), salt, KEYLEN, { ...options, maxmem: 64 * 1024 * 1024 }, (err, key) =>
            err ? reject(err) : resolve(key)
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
