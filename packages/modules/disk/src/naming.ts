/*
  Pojmenování složek na Disku: složka klienta a složka zakázky `{RRRR-MM} {Název zakázky}`. Čisté funkce
  (bez serveru a databáze), aby je šlo testovat a aby název sestavoval vždy OPSYS, ne n8n.
*/
import { sanitizeFolderName } from "./tree";

/** Dnešní datum v české zóně jako `YYYY-MM-DD` (rok a měsíc složky zakázky bez data zahájení). */
export function pragueToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Název složky klienta: název firmy bez lomítek a přebytečných mezer. */
export function clientFolderName(clientName: string): string {
  return sanitizeFolderName(clientName, "Klient bez názvu");
}

/** Vstup pro název složky zakázky. */
export type JobNameInput = {
  title: string;
  /** Kód zakázky (`Z-2026-001`). */
  number?: string | null;
  /** Datum zahájení `YYYY-MM-DD`; bez něj se vezme dnešek. */
  startDate?: string | null;
};

/**
 * Název složky zakázky podle vzoru z Nastavení (výchozí `{RRRR-MM} {Název zakázky}`), např. `2026-10 Nový web`.
 * Proměnné: `{RRRR-MM}`, `{RRRR}`, `{MM}`, `{Název zakázky}`, `{Číslo}`.
 */
export function jobFolderName(pattern: string, job: JobNameInput, now: Date = new Date()): string {
  const date = /^\d{4}-\d{2}-\d{2}/.test(job.startDate ?? "")
    ? job.startDate!.slice(0, 10)
    : pragueToday(now);
  const [year, month] = date.split("-") as [string, string];
  const out = pattern
    .replaceAll("{RRRR-MM}", `${year}-${month}`)
    .replaceAll("{RRRR}", year)
    .replaceAll("{MM}", month)
    .replaceAll("{Číslo}", job.number ?? "")
    .replaceAll("{Název zakázky}", job.title.trim());
  return sanitizeFolderName(out, "Zakázka bez názvu");
}
