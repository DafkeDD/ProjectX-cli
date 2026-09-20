'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
    Alert,
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Field,
    Input,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui'
import { api } from '@/lib/api'
import type { Organization } from '@/lib/session'
import { field, useSubmit } from './use-submit'

/** Je organisaties, met hernoemen voor een eigenaar of beheerder. */
export default function OrganizationsCard({ organizations }: { organizations: Organization[] }) {
    const t = useTranslations('Hub')
    const router = useRouter()
    const { pending, error, setError, run } = useSubmit()
    const [editing, setEditing] = useState<Organization | null>(null)

    async function rename(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const name = field(event.currentTarget, 'name')
        const done = await run(() => api.patch(`/api/auth/organizations/${editing!.id}`, { name }))
        if (done !== undefined) {
            setEditing(null)
            router.refresh()
        }
    }

    return (
        <Card>
            <CardHeader className='flex flex-col items-start gap-1'>
                <CardTitle>{t('home.organizations')}</CardTitle>
                <CardDescription>{t('home.organizationsDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('common.name')}</TableHead>
                            <TableHead>{t('home.kind')}</TableHead>
                            <TableHead>{t('home.role')}</TableHead>
                            <TableHead>{t('home.tenantKey')}</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {organizations.map(org => (
                            <TableRow key={org.id}>
                                <TableCell strong>{org.name}</TableCell>
                                <TableCell>
                                    {org.kind === 'person' ? t('common.personal') : t('common.company')}
                                </TableCell>
                                <TableCell>
                                    <Badge size='sm' tone={org.role === 'owner' ? 'accent' : 'neutral'}>
                                        {t(`roles.${org.role}`)}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge size='sm'>{org.tenant_key}</Badge>
                                </TableCell>
                                <TableCell align='right'>
                                    {org.role !== 'member' && (
                                        <Button
                                            size='sm'
                                            variant='ghost'
                                            onClick={() => {
                                                setError(null)
                                                setEditing(org)
                                            }}
                                        >
                                            {t('home.rename')}
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>

            <Dialog open={editing !== null} onOpenChange={open => !open && setEditing(null)}>
                <DialogContent>
                    <form onSubmit={rename}>
                        <DialogHeader>
                            <DialogTitle>{t('home.renameTitle')}</DialogTitle>
                            <DialogDescription>{t('home.renameDescription')}</DialogDescription>
                        </DialogHeader>
                        <DialogBody className='flex flex-col gap-4'>
                            {error && <Alert tone='red'>{error.message}</Alert>}
                            <Field label={t('common.name')}>
                                <Input name='name' defaultValue={editing?.name} required maxLength={100} />
                            </Field>
                        </DialogBody>
                        <DialogFooter>
                            <Button type='button' variant='secondary' onClick={() => setEditing(null)}>
                                {t('common.cancel')}
                            </Button>
                            <Button type='submit' loading={pending}>
                                {t('common.save')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
