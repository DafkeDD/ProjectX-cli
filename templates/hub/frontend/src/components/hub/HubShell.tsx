import type * as React from 'react'
import { getTranslations } from 'next-intl/server'
import { Badge, SectionHeader } from '@/components/ui'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import ThemeToggle from '@/components/theme/ThemeToggle'
import { env } from '@/lib/env'
import type { Me } from '@/lib/session'
import LogoutButton from './LogoutButton'
import NavButton from './NavButton'

/** Kader van de pagina's voor ingelogde gebruikers: kop met navigatie, inhoud, voet. */
export default async function HubShell({ me, children }: { me: Me; children: React.ReactNode }) {
    const t = await getTranslations('Hub')
    return (
        <div className='mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-6'>
            <header className='flex flex-wrap items-center justify-between gap-4'>
                <div className='flex items-center gap-3'>
                    <Badge tone='accent' dot>
                        {env.appName}
                    </Badge>
                    <NavButton href='/' variant='ghost' size='sm'>
                        {t('home.nav')}
                    </NavButton>
                    {me.account.is_admin && (
                        <NavButton href='/admin/tokens' variant='ghost' size='sm'>
                            {t('admin.nav')}
                        </NavButton>
                    )}
                </div>
                <div className='flex items-center gap-3'>
                    <SectionHeader size='sm' title={me.account.name} description={me.account.email} />
                    <LogoutButton />
                </div>
            </header>
            <main className='flex flex-1 flex-col gap-8'>{children}</main>
            <footer className='flex flex-wrap items-center gap-3'>
                <LocaleSwitcher />
                <ThemeToggle />
            </footer>
        </div>
    )
}
