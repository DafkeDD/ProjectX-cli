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

/** Extra foutsleutels van de SSO-hub (inloggen, registreren, links). */
export const HUB_ERROR_KEYS = [
    'invalidCredentials',
    'emailNotVerified',
    'emailTaken',
    'invalidEmail',
    'weakPassword',
    'linkInvalid',
    'interactionExpired'
] as const
type HubErrorKey = (typeof HUB_ERROR_KEYS)[number]

export const HUB_ERRORS: Record<Locale, Record<HubErrorKey, string>> = {
    en: {
        invalidCredentials: 'Email address or password is incorrect.',
        emailNotVerified: 'Confirm your email address first — check your inbox.',
        emailTaken: 'An account with this email address already exists.',
        invalidEmail: 'This is not a valid email address.',
        weakPassword: 'Use at least 10 characters, with a letter and a number.',
        linkInvalid: 'This link is invalid or has expired.',
        interactionExpired: 'This sign-in took too long. Go back to the app and try again.'
    },
    nl: {
        invalidCredentials: 'E-mailadres of wachtwoord klopt niet.',
        emailNotVerified: 'Bevestig eerst je e-mailadres — kijk in je mailbox.',
        emailTaken: 'Er bestaat al een account met dit e-mailadres.',
        invalidEmail: 'Dit is geen geldig e-mailadres.',
        weakPassword: 'Gebruik minstens 10 tekens, met een letter en een cijfer.',
        linkInvalid: 'Deze link is ongeldig of verlopen.',
        interactionExpired: 'Het aanmelden duurde te lang. Ga terug naar de app en probeer opnieuw.'
    },
    fr: {
        invalidCredentials: 'Adresse e-mail ou mot de passe incorrect.',
        emailNotVerified: 'Confirmez d’abord votre adresse e-mail — vérifiez votre boîte de réception.',
        emailTaken: 'Un compte existe déjà avec cette adresse e-mail.',
        invalidEmail: 'Cette adresse e-mail n’est pas valide.',
        weakPassword: 'Utilisez au moins 10 caractères, avec une lettre et un chiffre.',
        linkInvalid: 'Ce lien n’est pas valide ou a expiré.',
        interactionExpired: 'La connexion a pris trop de temps. Retournez à l’application et réessayez.'
    },
    de: {
        invalidCredentials: 'E-Mail-Adresse oder Passwort ist falsch.',
        emailNotVerified: 'Bestätige zuerst deine E-Mail-Adresse — schau in dein Postfach.',
        emailTaken: 'Mit dieser E-Mail-Adresse gibt es bereits ein Konto.',
        invalidEmail: 'Das ist keine gültige E-Mail-Adresse.',
        weakPassword: 'Verwende mindestens 10 Zeichen, mit einem Buchstaben und einer Zahl.',
        linkInvalid: 'Dieser Link ist ungültig oder abgelaufen.',
        interactionExpired: 'Die Anmeldung hat zu lange gedauert. Geh zurück zur App und versuche es erneut.'
    },
    es: {
        invalidCredentials: 'El correo electrónico o la contraseña no son correctos.',
        emailNotVerified: 'Primero confirma tu correo electrónico: revisa tu bandeja de entrada.',
        emailTaken: 'Ya existe una cuenta con este correo electrónico.',
        invalidEmail: 'Este correo electrónico no es válido.',
        weakPassword: 'Usa al menos 10 caracteres, con una letra y un número.',
        linkInvalid: 'Este enlace no es válido o ha caducado.',
        interactionExpired: 'El inicio de sesión tardó demasiado. Vuelve a la aplicación e inténtalo de nuevo.'
    },
    it: {
        invalidCredentials: 'Indirizzo e-mail o password non corretti.',
        emailNotVerified: 'Conferma prima il tuo indirizzo e-mail: controlla la posta in arrivo.',
        emailTaken: 'Esiste già un account con questo indirizzo e-mail.',
        invalidEmail: 'Questo indirizzo e-mail non è valido.',
        weakPassword: 'Usa almeno 10 caratteri, con una lettera e un numero.',
        linkInvalid: 'Questo link non è valido o è scaduto.',
        interactionExpired: 'L’accesso ha richiesto troppo tempo. Torna all’app e riprova.'
    },
    pt: {
        invalidCredentials: 'O e-mail ou a palavra-passe estão incorretos.',
        emailNotVerified: 'Confirme primeiro o seu e-mail — verifique a sua caixa de entrada.',
        emailTaken: 'Já existe uma conta com este e-mail.',
        invalidEmail: 'Este e-mail não é válido.',
        weakPassword: 'Use pelo menos 10 caracteres, com uma letra e um número.',
        linkInvalid: 'Este link é inválido ou expirou.',
        interactionExpired: 'O início de sessão demorou demasiado. Volte à aplicação e tente novamente.'
    },
    pl: {
        invalidCredentials: 'Nieprawidłowy adres e-mail lub hasło.',
        emailNotVerified: 'Najpierw potwierdź swój adres e-mail — sprawdź skrzynkę.',
        emailTaken: 'Konto z tym adresem e-mail już istnieje.',
        invalidEmail: 'To nie jest prawidłowy adres e-mail.',
        weakPassword: 'Użyj co najmniej 10 znaków, w tym litery i cyfry.',
        linkInvalid: 'Ten link jest nieprawidłowy lub wygasł.',
        interactionExpired: 'Logowanie trwało zbyt długo. Wróć do aplikacji i spróbuj ponownie.'
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
export function i18nFiles(locales: Locale[], defaultLocale: Locale, hub = false): Record<string, string> {
    const keys: readonly string[] = hub ? [...ERROR_KEYS, ...HUB_ERROR_KEYS] : ERROR_KEYS
    const messages = locales
        .map(l => {
            const texts = hub ? { ...ERRORS[l], ...HUB_ERRORS[l] } : ERRORS[l]
            return `    ${l}: ${JSON.stringify(texts, null, 4).replace(/\n/g, '\n    ')}`
        })
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
export type ErrorKey = ${keys.map(k => `'${k}'`).join(' | ')}

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
