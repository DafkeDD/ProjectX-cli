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
    type DatabaseChoice
} from './steps/database/index.js'
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
    const frontend = await askFrontend()
    // Talen enkel als er een frontend komt; next-intl zelf is geen vraag.
    let i18n: I18nConfig | null = frontend === 'nextjs' ? await askI18n() : null
    // Eerst ProjectX-UI: die heeft een eigen icon set, dus daarna is het een vraag naar EXTRA iconen.
    const ui: UiChoice | null = frontend === 'nextjs' ? await askProjectxUi() : null
    const icons: IconLibrary | null = frontend === 'nextjs' ? await askIcons(ui !== null) : null
    const port: number | null = frontend === 'nextjs' ? await askPort() : null

    // ---- Backend -----------------------------------------------------------
    const backend = await askBackend()
    if (frontend === 'none' && backend === 'none') {
        p.cancel('Geen frontend en geen backend gekozen — niets te doen.')
        process.exit(0)
    }
    // Zonder frontend: de talen voor de foutmeldingen van de backend.
    if (backend !== 'none' && !i18n) i18n = await askI18n()
    const backendPort: number | null = backend !== 'none' ? await askBackendPort(port ? [port] : []) : null

    // ---- Database (hoort bij de backend) -----------------------------------
    const database: DatabaseChoice | null = backend !== 'none' ? await askDatabase(app.appName) : null

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
            ...(backend !== 'none' ? [`${pc.dim('Database')}  ${pc.cyan(databaseLabel(database))}`] : []),
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
    const dbSecrets = database ? await prepareDatabase(database) : null

    const apiUrl = backendPort ? `http://localhost:${backendPort}` : undefined
    if (i18n && icons && port)
        await scaffoldFrontend(frontend, projectDir, PACKAGE_MANAGER, { i18n, icons, app, port, ui, apiUrl })
    if (i18n && backendPort)
        await scaffoldBackend(backend, projectDir, PACKAGE_MANAGER, {
            appName: app.appName,
            port: backendPort,
            frontendUrl: `http://localhost:${port ?? 3000}`,
            i18n
        })
    if (database && dbSecrets && backendPort && backend !== 'none')
        await setupDatabase(database, dbSecrets, projectDir, BACKEND_DIR, PACKAGE_MANAGER, {
            backend,
            backendPort,
            backendDevCommand: backendDevCommand(backend, PACKAGE_MANAGER),
            frontendPort: frontend === 'nextjs' ? port : null
        })

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
    if (database) appendDatabaseReadme(projectDir, database, frontend === 'nextjs')
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
    if (database) {
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
