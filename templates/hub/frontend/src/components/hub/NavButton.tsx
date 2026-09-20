'use client'

import type * as React from 'react'
import { Button, type ButtonProps } from '@/components/ui'
import { useRouter } from '@/i18n/navigation'

/** Knop die naar een pagina van de hub gaat (Button asChild werkt niet in ProjectX-UI). */
export default function NavButton({
    href,
    children,
    ...rest
}: ButtonProps & { href: string; children: React.ReactNode }) {
    const router = useRouter()
    return (
        <Button {...rest} onClick={() => router.push(href)}>
            {children}
        </Button>
    )
}
