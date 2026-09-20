import { createHash, randomBytes } from 'node:crypto'
import { hub } from '../db/hub.js'

/**
 * Eenmalige codes (e-mailbevestiging, wachtwoord vergeten) en hub-sessies,
 * in oidc_store. We bewaren enkel de hash: wie de database leest, kan er niets mee.
 */
export type CodeKind = 'EmailVerification' | 'PasswordReset' | 'HubSession'

export const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url')

/** Maakt een code aan en geeft de ruwe waarde terug (voor in een link of cookie). */
export async function createCode(
    kind: CodeKind,
    payload: Record<string, unknown>,
    ttlSeconds: number
): Promise<string> {
    const code = randomBytes(32).toString('base64url')
    await hub.query('insert into oidc_store (kind, id, payload, expires_at) values ($1, $2, $3, $4)', [
        kind,
        sha256(code),
        payload,
        new Date(Date.now() + ttlSeconds * 1000)
    ])
    return code
}

/** Leest een geldige, nog niet gebruikte code. */
export async function readCode<T>(kind: CodeKind, code: unknown): Promise<T | null> {
    if (typeof code !== 'string' || code.length < 20 || code.length > 100) return null
    const row = await hub.one<{ payload: T }>(
        'select payload from oidc_store where kind = $1 and id = $2 and consumed_at is null and expires_at > now()',
        [kind, sha256(code)]
    )
    return row?.payload ?? null
}

/** Leest én verbruikt een code in één keer (twee keer klikken op dezelfde link werkt niet). */
export async function consumeCode<T>(kind: CodeKind, code: unknown): Promise<T | null> {
    if (typeof code !== 'string' || code.length < 20 || code.length > 100) return null
    const row = await hub.one<{ payload: T }>(
        `update oidc_store set consumed_at = now()
         where kind = $1 and id = $2 and consumed_at is null and expires_at > now()
         returning payload`,
        [kind, sha256(code)]
    )
    return row?.payload ?? null
}

export async function deleteCode(kind: CodeKind, code: string): Promise<void> {
    await hub.query('delete from oidc_store where kind = $1 and id = $2', [kind, sha256(code)])
}

/** Alle codes van één soort voor een account weg (bv. alle sessies na een nieuw wachtwoord). */
export async function deleteCodesFor(kind: CodeKind, accountId: string): Promise<void> {
    await hub.query("delete from oidc_store where kind = $1 and payload->>'accountId' = $2", [kind, accountId])
}
