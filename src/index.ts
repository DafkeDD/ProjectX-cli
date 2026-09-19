#!/usr/bin/env node
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { askFrontend, checkFrontend, frontendLabel, scaffoldFrontend, FRONTEND_DIR } from "./steps/frontend.js";
import { orCancel } from "./utils/prompt.js";
import type { PackageManager } from "./types.js";

const PACKAGE_MANAGER: PackageManager = "npm";

async function main(): Promise<void> {
  console.clear();
  p.intro(pc.bgCyan(pc.black(" projectx-cli ")));

  // Alles komt in de map waar je het commando draait: per project.
  const projectDir = process.cwd();

  // ---- Vragen (stap voor stap) -------------------------------------------
  const frontend = await askFrontend();
  // Volgende stappen (backend, ...) komen hier.

  // ---- Controles ---------------------------------------------------------
  const problems = [checkFrontend(frontend, projectDir)].filter((x): x is string => !!x);
  if (problems.length > 0) {
    p.cancel(problems.join("\n"));
    process.exit(1);
  }

  // ---- Overzicht ---------------------------------------------------------
  p.note(
    [
      `${pc.dim("Locatie ")}  ${pc.cyan(projectDir)}`,
      `${pc.dim("Frontend")}  ${pc.cyan(frontendLabel(frontend))}`,
      `${pc.dim("Manager ")}  ${pc.cyan(PACKAGE_MANAGER)}`,
    ].join("\n"),
    "Overzicht",
  );

  const go = orCancel(await p.confirm({ message: "Zo installeren?", initialValue: true }));
  if (!go) {
    p.cancel("Niets geïnstalleerd.");
    process.exit(0);
  }

  // ---- Installeren -------------------------------------------------------
  await scaffoldFrontend(frontend, projectDir, PACKAGE_MANAGER);

  // ---- Volgende stappen --------------------------------------------------
  const steps: string[] = [];
  if (frontend === "nextjs") {
    steps.push(`cd ${FRONTEND_DIR} && ${PACKAGE_MANAGER} run dev   ${pc.dim("http://localhost:3000")}`);
  }
  if (steps.length > 0) p.note(steps.join("\n"), "Volgende stappen");

  p.outro(`Klaar in ${pc.cyan(path.basename(projectDir))}.`);
}

main().catch((err: unknown) => {
  p.cancel(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
