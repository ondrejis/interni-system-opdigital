import { addDaysIso, eachDayIso, monthRange } from "@rebar/core/time";
import type { DailyPoint, LeadIngestPayload, PerformanceMetrics } from "../contract";

/*
  Čistá logika reklamy bez databáze a sítě (REK-07, REK-10): výpočty CPL a nákladu na vyhraný obchod, období, okno
  přepočtu statistik, převod částek z Meta API a rozbor těla leadu z n8n. Má unit testy (`logic.test.ts`).
*/

/** Kolik předchozích dní (kromě dneška) se při synchronizaci přepisuje kvůli korekcím od Meta. */
export const REWRITE_DAYS = 7;
/** Kolik dní historie se stáhne při první synchronizaci účtu (aby šla vybrat období do 90 dní). */
export const BACKFILL_DAYS = 90;
/** Zdroj příchozích leadů v `inbound_event`. */
export const LEAD_SOURCE = "leads";

/* ---------- metriky ---------- */

/** Surové součty za období, ze kterých se skládají metriky. */
export type MetricsInput = {
  spendMinor: number;
  impressions: number;
  clicks: number;
  leadsMeta: number;
  leadsOpsys: number;
  wonDeals: number;
};

/** Podíl `a / b` v haléřích zaokrouhlený na celé číslo; `null`, když dělitel není kladný. */
export function ratioMinor(a: number, b: number): number | null {
  return b > 0 ? Math.round(a / b) : null;
}

/** CPL = útrata / počet leadů (haléře); `null` bez leadů. */
export const cplMinor = ratioMinor;

/** Prokliky v procentech zobrazení (na dvě desetinná místa); `null` bez zobrazení. */
export function ctrPct(clicks: number, impressions: number): number | null {
  return impressions > 0 ? Math.round((clicks / impressions) * 10_000) / 100 : null;
}

/** Z hrubých součtů složí `PerformanceMetrics` (CPL Meta, CPL OPSYS, ztracené leady, náklad na vyhraný obchod). */
export function buildMetrics(i: MetricsInput): PerformanceMetrics {
  return {
    spendMinor: i.spendMinor,
    impressions: i.impressions,
    clicks: i.clicks,
    ctrPct: ctrPct(i.clicks, i.impressions),
    leadsMeta: i.leadsMeta,
    leadsOpsys: i.leadsOpsys,
    leadsLost: i.leadsMeta - i.leadsOpsys,
    cplMinor: cplMinor(i.spendMinor, i.leadsMeta),
    cplOpsysMinor: cplMinor(i.spendMinor, i.leadsOpsys),
    wonDeals: i.wonDeals,
    costPerWonMinor: ratioMinor(i.spendMinor, i.wonDeals),
  };
}

/** Prázdné součty. */
export const emptyMetricsInput = (): MetricsInput => ({
  spendMinor: 0,
  impressions: 0,
  clicks: 0,
  leadsMeta: 0,
  leadsOpsys: 0,
  wonDeals: 0,
});

/** Sečte součty (např. kampaně účtu). */
export function sumMetricsInputs(list: readonly MetricsInput[]): MetricsInput {
  return list.reduce(
    (acc, m) => ({
      spendMinor: acc.spendMinor + m.spendMinor,
      impressions: acc.impressions + m.impressions,
      clicks: acc.clicks + m.clicks,
      leadsMeta: acc.leadsMeta + m.leadsMeta,
      leadsOpsys: acc.leadsOpsys + m.leadsOpsys,
      wonDeals: acc.wonDeals + m.wonDeals,
    }),
    emptyMetricsInput(),
  );
}

/**
 * Doplní dny bez dat nulami a seřadí vzestupně, aby graf neměl mezery. Řádky mimo `from..to` zahodí; více řádků téhož
 * dne sečte.
 */
export function fillDaily(
  points: readonly Pick<
    DailyPoint,
    "date" | "spendMinor" | "impressions" | "clicks" | "leadsMeta" | "leadsOpsys"
  >[],
  from: string,
  to: string,
): DailyPoint[] {
  const by = new Map<string, DailyPoint>();
  for (const date of eachDayIso(from, to))
    by.set(date, {
      date,
      spendMinor: 0,
      impressions: 0,
      clicks: 0,
      leadsMeta: 0,
      leadsOpsys: 0,
    });
  for (const p of points) {
    const cur = by.get(p.date);
    if (!cur) continue;
    cur.spendMinor += p.spendMinor;
    cur.impressions += p.impressions;
    cur.clicks += p.clicks;
    cur.leadsMeta += p.leadsMeta;
    cur.leadsOpsys += p.leadsOpsys;
  }
  return [...by.values()];
}

/* ---------- období ---------- */

/** Předvolby období v záhlaví: 7, 30, 90 dní, tento měsíc, vlastní. */
export type PeriodPreset = "7d" | "30d" | "90d" | "month" | "custom";

/**
 * Období z předvolby: `7d`/`30d`/`90d` = posledních N dní včetně dneška, `month` = od 1. dne měsíce do dneška,
 * `custom` = zadané `from`/`to` (chybí-li, posledních 30 dní).
 */
export function periodFromPreset(
  preset: PeriodPreset,
  today: string,
  custom?: { from?: string; to?: string },
): { from: string; to: string } {
  switch (preset) {
    case "7d":
      return { from: addDaysIso(today, -6), to: today };
    case "30d":
      return { from: addDaysIso(today, -29), to: today };
    case "90d":
      return { from: addDaysIso(today, -89), to: today };
    case "month":
      return { from: monthRange(today.slice(0, 7)).from, to: today };
    case "custom":
      return custom?.from && custom.to && custom.from <= custom.to
        ? { from: custom.from, to: custom.to }
        : { from: addDaysIso(today, -29), to: today };
  }
}

/** Okno, které denní synchronizace přepíše: dnešek a `REWRITE_DAYS` předchozích dní (korekce od Meta). */
export function rewriteWindow(today: string): { from: string; to: string } {
  return { from: addDaysIso(today, -REWRITE_DAYS), to: today };
}

/** Okno první synchronizace účtu: `BACKFILL_DAYS` dní zpět včetně dneška. */
export function backfillWindow(today: string): { from: string; to: string } {
  return { from: addDaysIso(today, -(BACKFILL_DAYS - 1)), to: today };
}

/* ---------- převody z Meta API ---------- */

/**
 * Částka z Meta API (`"123.45"`, v měně účtu) na haléře bez chyb pohyblivé čárky. Nečíselné nebo záporné vstupy
 * dávají 0.
 */
export function toMinor(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined || amount === "") return 0;
  const s = typeof amount === "number" ? amount.toFixed(4) : amount.trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return 0;
  const whole = Number(m[1]);
  const frac = (m[2] ?? "").padEnd(3, "0");
  const cents = Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0);
  return whole * 100 + cents;
}

/** Celé nezáporné číslo z řetězce Meta API (`"1234"`); jinak 0. */
export function toCount(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Typy akcí v Meta `actions`, které se počítají jako lead (první nalezený vyhrává, aby se leady nedvojily). */
export const LEAD_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
] as const;

/** Počet leadů z pole `actions` insights (`[{action_type, value}]`). */
export function leadsFromActions(
  actions: readonly { action_type: string; value: string | number }[] | undefined,
): number {
  if (!actions?.length) return 0;
  for (const t of LEAD_ACTION_TYPES) {
    const hit = actions.find((a) => a.action_type === t);
    if (hit) return toCount(hit.value);
  }
  return 0;
}

/* ---------- rozbor leadu z n8n ---------- */

/** Údaje o člověku vytažené z těla leadu. */
export type ParsedLead = {
  name: string;
  email: string | undefined;
  phone: string | undefined;
  companyName: string | undefined;
  ico: string | undefined;
};

/** Název pole formuláře bez diakritiky a interpunkce (`"Telefonní číslo"` → `telefonni_cislo`). */
export function normalizeFieldKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const FIELD_ALIASES: Record<string, keyof ParsedLeadRaw> = {
  full_name: "fullName",
  name: "fullName",
  jmeno_a_prijmeni: "fullName",
  cele_jmeno: "fullName",
  jmeno_prijmeni: "fullName",
  first_name: "firstName",
  jmeno: "firstName",
  last_name: "lastName",
  prijmeni: "lastName",
  email: "email",
  e_mail: "email",
  work_email: "email",
  phone: "phone",
  phone_number: "phone",
  telefon: "phone",
  telefonni_cislo: "phone",
  mobil: "phone",
  work_phone_number: "phone",
  company_name: "companyName",
  company: "companyName",
  firma: "companyName",
  nazev_firmy: "companyName",
  spolecnost: "companyName",
  ico: "ico",
  ic: "ico",
  company_ico: "ico",
};

type ParsedLeadRaw = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  ico?: string;
};

const clean = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
};

/**
 * Vytáhne jméno, e-mail, telefon, firmu a IČO z těla leadu: přímá pole mají přednost před `fields` a ta před `fieldData`
 * (formát Meta). Chybí-li celé jméno, složí se z křestního jména a příjmení; jinak z e-mailu nebo telefonu, aby
 * lead vždy měl jak se jmenovat.
 */
export function parseLead(p: LeadIngestPayload): ParsedLead {
  const raw: ParsedLeadRaw = {};
  const put = (key: string, value: unknown) => {
    const target = FIELD_ALIASES[normalizeFieldKey(key)];
    const v = clean(value);
    if (target && v && raw[target] === undefined) raw[target] = v;
  };
  for (const [k, v] of Object.entries(p.fields ?? {})) put(k, v);
  for (const f of p.fieldData ?? []) put(f.name, Array.isArray(f.values) ? f.values[0] : f.values);
  const direct: ParsedLeadRaw = {
    fullName: clean(p.fullName),
    firstName: clean(p.firstName),
    lastName: clean(p.lastName),
    email: clean(p.email),
    phone: clean(p.phone),
    companyName: clean(p.companyName),
    ico: clean(p.ico),
  };
  const get = <K extends keyof ParsedLeadRaw>(k: K) => direct[k] ?? raw[k];
  const joined = [get("firstName"), get("lastName")].filter(Boolean).join(" ");
  const email = get("email");
  const phone = get("phone");
  return {
    name: get("fullName") ?? (joined || email || phone || "Neznámý kontakt"),
    email,
    phone,
    companyName: get("companyName"),
    ico: get("ico"),
  };
}

/** Čas vytvoření leadu z těla (ISO nebo unixové sekundy); neplatný nebo chybějící = `null`. */
export function parseLeadTime(v: string | number | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d =
    typeof v === "number" || /^\d{9,11}$/.test(String(v))
      ? new Date(Number(v) * 1000)
      : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Název obchodu z leadu: „Jan Novák – Poptávka web“ (formulář), jinak kampaň, jinak „Meta lead“. */
export function leadDealTitle(
  name: string,
  p: Pick<LeadIngestPayload, "formName" | "campaignName">,
): string {
  const suffix = clean(p.formName) ?? clean(p.campaignName) ?? "Meta lead";
  const title = `${name} – ${suffix}`;
  return title.length > 160 ? `${title.slice(0, 159)}…` : title;
}
