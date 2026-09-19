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
| 1 | Frontend | Next.js + Tailwind CSS, of geen  | `./frontend`  |
| 2 | Backend  | _volgt_                          |               |

### 1. Frontend

- **Next.js** — altijd de laatste versie via `create-next-app@latest`
- **Tailwind CSS** — na de installatie expliciet naar `@latest` gezet
  (`tailwindcss` + `@tailwindcss/postcss`)
- TypeScript, ESLint, App Router, `src/`-map, import-alias `@/*`
- **Turbopack** — standaard-bundler sinds Next.js 16 (`next dev` / `next build`)
- Geen eigen git-repo in `./frontend`; git hoort op projectniveau

Bestaat `./frontend` al en is hij niet leeg, dan stopt de CLI voor hij iets doet.

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
│  └─ frontend.ts      askFrontend / checkFrontend / scaffoldFrontend
└─ utils/              exec, progress-bar, prompt-helpers
```

Een nieuwe stap toevoegen = een bestand in `src/steps/` met een `ask…`, een
`check…` en een `scaffold…`, en die drie aanroepen in `index.ts`.
