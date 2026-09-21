'use client'

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import {
    Alert,
    AlertDialog,
    Badge,
    Button,
    CopyButton,
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    EmptyState,
    Field,
    Icon,
    Input,
    SectionHeader,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui'
import { api } from '@/lib/api'
import { field, useSubmit } from './use-submit'

export interface RegistrationToken {
    id: string
    name: string
    hint: string
    expires_at: string | null
    max_uses: number | null
    uses: number
    allowed_domains: string[]
    status: 'active' | 'revoked'
    created_by_name: string | null
    created_at: string
    apps: string[]
}

const BASE = '/api/admin/registration-tokens'

/** Status zoals de beheerder ze ziet: ingetrokken, verlopen, opgebruikt of actief. */
function statusOf(token: RegistrationToken): 'active' | 'revoked' | 'expired' | 'usedUp' {
    if (token.status === 'revoked') return 'revoked'
    if (token.expires_at && new Date(token.expires_at) <= new Date()) return 'expired'
    if (token.max_uses !== null && token.uses >= token.max_uses) return 'usedUp'
    return 'active'
}

/** Kopie van een object zonder één sleutel. */
const without = (record: Record<string, string>, key: string) =>
    Object.fromEntries(Object.entries(record).filter(([k]) => k !== key))

const TONE = { active: 'green', revoked: 'red', expired: 'amber', usedUp: 'amber' } as const

/**
 * Registratietokens: aanmaken, tonen (ontsleuteld), wijzigen, vernieuwen en
 * intrekken. Een app sluit zich met zo'n token aan bij de hub.
 */
export default function TokensAdmin({ initial }: { initial: RegistrationToken[] }) {
    const t = useTranslations('Hub.admin')
    const tc = useTranslations('Hub.common')
    const format = useFormatter()
    const [tokens, setTokens] = useState(initial)
    /** Getoonde (ontsleutelde) tokens per id. */
    const [revealed, setRevealed] = useState<Record<string, string>>({})
    /** Net aangemaakt of vernieuwd: meteen tonen. */
    const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null)
    const [editing, setEditing] = useState<RegistrationToken | 'new' | null>(null)
    const [confirm, setConfirm] = useState<{ kind: 'renew' | 'revoke'; token: RegistrationToken } | null>(null)
    const { pending, error, run, setError } = useSubmit()

    const replace = (next: RegistrationToken) =>
        setTokens(list => {
            const exists = list.some(item => item.id === next.id)
            return exists ? list.map(item => (item.id === next.id ? next : item)) : [next, ...list]
        })

    async function toggleReveal(token: RegistrationToken) {
        if (revealed[token.id]) {
            setRevealed(r => without(r, token.id))
            return
        }
        const result = await run(() => api.post<{ token: string }>(`${BASE}/${token.id}/reveal`))
        if (result) setRevealed(r => ({ ...r, [token.id]: result.token }))
    }

    async function save(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const form = event.currentTarget
        const expires = field(form, 'expiresAt')
        const body = {
            name: field(form, 'name'),
            expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
            maxUses: field(form, 'maxUses') || null,
            allowedDomains: field(form, 'allowedDomains')
        }
        const result =
            editing === 'new'
                ? await run(() => api.post<RegistrationToken & { token: string }>(BASE, body))
                : await run(() => api.patch<RegistrationToken>(`${BASE}/${(editing as RegistrationToken).id}`, body))
        if (!result) return
        replace(result)
        if ('token' in result) setFresh({ name: result.name, token: result.token as string })
        setEditing(null)
    }

    async function confirmAction() {
        if (!confirm) return
        const { kind, token } = confirm
        const result = await run(() => api.post<RegistrationToken & { token?: string }>(`${BASE}/${token.id}/${kind}`))
        if (!result) return
        replace(result)
        setRevealed(r => without(r, token.id))
        if (result.token) setFresh({ name: result.name, token: result.token })
    }

    const date = (value: string | null) =>
        value ? format.dateTime(new Date(value), { dateStyle: 'medium' }) : t('never')
    const current = editing && editing !== 'new' ? editing : null

    return (
        <div className='flex flex-col gap-6'>
            <SectionHeader
                title={t('title')}
                description={t('description')}
                count={tokens.length}
                actions={
                    <Button icon={<Icon name='plus' />} onClick={() => (setError(null), setEditing('new'))}>
                        {t('new')}
                    </Button>
                }
            />

            {error && !editing && <Alert tone='red'>{error.message}</Alert>}

            {fresh && (
                <Alert tone='green' title={t('freshTitle', { name: fresh.name })} onDismiss={() => setFresh(null)}>
                    <div className='flex flex-wrap items-center gap-2'>
                        <code className='break-all'>{fresh.token}</code>
                        <CopyButton value={fresh.token} label={tc('copy')} copiedLabel={tc('copied')} />
                    </div>
                    {t('freshHint')}
                </Alert>
            )}

            {tokens.length === 0 ? (
                <EmptyState icon={<Icon name='key' />} title={t('emptyTitle')} description={t('emptyDescription')} />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{tc('name')}</TableHead>
                            <TableHead>{t('token')}</TableHead>
                            <TableHead>{t('status')}</TableHead>
                            <TableHead>{t('uses')}</TableHead>
                            <TableHead>{t('expiresAt')}</TableHead>
                            <TableHead>{t('apps')}</TableHead>
                            <TableHead>{t('created')}</TableHead>
                            <TableHead align='right'>{t('actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tokens.map(token => {
                            const status = statusOf(token)
                            const shown = revealed[token.id]
                            return (
                                <TableRow key={token.id}>
                                    <TableCell strong>{token.name}</TableCell>
                                    <TableCell>
                                        <div className='flex items-center gap-1'>
                                            <code className={shown ? 'break-all' : 'whitespace-nowrap'}>
                                                {shown ?? `pxr_••••${token.hint}`}
                                            </code>
                                            {shown && (
                                                <CopyButton
                                                    value={shown}
                                                    size='sm'
                                                    label={tc('copy')}
                                                    copiedLabel={tc('copied')}
                                                />
                                            )}
                                            <Button
                                                variant='ghost'
                                                size='sm'
                                                icon={<Icon name={shown ? 'eyeOff' : 'eye'} />}
                                                onClick={() => toggleReveal(token)}
                                            >
                                                {shown ? t('hide') : t('show')}
                                            </Button>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge size='sm' tone={TONE[status]}>
                                            {t(`statuses.${status}`)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {token.uses} / {token.max_uses ?? '∞'}
                                    </TableCell>
                                    <TableCell>{date(token.expires_at)}</TableCell>
                                    <TableCell>{token.apps.length ? token.apps.join(', ') : '—'}</TableCell>
                                    <TableCell>
                                        {date(token.created_at)}
                                        {token.created_by_name ? ` · ${token.created_by_name}` : ''}
                                    </TableCell>
                                    <TableCell align='right'>
                                        <div className='flex justify-end gap-1'>
                                            <Button
                                                variant='ghost'
                                                size='sm'
                                                icon={<Icon name='edit' />}
                                                aria-label={t('edit')}
                                                title={t('edit')}
                                                onClick={() => (setError(null), setEditing(token))}
                                            />
                                            <Button
                                                variant='ghost'
                                                size='sm'
                                                icon={<Icon name='refresh' />}
                                                aria-label={t('renew')}
                                                title={t('renew')}
                                                onClick={() => setConfirm({ kind: 'renew', token })}
                                            />
                                            {token.status === 'active' && (
                                                <Button
                                                    variant='danger-soft'
                                                    size='sm'
                                                    icon={<Icon name='xCircle' />}
                                                    aria-label={t('revoke')}
                                                    title={t('revoke')}
                                                    onClick={() => setConfirm({ kind: 'revoke', token })}
                                                />
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            )}

            <Dialog open={editing !== null} onOpenChange={open => !open && setEditing(null)}>
                <DialogContent>
                    <form onSubmit={save} noValidate>
                        <DialogHeader>
                            <DialogTitle>{current ? t('editTitle') : t('newTitle')}</DialogTitle>
                            <DialogDescription>{t('formDescription')}</DialogDescription>
                        </DialogHeader>
                        <DialogBody className='flex flex-col gap-4'>
                            {error && <Alert tone='red'>{error.message}</Alert>}
                            <Field label={tc('name')} required>
                                <Input
                                    name='name'
                                    defaultValue={current?.name ?? ''}
                                    required
                                    autoFocus
                                    maxLength={100}
                                />
                            </Field>
                            <Field label={t('expiresAt')} hint={t('expiresHint')}>
                                <Input
                                    name='expiresAt'
                                    type='date'
                                    defaultValue={current?.expires_at ? current.expires_at.slice(0, 10) : ''}
                                />
                            </Field>
                            <Field label={t('maxUses')} hint={t('maxUsesHint')}>
                                <Input name='maxUses' type='number' min={1} defaultValue={current?.max_uses ?? ''} />
                            </Field>
                            <Field label={t('allowedDomains')} hint={t('allowedDomainsHint')}>
                                <Input
                                    name='allowedDomains'
                                    placeholder='example.com, app.example.com'
                                    defaultValue={current?.allowed_domains.join(', ') ?? ''}
                                />
                            </Field>
                        </DialogBody>
                        <DialogFooter>
                            <Button variant='ghost' onClick={() => setEditing(null)}>
                                {tc('cancel')}
                            </Button>
                            <Button type='submit' loading={pending}>
                                {current ? tc('save') : t('create')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={confirm !== null}
                onOpenChange={open => !open && setConfirm(null)}
                title={confirm?.kind === 'revoke' ? t('revokeTitle') : t('renewTitle')}
                description={
                    confirm?.kind === 'revoke'
                        ? t('revokeDescription', { name: confirm.token.name })
                        : t('renewDescription', { name: confirm?.token.name ?? '' })
                }
                destructive={confirm?.kind === 'revoke'}
                confirmLabel={confirm?.kind === 'revoke' ? t('revoke') : t('renew')}
                cancelLabel={tc('cancel')}
                onConfirm={confirmAction}
            />
        </div>
    )
}
