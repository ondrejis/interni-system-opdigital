/*
  Plán měsíčních plateb z retaineru (FIN-20, ZAK-15, R-35). Funkce jen VRACÍ seznam plateb, které se mají založit —
  zápis do DB a jednorázovost zajišťuje FIN-B (unikát `(job_id, retainer_id, period_month)`). Vzhledem k už existujícím
  platbám je výpočet idempotentní: druhé spuštění vrátí prázdný seznam.

  Rozhodnutí:
  - Co se generuje: každý měsíc od `fromMonth` (nebo `options.notBefore`) do `min(toMonth, upToMonth)` včetně, pro který
    ještě neexistuje platba retaineru (v jakémkoli stavu — i Zrušená, protože unikát platí i na ni). Tím se při startu
    „dožene“ zameškaný měsíc.
  - Den vystavení (`issueDay`, 1–28, R-35) předvyplní PLÁNOVANÉ datum vystavení (`plannedIssuedOn`); splatnost se
    nenastavuje.
  - Fakturující: `fixed` → vždy `issuerId`; `alternate` → střídání od `fromMonth` (první měsíc `firstIssuerId`, pak
    ostatní z `partnerIds` v daném pořadí dokola). Střídání se odvozuje z měsíce, ne z počtu existujících plateb, takže je
    stabilní, i když se nějaký měsíc zruší.
  - Neaktivní retainer nic neplánuje. Ukončení k měsíci: `retainerEndImpact` řekne, které budoucí Plánované platby zrušit.
*/
import { addMonths, assertMonth, dateInMonth, monthsBetween } from "./dates";
import { assertPositiveMinor } from "./money";
import { FinanceLogicError, type PaymentStatus } from "./types";

/** Retainer (FIN-20) tak, jak ho potřebuje plán. */
export interface RetainerDef {
  id: string;
  jobId: string;
  amountMinor: number;
  /** První měsíc (`YYYY-MM`). */
  fromMonth: string;
  /** Poslední měsíc včetně; prázdné = bez konce. */
  toMonth?: string | null;
  /** Den vystavení v měsíci, 1–28. */
  issueDay: number;
  issuerMode: "fixed" | "alternate";
  /** Fakturující při `fixed`. */
  issuerId?: string | null;
  /** Kdo začíná při `alternate`. */
  firstIssuerId?: string | null;
  active: boolean;
}

/** Už existující platba retaineru (kterýkoli stav). */
export interface ExistingRetainerPayment {
  periodMonth: string;
  retainerId?: string | null;
  status?: PaymentStatus;
}

/** Nastavení plánu. */
export interface RetainerScheduleOptions {
  /** Do kterého měsíce včetně generovat (typicky aktuální měsíc; job v 1. dni měsíce). */
  upToMonth: string;
  /** Osoby, které se střídají (pořadí = pořadí střídání po prvním). Povinné u `alternate`. */
  partnerIds?: readonly string[];
  /** Už existující platby tohoto retaineru. */
  existing?: readonly ExistingRetainerPayment[];
  /** Nejdřívější měsíc, který se smí generovat (omezení dohánění). */
  notBefore?: string;
}

/** Platba, kterou má FIN-B založit (stav Plánovaná, režim rozdělení podle pravidel, druh retainer). */
export interface ScheduledPayment {
  jobId: string;
  retainerId: string;
  kind: "retainer";
  periodMonth: string;
  /** „Retainer MM/RRRR“. */
  description: string;
  amountMinor: number;
  issuerId: string;
  /** Plánované datum vystavení `YYYY-MM-DD` (z `issueDay`). */
  plannedIssuedOn: string;
  status: "planned";
}

const MAX_MONTHS = 1200;

/** Popisek měsíční platby retaineru: „Retainer 12/2026“. */
export function retainerLabel(month: string): string {
  assertMonth(month);
  return `Retainer ${month.slice(5)}/${month.slice(0, 4)}`;
}

function validateRetainer(def: RetainerDef): void {
  const bad = (message: string) => {
    throw new FinanceLogicError("invalid_retainer", message);
  };
  assertPositiveMinor(def.amountMinor, "Měsíční částka retaineru");
  assertMonth(def.fromMonth, "Začátek retaineru");
  if (def.toMonth) {
    assertMonth(def.toMonth, "Konec retaineru");
    if (def.toMonth < def.fromMonth) bad("Retainer nemůže skončit dřív, než začal.");
  }
  if (!Number.isInteger(def.issueDay) || def.issueDay < 1 || def.issueDay > 28) {
    bad("Den vystavení musí být celé číslo 1–28.");
  }
  if (def.issuerMode === "fixed" && !def.issuerId) bad("Retainer nemá fakturujícího.");
  if (def.issuerMode === "alternate" && !def.firstIssuerId) {
    bad("U střídání musí být určeno, kdo začíná.");
  }
}

/** Fakturující retaineru za daný měsíc (viz hlavička souboru: pevný, nebo střídání od `fromMonth`). */
export function retainerIssuerFor(
  def: Pick<RetainerDef, "fromMonth" | "issuerMode" | "issuerId" | "firstIssuerId">,
  month: string,
  partnerIds: readonly string[] = [],
): string {
  if (def.issuerMode === "fixed") {
    if (!def.issuerId)
      throw new FinanceLogicError("invalid_retainer", "Retainer nemá fakturujícího.");
    return def.issuerId;
  }
  const first = def.firstIssuerId;
  if (!first) {
    throw new FinanceLogicError("invalid_retainer", "U střídání musí být určeno, kdo začíná.");
  }
  const order = [first, ...partnerIds.filter((id) => id !== first)];
  const offset = monthsBetween(def.fromMonth, month);
  return order[((offset % order.length) + order.length) % order.length]!;
}

/**
 * Vrátí platby retaineru, které se mají založit, aby existovaly všechny měsíce od začátku do `upToMonth` (nebo do konce
 * retaineru). Pořadí vzestupně podle měsíce. Idempotentní vůči `options.existing`.
 */
export function retainerSchedule(
  def: RetainerDef,
  options: RetainerScheduleOptions,
): ScheduledPayment[] {
  validateRetainer(def);
  assertMonth(options.upToMonth, "Měsíc, do kterého se generuje");
  if (!def.active) return [];
  const lower =
    options.notBefore && options.notBefore > def.fromMonth ? options.notBefore : def.fromMonth;
  assertMonth(lower);
  const upper = def.toMonth && def.toMonth < options.upToMonth ? def.toMonth : options.upToMonth;
  if (upper < lower) return [];
  if (monthsBetween(lower, upper) > MAX_MONTHS) {
    throw new FinanceLogicError("invalid_retainer", "Plán retaineru by byl příliš dlouhý.");
  }
  const have = new Set(
    (options.existing ?? [])
      .filter((e) => !e.retainerId || e.retainerId === def.id)
      .map((e) => e.periodMonth),
  );
  const out: ScheduledPayment[] = [];
  for (let m = lower; m <= upper; m = addMonths(m, 1)) {
    if (have.has(m)) continue;
    out.push({
      jobId: def.jobId,
      retainerId: def.id,
      kind: "retainer",
      periodMonth: m,
      description: retainerLabel(m),
      amountMinor: def.amountMinor,
      issuerId: retainerIssuerFor(def, m, options.partnerIds),
      plannedIssuedOn: dateInMonth(m, def.issueDay),
      status: "planned",
    });
  }
  return out;
}

/** Platba retaineru pro zjištění dopadu ukončení. */
export interface RetainerPaymentRef {
  id: string;
  periodMonth: string;
  status: PaymentStatus;
}

/** Dopad ukončení retaineru k měsíci (ZAK-17, AS-04). */
export interface RetainerEndImpact {
  /** Budoucí Plánované platby (po `endMonth`), které se po potvrzení zruší. */
  cancelIds: string[];
  /** Platby po `endMonth`, které už jsou Vystavené/Zaplacené — nezruší se, uživatel je má vyřešit ručně. */
  keptIds: string[];
}

/** Které platby retaineru zrušit, když retainer končí k měsíci `endMonth` (včetně). Zrušené platby se ignorují. */
export function retainerEndImpact(
  payments: readonly RetainerPaymentRef[],
  endMonth: string,
): RetainerEndImpact {
  assertMonth(endMonth, "Měsíc ukončení");
  const cancelIds: string[] = [];
  const keptIds: string[] = [];
  for (const p of [...payments].sort((a, b) => a.periodMonth.localeCompare(b.periodMonth))) {
    if (p.periodMonth <= endMonth || p.status === "canceled") continue;
    (p.status === "planned" ? cancelIds : keptIds).push(p.id);
  }
  return { cancelIds, keptIds };
}
