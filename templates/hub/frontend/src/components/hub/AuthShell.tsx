import type * as React from 'react'
import { AuthCard, AuthLayout, Badge } from '@/components/ui'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import ThemeToggle from '@/components/theme/ThemeToggle'
import { env } from '@/lib/env'

/**
 * Kader van alle schermen rond aanmelden (ProjectX-UI AuthLayout + AuthCard),
 * met taalkiezer en thema eronder.
 */
export default function AuthShell({
    title,
    description,
    footer,
    onSubmit,
    children
}: {
    title: React.ReactNode
    description?: React.ReactNode
    footer?: React.ReactNode
    /** Met onSubmit is de kaart een formulier. */
    onSubmit?: React.FormEventHandler<HTMLElement>
    children?: React.ReactNode
}) {
    return (
        <AuthLayout variant='centered'>
            <div className='flex w-full max-w-md flex-col items-center gap-6'>
                <AuthCard
                    as={onSubmit ? 'form' : 'div'}
                    onSubmit={onSubmit}
                    brand={
                        <Badge tone='accent' dot>
                            {env.appName}
                        </Badge>
                    }
                    title={title}
                    description={description}
                    footer={footer}
                    className='w-full'
                >
                    {children}
                </AuthCard>
                <div className='flex flex-wrap items-center justify-center gap-3'>
                    <LocaleSwitcher />
                    <ThemeToggle />
                </div>
            </div>
        </AuthLayout>
    )
}
