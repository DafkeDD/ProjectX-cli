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

| #   | Stap     | Keuzes                                                                                       | Resultaat    |
| --- | -------- | -------------------------------------------------------------------------------------------- | ------------ |
| 1   | Frontend | Next.js + Tailwind CSS + next-intl (talen naar keuze) + light/dark + iconen (keuze), of geen | `./frontend` |
| 2   | Backend  | _volgt_                                                                                      |              |

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

- **Iconen — vraag: welke?**

    | Keuze        | Packages (altijd `@latest`)                                                                                                         |
    | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
    | React Icons  | `react-icons`                                                                                                                       |
    | Font Awesome | `@fortawesome/react-fontawesome`, `fontawesome-svg-core`, `free-solid-svg-icons`, `free-regular-svg-icons`, `free-brands-svg-icons` |
    | Beide        | alles hierboven                                                                                                                     |

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
       `section-header`, `separator` en `icon` staan aan en komen er altijd bij — de startpagina gebruikt ze.
       Afhankelijkheden (bv. `button` → `spinner`) komen automatisch mee.
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

## Oude versie na een update?

`npx` bewaart een kopie van de CLI en haalt niet altijd de nieuwste commit op. Je ziet de versie bovenaan
(`projectx-cli v0.10.0`). Klopt die niet, maak dan de npx-cache leeg:

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
│  └─ ui-templates.ts  startpagina/taalkiezer/themaknop met ProjectX-UI
└─ utils/              exec, prettier, progress-bar, prompt-helpers
```

Een nieuwe stap toevoegen = een bestand in `src/steps/` met een `ask…`, een `check…` en een `scaffold…`, en die drie
aanroepen in `index.ts`.
