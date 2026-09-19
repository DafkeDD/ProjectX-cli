# ProjectX-cli

Interactieve CLI die stap voor stap een project opzet in de **huidige map**.

## Gebruik — altijd per project

```bash
mkdir mijn-project
cd mijn-project
npx --allow-git=root github:DafkeDD/ProjectX-cli
```

> **Waarom `--allow-git=root`?** Sinds npm 12 staat het ophalen van packages uit git standaard uit (`EALLOWGIT`). Met
> `root` sta je dat enkel toe voor het pakket dat je zelf opvraagt — niet voor eventuele git-dependencies daaronder. Het
> is een vlag op dit ene commando, geen globale instelling.

De CLI wordt **niet** globaal geïnstalleerd. `npx` haalt hem tijdelijk op vanaf GitHub, bouwt hem en draait hem in de
map waar je staat. Een `npm i -g` wordt bewust geweigerd (`scripts/no-global.cjs`, en bij het opstarten nog eens
gecontroleerd in `src/utils/guard.ts`).

Wil je een vaste versie? Gebruik een tag of branch:

```bash
npx --allow-git=root github:DafkeDD/ProjectX-cli#v0.1.0
```

## De stappen

| #   | Stap     | Keuzes                                                                                       | Resultaat                        |
| --- | -------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Frontend | Next.js + Tailwind CSS + next-intl (talen naar keuze) + light/dark + iconen (keuze), of geen | `./frontend`                     |
| 2   | Backend  | NestJS (standaard) of Node.js + Express 5, of geen                                           | `./backend`                      |
| ∞   | GitHub   | pushen? + projectnaam + privé/openbaar                                                       | repo op GitHub, of de commando's |

### 1. Frontend

- **Next.js** — altijd de laatste versie via `create-next-app@latest`
- **Tailwind CSS** — na de installatie expliciet naar `@latest` gezet (`tailwindcss` + `@tailwindcss/postcss`)
- TypeScript, ESLint, App Router, `src/`-map, import-alias `@/*`
- **Turbopack** — standaard-bundler sinds Next.js 16 (`next dev` / `next build`)
- Geen eigen git-repo in `./frontend`; git hoort op projectniveau
- **next-intl, altijd** — dat zelf is geen vraag. Wel vraagt de CLI:
    - **welke talen** (aanvinken met spatie): English, Nederlands, Français, Deutsch, Español, Italiano, Português,
      Polski — voorgeselecteerd: `en`, `nl`, `fr`, `de`
    - **welke taal de standaard is** (voorstel: Engels)
- de taal staat **nooit in de URL** (`localePrefix: 'never'`); de keuze zit in de cookie `NEXT_LOCALE`. `/nl/…` wordt
  doorgestuurd naar `/…`
- zonder cookie kiest next-intl op basis van de browsertaal
- vertalingen in `messages/<taal>.json`, één per gekozen taal — zichtbare tekst nooit hard coderen
- `src/proxy.ts` (de opvolger van `middleware.ts` sinds Next.js 16), `src/i18n/` (routing, request, navigation,
  actions), `src/app/[locale]/` en een `LocaleSwitcher`-component

- **Light/dark mode, altijd** — geen vraag:
    - class-based (Tailwind 4 `@custom-variant dark`), voorkeur in de cookie `theme` — nooit localStorage
    - de server zet de class al op `<html>`, dus geen flits bij het laden

        | cookie           | `<html>`               | resultaat                    |
        | ---------------- | ---------------------- | ---------------------------- |
        | `light`          | geen class             | altijd licht                 |
        | `dark`           | `class="dark"`         | altijd donker                |
        | `system` of geen | `class="theme-system"` | volgt `prefers-color-scheme` |

    - design tokens in `globals.css` (licht + donker) → utility classes als `bg-background`, `text-foreground`,
      `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`. Gebruik die i.p.v. `bg-white`/`text-black`,
      anders breekt dark mode
    - `useTheme()` geeft `theme`, `resolvedTheme`, `setTheme()` en `cycleTheme()`
    - `ThemeToggle` wisselt licht → donker → systeem, met iconen uit `react-icons` en vertaalde labels

- **Vertaalde 404-pagina** — elke onbekende URL (`[locale]/[...rest]`) toont `not-found.tsx` in de taal van de bezoeker,
  met een knop terug naar de startpagina. Met ProjectX-UI: `EmptyState` + `Button` + `Icon`; zonder: Tailwind + tokens.
  Teksten in `messages/<taal>.json` onder `NotFound`. Ook een ontbrekend bestand (`/logo.png`) krijgt die pagina, in de
  taal uit de cookie.
- **Iconen — vraag: welke?** (komt ná de ProjectX-UI-vraag)

    | Keuze        | Packages (altijd `@latest`)                                                                                                         |
    | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
    | React Icons  | `react-icons`                                                                                                                       |
    | Font Awesome | `@fortawesome/react-fontawesome`, `fontawesome-svg-core`, `free-solid-svg-icons`, `free-regular-svg-icons`, `free-brands-svg-icons` |
    | Beide        | alles hierboven                                                                                                                     |

    Met ProjectX-UI wordt het _Wil je naast de ProjectX-UI-iconen nog extra iconen?_ — standaard **Nee** (enkel `Icon`
    uit ProjectX-UI); de AI-regels zeggen dan: eerst `Icon`, pas daarna de extra library.

    Bij Font Awesome zet de CLI in `src/app/layout.tsx` de CSS-import en `config.autoAddCss = false` (de aanbevolen
    Next.js-setup, anders flitsen de iconen groot bij het laden). De `ThemeToggle` gebruikt React Icons als die er zijn,
    anders Font Awesome.

    ```tsx
    // React Icons
    import { MdHome } from 'react-icons/md'
    ;<MdHome size={20} />

    // Font Awesome
    import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
    import { faHouse } from '@fortawesome/free-solid-svg-icons'
    ;<FontAwesomeIcon icon={faHouse} />
    ```

- **De talenlijst staat op één plek:** `src/i18n/locales.ts` (talen, standaardtaal, namen voor de taalkiezer). Routing,
  redirects in `next.config.ts` en de `LocaleSwitcher` lezen daaruit. Bij één taal wordt de taalkiezer verborgen.
- **`.env` met app-naam en poort** — de CLI vraagt beide (naam: standaard de mapnaam; poort: de eerste vrije vanaf
  3000):

    | Variabele              | Gebruikt voor                                                 | In de code    |
    | ---------------------- | ------------------------------------------------------------- | ------------- |
    | `NEXT_PUBLIC_APP_NAME` | paginatitel, beschrijving (`{appName}` in `messages/`), de UI | `env.appName` |
    | `PORT`                 | `npm run dev` en `npm run start`                              | `env.port`    |

    Alles loopt via `src/lib/env.ts` (met terugvalwaarden). Next.js leest `PORT` zelf niet uit `.env`, daarom starten
    `dev` en `start` via `scripts/next.mjs`, dat `.env` laadt met Next's eigen loader. `.env` gaat niet mee in git,
    `.env.example` wel. Subpagina's krijgen als titel `Pagina · app-naam`.

- **ESLint + Prettier botsen nooit** — `eslint-config-prettier` staat als laatste in `eslint.config.mjs`.
- **VS Code** — in de projectmap (niet in `./frontend`): `.vscode/settings.json` formatteert bij opslaan met Prettier,
  voert ESLint-fixes uit en herkent Tailwind v4; `.vscode/extensions.json` raadt Prettier, ESLint en Tailwind CSS
  IntelliSense aan. Een bestaande `.vscode` wordt niet overschreven.
- **ProjectX-UI — drie vragen** ([DafkeDD/ProjectX-ui](https://github.com/DafkeDD/ProjectX-ui))
    1. _Wil je ProjectX-UI installeren?_
    2. _Welke componenten?_ — **Alles** of **Zelf kiezen**
    3. bij _Zelf kiezen_: aanvinken per categorie (Basis, Formulieren, Overlays, ...). `card`, `badge`, `segmented`,
       `section-header`, `separator`, `icon`, `empty-state` en `button` staan aan en komen er altijd bij — de
       startpagina gebruikt ze. Afhankelijkheden (bv. `button` → `spinner`) komen automatisch mee.
    - **Met ProjectX-UI gebruikt de app ENKEL ProjectX-UI-componenten**: de startpagina is een `Card` met `Badge`,
      `SectionHeader` en `Separator`; de taalkiezer en de themaknop zijn `Segmented` (+ `Icon`). Tailwind enkel voor
      layout. Dat staat ook zo in de AI-regels.
    - componenten als broncode in `src/components/ui/`, via `import { Button } from '@/components/ui'`
    - opgehaald over HTTPS van GitHub, **niet** als git-package (anders faalt elke `npm install` op npm 12)
    - `globals.css` neemt de design tokens over (`bg-card`, `text-muted-foreground`, ... wijzen naar de UI-tokens); de
      UI-CSS zit in de cascade-laag `components`
    - lettertypes Hanken Grotesk + JetBrains Mono via `next/font`; `data-theme` op `<html>` volgt licht/donker
    - later: `npm run ui -- list`, `npm run ui -- add <naam>`, `npm run ui -- add --all --force` (daarna Prettier)
    - React Compiler-lintregels voor `src/components/ui/**` op waarschuwing (oplossen in de UI-repo)
    - niet bereikbaar? Dan vraagt de CLI of je zonder verder wil
- **Prettier, altijd — met de vaste ProjectX-settings.** `templates/prettierrc.json` wordt ongewijzigd gekopieerd als
  `.prettierrc` (4 spaties, enkele quotes, geen puntkomma's, 120 tekens, `prettier-plugin-tailwindcss`, JSON met 4
  spaties). Huisstijl aanpassen = alleen dat ene bestand aanpassen. Scripts: `npm run format` en `npm run format:check`.
  Na de installatie wordt alles meteen geformatteerd.
- **Regels voor AI-assistenten, altijd** — volgen je keuzes (talen, iconen):
    - `PROJECT-RULES.md`: de volledige regels met voorbeelden, voor mensen
    - `AGENTS.md`: een beknopt blok tussen `<!-- BEGIN/END:projectx-rules -->`, dat Claude Code, Copilot, Cursor, Codex,
      ... automatisch lezen (`CLAUDE.md` verwijst naar `@AGENTS.md`)
    - regels: i18n (nooit hard gecodeerde tekst), UI-componenten zelf bouwen (geen shadcn/MUI/...), alleen de gekozen
      icon-library, kleuren via tokens (dark mode), Prettier + ESLint

```
frontend/
├─ PROJECT-RULES.md     regels (mensen)
├─ AGENTS.md            regels (AI-assistenten) + blok van Next.js
├─ .prettierrc
├─ messages/            één .json per gekozen taal
└─ src/
   ├─ proxy.ts          next-intl middleware
   ├─ i18n/             locales · routing · request · navigation · actions
   ├─ components/       LocaleSwitcher.tsx
   │  └─ theme/         theme.ts · actions.ts · ThemeProvider · ThemeToggle
   └─ app/
      ├─ globals.css    tokens licht/donker + Tailwind-mapping
      ├─ layout.tsx     <html lang class> + fonts + ThemeProvider
      └─ [locale]/      layout.tsx · page.tsx
```

Bestaat `./frontend` al en is hij niet leeg, dan stopt de CLI voor hij iets doet.

### 2. Backend

Vragen: _Welke backend?_ — **NestJS** (bovenaan) · **Node.js + Express** · geen — en _Op welke poort?_ (eerste vrije
vanaf 4000, nooit die van de frontend). Kies je geen frontend, dan vraagt de CLI hier de talen.

|            | NestJS                                 | Node.js + Express                                   |
| ---------- | -------------------------------------- | --------------------------------------------------- |
| Aanmaak    | `@nestjs/cli@latest new` (ESM, strict) | eigen template, Express 5 (ESM)                     |
| Starten    | `npm run start:dev`                    | `npm run dev` (`tsx watch`)                         |
| Lint       | oxlint (van Nest)                      | ESLint + typescript-eslint + eslint-config-prettier |
| Tests      | vitest (van Nest)                      | —                                                   |
| TypeScript | ^6 (Nest pint dit)                     | ^6 (typescript-eslint ondersteunt 7 nog niet)       |

Altijd, bij beide:

- **`.env`** (`APP_NAME`, `PORT`, `FRONTEND_URL`) + `.env.example`, gelezen via `src/env.ts` (`process.loadEnvFile`,
  geen extra package)
- **CORS** — enkel `FRONTEND_URL`, met cookies
- **`GET /health`** → `{ status, app, version, time }`
- **Meertalige foutmeldingen** — dezelfde talen als de frontend; taal uit de cookie `NEXT_LOCALE`, dan
  `Accept-Language`. Antwoord: `{ statusCode, error: 'notFound', message: 'Dit werd niet gevonden.' }`. Nest:
  `I18nExceptionFilter` (`throw new BadRequestException({ key: 'conflict' })`); Express: error-middleware
  (`throw new HttpError(409, 'conflict')`). Teksten in `src/i18n/messages.ts`.
- **Prettier** met de vaste ProjectX-`.prettierrc`, **AGENTS.md/CLAUDE.md** met de backend-regels

Met een frontend erbij:

- frontend `.env` krijgt `NEXT_PUBLIC_API_URL`, in code `env.apiUrl`
- **API-helper** — `src/lib/api.ts` (client components) en `src/lib/api.server.ts` (server components/actions, stuurt de
  cookies en de taal van de bezoeker door):

    ```ts
    const users = await api.get<User[]>('/users', { query: { page: 2 } })
    await api.post('/users', { name }) // ook put, patch, delete
    ```

    Adres uit `env.apiUrl`, cookies mee, JSON in/uit, time-out (10 s). Een fout wordt een `ApiError` met `status`,
    `code` (bv. `notFound`, of `unreachable` als de backend niet draait) en de al vertaalde `message`.

- **demo op de startpagina**: blok "Backend" met _Online · v0.0.1_ of _Niet bereikbaar_ (ProjectX-UI `Badge`)
- `.vscode` in de projectmap kent beide apps (ESLint-mappen, oxc-extensie bij NestJS)

## GitHub — altijd de laatste vraag

1. _Wil je dit naar GitHub pushen?_
2. bij ja: _Hoe moet het project op GitHub heten?_ (standaard de app-naam als `mijn-super-app`; `organisatie/naam` mag
   ook) en _Privé of openbaar?_

Na de installatie zet de CLI in de projectmap een `.gitignore` en `README.md`, en dan:

- **ja** → `git init`, eerste commit, `gh repo create <naam> --private|--public --source=. --push`. Nodig: de
  [GitHub CLI](https://cli.github.com) (`winget install --id GitHub.cli`) en `gh auth login`.
- **nee**, of `gh`/`git` ontbreekt, of het pushen mislukt → je krijgt de commando's om het zelf te doen: met `gh`, of
  via github.com/new + `git remote add origin ...` + `git push`.

`.env` gaat nooit mee (wel `.env.example`), `node_modules` en `.next` ook niet.

## Oude versie na een update?

`npx` bewaart een kopie van de CLI en haalt niet altijd de nieuwste commit op. Je ziet de versie bovenaan
(`projectx-cli v0.14.0`). Klopt die niet, maak dan de npx-cache leeg:

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"
```

## Ontwikkelen aan de CLI zelf

```bash
npm install
npm run dev      # draait src/index.ts rechtstreeks met tsx
npm run build    # compileert naar dist/
npm run format   # de CLI zelf gebruikt dezelfde .prettierrc
```

Structuur:

```
src/
├─ index.ts            vragen → controles → overzicht → installeren
├─ steps/
│  ├─ frontend.ts      askFrontend / checkFrontend / scaffoldFrontend
│  ├─ i18n.ts          next-intl: talen, bestanden, vertalingen
│  ├─ theme.ts         light/dark mode + design tokens
│  ├─ icons.ts         React Icons / Font Awesome / beide
│  ├─ rules.ts         PROJECT-RULES.md + AGENTS.md
│  ├─ editor.ts        eslint-config-prettier + .vscode
│  ├─ env.ts           app-naam + poort -> .env, src/lib/env.ts, scripts/next.mjs
│  ├─ ui.ts            ProjectX-UI: vragen, ophalen, npm run ui
│  ├─ ui-templates.ts  startpagina/taalkiezer/themaknop met ProjectX-UI
│  ├─ notfound.ts      vertaalde 404
│  ├─ backend-status.ts  blok "Backend" op de startpagina
│  ├─ backend/         NestJS / Express (index, nest, express, shared)
│  └─ github.ts        pushen naar GitHub of de commando's tonen
└─ utils/              exec, prettier, progress-bar, prompt-helpers
```

Een nieuwe stap toevoegen = een bestand in `src/steps/` met een `ask…`, een `check…` en een `scaffold…`, en die drie
aanroepen in `index.ts`.
