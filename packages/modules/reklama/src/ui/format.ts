import { addMonthsIso, formatInstant, monthOf, monthRange } from "@rebar/core/time";
import type { DailyPoint, PerformanceMetrics } from "../contract";

/*
  Čistý formát a odvozená čísla pro UI reklamy (REK-08, REK-09, REK-11, KLI-08): peníze v celých jednotkách měny,
  čísla česky, rozdíl leadů Meta × OPSYS, stav synchronizace a součty po měsících. Bez Reactu, aby šlo testovat bez DOM
  (`format.test.ts`). Peníze jsou v haléřích, `null` je „nelze spočítat“ a ukazuje se pomlčkou, ne nulou.
*/

/** Pomlčka pro hodnotu, kterou nejde spočítat (bez dělitele). */
export const DASH = "–";

const nfInt = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });
const nfPct = new Intl.NumberFormat("cs-CZ", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Nezlomitelná mezera mezi číslem a jednotkou. */
const NBSP = String.fromCharCode(0xa0);

const SYMBOLS: Record<string, string> = { CZK: "Kč", EUR: "€", USD: "$" };

/** Celé číslo s oddělenými tisíci: „12 345“. */
export function fmtInt(n: number | null | undefined): string {
  return n === null || n === undefined ? DASH : nfInt.format(n);
}

/** Peníze v celých jednotkách měny: „12 345 Kč“ (haléře → koruny); `null` je pomlčka. Měna bez údaje je CZK. */
export function fmtMoney(minor: number | null | undefined, currency?: string | null): string {
  if (minor === null || minor === undefined) return DASH;
  const cur = currency ?? "CZK";
  return `${nfInt.format(Math.round(minor / 100))}${NBSP}${SYMBOLS[cur] ?? cur}`;
}

/** Procenta na dvě desetinná místa: „1,23 %“; `null` je pomlčka. */
export function fmtPct(p: number | null | undefined): string {
  return p === null || p === undefined ? DASH : `${nfPct.format(p)}${NBSP}%`;
}

/** Den `RRRR-MM-DD` jako „14. 10.“ (s `year` „14. 10. 2026“). */
export function fmtDay(date: string, year = false): string {
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${Number(d)}. ${Number(m)}.${year ? ` ${y}` : ""}`;
}

/** Období jako „1. 10. – 14. 10. 2026“. */
export function fmtPeriod(p: { from: string; to: string }): string {
  return p.from === p.to
    ? fmtDay(p.to, true)
    : `${fmtDay(p.from, p.from.slice(0, 4) !== p.to.slice(0, 4))} – ${fmtDay(p.to, true)}`;
}

const MONTHS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

/** Měsíc `RRRR-MM` jako „říjen 2026“. */
export function fmtMonth(month: string): string {
  const [y, m] = month.split("-");
  const name = MONTHS[Number(m) - 1];
  return name ? `${name} ${y}` : month;
}

/** Měsíc `RRRR-MM` krátce pro osu grafu a mobil: „10/2026“. */
export function fmtMonthShort(month: string): string {
  const [y, m] = month.split("-");
  return `${Number(m)}/${y}`;
}

/* ---------- rozdíl leadů Meta × OPSYS ---------- */

/** Jak ukázat rozdíl mezi leady podle Meta a podle OPSYS (REK-08: leady, které se cestou ztratily). */
export type LostInfo = {
  /** Krátký text do buňky. */
  label: string;
  /** `warn` = Meta napočítala víc, než dorazilo; `info` = v OPSYS je víc (ruční zápisy); `ok` = souhlasí. */
  tone: "warn" | "info" | "ok" | "none";
  /** Delší vysvětlení pro title a čtečky. */
  hint: string;
};

/** Z metrik složí popis rozdílu leadů. Bez leadů na obou stranách nic neukazuje. */
export function lostInfo(
  m: Pick<PerformanceMetrics, "leadsMeta" | "leadsOpsys" | "leadsLost">,
): LostInfo {
  const lost = m.leadsLost;
  if (m.leadsMeta === 0 && m.leadsOpsys === 0)
    return { label: DASH, tone: "none", hint: "Bez leadů" };
  if (lost > 0)
    return {
      label: `−${fmtInt(lost)}`,
      tone: "warn",
      hint: `Meta napočítala o ${fmtInt(lost)} leadů víc, než dorazilo do OPSYS (ztracené leady).`,
    };
  if (lost < 0)
    return {
      label: `+${fmtInt(-lost)}`,
      tone: "info",
      hint: `V OPSYS je o ${fmtInt(-lost)} leadů víc, než napočítala Meta (např. ručně zapsané obchody).`,
    };
  return { label: "0", tone: "ok", hint: "Leady podle Meta a podle OPSYS souhlasí." };
}

/* ---------- synchronizace účtu ---------- */

/** Po kolika hodinách bez synchronizace se účet označí jako zastaralý (úloha běží denně v 6:00). */
export const STALE_HOURS = 36;

/** Stav posledního stažení dat z Meta pro štítek u účtu. */
export type SyncState = {
  kind: "never" | "error" | "stale" | "ok";
  /** Text stavu: „Synchronizováno 14. 10. 06:00“, „Chyba synchronizace“, „Zatím nesynchronizováno“. */
  label: string;
  /** Barva štítku jádra. */
  color: "gray" | "red" | "orange" | "green";
};

/** Stav posledního stažení dat z Meta podle času a chyby (chyba má přednost). */
export function syncState(
  lastSyncAt: string | null,
  lastSyncError: string | null,
  now: Date = new Date(),
): SyncState {
  if (lastSyncError) return { kind: "error", label: "Chyba synchronizace", color: "red" };
  if (!lastSyncAt) return { kind: "never", label: "Zatím nesynchronizováno", color: "gray" };
  const at = new Date(lastSyncAt);
  const when = formatInstant(at);
  if (now.getTime() - at.getTime() > STALE_HOURS * 3_600_000)
    return { kind: "stale", label: `Naposledy ${when}`, color: "orange" };
  return { kind: "ok", label: `Synchronizováno ${when}`, color: "green" };
}

/* ---------- po měsících (záložka Reklama u klienta a zakázky) ---------- */

/** Součet jednoho měsíce (záložka Reklama u klienta a zakázky). */
export type MonthRow = {
  /** `RRRR-MM`. */
  month: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  leadsMeta: number;
  leadsOpsys: number;
  /** Útrata / leady Meta; `null` bez leadů. */
  cplMinor: number | null;
};

/** Sečte denní body po měsících (vzestupně); měsíc bez dat mezi prvním a posledním se doplní nulami. */
export function aggregateMonthly(daily: readonly DailyPoint[]): MonthRow[] {
  if (daily.length === 0) return [];
  const by = new Map<string, MonthRow>();
  const months = [...new Set(daily.map((d) => monthOf(d.date)))].sort();
  const first = months[0]!;
  const last = months[months.length - 1]!;
  for (let m = first; m <= last; m = monthOf(addMonthsIso(`${m}-01`, 1)))
    by.set(m, {
      month: m,
      spendMinor: 0,
      impressions: 0,
      clicks: 0,
      leadsMeta: 0,
      leadsOpsys: 0,
      cplMinor: null,
    });
  for (const d of daily) {
    const row = by.get(monthOf(d.date));
    if (!row) continue;
    row.spendMinor += d.spendMinor;
    row.impressions += d.impressions;
    row.clicks += d.clicks;
    row.leadsMeta += d.leadsMeta;
    row.leadsOpsys += d.leadsOpsys;
  }
  for (const row of by.values())
    row.cplMinor = row.leadsMeta > 0 ? Math.round(row.spendMinor / row.leadsMeta) : null;
  return [...by.values()];
}

/** Rozsah „poslední N měsíců“ (včetně aktuálního) pro záložku Reklama: od 1. dne měsíce před N−1 měsíci do dneška. */
export function lastMonthsPeriod(today: string, months: number): { from: string; to: string } {
  const start = monthOf(addMonthsIso(`${today.slice(0, 7)}-01`, -(months - 1)));
  return { from: monthRange(start).from, to: today };
}

/* ---------- graf ---------- */

/** Popisek dne na ose grafu: „14. 10.“. */
export const dayLabel = (date: string) => fmtDay(date);

/** Součet řady (pro popisek pod grafem). */
export function sumBy(
  daily: readonly DailyPoint[],
  key: "spendMinor" | "leadsMeta" | "leadsOpsys",
) {
  return daily.reduce((s, d) => s + d[key], 0);
}

/** Cesta do detailu: účet a kampaň. */
export const accountHref = (id: string) => `/reklama/${id}`;
/** Adresa detailu kampaně. */
export const campaignHref = (id: string) => `/reklama/kampane/${id}`;

/* ---------- stavy a kreativy ---------- */

const STATUS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "Aktivní", color: "green" },
  PAUSED: { label: "Pozastavená", color: "gray" },
  CAMPAIGN_PAUSED: { label: "Kampaň pozastavena", color: "gray" },
  ADSET_PAUSED: { label: "Sada pozastavena", color: "gray" },
  ARCHIVED: { label: "Archivovaná", color: "gray" },
  DELETED: { label: "Smazaná", color: "red" },
  IN_PROCESS: { label: "Zpracovává se", color: "orange" },
  PENDING_REVIEW: { label: "Čeká na schválení", color: "orange" },
  DISAPPROVED: { label: "Zamítnutá", color: "red" },
  WITH_ISSUES: { label: "S problémy", color: "orange" },
};

/** Stav objektu z Meta česky a barvou štítku; neznámý stav se ukáže tak, jak přišel; bez stavu `null`. */
export function statusInfo(status: string | null): { label: string; color: string } | null {
  if (!status) return null;
  return STATUS[status.toUpperCase()] ?? { label: status, color: "gray" };
}

/** Cíl kampaně z Meta (`OUTCOME_LEADS`) česky; neznámý cíl se vrátí nezměněný. */
const OBJECTIVES: Record<string, string> = {
  OUTCOME_LEADS: "Poptávky",
  LEAD_GENERATION: "Poptávky",
  OUTCOME_TRAFFIC: "Návštěvnost",
  LINK_CLICKS: "Návštěvnost",
  OUTCOME_AWARENESS: "Povědomí",
  BRAND_AWARENESS: "Povědomí",
  REACH: "Dosah",
  OUTCOME_ENGAGEMENT: "Interakce",
  POST_ENGAGEMENT: "Interakce",
  OUTCOME_SALES: "Prodeje",
  CONVERSIONS: "Konverze",
  OUTCOME_APP_PROMOTION: "Propagace aplikace",
  VIDEO_VIEWS: "Zhlédnutí videa",
  MESSAGES: "Zprávy",
};
/** Cíl kampaně česky; bez cíle `null`. */
export function objectiveLabel(objective: string | null): string | null {
  if (!objective) return null;
  return OBJECTIVES[objective.toUpperCase()] ?? objective;
}

/** Adresa náhledu kreativy jen pokud je `http(s)`; jinou (data:, javascript:) UI nikdy nevykreslí. */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Výsledek leadu (obchodu) česky. */
export const RESULT_LABEL = { open: "Otevřený", won: "Vyhraný", lost: "Prohraný" } as const;
export const RESULT_COLOR = { open: "blue", won: "green", lost: "gray" } as const;
