import type { Locale } from '../i18n.js'

/**
 * Gedeelde bronbestanden voor beide backends (NestJS en Express):
 * .env, env.ts, meertalige foutmeldingen, health-info.
 */

export const DEFAULT_BACKEND_PORT = 4000

export const ERROR_KEYS = [
    'badRequest',
    'unauthorized',
    'forbidden',
    'notFound',
    'conflict',
    'tooManyRequests',
    'internal'
] as const
type ErrorKey = (typeof ERROR_KEYS)[number]

const ERRORS: Record<Locale, Record<ErrorKey, string>> = {
    en: {
        badRequest: 'The request is invalid.',
        unauthorized: 'You need to sign in first.',
        forbidden: 'You do not have permission to do this.',
        notFound: 'This resource was not found.',
        conflict: 'This conflicts with existing data.',
        tooManyRequests: 'Too many requests. Please try again later.',
        internal: 'Something went wrong on our side. Please try again later.'
    },
    nl: {
        badRequest: 'Het verzoek is ongeldig.',
        unauthorized: 'Je moet eerst aanmelden.',
        forbidden: 'Je hebt geen toestemming om dit te doen.',
        notFound: 'Dit werd niet gevonden.',
        conflict: 'Dit botst met bestaande gegevens.',
        tooManyRequests: 'Te veel verzoeken. Probeer het later opnieuw.',
        internal: 'Er ging iets mis bij ons. Probeer het later opnieuw.'
    },
    fr: {
        badRequest: 'La requête n’est pas valide.',
        unauthorized: 'Vous devez d’abord vous connecter.',
        forbidden: 'Vous n’avez pas l’autorisation de faire ceci.',
        notFound: 'Cette ressource est introuvable.',
        conflict: 'Ceci est en conflit avec des données existantes.',
        tooManyRequests: 'Trop de requêtes. Réessayez plus tard.',
        internal: 'Une erreur s’est produite de notre côté. Réessayez plus tard.'
    },
    de: {
        badRequest: 'Die Anfrage ist ungültig.',
        unauthorized: 'Bitte melde dich zuerst an.',
        forbidden: 'Du hast keine Berechtigung dafür.',
        notFound: 'Diese Ressource wurde nicht gefunden.',
        conflict: 'Das steht im Konflikt mit vorhandenen Daten.',
        tooManyRequests: 'Zu viele Anfragen. Bitte versuche es später erneut.',
        internal: 'Bei uns ist etwas schiefgelaufen. Bitte versuche es später erneut.'
    },
    es: {
        badRequest: 'La solicitud no es válida.',
        unauthorized: 'Primero debes iniciar sesión.',
        forbidden: 'No tienes permiso para hacer esto.',
        notFound: 'No se encontró este recurso.',
        conflict: 'Esto entra en conflicto con datos existentes.',
        tooManyRequests: 'Demasiadas solicitudes. Inténtalo más tarde.',
        internal: 'Algo salió mal de nuestro lado. Inténtalo más tarde.'
    },
    it: {
        badRequest: 'La richiesta non è valida.',
        unauthorized: 'Devi prima accedere.',
        forbidden: 'Non hai i permessi per farlo.',
        notFound: 'Risorsa non trovata.',
        conflict: 'Questo è in conflitto con dati esistenti.',
        tooManyRequests: 'Troppe richieste. Riprova più tardi.',
        internal: 'Qualcosa è andato storto da parte nostra. Riprova più tardi.'
    },
    pt: {
        badRequest: 'O pedido é inválido.',
        unauthorized: 'Tem de iniciar sessão primeiro.',
        forbidden: 'Não tem permissão para fazer isto.',
        notFound: 'Este recurso não foi encontrado.',
        conflict: 'Isto entra em conflito com dados existentes.',
        tooManyRequests: 'Demasiados pedidos. Tente novamente mais tarde.',
        internal: 'Algo correu mal do nosso lado. Tente novamente mais tarde.'
    },
    pl: {
        badRequest: 'Żądanie jest nieprawidłowe.',
        unauthorized: 'Najpierw musisz się zalogować.',
        forbidden: 'Nie masz uprawnień, aby to zrobić.',
        notFound: 'Nie znaleziono tego zasobu.',
        conflict: 'To koliduje z istniejącymi danymi.',
        tooManyRequests: 'Zbyt wiele żądań. Spróbuj ponownie później.',
        internal: 'Coś poszło nie tak po naszej stronie. Spróbuj ponownie później.'
    }
}

export interface EnvValues {
    appName: string
    port: number
    frontendUrl: string
}

export function envFile({ appName, port, frontendUrl }: EnvValues, example: boolean): string {
    return `# ${example ? 'Voorbeeld — kopieer naar .env. Dit bestand gaat WEL mee in git.' : 'Lokale instellingen — gaat NIET mee in git (zie .env.example).'}
#
# In de code altijd via src/env.ts, nooit process.env rechtstreeks.

# Naam van de app (health-endpoint, logs).
APP_NAME="${appName}"

# Poort van de API.
PORT=${port}

# Adres van de frontend: enkel die mag de API aanroepen (CORS).
FRONTEND_URL="${frontendUrl}"
`
}

/** src/env.ts — laadt .env zonder extra package (Node ≥ 20.12). */
export const ENV_TS = `import { existsSync } from 'node:fs'

// .env laden zonder extra package. Waarden die al in de omgeving staan
// (bv. in Docker of CI) blijven voorgaan.
if (existsSync('.env')) process.loadEnvFile('.env')

/**
 * Alle instellingen op één plek, met terugvalwaarden.
 * Gebruik overal \`env.*\` — nooit process.env rechtstreeks.
 */
export const env = {
    appName: process.env.APP_NAME || 'App',
    port: Number(process.env.PORT) || ${DEFAULT_BACKEND_PORT},
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
} as const
`

/** src/version.ts — versie uit package.json (werkt vanuit src/ én dist/). */
export const VERSION_TS = `import { readFileSync } from 'node:fs'

export const version: string = (
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version
`

/** src/i18n/*.ts — talen, vertaalde foutmeldingen en de taal van een verzoek bepalen. */
export function i18nFiles(locales: Locale[], defaultLocale: Locale): Record<string, string> {
    const messages = locales
        .map(l => `    ${l}: ${JSON.stringify(ERRORS[l], null, 4).replace(/\n/g, '\n    ')}`)
        .join(',\n')

    return {
        'locales.ts': `/**
 * Dezelfde talen als de frontend (src/i18n/locales.ts daar).
 * Een taal toevoegen: hier én in messages.ts.
 */
export const locales = [${locales.map(l => `'${l}'`).join(', ')}] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = '${defaultLocale}'
`,
        'messages.ts': `import type { Locale } from './locales.js'

/** Sleutels voor foutmeldingen. Een nieuwe sleutel: in ELKE taal hieronder. */
export type ErrorKey = ${ERROR_KEYS.map(k => `'${k}'`).join(' | ')}

export const messages: Record<Locale, Record<ErrorKey, string>> = {
${messages}
}
`,
        'i18n.ts': `import { defaultLocale, locales, type Locale } from './locales.js'
import { messages, type ErrorKey } from './messages.js'

export type { ErrorKey, Locale }

const isLocale = (value: string | undefined): value is Locale =>
    value !== undefined && (locales as readonly string[]).includes(value)

export const isErrorKey = (value: unknown): value is ErrorKey =>
    typeof value === 'string' && value in messages[defaultLocale]

/**
 * Taal van een verzoek: eerst de cookie NEXT_LOCALE (dezelfde als de
 * frontend zet), dan Accept-Language, dan de standaardtaal.
 */
export function resolveLocale(headers: { cookie?: string; 'accept-language'?: string }): Locale {
    const cookie = headers.cookie?.match(/(?:^|;\\s*)NEXT_LOCALE=([^;]+)/)?.[1]
    if (isLocale(cookie)) return cookie

    for (const part of headers['accept-language']?.split(',') ?? []) {
        const code = part.split(';')[0]?.trim().slice(0, 2).toLowerCase()
        if (isLocale(code)) return code
    }
    return defaultLocale
}

/** Vertaalde foutmelding. */
export const t = (locale: Locale, key: ErrorKey): string => messages[locale][key]

/** Standaardsleutel per HTTP-status. */
export function errorKeyFor(status: number): ErrorKey {
    switch (status) {
        case 400:
        case 422:
            return 'badRequest'
        case 401:
            return 'unauthorized'
        case 403:
            return 'forbidden'
        case 404:
            return 'notFound'
        case 409:
            return 'conflict'
        case 429:
            return 'tooManyRequests'
        default:
            return status < 500 ? 'badRequest' : 'internal'
    }
}
`
    }
}

/** Regels voor AI-assistenten in de backend (AGENTS.md; CLAUDE.md verwijst ernaar). */
export function backendAgents(kind: 'nestjs' | 'express', locales: Locale[]): string {
    const nest = kind === 'nestjs'
    return `<!-- BEGIN:projectx-rules -->

# Projectregels backend (niet verwijderen)

${nest ? 'NestJS 12 (ESM)' : 'Node.js + Express 5 (ESM, TypeScript)'} — aangemaakt door projectx-cli.

## Instellingen

- Alles uit \`.env\` via \`src/env.ts\` (\`env.appName\`, \`env.port\`, \`env.frontendUrl\`). Nooit \`process.env\` rechtstreeks.
- Nieuwe instelling = in \`.env\`, \`.env.example\` én \`src/env.ts\`. Geheimen nooit in \`.env.example\`.
- Imports tussen eigen bestanden eindigen op \`.js\` (ESM), ook in TypeScript.

## Foutmeldingen — altijd vertaald

- Talen: ${locales.map(l => `\`${l}\``).join(', ')} (zelfde als de frontend). De taal komt uit de cookie \`NEXT_LOCALE\`, dan
  \`Accept-Language\`.
- Antwoord bij een fout: \`{ statusCode, error: '<sleutel>', message: '<vertaald>' }\`.
- ${
        nest
            ? "Gooi Nest-excepties: `throw new NotFoundException()`, of met eigen sleutel `throw new BadRequestException({ key: 'conflict' })`. De `I18nExceptionFilter` vertaalt."
            : "Gooi `new HttpError(404)` of met eigen sleutel `new HttpError(409, 'conflict')` (src/errors.ts). De error-middleware vertaalt; async fouten vangt Express 5 zelf op."
    }
- Nieuwe foutsleutel: in \`src/i18n/messages.ts\`, in **elke** taal. Nooit Nederlandse/Engelse tekst hard in een antwoord.

## API

- \`GET /health\` → \`{ status, app, version, time }\` — niet verwijderen (de frontend toont hiermee of de API draait).
- CORS: enkel \`env.frontendUrl\`, met credentials (cookies).
${
    nest
        ? '- Nieuwe onderdelen met de Nest CLI: `npx nest g resource <naam>` (module + controller + service).\n- Lint: `npm run lint` (oxlint). Tests: `npm test` (vitest).'
        : '- Nieuwe routes als `Router` in `src/routes/<naam>.ts`, gekoppeld in `src/index.ts`.\n- Lint: `npm run lint` (ESLint + typescript-eslint). Types: `npm run typecheck`.'
}

## Code-stijl — Prettier

- Na elke wijziging: \`npm run format\`. De \`.prettierrc\` is de vaste ProjectX-stijl — niet aanpassen.

<!-- END:projectx-rules -->
`
}
