import * as p from "@clack/prompts";

/** Stopt netjes als de gebruiker Ctrl+C / Esc doet in een vraag. */
export function orCancel<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Geannuleerd.");
    process.exit(0);
  }
  return value as T;
}
