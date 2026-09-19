import fs from "node:fs";
import path from "node:path";
import type { Locale } from "./i18n.js";
import { usesReactIcons, type IconLibrary } from "./icons.js";

/**
 * VASTE REGEL: elke frontend heeft light/dark mode (zoals starter-cli).
 *
 * Class-based dark mode (Tailwind 4 `@custom-variant`), voorkeur in de cookie
 * `theme` (nooit localStorage). De server zet de class al op <html>, dus geen
 * flits en geen inline script:
 *   - cookie "dark"          -> <html class="dark">
 *   - cookie "light"         -> <html>
 *   - cookie "system" / geen -> <html class="theme-system">, CSS volgt
 *                               prefers-color-scheme
 */

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

/** Vertalingen voor de theme-toggle; komen in messages/<taal>.json onder "Theme". */
export const THEME_MESSAGES: Record<Locale, Record<string, string>> = {
  en: { appearance: "Appearance", toggle: "Switch theme", light: "Light", dark: "Dark", system: "System" },
  nl: { appearance: "Weergave", toggle: "Thema wisselen", light: "Licht", dark: "Donker", system: "Systeem" },
  fr: { appearance: "Apparence", toggle: "Changer de thème", light: "Clair", dark: "Sombre", system: "Système" },
  de: { appearance: "Darstellung", toggle: "Theme wechseln", light: "Hell", dark: "Dunkel", system: "System" },
  es: { appearance: "Apariencia", toggle: "Cambiar tema", light: "Claro", dark: "Oscuro", system: "Sistema" },
  it: { appearance: "Aspetto", toggle: "Cambia tema", light: "Chiaro", dark: "Scuro", system: "Sistema" },
  pt: { appearance: "Aparência", toggle: "Alternar tema", light: "Claro", dark: "Escuro", system: "Sistema" },
  pl: { appearance: "Wygląd", toggle: "Zmień motyw", light: "Jasny", dark: "Ciemny", system: "Systemowy" },
};

/** Dark-tokens, hergebruikt voor .dark én voor .theme-system + prefers-color-scheme. */
const DARK_TOKENS = `    --background: 220 20% 8%;
    --foreground: 160 10% 95%;

    --card: 220 20% 10%;
    --card-foreground: 160 10% 95%;

    --primary: 160 70% 45%;
    --primary-foreground: 220 20% 8%;

    --secondary: 160 30% 15%;
    --secondary-foreground: 160 60% 80%;

    --muted: 220 15% 18%;
    --muted-foreground: 220 10% 60%;

    --accent: 220 15% 20%;
    --accent-foreground: 160 10% 90%;

    --destructive: 0 70% 50%;
    --destructive-foreground: 0 0% 100%;

    --border: 220 12% 20%;
    --input: 220 12% 20%;
    --ring: 160 70% 45%;`;

const GLOBALS_CSS = `@import 'tailwindcss';

/* ============================================================
   DARK MODE (Tailwind 4)
   .dark          = expliciet donker
   .theme-system  = volg de systeemvoorkeur
   ============================================================ */
@custom-variant dark {
    &:where(.dark, .dark *) {
        @slot;
    }
    @media (prefers-color-scheme: dark) {
        &:where(.theme-system, .theme-system *) {
            @slot;
        }
    }
}

/* ============================================================
   DESIGN TOKENS — light
   ============================================================ */
:root {
    --background: 0 0% 100%;
    --foreground: 220 20% 10%;

    --card: 0 0% 100%;
    --card-foreground: 220 20% 10%;

    --primary: 160 84% 39%;
    --primary-foreground: 0 0% 100%;

    --secondary: 152 40% 96%;
    --secondary-foreground: 160 84% 25%;

    --muted: 160 20% 96%;
    --muted-foreground: 220 10% 45%;

    --accent: 20 80% 95%;
    --accent-foreground: 20 60% 35%;

    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;

    --border: 160 15% 90%;
    --input: 160 15% 92%;
    --ring: 160 84% 39%;

    --radius: 0.75rem;
}

/* ============================================================
   DESIGN TOKENS — dark
   ============================================================ */
.dark {
${DARK_TOKENS}
}

/* Systeemvoorkeur volgen (cookie "system" of nog geen cookie). */
@media (prefers-color-scheme: dark) {
    .theme-system {
${DARK_TOKENS}
    }
}

/* ============================================================
   TAILWIND 4 MAPPING — CSS-variabelen -> utility classes
   (bg-background, text-foreground, bg-card, text-muted-foreground, ...)
   ============================================================ */
@theme inline {
    --font-sans: var(--font-geist-sans);
    --font-mono: var(--font-geist-mono);

    --color-background: hsl(var(--background));
    --color-foreground: hsl(var(--foreground));

    --color-card: hsl(var(--card));
    --color-card-foreground: hsl(var(--card-foreground));

    --color-primary: hsl(var(--primary));
    --color-primary-foreground: hsl(var(--primary-foreground));

    --color-secondary: hsl(var(--secondary));
    --color-secondary-foreground: hsl(var(--secondary-foreground));

    --color-muted: hsl(var(--muted));
    --color-muted-foreground: hsl(var(--muted-foreground));

    --color-accent: hsl(var(--accent));
    --color-accent-foreground: hsl(var(--accent-foreground));

    --color-destructive: hsl(var(--destructive));
    --color-destructive-foreground: hsl(var(--destructive-foreground));

    --color-border: hsl(var(--border));
    --color-input: hsl(var(--input));
    --color-ring: hsl(var(--ring));

    --radius-sm: calc(var(--radius) - 4px);
    --radius-md: calc(var(--radius) - 2px);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) + 4px);
}

/* ============================================================
   BASIS
   ============================================================ */
body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
}

html {
    color-scheme: light;
    transition:
        background-color 0.2s ease,
        color 0.2s ease;
}

html.dark {
    color-scheme: dark;
}

@media (prefers-color-scheme: dark) {
    html.theme-system {
        color-scheme: dark;
    }
}

:focus-visible {
    outline: 2px solid hsl(var(--ring));
    outline-offset: 2px;
}
`;

/** Gedeeld tussen server (layout) en client (provider): welke class hoort bij welk thema. */
const THEME_LIB = `export type Theme = 'light' | 'dark' | 'system'

export const THEMES: Theme[] = ['light', 'dark', 'system']

/** Naam van de cookie met de voorkeur. */
export const THEME_COOKIE = 'theme'

export function isTheme(value: unknown): value is Theme {
    return value === 'light' || value === 'dark' || value === 'system'
}

/** Class op <html>. Bij 'system' beslist de CSS zelf via prefers-color-scheme. */
export function themeClass(theme: Theme): string | undefined {
    if (theme === 'dark') return 'dark'
    if (theme === 'system') return 'theme-system'
    return undefined
}
`;

/**
 * Server action voor de cookie. Via de server i.p.v. document.cookie: dat
 * laatste keurt de lintregel react-hooks/immutability af.
 */
const THEME_ACTIONS = `'use server'

import { cookies } from 'next/headers'
import { isTheme, THEME_COOKIE } from './theme'

/** Bewaart de themavoorkeur in een cookie (1 jaar geldig). */
export async function saveTheme(theme: string): Promise<void> {
    if (!isTheme(theme)) return

    const cookieStore = await cookies()
    cookieStore.set(THEME_COOKIE, theme, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
}
`;

const THEME_PROVIDER = `'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { saveTheme } from './actions'
import { THEMES, themeClass, type Theme } from './theme'

interface ThemeContextValue {
    /** Voorkeur van de gebruiker. */
    theme: Theme
    /** Wat er echt getoond wordt — altijd light of dark. */
    resolvedTheme: 'light' | 'dark'
    setTheme: (theme: Theme) => void
    /** Wisselt light -> dark -> system -> light. */
    cycleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Luistert naar de systeemvoorkeur, zonder setState in een effect. */
function subscribe(onChange: () => void): () => void {
    const mq = window.matchMedia(DARK_QUERY)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
}

function useSystemPrefersDark(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(DARK_QUERY).matches,
        () => false
    )
}

/**
 * Beheert light/dark mode. De voorkeur staat in een cookie (nooit
 * localStorage), zodat de server de class al kan zetten — geen flits.
 */
export function ThemeProvider({ children, initialTheme = 'system' }: { children: ReactNode; initialTheme?: Theme }) {
    const [theme, setThemeState] = useState<Theme>(initialTheme)
    const systemDark = useSystemPrefersDark()
    const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

    // Class op <html> synchroon houden met de voorkeur (zelfde logica als de layout).
    useEffect(() => {
        const root = document.documentElement
        root.classList.remove('dark', 'theme-system')
        const cls = themeClass(theme)
        if (cls) root.classList.add(cls)
    }, [theme])

    const setTheme = useCallback((next: Theme) => {
        setThemeState(next)
        void saveTheme(next)
    }, [])

    const cycleTheme = useCallback(() => {
        setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length])
    }, [theme, setTheme])

    const value = useMemo(
        () => ({ theme, resolvedTheme, setTheme, cycleTheme }),
        [theme, resolvedTheme, setTheme, cycleTheme]
    )

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext)
    if (!ctx) throw new Error('useTheme moet binnen ThemeProvider gebruikt worden')
    return ctx
}
`;

function themeToggle(lib: IconLibrary): string {
  // React Icons als die er is, anders Font Awesome.
  const iconImports = usesReactIcons(lib)
    ? "import { MdComputer, MdDarkMode, MdLightMode } from 'react-icons/md'"
    : "import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'\nimport { faDesktop, faMoon, faSun } from '@fortawesome/free-solid-svg-icons'";
  const icons = usesReactIcons(lib)
    ? `const ICONS: Record<Theme, React.ReactNode> = {
    light: <MdLightMode size={16} />,
    dark: <MdDarkMode size={16} />,
    system: <MdComputer size={16} />
}`
    : `const ICONS: Record<Theme, React.ReactNode> = {
    light: <FontAwesomeIcon icon={faSun} />,
    dark: <FontAwesomeIcon icon={faMoon} />,
    system: <FontAwesomeIcon icon={faDesktop} />
}`;

  return `'use client'

import { useTranslations } from 'next-intl'
${iconImports}
import { useTheme } from './ThemeProvider'
import type { Theme } from './theme'

${icons}

/**
 * Knop die wisselt tussen light, dark en system. Zelf gebouwd — geen
 * component library. De server kent de voorkeur al (cookie), dus het label
 * klopt meteen bij de eerste render.
 */
export default function ThemeToggle() {
    const t = useTranslations('Theme')
    const { theme, cycleTheme } = useTheme()

    return (
        <button
            type='button'
            onClick={cycleTheme}
            aria-label={t('toggle')}
            title={t('toggle')}
            className='border-border hover:bg-muted flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors'
        >
            {ICONS[theme]}
            <span>{t(theme)}</span>
        </button>
    )
}
`;
}

/** Schrijft globals.css en de thema-bestanden. De layout zet i18n.ts. */
export function setupTheme(target: string, icons: IconLibrary): void {
  const src = path.join(target, "src");
  const dir = path.join(src, "components", "theme");

  write(path.join(src, "app", "globals.css"), GLOBALS_CSS);
  write(path.join(dir, "theme.ts"), THEME_LIB);
  write(path.join(dir, "actions.ts"), THEME_ACTIONS);
  write(path.join(dir, "ThemeProvider.tsx"), THEME_PROVIDER);
  write(path.join(dir, "ThemeToggle.tsx"), themeToggle(icons));
}
