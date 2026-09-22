import fs from 'node:fs'
import path from 'node:path'

/** Wat voor project staat er in deze map? */
export interface Project {
    dir: string
    frontendDir: string | null
    backendDir: string | null
    /** NestJS of Express (naar de bestanden gekeken). */
    backend: 'nestjs' | 'express' | null
    /** Is dit de SSO-hub zelf? */
    hub: boolean
    /** Is dit een app die op een hub aangesloten is? */
    connected: boolean
    /** Heeft de backend de eigen datalaag (src/db)? */
    database: boolean
    /** Gebruikt de frontend ProjectX-UI? */
    ui: boolean
}

const has = (...parts: string[]) => fs.existsSync(path.join(...parts))

/** Waarden uit een .env-bestand (zonder een package). */
export function readEnv(file: string): Record<string, string> {
    if (!fs.existsSync(file)) return {}
    const values: Record<string, string> = {}
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
        if (!match) continue
        values[match[1]!] = match[2]!.trim().replace(/^"(.*)"$/, '$1')
    }
    return values
}

export function detectProject(dir: string): Project {
    const frontendDir = has(dir, 'frontend', 'package.json') ? path.join(dir, 'frontend') : null
    const backendDir = has(dir, 'backend', 'package.json') ? path.join(dir, 'backend') : null
    // .env is het stevigste kenmerk: dat bestand verdwijnt niet en staat niet in git.
    const env = backendDir ? readEnv(path.join(backendDir, '.env')) : {}

    return {
        dir,
        frontendDir,
        backendDir,
        backend: backendDir
            ? has(backendDir, 'nest-cli.json')
                ? 'nestjs'
                : has(backendDir, 'src', 'index.ts')
                  ? 'express'
                  : null
            : null,
        // .env is het stevigste kenmerk: dat bestand verdwijnt niet en staat niet in git.
        hub: !!backendDir && (!!env.HUB_SECRET_KEY || has(backendDir, 'migrations', 'hub')),
        connected: !!backendDir && (!!env.OIDC_ISSUER || has(backendDir, 'src', 'auth', 'flow.ts')),
        database: !!backendDir && (!!env.APP_KEY || has(backendDir, 'migrations', 'control')),
        ui: !!frontendDir && has(frontendDir, 'src', 'components', 'ui')
    }
}

export const projectLabel = (project: Project): string =>
    project.hub ? 'SSO-hub' : project.connected ? 'app aangesloten op een hub' : 'app'
