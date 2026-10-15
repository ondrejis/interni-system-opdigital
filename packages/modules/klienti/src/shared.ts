/*
  Sdílené konstanty a čistá logika modulu „klienti“ (server i prohlížeč: žádné importy z DB ani ze zod).
  Pravidla stavů klienta (KLI-02, R-17), skrývání prázdných záložek, seskupení seznamu a odkazy akcí hlavičky.
*/
import type { ClientStatus, ClientTabId, DriveState, ServiceType } from "@rebar/core/contracts";

/** Stavy klienta v pořadí, v jakém se nabízejí. */
export const CLIENT_STATUSES: readonly ClientStatus[] = ["lead", "active", "paused", "former"];
/** Služby v pořadí, v jakém se nabízejí. */
export const SERVICES: readonly ServiceType[] = ["web", "marketing", "systemy"];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  lead: "Lead",
  active: "Aktivní",
  paused: "Pozastavený",
  former: "Bývalý",
};
/** Barvy čipů stavu (názvy barev `Chip` z `@rebar/ui`). */
export const CLIENT_STATUS_COLORS: Record<ClientStatus, string> = {
  lead: "blue",
  active: "green",
  paused: "orange",
  former: "gray",
};
export const SERVICE_LABELS: Record<ServiceType, string> = {
  web: "Web",
  marketing: "Marketing",
  systemy: "Systémy",
};
export const DRIVE_STATE_LABELS: Record<DriveState, string> = {
  none: "Bez složky",
  pending: "Vytváří se",
  ready: "Hotová",
  error: "Chyba",
  timeout: "Bez odpovědi",
};

/** Je text jedním ze stavů klienta? */
export const isClientStatus = (v: unknown): v is ClientStatus =>
  typeof v === "string" && (CLIENT_STATUSES as readonly string[]).includes(v);

/** Dnešní datum v Praze (`YYYY-MM-DD`). */
export function todayPrague(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return p;
}

/** Stav klienta před a po přechodu, jak ho pravidla vidí. */
export type ClientState = {
  status: ClientStatus | null;
  since: string | null;
  until: string | null;
};

/** Co přechod stavu zapíše do `company` a které události z něj vzniknou. */
export type StatusPlan = {
  changed: boolean;
  /** Sloupce k zápisu (vlastnosti tabulky `company`). */
  patch: {
    clientStatus: ClientStatus;
    clientSince?: string;
    clientUntil?: string | null;
    clientEndReason?: string;
  };
  /** „Klient od“ po přechodu. */
  since: string | null;
};

/**
 * Pravidla přechodu stavu klienta (KLI-02, R-17):
 * - „klient od“ se uloží jen při prvním přechodu na Aktivní a pak se už nemění;
 * - Bývalý má datum ukončení (výchozí dnes) a důvod; ruční přechod (`manual`) důvod vyžaduje;
 * - návrat z Bývalého smaže datum ukončení (důvod zůstává v historii změn).
 * Vrací `{ error }`, když přechod nejde (chybí důvod).
 */
export function planStatusChange(
  before: ClientState,
  to: ClientStatus,
  input: {
    reason?: string | undefined;
    endedOn?: string | undefined;
    source: "manual" | "deal_won" | "job_ended";
  },
  today: string,
): StatusPlan | { error: string } {
  if (before.status === to)
    return { changed: false, patch: { clientStatus: to }, since: before.since };
  const patch: StatusPlan["patch"] = { clientStatus: to };
  let since = before.since;
  if (to === "active" && !before.since) {
    since = today;
    patch.clientSince = today;
  }
  if (to === "former") {
    const reason = input.reason?.trim() ?? "";
    if (input.source === "manual" && !reason)
      return { error: "Napište, proč spolupráce skončila." };
    patch.clientUntil = input.endedOn?.trim() || today;
    patch.clientEndReason =
      reason || (input.source === "job_ended" ? "Poslední zakázka byla ukončena." : "");
    if (!patch.clientEndReason) delete patch.clientEndReason;
  } else if (before.status === "former") {
    patch.clientUntil = null;
  }
  return { changed: true, patch, since };
}

/** Záložky, které karta ukazuje vždy (Přehled a Kontext jsou vlastní, Historie je záložka Aktivita jádra). */
export const ALWAYS_VISIBLE_TABS: readonly ClientTabId[] = ["prehled", "kontext", "historie"];
/** Záložky, které karty klientů vykresluje sám modul `klienti` (bez dat nebo bez zapnutého modulu se skryjí). */
export const OWN_DATA_TABS: readonly ClientTabId[] = ["zakazky", "obchody"];

/**
 * Které záložky se skryjí: záložka bez dat (počet 0). Záložky, které vykresluje `klienti` sám (Zakázky, Obchody), se
 * skryjí i když poskytovatel chybí (modul není zapnutý); u cizích záložek chybějící počet nic neznamená (modul
 * záložku nemusí nabízet), proto se skrývají jen při výslovné nule.
 */
export function hiddenTabs(
  counts: Partial<Record<ClientTabId, number>>,
  all: readonly ClientTabId[],
): ClientTabId[] {
  return all.filter((id) => {
    if (ALWAYS_VISIBLE_TABS.includes(id)) return false;
    const n = counts[id];
    if (OWN_DATA_TABS.includes(id)) return !(typeof n === "number" && n > 0);
    return n === 0;
  });
}

/** Seskupení seznamu klientů. */
export type ClientGroupBy = "none" | "status" | "service";

type Groupable = { status: ClientStatus; services: readonly ServiceType[] };

/**
 * Seskupí řádky podle stavu nebo služby (klient s více službami je v každé své skupině; bez služby ve skupině
 * „Bez služby“). Pořadí skupin je pevné; prázdné skupiny se vynechají.
 */
export function groupClients<T extends Groupable>(
  rows: readonly T[],
  by: ClientGroupBy,
): { key: string; label: string; rows: T[] }[] {
  if (by === "none") return [{ key: "all", label: "Všichni klienti", rows: [...rows] }];
  if (by === "status") {
    return CLIENT_STATUSES.map((s) => ({
      key: s,
      label: CLIENT_STATUS_LABELS[s],
      rows: rows.filter((r) => r.status === s),
    })).filter((g) => g.rows.length);
  }
  const groups: { key: string; label: string; rows: T[] }[] = SERVICES.map((s) => ({
    key: s,
    label: SERVICE_LABELS[s],
    rows: rows.filter((r) => r.services.includes(s)),
  }));
  groups.push({
    key: "none",
    label: "Bez služby",
    rows: rows.filter((r) => r.services.length === 0),
  });
  return groups.filter((g) => g.rows.length);
}

/** Odkaz `tel:` z telefonu (jen číslice a `+`); `null`, když číslo není. */
export function telHref(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/[^\d+]/g, "");
  return d.length >= 5 ? `tel:${d}` : null;
}

/** Adresa jedním řádkem pro mapy; `null`, když chybí ulice i město. */
export function addressLine(a: {
  street?: unknown;
  city?: unknown;
  zip?: unknown;
  country?: unknown;
}): string | null {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const street = s(a.street);
  const city = [s(a.zip), s(a.city)].filter(Boolean).join(" ");
  if (!street && !s(a.city)) return null;
  return [street, city, s(a.country) && s(a.country) !== "CZ" ? s(a.country) : "Česko"]
    .filter(Boolean)
    .join(", ");
}

/** Odkaz do map (Google Maps; na telefonu ho přebere systémová aplikace). */
export function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Web ve tvaru odkazu (doplní `https://`); `null`, když web není. */
export function webHref(web: unknown): string | null {
  const v = typeof web === "string" ? web.trim() : "";
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** Odkaz „Nová zakázka“ pro klienta (stránka otevře dialog a, umí-li, předvyplní klienta). */
export const newJobHref = (companyId: string) => `/zakazky?novy=1&klient=${companyId}`;
/** Odkaz „Nový obchod“ pro klienta (viz `newJobHref`). */
export const newDealHref = (companyId: string) => `/obchody?novy=1&klient=${companyId}`;

/** Pořadí akcí hlavičky (`CLIENT_ACTIONS` z jádra; do prohlížeče se konstanty jádra netáhnou). */
export const ACTION_ORDER = { call: 20, web: 40, job: 70, deal: 80 } as const;

/** Pořadí záložek, které vykresluje modul `klienti` (shodné s `CLIENT_TABS` z jádra, hlídá `shared.test.ts`). */
export const OWN_TAB_ORDER = { kontext: 10, zakazky: 30, obchody: 40 } as const;
/** Pořadí karet Přehledu, které vykresluje modul `klienti` (shodné s `CLIENT_OVERVIEW_ORDER`). */
export const OWN_OVERVIEW_ORDER = { zakazky: 20, obchody: 30, finance: 50, udalosti: 90 } as const;
