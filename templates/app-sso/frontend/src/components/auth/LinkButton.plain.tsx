import type * as React from 'react'

/**
 * Knop die naar /auth/... gaat. Een gewone link, want die adressen sturen door
 * naar de SSO-hub.
 */
export default function LinkButton({
    href,
    children,
    variant = 'primary'
}: {
    href: string
    children: React.ReactNode
    variant?: 'primary' | 'secondary'
}) {
    const style =
        variant === 'primary'
            ? 'bg-foreground text-background hover:opacity-90'
            : 'border-foreground/20 hover:bg-foreground/5 border'
    return (
        <a
            href={href}
            className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition ${style}`}
        >
            {children}
        </a>
    )
}
