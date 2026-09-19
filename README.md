# ProjectX-cli

Interactieve CLI die stap voor stap een project opzet in de **huidige map**.

## Gebruik — altijd per project

```bash
mkdir mijn-project
cd mijn-project
npx --allow-git=root github:DafkeDD/ProjectX-cli
```

> **Waarom `--allow-git=root`?** Sinds npm 12 staat het ophalen van packages
> uit git standaard uit (`EALLOWGIT`). Met `root` sta je dat enkel toe voor
> het pakket dat je zelf opvraagt — niet voor eventuele git-dependencies
> daaronder. Het is een vlag op dit ene commando, geen globale instelling.

De CLI wordt **niet** globaal geïnstalleerd. `npx` haalt hem tijdelijk op vanaf
GitHub, bouwt hem en draait hem in de map waar je staat. Een `npm i -g` wordt
bewust geweigerd (`scripts/no-global.cjs`, en bij het opstarten nog eens
gecontroleerd in `src/utils/guard.ts`).

Wil je een vaste versie? Gebruik een tag of branch:

```bash
npx --allow-git=root github:DafkeDD/ProjectX-cli#v0.1.0
```

## De stappen

| # | Stap     | Keuzes                           | Resultaat     |
|---|----------|----------------------------------|---------------|
| 1 | Frontend | Next.js + Tailwind CSS + next-intl (talen naar keuze), of geen | `./frontend`  |
| 2 | Backend  | _volgt_                          |               |

### 1. Frontend

- **Next.js** — altijd de laatste versie via `create-next-app@latest`
- **Tailwind CSS** — na de installatie expliciet naar `@latest` gezet
  (`tailwindcss` + `@tailwindcss/postcss`)
- TypeScript, ESLint, App Router, `src/`-map, import-alias `@/*`
- **Turbopack** — standaard-bundler sinds Next.js 16 (`next dev` / `next build`)
- Geen eigen git-repo in `./frontend`; git hoort op projectniveau
- **next-intl, altijd** — dat zelf is geen vraag. Wel vraagt de CLI:
  - **welke talen** (aanvinken met spatie): English, Nederlands, Français,
    Deutsch, Español, Italiano, Português, Polski — voorgeselecteerd:
    `en`, `nl`, `fr`, `de`
  - **welke taal de standaard is** (voorstel: Engels)
- de taal staat **nooit in de URL** (`localePrefix: 'never'`); de keuze zit in
  de cookie `NEXT_LOCALE`. `/nl/…` wordt doorgestuurd naar `/…`
- zonder cookie kiest next-intl op basis van de browsertaal
- vertalingen in `messages/<taal>.json`, één per gekozen taal — zichtbare
  tekst nooit hard coderen
- `src/proxy.ts` (de opvolger van `middleware.ts` sinds Next.js 16),
  `src/i18n/` (routing, request, navigation, actions), `src/app/[locale]/`
  en een `LocaleSwitcher`-component

```
frontend/
├─ messages/            één .json per gekozen taal
└─ src/
   ├─ proxy.ts          next-intl middleware
   ├─ i18n/             routing · request · navigation · actions
   ├─ components/       LocaleSwitcher.tsx
   └─ app/
      ├─ layout.tsx     <html lang> + fonts
      └─ [locale]/      layout.tsx · page.tsx
```

Bestaat `./frontend` al en is hij niet leeg, dan stopt de CLI voor hij iets doet.

## Oude versie na een update?

`npx` bewaart een kopie van de CLI en haalt niet altijd de nieuwste commit
op. Je ziet de versie bovenaan (`projectx-cli v0.2.0`). Klopt die niet, maak
dan de npx-cache leeg:

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"
```

## Ontwikkelen aan de CLI zelf

```bash
npm install
npm run dev      # draait src/index.ts rechtstreeks met tsx
npm run build    # compileert naar dist/
```

Structuur:

```
src/
├─ index.ts            vragen → controles → overzicht → installeren
├─ steps/
│  ├─ frontend.ts      askFrontend / checkFrontend / scaffoldFrontend
│  └─ i18n.ts          next-intl: talen, bestanden, vertalingen
└─ utils/              exec, progress-bar, prompt-helpers
```

Een nieuwe stap toevoegen = een bestand in `src/steps/` met een `ask…`, een
`check…` en een `scaffold…`, en die drie aanroepen in `index.ts`.
