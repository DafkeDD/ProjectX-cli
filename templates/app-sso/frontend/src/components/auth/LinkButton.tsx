'use client'

import type * as React from 'react'
import { Button, type ButtonProps } from '@/components/ui'

/**
 * Knop die naar /auth/... gaat. Een gewone paginanavigatie (geen router), want
 * die adressen sturen door naar de SSO-hub.
 */
export default function LinkButton({
    href,
    children,
    ...rest
}: ButtonProps & { href: string; children: React.ReactNode }) {
    return (
        <Button {...rest} onClick={() => window.location.assign(href)}>
            {children}
        </Button>
    )
}
