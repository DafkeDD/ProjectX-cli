import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { runCapture, runQuiet } from '../../utils/exec.js'

/**
 * Eén gedeelde PostgreSQL-container voor ALLE ProjectX-projecten op deze
 * machine: elke app krijgt er haar eigen databases en rollen in (voorvoegsel
 * = appKey). Zo draait er maar één PostgreSQL, ook met tien projecten.
 */
export const CONTAINER = 'projectx-postgres'
export const NETWORK = 'projectx'
export const VOLUME = 'projectx-pgdata'
/** Vaste hoofdversie: een nieuwe hoofdversie vraagt een dump/restore, dus nooit "latest". */
export const IMAGE = 'postgres:18'
export const DOCKER_ADMIN_USER = 'projectx'

export interface PgAdmin {
    host: string
    port: number
    user: string
    password: string
}

/** Beheerder-gegevens van de gedeelde container: enkel op deze machine, nooit in een project. */
export const ADMIN_CONFIG = path.join(os.homedir(), '.projectx', 'postgres.json')

export function readAdminConfig(): PgAdmin | null {
    try {
        const data = JSON.parse(fs.readFileSync(ADMIN_CONFIG, 'utf8')) as Partial<PgAdmin>
        if (!data.password || !data.port) return null
        return {
            host: 'localhost',
            port: Number(data.port),
            user: data.user || DOCKER_ADMIN_USER,
            password: data.password
        }
    } catch {
        return null
    }
}

export function writeAdminConfig(admin: PgAdmin): void {
    fs.mkdirSync(path.dirname(ADMIN_CONFIG), { recursive: true })
    const data = { container: CONTAINER, user: admin.user, password: admin.password, port: admin.port }
    fs.writeFileSync(ADMIN_CONFIG, JSON.stringify(data, null, 4) + '\n', { encoding: 'utf8', mode: 0o600 })
}

/** Draait Docker (de daemon, niet enkel de CLI)? */
export const dockerAvailable = async () =>
    (await runCapture('docker', ['version', '--format', '{{.Server.Version}}'])) !== null

export async function containerState(): Promise<'running' | 'stopped' | 'missing'> {
    const out = await runCapture('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER])
    if (out === null) return 'missing'
    return out === 'true' ? 'running' : 'stopped'
}

/** Bestaat het datavolume nog (bv. na het verwijderen van de container)? */
export const volumeExists = async () => (await runCapture('docker', ['volume', 'inspect', VOLUME])) !== null

/** Poort op de host waarop de container luistert (null = geen gepubliceerde poort). */
export async function containerPort(): Promise<number | null> {
    const out = await runCapture('docker', ['port', CONTAINER, '5432/tcp'])
    const match = out?.match(/:(\d+)\s*$/m)
    return match ? Number(match[1]) : null
}

/** Netwerk + container aanmaken of starten. */
export async function ensureContainer(admin: PgAdmin): Promise<void> {
    if ((await runCapture('docker', ['network', 'inspect', NETWORK])) === null) {
        await runQuiet('docker', ['network', 'create', NETWORK])
    }
    const state = await containerState()
    if (state === 'running') return
    if (state === 'stopped') {
        await runQuiet('docker', ['start', CONTAINER])
        return
    }
    // Het wachtwoord via een tijdelijk bestand (0600), niet via -e: anders staat
    // het in `ps` en blijft het in `docker inspect` staan.
    const envFile = path.join(os.tmpdir(), `projectx-pg-${randomBytes(8).toString('hex')}.env`)
    fs.writeFileSync(envFile, `POSTGRES_USER=${admin.user}\nPOSTGRES_PASSWORD=${admin.password}\n`, {
        encoding: 'utf8',
        mode: 0o600
    })
    try {
        await runQuiet('docker', [
            'run',
            '-d',
            '--name',
            CONTAINER,
            '--restart',
            'unless-stopped',
            '--network',
            NETWORK,
            // Enkel bereikbaar vanaf deze machine.
            '-p',
            `127.0.0.1:${admin.port}:5432`,
            // postgres 18: het volume hoort op /var/lib/postgresql (niet .../data).
            '-v',
            `${VOLUME}:/var/lib/postgresql`,
            '--env-file',
            envFile,
            IMAGE,
            // Honderden tenants: ruim genoeg verbindingen.
            '-c',
            'max_connections=300'
        ])
    } finally {
        fs.rmSync(envFile, { force: true })
    }
}

export interface ComposeOptions {
    appKey: string
    backendPort: number
    backendDevCommand: string
    frontendPort: number | null
}

const DOCKERIGNORE = ['node_modules', 'dist', '.next', '.env', '.env.local', '*.log', ''].join('\n')

const dockerfile = (
    command: string
) => `# Ontwikkel-image: de broncode komt via een bind mount (zie docker-compose.yml).
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ${JSON.stringify(command.split(' '))}
`

/**
 * docker-compose.yml in de projectmap + een Dockerfile.dev per app.
 * Geen geheimen in compose: de apps lezen hun eigen .env (bind mount); compose
 * zet enkel de adressen die in Docker anders zijn.
 */
export function composeFiles({
    appKey,
    backendPort,
    backendDevCommand,
    frontendPort
}: ComposeOptions): Record<string, string> {
    const polling = [
        'CHOKIDAR_USEPOLLING: "true"',
        'WATCHPACK_POLLING: "true"',
        'TSC_WATCHFILE: DynamicPriorityPolling'
    ]
    const lines = [
        '# Frontend en backend in Docker, op het gedeelde netwerk van projectx-postgres.',
        '# Starten: docker compose up --build   ·   stoppen: docker compose down',
        '# De database zelf is de gedeelde container projectx-postgres (npm run db:up in ./backend).',
        `name: ${appKey.replace(/_/g, '-')}`,
        '',
        'services:',
        '    backend:',
        '        build:',
        '            context: ./backend',
        '            dockerfile: Dockerfile.dev',
        '        ports:',
        `            - '${backendPort}:${backendPort}'`,
        '        environment:',
        '            # In Docker heet de database-host zoals de container.',
        `            DB_HOST: ${CONTAINER}`,
        '            DB_PORT: "5432"',
        ...polling.map(l => `            ${l}`),
        '        volumes:',
        '            - ./backend:/app',
        '            - /app/node_modules',
        '        networks:',
        `            - ${NETWORK}`,
        ...(frontendPort
            ? [
                  '',
                  '    frontend:',
                  '        build:',
                  '            context: ./frontend',
                  '            dockerfile: Dockerfile.dev',
                  '        ports:',
                  `            - '${frontendPort}:${frontendPort}'`,
                  '        environment:',
                  '            # Server components praten rechtstreeks met de backend-container;',
                  '            # de browser blijft NEXT_PUBLIC_API_URL (localhost) gebruiken.',
                  `            API_INTERNAL_URL: http://backend:${backendPort}`,
                  ...polling.map(l => `            ${l}`),
                  '        volumes:',
                  '            - ./frontend:/app',
                  '            - /app/node_modules',
                  '            - /app/.next',
                  '        depends_on:',
                  '            - backend',
                  '        networks:',
                  `            - ${NETWORK}`
              ]
            : []),
        '',
        'networks:',
        `    ${NETWORK}:`,
        '        external: true',
        ''
    ]
    return {
        'docker-compose.yml': lines.join('\n'),
        'backend/Dockerfile.dev': dockerfile(backendDevCommand),
        'backend/.dockerignore': DOCKERIGNORE,
        ...(frontendPort
            ? { 'frontend/Dockerfile.dev': dockerfile('npm run dev'), 'frontend/.dockerignore': DOCKERIGNORE }
            : {})
    }
}
