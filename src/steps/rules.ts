import fs from 'node:fs'
import path from 'node:path'
import { LOCALE_LABELS, type I18nConfig } from './i18n.js'
import { usesFontAwesome, usesReactIcons, type IconLibrary } from './icons.js'

/**
 * Regels voor AI-assistenten (Claude Code, Copilot, Cursor, Codex, ...).
 *
 * - PROJECT-RULES.md: het volledige document, leesbaar voor mensen.
 * - AGENTS.md: een beknopt blok, dat agents automatisch lezen.
 *   create-next-app zet CLAUDE.md al op `@AGENTS.md`, dus Claude leest mee.
 *
 * De regels volgen de keuzes uit de CLI (talen, iconen).
 */

const BEGIN = '<!-- BEGIN:projectx-rules -->'
const END = '<!-- END:projectx-rules -->'

const code = (s: string) => `\`${s}\``

/** Wat je gebruikt als ProjectX-UI een icoon niet heeft. */
function extraIcons(icons: IconLibrary): string {
    if (usesReactIcons(icons) && usesFontAwesome(icons)) return 'pas \`react-icons\` of Font Awesome'
    if (usesReactIcons(icons)) return 'pas \`react-icons\`'
    if (usesFontAwesome(icons)) return 'pas Font Awesome'
    return 'voeg je het toe aan de icon set in de ProjectX-UI-repo (er is bewust geen extra icon library)'
}

function iconRule(icons: IconLibrary): string {
    if (icons === 'none') return 'Er is geen icon library geïnstalleerd; voeg er pas een toe na overleg.'
    const libs: string[] = []
    if (usesReactIcons(icons)) libs.push(code('react-icons'))
    if (usesFontAwesome(icons)) libs.push(`Font Awesome (${code('@fortawesome/react-fontawesome')})`)
    return `Iconen komen **uitsluitend** uit ${libs.join(' of ')}. Nooit ${code('lucide-react')} of losse SVG-packs.`
}

function iconExample(icons: IconLibrary): string {
    const parts: string[] = []
    if (usesReactIcons(icons)) {
        parts.push(`// React Icons
import { MdHome } from 'react-icons/md'
<MdHome size={20} />`)
    }
    if (usesFontAwesome(icons)) {
        parts.push(`// Font Awesome
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHouse } from '@fortawesome/free-solid-svg-icons'
<FontAwesomeIcon icon={faHouse} />`)
    }
    return parts.length ? '```tsx\n' + parts.join('\n\n') + '\n```' : ''
}

function agentsUi(ui: boolean, icons: IconLibrary): string {
    if (!ui) {
        return `## 2. UI-componenten — altijd zelf bouwen

Niets uit een component library: geen shadcn/ui, Radix, MUI, Chakra, Ant Design, HeadlessUI, DaisyUI, NextUI/HeroUI.
Componenten komen in \`src/components/ui/\`, met Tailwind en de design tokens. \`clsx\` en \`tailwind-merge\` mogen wel.

${iconRule(icons)}`
    }
    return `## 2. UI-componenten — ENKEL ProjectX-UI

- Gebruik **enkel componenten van ProjectX-UI**: \`import { Button, Dialog, Table } from '@/components/ui'\`. Nooit zelf
  een knop, input, kaart, dialog, badge, ... bouwen met losse \`<button>\`/\`<div>\` + Tailwind.
- Nog niet geïnstalleerd? \`npm run ui -- add <naam>\` (lijst: \`npm run ui -- list\`). Bestaat het niet in ProjectX-UI,
  maak het dan in de ProjectX-UI-repo — niet in dit project.
- Tailwind alleen voor layout (flex, grid, gap, padding, breedte) rond de componenten.
- \`src/components/ui/\` wordt beheerd vanuit github.com/DafkeDD/ProjectX-ui. **Niet met de hand aanpassen** — wijzig
  de library en haal op met \`npm run ui -- add --all --force\`. Eigen componenten komen in \`src/components/\`.
- Geen andere component library: geen shadcn/ui, Radix, MUI, Chakra, Ant Design, HeadlessUI, DaisyUI, NextUI/HeroUI.
- CSS-klassen van de library beginnen met \`pxui-\`; hergebruik die niet in eigen code, gebruik Tailwind + tokens.

Iconen: **eerst** \`Icon\` uit ProjectX-UI (\`<Icon name='home' />\`). Ontbreekt een icoon daar (bv. merklogo's),
dan ${extraIcons(icons)}. Nooit \`lucide-react\`.`
}

function projectUi(ui: boolean, icons: IconLibrary): string {
    if (!ui) {
        return `## 2. UI-componenten — altijd zelf bouwen

**Niets uit een component library.** Niet uit shadcn/ui, Radix, MUI, Chakra,
Ant Design, HeadlessUI, DaisyUI, NextUI/HeroUI of wat dan ook. Elke knop,
input, modal, dropdown, tabel en badge wordt zelf geschreven in
\`src/components/ui/\`, met Tailwind en de design tokens.

- \`npx shadcn@latest add ...\` wordt in dit project nooit gedraaid.
- Utility-libraries zonder componenten (\`clsx\`, \`tailwind-merge\`) mogen wel.
- ${iconRule(icons)}

${iconExample(icons)}

\`\`\`tsx
// src/components/ui/Button.tsx — zo hoort een component eruit te zien
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const VARIANTS: Record<Variant, string> = {
    primary: 'bg-primary text-primary-foreground hover:opacity-90',
    secondary: 'bg-secondary text-secondary-foreground hover:opacity-90',
    ghost: 'hover:bg-muted'
}

export function Button({
    variant = 'primary',
    className = '',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
    return (
        <button
            className={\`inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:opacity-50 \${VARIANTS[variant]} \${className}\`}
            {...props}
        />
    )
}
\`\`\``
    }
    return `## 2. UI-componenten — ProjectX-UI

Dit project gebruikt **ProjectX-UI** (github.com/DafkeDD/ProjectX-ui): 68 eigen
componenten, als broncode in \`src/components/ui/\` — zoals shadcn, maar
volledig zelf gebouwd.

| | |
|---|---|
| Importeren | \`import { Button, Card, Dialog } from '@/components/ui'\` |
| Overzicht | \`npm run ui -- list\` |
| Eén toevoegen | \`npm run ui -- add <naam>\` |
| Alles bijwerken | \`npm run ui -- add --all --force\` |
| Kleuren | \`src/components/ui/tokens.css\` (licht + \`[data-theme="dark"]\`) |

1. **ENKEL ProjectX-UI-componenten.** Elke knop, input, kaart, badge, dialog,
   tabel, ... komt uit \`@/components/ui\`. Nooit zelf nabouwen met losse
   \`<button>\` / \`<div>\` + Tailwind. Tailwind is er alleen voor layout
   (flex, grid, gap, padding, breedte).
   Nog niet geïnstalleerd? \`npm run ui -- add <naam>\`. Bestaat het niet in
   ProjectX-UI, dan hoort het in de ProjectX-UI-repo — niet in dit project.
2. **\`src/components/ui/\` niet met de hand aanpassen.** Die map wordt
   overschreven bij het bijwerken. Een fout of nieuw component hoort in de
   ProjectX-UI-repo; daarna \`npm run ui -- add --all --force\`.
3. **Eigen componenten** in \`src/components/\` zijn alleen *samenstellingen*
   van ProjectX-UI-componenten (zoals \`LocaleSwitcher\` = \`Segmented\`,
   \`ThemeToggle\` = \`Segmented\` + \`Icon\`).
4. **Geen andere component library** (shadcn/ui, Radix, MUI, Chakra, ...).
5. De Tailwind-namen (\`bg-card\`, \`text-muted-foreground\`, \`bg-primary\`, ...)
   wijzen naar de ProjectX-UI-tokens — ze blijven dus bruikbaar én passen
   bij de library.
6. **Iconen: eerst \`Icon\` uit ProjectX-UI** (\`<Icon name='home' />\`, 24×24,
   volgt de tekstkleur). Ontbreekt een icoon daar (bv. merklogo's), dan
   ${extraIcons(icons)}. Nooit \`lucide-react\`.

\`\`\`tsx
import { Badge, Button, Card, CardHeader, CardTitle } from '@/components/ui'

export function Voorbeeld() {
    const t = useTranslations('Voorbeeld')
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('title')}</CardTitle>
            </CardHeader>
            <Badge tone='accent'>{t('status')}</Badge>
            <Button>{t('save')}</Button>
        </Card>
    )
}
\`\`\`

${iconExample(icons)}`
}

function agentsBlock({ locales, defaultLocale }: I18nConfig, icons: IconLibrary, ui: boolean): string {
    return `
${BEGIN}

# Projectregels (niet verwijderen)

Volledige uitleg met voorbeelden: \`PROJECT-RULES.md\`.

## 1. i18n — altijd next-intl

Talen: ${locales.map(code).join(', ')}. Standaardtaal: ${code(defaultLocale)}. De taal staat nooit in de URL.

- Zichtbare tekst **nooit** hard coderen — altijd \`useTranslations()\` (client) of \`getTranslations()\` (server).
- Elke nieuwe key in **alle** bestanden onder \`messages/\` (${locales.map(l => code(`${l}.json`)).join(', ')}).
- Nieuwe pagina's onder \`src/app/[locale]/\`, nooit direct onder \`src/app/\`.
- Interne navigatie via \`@/i18n/navigation\`, niet via \`next/link\` of \`next/navigation\`.
- Talenlijst **alleen** in \`src/i18n/locales.ts\`. Paginatitels via \`generateMetadata\` + \`Metadata\` in \`messages/\`.

## Instellingen — .env

- App-naam (\`NEXT_PUBLIC_APP_NAME\`) en poort (\`PORT\`) staan in \`.env\`. In de code **altijd** via
  \`import { env } from '@/lib/env'\` (\`env.appName\`, \`env.port\`), nooit \`process.env\` rechtstreeks en nooit de naam
  hard coderen.
- Nieuwe instelling = in \`.env\`, in \`.env.example\` én in \`src/lib/env.ts\`. Geheimen nooit in \`.env.example\`.
- \`npm run dev\` / \`npm run start\` lopen via \`scripts/next.mjs\`, dat \`PORT\` uit \`.env\` leest. Niet vervangen door
  \`next dev\`.

${agentsUi(ui, icons)}

## 3. Light/dark mode — altijd

- Kleuren **alleen** via design tokens: \`bg-background\`, \`text-foreground\`, \`bg-card\`, \`border-border\`,
  \`text-muted-foreground\`, \`bg-primary\`, ... Nooit \`bg-white\`, \`text-black\` of hex-kleuren in componenten.
- Nieuwe kleur = nieuw token in ${ui ? '\`src/components/ui/tokens.css\` (licht én \`[data-theme="dark"]\`) + mapping in \`globals.css\`' : '\`src/app/globals.css\`, in \`:root\` én in \`.dark\` / \`.theme-system\`'}.
- De voorkeur staat in de \`theme\`-cookie, **nooit** in localStorage. Gebruik \`useTheme()\`.

## 4. Code-stijl — Prettier

- Na elke wijziging: \`npm run format\`. Controle: \`npm run format:check\` en \`npm run lint\`.
- Stijl: 4 spaties, enkele quotes, geen puntkomma's, max. 120 tekens. Tailwind-classes worden automatisch gesorteerd.
- Cookies zet je via een server action (zie \`src/i18n/actions.ts\`), niet met \`document.cookie\`.

${END}
`
}

function projectRules({ locales, defaultLocale }: I18nConfig, icons: IconLibrary, ui: boolean): string {
    const langRows = locales.map(l => `${code(l)} (${LOCALE_LABELS[l].label})`).join(', ')
    return `# Projectregels

Deze regels zijn aangemaakt door projectx-cli en gelden voor alles wat er later
bijkomt — voor mensen én voor AI-assistenten (die lezen het blok in
\`AGENTS.md\`).

---

## 1. i18n — altijd next-intl

| | |
|---|---|
| Talen | ${langRows} |
| Standaardtaal | ${code(defaultLocale)} |
| URL-prefix | \`never\` — de taal staat in de cookie \`NEXT_LOCALE\`, niet in de URL |
| Vertalingen | \`messages/\` (${locales.map(l => code(`${l}.json`)).join(', ')}) |
| Routing | \`src/app/[locale]/...\` |

1. **Geen enkele zichtbare tekst hard coderen.** Alles komt uit
   \`useTranslations()\` (client) of \`getTranslations()\` (server).
2. **Elke nieuwe key in alle ${locales.length} bestanden.** Een key die in één taal
   ontbreekt, is een bug.
3. **Nieuwe pagina's onder \`src/app/[locale]/\`**, anders mist de taalcontext.
4. **Navigatie via \`@/i18n/navigation\`** (\`Link\`, \`useRouter\`, \`redirect\`,
   \`usePathname\`) — nooit \`next/link\` of \`next/navigation\` voor interne links.
5. **De talenlijst staat op één plek: \`src/i18n/locales.ts\`.** Een taal
   toevoegen = daar \`locales\` en \`localeLabels\` aanvullen, en een nieuw
   bestand in \`messages/\`. Routing, redirects en taalkiezer volgen vanzelf.
6. **Paginatitels komen ook uit \`messages/\`** (namespace \`Metadata\`), via
   \`generateMetadata\` + \`getTranslations\`. Nooit \`title: 'Iets'\` hard
   coderen. De app-naam zelf komt uit \`.env\` (\`env.appName\`).

---

## Instellingen — .env

| Variabele | Waarvoor | In de code |
|---|---|---|
| \`NEXT_PUBLIC_APP_NAME\` | naam van de app: titel, beschrijving, UI (ook in de browser) | \`env.appName\` |
| \`PORT\` | poort voor \`npm run dev\` en \`npm run start\` | \`env.port\` |

- **Altijd via \`src/lib/env.ts\`** (\`import { env } from '@/lib/env'\`), nooit
  \`process.env\` rechtstreeks. Zo staat elke instelling met terugvalwaarde op
  één plek.
- \`.env\` gaat **niet** mee in git; \`.env.example\` wel. Een nieuwe instelling
  zet je in alle drie (\`.env\`, \`.env.example\`, \`src/lib/env.ts\`). Geheimen
  nooit in \`.env.example\`.
- Next.js leest \`PORT\` zelf niet uit \`.env\`; daarom starten \`dev\` en
  \`start\` via \`scripts/next.mjs\`. Na het wijzigen van \`.env\`: dev-server
  herstarten (\`NEXT_PUBLIC_\`-waarden worden bij het bouwen ingevuld).

\`\`\`tsx
// Server component
import { getTranslations } from 'next-intl/server'

export default async function Page() {
    const t = await getTranslations('HomePage')
    return <h1>{t('title')}</h1>
}
\`\`\`

\`\`\`tsx
// Client component
'use client'
import { useTranslations } from 'next-intl'

export default function Widget() {
    const t = useTranslations('HomePage')
    return <p>{t('description')}</p>
}
\`\`\`

In ICU-messages zijn \`{ }\` placeholders en \`< >\` tags. Letterlijk tonen doe
je met apostrofs: \`'{'\` of \`'<'\`.

---

${projectUi(ui, icons)}

---

## 3. Light/dark mode — altijd aanwezig

| | |
|---|---|
| Mechanisme | class-based (\`@custom-variant dark\` in \`src/app/globals.css\`) |
| Opslag | cookie \`theme\` (server action), **nooit** localStorage |
| Waarden | \`light\`, \`dark\`, \`system\` |
| Provider | \`src/components/theme/ThemeProvider.tsx\` — \`useTheme()\` |
| Toggle | \`src/components/theme/ThemeToggle.tsx\` |

- De root-layout (\`src/app/layout.tsx\`) leest de cookie en zet meteen de
  class op \`<html>\`: \`dark\`, geen class (light) of \`theme-system\` (CSS volgt
  \`prefers-color-scheme\`). Geen inline script, geen flits.
- **Kleuren alleen via tokens**: \`bg-background\`, \`text-foreground\`,
  \`bg-card\`, \`text-card-foreground\`, \`border-border\`,
  \`text-muted-foreground\`, \`bg-muted\`, \`bg-primary\`,
  \`text-primary-foreground\`, \`bg-destructive\`.
- **Nooit** \`bg-white\`, \`text-black\` of hex-kleuren in componenten — dan
  breekt dark mode. ${
      ui
          ? 'Een nieuwe kleur wordt een token in \`src/components/ui/tokens.css\`\n  (licht én \`[data-theme="dark"]\`) — liefst in de ProjectX-UI-repo — plus een\n  regel in \`@theme inline\` in \`globals.css\`.'
          : 'Een nieuwe kleur wordt een token in \`globals.css\`, zowel\n  in \`:root\` als in de donkere varianten, plus een regel in \`@theme inline\`.'
  }

---

## 4. Code-stijl — Prettier + ESLint

| Commando | Wat |
|---|---|
| \`npm run format\` | alles in de huisstijl zetten |
| \`npm run format:check\` | controleren zonder te wijzigen |
| \`npm run lint\` | ESLint (React-regels van Next.js; stijlregels uit via \`eslint-config-prettier\`) |

- 4 spaties, enkele quotes (ook in JSX), geen puntkomma's, geen trailing
  commas, max. 120 tekens per regel. Tailwind-classes worden gesorteerd door
  \`prettier-plugin-tailwindcss\`. De config staat in \`.prettierrc\` — niet
  aanpassen.
- VS Code: formatteert bij opslaan (zie \`.vscode/\` in de projectmap).
- Cookies zet je via een **server action** (zoals \`src/i18n/actions.ts\` en
  \`src/components/theme/actions.ts\`), niet met \`document.cookie\` — dat keurt
  de lintregel \`react-hooks/immutability\` af.
- Geen \`setState\` rechtstreeks in een \`useEffect\`; voor externe bronnen
  (media queries, events) gebruik je \`useSyncExternalStore\`.
`
}

/** Schrijft PROJECT-RULES.md en voegt het regelblok toe aan AGENTS.md. */
export function setupRules(target: string, i18n: I18nConfig, icons: IconLibrary, ui = false): void {
    fs.writeFileSync(path.join(target, 'PROJECT-RULES.md'), projectRules(i18n, icons, ui), 'utf8')

    const agentsFile = path.join(target, 'AGENTS.md')
    const existing = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, 'utf8') : ''
    if (!existing.includes(BEGIN)) {
        fs.writeFileSync(agentsFile, existing.trimEnd() + '\n' + agentsBlock(i18n, icons, ui), 'utf8')
    }

    // Zorgt dat Claude Code AGENTS.md meeleest, ook als create-next-app dat ooit niet meer doet.
    const claudeFile = path.join(target, 'CLAUDE.md')
    const claude = fs.existsSync(claudeFile) ? fs.readFileSync(claudeFile, 'utf8') : ''
    if (!claude.includes('@AGENTS.md')) {
        fs.writeFileSync(claudeFile, (claude.trimEnd() ? claude.trimEnd() + '\n' : '') + '@AGENTS.md\n', 'utf8')
    }
}
