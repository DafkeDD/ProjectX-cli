'use client'

import { useState } from 'react'
import { ApiError } from '@/lib/api'

/**
 * Formulier versturen met laadstatus en een vertaalde foutmelding (de backend
 * stuurt de tekst al in de juiste taal mee).
 */
export function useSubmit() {
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<{ code: string; message: string } | null>(null)

    async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
        setPending(true)
        setError(null)
        try {
            return await work()
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? { code: err.code, message: err.message }
                    : { code: 'internal', message: String(err) }
            )
            return undefined
        } finally {
            setPending(false)
        }
    }

    return { pending, error, setError, run }
}

/** Waarde van een formulierveld. */
export const field = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? '')
