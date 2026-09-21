#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { askFrontend, checkFrontend, frontendLabel, scaffoldFrontend, FRONTEND_DIR } from './steps/frontend.js'
import { askI18n, i18nLabel, type I18nConfig } from './steps/i18n.js'
import { askIcons, iconsLabel, type IconLibrary } from './steps/icons.js'
import { askAppName, askPort } from './steps/env.js'
import { askProjectxUi, uiLabel, type UiChoice } from './steps/ui.js'
import { askGithub, githubLabel, pushToGithub, writeRootFiles } from './steps/github.js'
import {
    askBackend,
    askBackendPort,
    backendDevCommand,
    backendLabel,
    checkBackend,
    scaffoldBackend,
    BACKEND_DIR
} from './steps/backend/index.js'
import { setupVsCode } from './steps/editor.js'
import {
    appendDatabaseReadme,
    askDatabase,
    databaseLabel,
    prepareDatabase,
    setupDatabase,
    askHubDatabase,
    hubDatabaseLabel,
    prepareHubDatabase,
    type DatabaseChoice
} from './steps/database/index.js'
import { applyHubBackend, applyHubFrontend, askHubAdmin, askSso, type HubAdmin } from './steps/hub/index.js'
import {
    applySsoBackend,
    applySsoFrontend,
    askHubConnection,
    registerWithHub,
    setupSso,
    ssoLabel,
    type HubConnection,
    type RegisteredApp
} from './steps/sso/index.js'
import { formatAll } from './utils/prettier.js'
import { orCancel } from './utils/prompt.js'
import { isGlobalInstall } from './utils/guard.js'
import type { PackageManager } from './types.js'

const PACKAGE_MANAGER: PackageManager = 'npm'

/** Versie uit package.json — zo zie je meteen of npx een oude kopie draait. */
const VERSION: string = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

async function main(): Promise<void> {
    if (isGlobalInstall()) {
        console.error(
            '\n  projectx-cli is globaal geïnstalleerd — dat is niet de bedoeling.\n' +
                '  Verwijder hem met:  npm uninstall -g projectx-cli\n' +
                '  en draai hem per project:  npx --allow-git=root github:DafkeDD/ProjectX-cli\n'
        )
        process.exit(1)
    }

    console.clear()
    p.intro(`${pc.bgCyan(pc.black(' projectx-cli '))} ${pc.dim(`v${VERSION}`)}`)

    // Alles komt in de map waar je het commando draait: per project.
    const projectDir = process.cwd()

    // ---- Vragen (stap voor stap) -------------------------------------------
    const app = await askAppName(projectDir)
    // Bovenaan: wordt dit een SSO-hub (OIDC-server)?
    const sso = await askSso()
    const isHub = sso === 'hub'
    const isConnected = sso === 'connect'
    // Aansluiten op een bestaande hub: eerst kijken of ze bereikbaar is.
    const connection: HubConnection | null = isConnected ? await askHubConnection() : null
    if (isHub)
        p.log.info(
            `SSO-hub: ${pc.cyan('Next.js + ProjectX-UI')} (frontend) · ${pc.cyan('NestJS + oidc-provider')} (backend) · ${pc.cyan('PostgreSQL')}`
        )

    const frontend = isHub ? 'nextjs' : await askFrontend()
    // Talen enkel als er een frontend komt; next-intl zelf is geen vraag.
    let i18n: I18nConfig | null = frontend === 'nextjs' ? await askI18n() : null
    // Eerst ProjectX-UI: die heeft een eigen icon set, dus daarna is het een vraag naar EXTRA iconen.
    // De hub gebruikt altijd ProjectX-UI (alle componenten) en geen extra iconen.
    const ui: UiChoice | null = isHub ? { all: true } : frontend === 'nextjs' ? await askProjectxUi() : null
    const icons: IconLibrary | null = isHub ? 'none' : frontend === 'nextjs' ? await askIcons(ui !== null) : null
    const port: number | null = frontend === 'nextjs' ? await askPort() : null

    // ---- Backend -----------------------------------------------------------
    const backend = isHub ? 'nestjs' : await askBackend(!isConnected)
    if (frontend === 'none' && backend === 'none') {
        p.cancel('Geen frontend en geen backend gekozen — niets te doen.')
        process.exit(0)
    }
    // Zonder frontend: de talen voor de foutmeldingen van de backend.
    if (backend !== 'none' && !i18n) i18n = await askI18n()
    const backendPort: number | null = backend !== 'none' ? await askBackendPort(port ? [port] : []) : null

    // ---- Database (hoort bij de backend) -----------------------------------
    const database: DatabaseChoice | null = isHub
        ? await askHubDatabase()
        : backend !== 'none'
          ? await askDatabase(app.appName, isConnected)
          : null
    const hubAdmin: HubAdmin | null = isHub ? await askHubAdmin() : null

    // Helemaal als laatste: naar GitHub?
    const github = await askGithub(app.appName)

    // ---- Controles ---------------------------------------------------------
    const problems = [checkFrontend(frontend, projectDir), checkBackend(backend, projectDir)].filter(
        (x): x is string => !!x
    )
    if (problems.length > 0) {
        p.cancel(problems.join('\n'))
        process.exit(1)
    }

    // ---- Overzicht ---------------------------------------------------------
    p.note(
        [
            `${pc.dim('App     ')}  ${pc.cyan(app.appName)}`,
            `${pc.dim('Locatie ')}  ${pc.cyan(projectDir)}`,
            `${pc.dim('Frontend')}  ${pc.cyan(frontendLabel(frontend))}`,
            ...(i18n ? [`${pc.dim('Talen   ')}  ${pc.cyan(i18nLabel(i18n))}`] : []),
            ...(icons ? [`${pc.dim('Iconen  ')}  ${pc.cyan(iconsLabel(icons))}`] : []),
            ...(frontend === 'nextjs'
                ? [`${pc.dim('UI      ')}  ${pc.cyan(ui ? uiLabel(ui) : 'eigen componenten')}`]
                : []),
            ...(port ? [`${pc.dim('Poort   ')}  ${pc.cyan(String(port))}${pc.dim('  in frontend/.env')}`] : []),
            `${pc.dim('Backend ')}  ${pc.cyan(backendLabel(backend, backendPort))}`,
            ...(backend !== 'none'
                ? [
                      `${pc.dim('Database')}  ${pc.cyan(isHub && database ? hubDatabaseLabel(database) : databaseLabel(database))}`
                  ]
                : []),
            ...(isHub && hubAdmin
                ? [`${pc.dim('SSO-hub ')}  ${pc.cyan(`OIDC-server · beheerder ${hubAdmin.email}`)}`]
                : []),
            ...(connection ? [`${pc.dim('SSO     ')}  ${pc.cyan(ssoLabel(connection))}`] : []),
            `${pc.dim('GitHub  ')}  ${pc.cyan(githubLabel(github))}`,
            `${pc.dim('Manager ')}  ${pc.cyan(PACKAGE_MANAGER)}`
        ].join('\n'),
        'Overzicht'
    )

    const go = orCancel(await p.confirm({ message: 'Zo installeren?', initialValue: true }))
    if (!go) {
        p.cancel('Niets geïnstalleerd.')
        process.exit(0)
    }

    // ---- Installeren -------------------------------------------------------
    // Eerst de database: een probleem daar zien we liever vóór er iets geïnstalleerd is.
    const publicUrl = port ? `http://localhost:${port}` : `http://localhost:${backendPort}`

    const dbSecrets = database && !isHub ? await prepareDatabase(database) : null
    const hubDbPassword = database && isHub ? await prepareHubDatabase(database) : null

    // Pas aansluiten bij de hub als de database er staat: zo verbruiken we het
    // registratietoken niet voor een installatie die toch niet lukt.
    let registered: RegisteredApp | null = null
    if (connection && database && backendPort) {
        const s = p.spinner()
        s.start('App aansluiten bij de hub')
        try {
            registered = await registerWithHub(connection, {
                appKey: database.appKey,
                appName: app.appName,
                publicUrl,
                webhookUrl: `http://localhost:${backendPort}/hub/events`
            })
        } catch (error) {
            s.stop('Aansluiten mislukt')
            p.cancel(error instanceof Error ? error.message : String(error))
            process.exit(1)
        }
        s.stop(`Aangesloten bij de hub ${pc.dim(`client_id ${registered.clientId}`)}`)
    }

    const apiUrl = backendPort ? `http://localhost:${backendPort}` : undefined
    // De hub-frontend praat met zichzelf (hij stuurt /api en /oidc door naar de backend).
    const frontendApiUrl = (isHub || isConnected) && port ? `http://localhost:${port}` : apiUrl
    if (i18n && icons && port) {
        await scaffoldFrontend(frontend, projectDir, PACKAGE_MANAGER, {
            i18n,
            icons,
            app,
            port,
            ui,
            apiUrl: frontendApiUrl
        })
        if (isHub && backendPort) {
            applyHubFrontend(path.join(projectDir, FRONTEND_DIR), i18n, backendPort)
            await formatAll(PACKAGE_MANAGER, path.join(projectDir, FRONTEND_DIR))
        }
        if (isConnected && backendPort) {
            applySsoFrontend(path.join(projectDir, FRONTEND_DIR), i18n, backendPort, ui !== null)
            await formatAll(PACKAGE_MANAGER, path.join(projectDir, FRONTEND_DIR))
        }
    }
    if (i18n && backendPort)
        await scaffoldBackend(backend, projectDir, PACKAGE_MANAGER, {
            appName: app.appName,
            port: backendPort,
            frontendUrl: `http://localhost:${port ?? 3000}`,
            i18n
        })
    let firstToken = ''
    if (isHub && database && hubDbPassword && hubAdmin && i18n && backendPort && port) {
        firstToken = await applyHubBackend(path.join(projectDir, BACKEND_DIR), PACKAGE_MANAGER, {
            i18n,
            db: database,
            dbPassword: hubDbPassword,
            admin: hubAdmin,
            frontendUrl: `http://localhost:${port}`,
            port: backendPort
        })
    }
    if (database && dbSecrets && backendPort && backend !== 'none')
        await setupDatabase(database, dbSecrets, projectDir, BACKEND_DIR, PACKAGE_MANAGER, {
            backend,
            backendPort,
            backendDevCommand: backendDevCommand(backend, PACKAGE_MANAGER),
            frontendPort: frontend === 'nextjs' ? port : null
        })

    // Inloggen via de hub: pas na de databaselaag (die zet src/db en migreert).
    if (connection && registered && backendPort && backend !== 'none') {
        await setupSso(projectDir, BACKEND_DIR, PACKAGE_MANAGER, {
            backend,
            issuer: connection.issuer,
            app: registered,
            publicUrl
        })
    }

    // ---- VS Code (projectmap) ----------------------------------------------
    const vscode = setupVsCode(projectDir, {
        eslintDirs: [...(frontend === 'nextjs' ? [FRONTEND_DIR] : []), ...(backend === 'express' ? [BACKEND_DIR] : [])],
        tsDir: frontend === 'nextjs' ? FRONTEND_DIR : BACKEND_DIR,
        oxlint: backend === 'nestjs',
        tailwind: frontend === 'nextjs'
    })
    p.log.info(
        vscode
            ? `VS Code-instellingen in ./.vscode ${pc.dim('(open de projectmap in VS Code en installeer de aanbevolen extensies)')}`
            : `./.vscode bestond al ${pc.dim('— niet overschreven')}`
    )

    // ---- Projectmap + GitHub -----------------------------------------------
    writeRootFiles(projectDir, app.appName, [
        ...(frontend === 'nextjs' ? [{ dir: FRONTEND_DIR, run: `${PACKAGE_MANAGER} run dev` }] : []),
        ...(backend !== 'none' ? [{ dir: BACKEND_DIR, run: backendDevCommand(backend, PACKAGE_MANAGER) }] : [])
    ])
    if (database && !isHub) appendDatabaseReadme(projectDir, database, frontend === 'nextjs')
    await pushToGithub(github, projectDir)

    // ---- Volgende stappen --------------------------------------------------
    const steps: string[] = []
    if (frontend === 'nextjs') {
        steps.push(`cd ${FRONTEND_DIR} && ${PACKAGE_MANAGER} run dev   ${pc.dim(`http://localhost:${port}`)}`)
    }
    if (backend !== 'none') {
        steps.push(
            `cd ${BACKEND_DIR} && ${backendDevCommand(backend, PACKAGE_MANAGER)}   ${pc.dim(`http://localhost:${backendPort}/health`)}`
        )
    }
    if (isHub && port) {
        steps.push(`${pc.dim('Aanmelden:')} http://localhost:${port}/login   ${pc.dim(`(${hubAdmin?.email})`)}`)
        steps.push(`${pc.dim('OIDC-issuer:')} http://localhost:${port}/oidc`)
        if (firstToken)
            steps.push(`${pc.dim('Eerste registratietoken:')} ${firstToken}   ${pc.dim('(ook in het beheerpaneel)')}`)
    } else if (isConnected && port) {
        steps.push(`${pc.dim('Aanmelden:')} http://localhost:${port}   ${pc.dim('(via de hub)')}`)
        steps.push(`${pc.dim('Beschermde pagina:')} http://localhost:${port}/dashboard`)
    } else if (database) {
        steps.push(
            `cd ${BACKEND_DIR} && ${PACKAGE_MANAGER} run db:tenant:create -- "Mijn organisatie"   ${pc.dim('eerste tenant')}`
        )
        if (database.mode === 'docker') steps.push(`docker compose up --build   ${pc.dim('of alles in Docker')}`)
    }
    if (steps.length > 0) p.note(steps.join('\n'), 'Volgende stappen')

    p.outro(`Klaar in ${pc.cyan(path.basename(projectDir))}.`)
}

main().catch((err: unknown) => {
    p.cancel(err instanceof Error ? err.message : String(err))
    process.exit(1)
})
