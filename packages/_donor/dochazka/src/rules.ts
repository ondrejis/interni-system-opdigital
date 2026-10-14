import { formatMinutes, timeToMinutes } from "@rebar/core/time";

/** Druhy záznamů. Absence (dovolená, nemoc…) nemají zakázku a nezapočítávají se do nákladů zakázek. */
export const TIME_KINDS = [
  { value: "work", label: "Práce", absence: false, color: "blue" },
  { value: "travel", label: "Cesta", absence: false, color: "indigo" },
  { value: "workshop", label: "Dílna / sklad", absence: false, color: "teal" },
  { value: "admin", label: "Administrativa", absence: false, color: "purple" },
  { value: "vacation", label: "Dovolená", absence: true, color: "yellow" },
  { value: "sick", label: "Nemoc", absence: true, color: "red" },
  { value: "doctor", label: "Lékař", absence: true, color: "orange" },
  { value: "holiday", label: "Svátek", absence: true, color: "gray" },
  { value: "comp", label: "Náhradní volno", absence: true, color: "gray" },
] as const;
export type TimeKind = (typeof TIME_KINDS)[number]["value"];
export const TIME_KIND_VALUES = TIME_KINDS.map((k) => k.value) as [TimeKind, ...TimeKind[]];
export const isAbsence = (kind: string) => TIME_KINDS.some((k) => k.value === kind && k.absence);
/** Absence, které se započítávají do plnění fondu pracovní doby (náhradní volno čerpá fond, takže ne). */
export const PAID_ABSENCE: readonly string[] = ["vacation", "holiday", "sick", "doctor"];

/** Druhy, které zakázce účtují práci. */
export const BILLABLE_KINDS: readonly string[] = ["work", "travel"];

export const TIME_STATUSES = ["draft", "submitted", "approved", "returned"] as const;
export type TimeStatus = (typeof TIME_STATUSES)[number];

export class TimeRuleError extends Error {}

/**
 * Doba záznamu v minutách: buď od–do minus přestávka (konec musí být po začátku), nebo přímo hodiny.
 * Vždy musí vyjít kladná doba.
 */
export function entryMinutes(i: {
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number;
  hours?: number | null;
}): number {
  let minutes: number;
  if (i.startTime && i.endTime) {
    const a = timeToMinutes(i.startTime);
    const b = timeToMinutes(i.endTime);
    if (b <= a) throw new TimeRuleError("Konec musí být po začátku.");
    minutes = b - a - (i.breakMinutes ?? 0);
  } else {
    minutes = Math.round((i.hours ?? 0) * 60);
  }
  if (minutes <= 0) throw new TimeRuleError("Zadejte odpracovanou dobu (od–do nebo počet hodin).");
  return minutes;
}

/** Den nesmí přesáhnout 24 hodin. */
export function assertDayLimit(alreadyMinutes: number, addMinutes: number) {
  const total = alreadyMinutes + addMinutes;
  if (total > 24 * 60)
    throw new TimeRuleError(`V tento den by bylo zapsáno ${formatMinutes(total)}, víc než 24 h.`);
}

/**
 * Stav záznamu po úpravě: vrácený se po opravě vrací do rozpracovaných; schválený a odeslaný záznam smí měnit jen ten,
 * kdo schvaluje (u odeslaného i sám autor po vzetí týdne zpět).
 */
export function editedStatus(opts: {
  status: string;
  isOwner: boolean;
  canApprove: boolean;
}): TimeStatus {
  if (opts.status === "approved" && !opts.canApprove)
    throw new TimeRuleError("Schválený záznam nejde měnit. Požádejte vedoucího.");
  if (opts.status === "submitted" && opts.isOwner && !opts.canApprove)
    throw new TimeRuleError("Týden je odeslaný ke schválení, nejdřív ho vezměte zpět.");
  return opts.status === "returned" ? "draft" : (opts.status as TimeStatus);
}

/** Odpracované minuty z píchačky: od příchodu do odchodu minus přestávky (nikdy záporné). */
export function clockMinutes(startedAt: Date, endedAt: Date, breakMinutes: number): number {
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000) - breakMinutes);
}

/** Přesčas/mínus: odpracováno proti fondu měsíce (absence se do odpracovaného počítají, kromě náhradního volna jako „čerpání“). */
export function monthBalance(workedMinutes: number, fundMinutes: number): number {
  return workedMinutes - fundMinutes;
}
