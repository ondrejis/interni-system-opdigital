/** Čisté pomocné funkce a české popisky pro Nastavení → Exporty (bez Reactu, aby šly testovat samostatně). */

export type StatusInfo = { label: string; color: string };

/** Stav exportu v „Moje exporty“ jako štítek. Neznámý stav se ukáže tak, jak přišel, šedě. */
const RUN_STATUS: Record<string, StatusInfo> = {
  queued: { label: "Ve frontě", color: "gray" },
  running: { label: "Zpracovává se", color: "blue" },
  done: { label: "Hotovo", color: "green" },
  failed: { label: "Selhalo", color: "red" },
  expired: { label: "Vypršelo", color: "gray" },
};

export function runStatus(status: string): StatusInfo {
  return RUN_STATUS[status] ?? { label: status, color: "gray" };
}

/** Export čeká nebo se zpracovává, takže se seznam má obnovovat. */
export const isRunActive = (status: string) => status === "queued" || status === "running";

export const FORMAT_LABEL: Record<string, string> = {
  csv: "CSV",
  xlsx: "Excel (XLSX)",
  pdf: "PDF",
};
export const formatLabel = (f: string) => FORMAT_LABEL[f] ?? f.toUpperCase();

export const DELIVER_LABEL = {
  email: "E-mailem",
  myexports: "Do Moje exporty",
  both: "E-mailem i do Moje exporty",
} as const;
export const deliverLabel = (d: string) => DELIVER_LABEL[d as keyof typeof DELIVER_LABEL] ?? d;

/** Velikost souboru: „512 B“, „1,5 kB“, „12 MB“. Neznámá velikost je pomlčka. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["kB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const text = (Math.round(value * 10) / 10).toString().replace(".", ",");
  return `${text} ${units[i]}`;
}

/** Počet řádků s oddělením tisíců: „12 345“. */
export const formatCount = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : new Intl.NumberFormat("cs-CZ").format(n);

/* ---------- plány ---------- */

export type Timing = {
  frequency: "daily" | "weekly" | "monthly";
  /** 1 = pondělí … 7 = neděle. */
  weekday: number | null;
  /** 1–28, 0 = poslední den měsíce. */
  monthDay: number | null;
  /** `HH:MM`. */
  timeLocal: string;
};

/** Dny v týdnu pro výběr (1 = pondělí) a jejich tvar po „Každé / Každý / Každou“. */
export const WEEKDAYS = [
  { value: 1, label: "pondělí", every: "Každé pondělí" },
  { value: 2, label: "úterý", every: "Každé úterý" },
  { value: 3, label: "středa", every: "Každou středu" },
  { value: 4, label: "čtvrtek", every: "Každý čtvrtek" },
  { value: 5, label: "pátek", every: "Každý pátek" },
  { value: 6, label: "sobota", every: "Každou sobotu" },
  { value: 7, label: "neděle", every: "Každou neděli" },
] as const;

/** „07:00“ → „7:00“ (české zápisy času bez úvodní nuly u hodin). */
export function timeText(timeLocal: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeLocal.trim());
  return m ? `${Number(m[1])}:${m[2]}` : timeLocal;
}

/** Popis četnosti plánu: „Každý den v 7:00“, „Každé pondělí v 7:00“, „Každého 5. v měsíci v 7:00“, „Poslední den v měsíci v 7:00“. */
export function describeTiming(t: Timing): string {
  const at = `v ${timeText(t.timeLocal)}`;
  if (t.frequency === "daily") return `Každý den ${at}`;
  if (t.frequency === "weekly") {
    const day = WEEKDAYS.find((d) => d.value === (t.weekday ?? 1)) ?? WEEKDAYS[0];
    return `${day.every} ${at}`;
  }
  if (t.monthDay === 0) return `Poslední den v měsíci ${at}`;
  return `Každého ${t.monthDay ?? 1}. v měsíci ${at}`;
}

/** Měsíční den 0 = poslední den měsíce; ostatní 1–28. */
export const MONTH_DAYS: { value: number; label: string }[] = [
  ...Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `${i + 1}.` })),
  { value: 0, label: "Poslední den v měsíci" },
];

/** Příjemci plánu v řádku: „Jan Novák“, „Jan Novák a 2 další“. */
export function recipientsText(names: readonly string[]): string {
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0]!;
  const rest = names.length - 1;
  return `${names[0]} a ${rest} ${rest < 5 ? "další" : "dalších"}`;
}

export const MAX_RECIPIENTS = 20;

/** Zadaný čas je platné `HH:MM`. */
export const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/* ---------- šablony ---------- */

/** Odkaz „Použít šablonu“: seznam entity s parametrem, který exportní dialog v seznamu předvyplní. */
export function templateHref(listPath: string | undefined, templateId: string): string | null {
  if (!listPath) return null;
  return `${listPath}?exportTemplate=${encodeURIComponent(templateId)}`;
}

/* ---------- záložky ---------- */

export const TAB_KEYS = ["moje", "sablony", "plany", "historie", "nastaveni"] as const;
export type TabKey = (typeof TAB_KEYS)[number];

/** Záložka z adresy (`?tab=`), jen z těch, které smí uživatel vidět; jinak první dostupná. */
export function resolveTab(raw: string | null | undefined, allowed: readonly TabKey[]): TabKey {
  return allowed.find((t) => t === raw) ?? allowed[0] ?? "moje";
}
