import fs from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import { orCancel } from '../utils/prompt.js'

/** Welke icon-library (of beide) er in de frontend komt. */
export type IconLibrary = 'react-icons' | 'fontawesome' | 'both'

export const usesReactIcons = (lib: IconLibrary): boolean => lib !== 'fontawesome'
export const usesFontAwesome = (lib: IconLibrary): boolean => lib !== 'react-icons'

/** Vraag: welke iconen? */
export async function askIcons(): Promise<IconLibrary> {
    return orCancel(
        await p.select<IconLibrary>({
            message: 'Welke iconen wil je?',
            initialValue: 'react-icons',
            options: [
                {
                    value: 'react-icons',
                    label: 'React Icons',
                    hint: 'react-icons.github.io — o.a. Material, Font Awesome, Lucide, Heroicons in één package'
                },
                {
                    value: 'fontawesome',
                    label: 'Font Awesome',
                    hint: 'officiële React-component · solid, regular en brands (gratis)'
                },
                { value: 'both', label: 'Beide' }
            ]
        })
    )
}

export function iconsLabel(lib: IconLibrary): string {
    if (lib === 'react-icons') return 'React Icons'
    if (lib === 'fontawesome') return 'Font Awesome'
    return 'React Icons + Font Awesome'
}

/** npm-packages voor de gekozen library, altijd @latest. */
export function iconPackages(lib: IconLibrary): string[] {
    const pkgs: string[] = []
    if (usesReactIcons(lib)) pkgs.push('react-icons@latest')
    if (usesFontAwesome(lib)) {
        pkgs.push(
            '@fortawesome/fontawesome-svg-core@latest',
            '@fortawesome/free-solid-svg-icons@latest',
            '@fortawesome/free-regular-svg-icons@latest',
            '@fortawesome/free-brands-svg-icons@latest',
            '@fortawesome/react-fontawesome@latest'
        )
    }
    return pkgs
}

/**
 * Font Awesome in Next.js (App Router): de CSS zelf importeren in de
 * root-layout en autoAddCss uitzetten, anders probeert FA <style>-tags in de
 * <head> te zetten en krijg je bij het laden kort reuzegrote iconen.
 * Zie https://docs.fontawesome.com/web/use-with/react/use-with
 */
export function setupIcons(target: string, lib: IconLibrary): void {
    if (!usesFontAwesome(lib)) return

    const layout = path.join(target, 'src', 'app', 'layout.tsx')
    if (!fs.existsSync(layout)) return

    const marker = "import './globals.css'\n"
    const source = fs.readFileSync(layout, 'utf8')
    if (!source.includes(marker) || source.includes('fontawesome-svg-core')) return

    fs.writeFileSync(
        layout,
        source.replace(
            marker,
            `${marker}import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'

// Font Awesome: CSS komt uit de import hierboven, niet via <style>-tags.
config.autoAddCss = false
`
        ),
        'utf8'
    )
}
