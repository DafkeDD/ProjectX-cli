import { randomUUID } from 'node:crypto'
import { hub } from '../db/hub.js'
import type { Db } from '../db/sql.js'
import { hashPassword } from '../auth/password.js'

export interface Account {
    id: string
    email: string
    password_hash: string
    name: string
    locale: string | null
    status: 'pending' | 'active' | 'disabled'
    is_admin: boolean
}

export interface Organization {
    id: string
    tenant_key: string
    name: string
    kind: 'person' | 'company'
    role: 'owner' | 'admin' | 'member'
}

/** tenantKey = de eerste 12 tekens van de organisatie-id, zonder streepjes. */
export const tenantKeyFor = (orgId: string) => orgId.replace(/-/g, '').slice(0, 12).toLowerCase()

export const findAccountByEmail = (email: string) =>
    hub.one<Account & Record<string, unknown>>('select * from accounts where lower(email) = lower($1)', [email.trim()])

export const getAccount = (id: string) =>
    hub.one<Account & Record<string, unknown>>('select * from accounts where id = $1', [id])

/**
 * Nieuw account + meteen een eigen organisatie (een persoon alleen is een
 * organisatie met één lid), met dit account als eigenaar.
 */
export async function createAccount(input: {
    email: string
    name: string
    password: string
    locale?: string | null
    organization?: string | null
    status?: Account['status']
    isAdmin?: boolean
}): Promise<{ account: Account; organization: Organization }> {
    const passwordHash = await hashPassword(input.password)
    return hub.tx(async (tx: Db) => {
        const account = (await tx.one<Account & Record<string, unknown>>(
            `insert into accounts (email, password_hash, name, locale, status, is_admin, email_verified_at)
             values ($1, $2, $3, $4, $5, $6, case when $5 = 'active' then now() end)
             returning *`,
            [
                input.email.trim(),
                passwordHash,
                input.name.trim(),
                input.locale ?? null,
                input.status ?? 'pending',
                input.isAdmin ?? false
            ]
        ))!
        const company = input.organization?.trim()
        const org = { id: randomUUID() }
        await tx.query('insert into organizations (id, tenant_key, name, kind) values ($1, $2, $3, $4)', [
            org.id,
            tenantKeyFor(org.id),
            company || account.name,
            company ? 'company' : 'person'
        ])
        await tx.query("insert into memberships (org_id, account_id, role) values ($1, $2, 'owner')", [
            org.id,
            account.id
        ])
        return {
            account,
            organization: {
                id: org.id,
                tenant_key: tenantKeyFor(org.id),
                name: company || account.name,
                kind: company ? 'company' : 'person',
                role: 'owner'
            }
        }
    })
}

/** De organisaties van een account, eigen organisatie eerst. */
export const listOrganizations = (accountId: string) =>
    hub.many<Organization & Record<string, unknown>>(
        `select o.id, o.tenant_key, o.name, o.kind, m.role
         from memberships m join organizations o on o.id = m.org_id
         where m.account_id = $1
         order by (m.role = 'owner') desc, o.name`,
        [accountId]
    )

export const getMembership = (accountId: string, orgId: string) =>
    hub.one<Organization & Record<string, unknown>>(
        `select o.id, o.tenant_key, o.name, o.kind, m.role
         from memberships m join organizations o on o.id = m.org_id
         where m.account_id = $1 and m.org_id = $2`,
        [accountId, orgId]
    )
