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

/** Voert een commando uit en geeft stdout terug (null als het mislukt of niet bestaat). */
export function runCapture(command: string, args: string[], cwd: string = process.cwd()): Promise<string | null> {
    return new Promise(resolve => {
        const stdio: ['ignore', 'pipe', 'ignore'] = ['ignore', 'pipe', 'ignore']
        const child = USE_SHELL
            ? spawn(commandLine(command, args), { cwd, stdio, shell: true })
            : spawn(command, args, { cwd, stdio })
        let out = ''
        child.stdout?.on('data', d => (out += String(d)))
        child.on('error', () => resolve(null))
        child.on('close', code => resolve(code === 0 ? out.trim() : null))
    })
}

/**
 * Voert een commando uit met extra omgevingsvariabelen en geeft stdout terug;
 * gooit een fout (met de laatste regels van stderr) als het mislukt.
 */
export function runOutput(
    command: string,
    args: string[],
    cwd: string = process.cwd(),
    extraEnv: Record<string, string> = {}
): Promise<string> {
    return new Promise((resolve, reject) => {
        const options = {
            cwd,
            env: { ...process.env, ...extraEnv },
            stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe']
        }
        const child = USE_SHELL
            ? spawn(commandLine(command, args), { ...options, shell: true })
            : spawn(command, args, options)
        let out = ''
        let err = ''
        child.stdout?.on('data', d => (out += String(d)))
        child.stderr?.on('data', d => (err += String(d)))
        child.on('error', reject)
        child.on('close', code => {
            if (code === 0) return resolve(out)
            const tail = err.trim().split('\n').slice(-8).join('\n')
            reject(new Error(`\`${command} ${args.join(' ')}\` faalde (exit code ${code}).${tail ? '\n' + tail : ''}`))
        })
    })
}
