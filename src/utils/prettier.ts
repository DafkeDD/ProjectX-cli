import fs from "node:fs";
import path from "node:path";
import { runQuiet } from "./exec.js";
import type { PackageManager } from "../types.js";

/**
 * Prettier-config voor gegenereerde projecten (zelfde huisstijl als
 * starter-cli). Wordt letterlijk als .prettierrc weggeschreven.
 *
 * De tailwind-plugin sorteert class-namen en heeft alleen zin in de frontend.
 */
function buildConfig(tailwind: boolean): Record<string, unknown> {
  return {
    arrowParens: "avoid",
    singleQuote: true,
    jsxSingleQuote: true,
    tabWidth: 4,
    trailingComma: "none",
    semi: false,
    proseWrap: "always",
    printWidth: 120,
    ...(tailwind ? { plugins: ["prettier-plugin-tailwindcss"] } : {}),
  };
}

const PRETTIER_IGNORE = [
  "node_modules",
  ".next",
  "out",
  "build",
  "dist",
  "coverage",
  "next-env.d.ts",
  // next dev herschrijft zijn eigen blok in AGENTS.md (ongewrapt); Prettier
  // zou daar dan telkens over klagen.
  "AGENTS.md",
  "CLAUDE.md",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "",
].join("\n");

/** Voegt `format` en `format:check` toe aan package.json. */
function addScripts(targetDir: string): void {
  const file = path.join(targetDir, "package.json");
  if (!fs.existsSync(file)) return;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8")) as { scripts?: Record<string, string> };
  pkg.scripts = { ...pkg.scripts, format: "prettier --write .", "format:check": "prettier --check ." };
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

/**
 * Zet Prettier op in `targetDir`: config + ignore, packages (@latest) en
 * scripts. Formatteren gebeurt apart met formatAll(), als laatste stap.
 */
export async function setupPrettier(
  pm: PackageManager,
  targetDir: string,
  { tailwind = true }: { tailwind?: boolean } = {},
): Promise<void> {
  fs.writeFileSync(path.join(targetDir, ".prettierrc"), JSON.stringify(buildConfig(tailwind), null, 4) + "\n", "utf8");
  fs.writeFileSync(path.join(targetDir, ".prettierignore"), PRETTIER_IGNORE, "utf8");
  addScripts(targetDir);

  const packages = ["prettier@latest", ...(tailwind ? ["prettier-plugin-tailwindcss@latest"] : [])];
  await runQuiet(pm, ["install", "--save-dev", ...packages], targetDir);
}

/** Zet alle code in de huisstijl — met de lokaal geïnstalleerde Prettier. */
export async function formatAll(pm: PackageManager, targetDir: string): Promise<void> {
  await runQuiet(pm, ["run", "format"], targetDir);
}
