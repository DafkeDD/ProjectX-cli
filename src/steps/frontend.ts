import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { runQuiet } from "../utils/exec.js";
import { withProgress } from "../utils/progress.js";
import { orCancel } from "../utils/prompt.js";
import type { PackageManager } from "../types.js";

/** Submap binnen het project voor de frontend. */
export const FRONTEND_DIR = "frontend";

export type Frontend = "nextjs" | "none";

/** Stap 1 — vraag: welke frontend? */
export async function askFrontend(): Promise<Frontend> {
  return orCancel(
    await p.select<Frontend>({
      message: "Welke frontend wil je?",
      initialValue: "nextjs",
      options: [
        {
          value: "nextjs",
          label: "Next.js + Tailwind CSS",
          hint: "laatste versies · TypeScript · ESLint · src/ · Turbopack",
        },
        { value: "none", label: "Geen frontend" },
      ],
    }),
  );
}

export function frontendLabel(frontend: Frontend): string {
  return frontend === "nextjs"
    ? `Next.js + Tailwind CSS${pc.dim(`  -> ./${FRONTEND_DIR}`)}`
    : "geen";
}

/** Controle vóór het installeren: ./frontend mag niet al bestaan met inhoud. */
export function checkFrontend(frontend: Frontend, projectDir: string): string | null {
  if (frontend === "none") return null;
  const dir = path.join(projectDir, FRONTEND_DIR);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    return `De map "./${FRONTEND_DIR}" bestaat al en is niet leeg.`;
  }
  return null;
}

/**
 * Stap 1 — installatie: Next.js (create-next-app@latest) in ./frontend, en
 * daarna Tailwind expliciet op @latest zodat je nooit achterloopt op wat
 * create-next-app toevallig vastpint.
 */
export async function scaffoldFrontend(
  frontend: Frontend,
  projectDir: string,
  pm: PackageManager,
): Promise<void> {
  if (frontend === "none") {
    p.log.info("Geen frontend gekozen — overgeslagen.");
    return;
  }

  const target = path.join(projectDir, FRONTEND_DIR);

  await withProgress(
    "Next.js installeren (laatste versie)",
    async (update) => {
      await runQuiet(
        "npx",
        [
          "--yes",
          "create-next-app@latest",
          FRONTEND_DIR,
          "--ts",
          "--tailwind",
          "--eslint",
          "--app",
          "--src-dir",
          "--import-alias",
          "@/*",
          `--use-${pm}`,
          // Geen genest git-repo in ./frontend: git hoort op projectniveau.
          "--disable-git",
          "--yes",
        ],
        projectDir,
      );

      update("Tailwind CSS naar de laatste versie");
      await runQuiet(pm, ["install", "--save-dev", "tailwindcss@latest", "@tailwindcss/postcss@latest"], target);

      update("Turbopack controleren");
      ensureTurbopack(target);
    },
    75000,
  );

  const versions = readVersions(target);
  p.log.success(
    `Frontend klaar in ./${FRONTEND_DIR}` +
      pc.dim(`  (next ${versions.next ?? "?"}, tailwindcss ${versions.tailwindcss ?? "?"})`),
  );
}

/**
 * Vanaf Next.js 16 is Turbopack de standaard-bundler. Staat er toch nog
 * `--webpack` in de scripts, dan halen we dat weg.
 */
function ensureTurbopack(target: string): void {
  const file = path.join(target, "package.json");
  if (!fs.existsSync(file)) return;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8")) as { scripts?: Record<string, string> };
  if (!pkg.scripts) return;

  let changed = false;
  for (const [name, script] of Object.entries(pkg.scripts)) {
    const next = script.replace(/\s--webpack\b/, "");
    if (next !== script) {
      pkg.scripts[name] = next;
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

/** Leest de werkelijk geïnstalleerde versies uit node_modules. */
function readVersions(target: string): Record<string, string | undefined> {
  const read = (name: string): string | undefined => {
    try {
      const file = path.join(target, "node_modules", name, "package.json");
      return (JSON.parse(fs.readFileSync(file, "utf8")) as { version?: string }).version;
    } catch {
      return undefined;
    }
  };
  return { next: read("next"), tailwindcss: read("tailwindcss") };
}
