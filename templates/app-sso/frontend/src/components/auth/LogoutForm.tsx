import { Button } from '@/components/ui'

/**
 * Afmelden gaat met een POST: zo kan een andere site je niet ongevraagd
 * uitloggen met een verborgen link of afbeelding.
 */
export default function LogoutForm({ label }: { label: string }) {
    return (
        <form action='/auth/logout' method='post'>
            <Button type='submit' variant='ghost' size='sm'>
                {label}
            </Button>
        </form>
    )
}
