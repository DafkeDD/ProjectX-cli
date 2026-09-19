import { spawn } from 'node:child_process'

/**
 * Op Windows draaien we via de shell: npm/npx zijn daar .cmd-bestanden.
 * We bouwen de commandoregel dan zelf en quoten zelf (cmd.exe-regels), om
 * DEP0190 en opgesplitste paden met spaties te vermijden.
 */
const USE_SHELL = process.platform === 'win32'

function quoteArg(arg: string): string {
    if (/^[A-Za-z0-9._\-:/\\@=*]+$/.test(arg)) return arg
    return `"${arg.replace(/"/g, '""')}"`
}

function commandLine(command: string, args: string[]): string {
    return [command, ...args].map(quoteArg).join(' ')
}

/** Voert een commando uit zonder output; stderr wordt bewaard voor foutmeldingen. */
export function runQuiet(command: string, args: string[], cwd: string = process.cwd()): Promise<void> {
    return new Promise((resolve, reject) => {
        const stdio: ['ignore', 'ignore', 'pipe'] = ['ignore', 'ignore', 'pipe']
        const child = USE_SHELL
            ? spawn(commandLine(command, args), { cwd, stdio, shell: true })
            : spawn(command, args, { cwd, stdio })

        let stderr = ''
        child.stderr?.on('data', d => (stderr += String(d)))
        child.on('error', reject)
        child.on('close', code => {
            if (code === 0) return resolve()
            const tail = stderr.trim().split('\n').slice(-8).join('\n')
            reject(new Error(`\`${command} ${args.join(' ')}\` faalde (exit code ${code}).${tail ? '\n' + tail : ''}`))
        })
    })
}
