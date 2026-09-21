import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * Deze CLI draai je per project met npx, nooit als globale installatie.
 * Sinds npm 12 draaien install-scripts (zoals onze preinstall-check) niet meer
 * standaard, dus controleren we het hier nog eens bij het opstarten.
 */
export function isGlobalInstall(): boolean {
    try {
        const self = fs.realpathSync(fileURLToPath(import.meta.url)).toLowerCase()
        const globalRoot = fs
            .realpathSync(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim())
            .toLowerCase()
        return self.startsWith(globalRoot)
    } catch {
        return false
    }
}

/**
 * Bestand enkel leesbaar maken voor deze gebruiker (0600). Voor .env-bestanden
 * met wachtwoorden en sleutels. Op Windows doet chmod niets; daar regelt NTFS
 * de rechten van de gebruikersmap.
 */
export function protectFile(file: string): void {
    try {
        fs.chmodSync(file, 0o600)
    } catch {
        // Geen rechten of een bestandssysteem zonder modus: niet fataal.
    }
}
