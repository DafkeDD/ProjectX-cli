import pc from 'picocolors'

export type UpdateLabel = (label: string) => void

const BAR_WIDTH = 24
const PREFIX_WIDTH = 2 + BAR_WIDTH + 1 + 4 + 2

/**
 * Eén geanimeerde progress-bar terwijl `task` loopt. npm geeft geen echt
 * percentage, dus de bar kruipt richting 95% en springt naar 100% als de taak
 * klaar is. Zonder TTY draait de taak gewoon zonder animatie.
 */
export async function withProgress<T>(
    label: string,
    task: (update: UpdateLabel) => Promise<T>,
    estMs = 25000
): Promise<T> {
    const out = process.stdout
    if (!out.isTTY) return task(() => {})

    const start = Date.now()
    let current = label
    let finished = false

    const draw = (ratio: number): void => {
        const r = Math.max(0, Math.min(1, ratio))
        const filled = Math.round(r * BAR_WIDTH)
        const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled)
        const pct = String(Math.round(r * 100)).padStart(3, ' ')
        const room = Math.max(0, (out.columns || 80) - PREFIX_WIDTH - 1)
        const text = current.length > room ? current.slice(0, Math.max(0, room - 1)) + '…' : current
        out.cursorTo(0)
        out.clearLine(0)
        out.write(`  ${pc.cyan(bar)} ${pct}%  ${pc.dim(text)}`)
    }

    draw(0)
    const timer = setInterval(() => {
        if (!finished) draw(Math.min(0.95, 1 - Math.exp(-(Date.now() - start) / estMs)))
    }, 120)

    try {
        const result = await task(next => (current = next))
        finished = true
        clearInterval(timer)
        draw(1)
        out.write('\n')
        return result
    } catch (err) {
        finished = true
        clearInterval(timer)
        out.write('\n')
        throw err
    }
}
