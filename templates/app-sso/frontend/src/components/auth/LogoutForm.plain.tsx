/**
 * Afmelden gaat met een POST: zo kan een andere site je niet ongevraagd
 * uitloggen met een verborgen link of afbeelding.
 */
export default function LogoutForm({ label }: { label: string }) {
    return (
        <form action='/auth/logout' method='post'>
            <button
                type='submit'
                className='border-foreground/20 hover:bg-foreground/5 inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium transition'
            >
                {label}
            </button>
        </form>
    )
}
