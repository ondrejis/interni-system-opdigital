/**
 * Čistá logika nákladů zakázky (bez databáze a Reactu, použitelná na serveru i v prohlížeči): zdroje nákladů,
 * stav párování na oddíl rozpočtu, kontrola rozpadu na víc oddílů, návrh párování podle kategorie oddílu.
 * Částky jsou v haléřích bez DPH. Vratky (sklad) mají zápornou částku.
 */

/** Zdroje nákladů a jejich popisky (klíč = `CostLine.source`; ruční náklady mají `manual`). */
export const COST_SOURCES = [
  { key: "manual", label: "Ruční", icon: "pencil" },
  { key: "faktura_prijata", label: "Přijatá faktura", icon: "receipt" },
  { key: "dochazka", label: "Docházka", icon: "clock" },
  { key: "sklad", label: "Sklad", icon: "package" },
  { key: "stroje", label: "Stroje", icon: "truck" },
  { key: "diary", label: "Deník", icon: "book-open" },
] as const;
export const sourceLabel = (k: string) => COST_SOURCES.find((s) => s.key === k)?.label ?? k;

/** Kategorie nákladů (stejné klíče jako druh položky rozpočtu). Práci a stroje počítají moduly, ostatní lze zadat ručně. */
export const COST_CATEGORY_LIST = [
  { key: "labour", label: "Práce" },
  { key: "material", label: "Materiál" },
  { key: "machines", label: "Stroje a doprava" },
  { key: "subcontract", label: "Subdodávky" },
  { key: "other", label: "Ostatní" },
] as const;
export const categoryLabel = (k: string) => COST_CATEGORY_LIST.find((c) => c.key === k)?.label ?? k;

/** Část nákladu přiřazená oddílu (a případně položce) rozpočtu. `amountMinor === null` = celý náklad. */
export type Allocation = { sectionId: string; itemId: string | null; amountMinor: number | null };

export type AllocationStatus = "paired" | "partial" | "unpaired";
export type AllocationState = {
  allocatedMinor: number;
  remainingMinor: number;
  status: AllocationStatus;
};

/**
 * Kolik z nákladu je spárované. Jediná část bez částky pokrývá celý náklad (a sleduje ho, když se změní,
 * např. při opravě docházky); rozpad s částkami, které už nesedí, nechá zbytek jako nespárovaný.
 */
export function allocationState(
  amountMinor: number,
  allocations: readonly Allocation[],
): AllocationState {
  if (!allocations.length)
    return {
      allocatedMinor: 0,
      remainingMinor: amountMinor,
      status: amountMinor === 0 ? "paired" : "unpaired",
    };
  const full = allocations.some((a) => a.amountMinor === null);
  const allocated = full ? amountMinor : allocations.reduce((s, a) => s + (a.amountMinor ?? 0), 0);
  const remaining = amountMinor - allocated;
  return {
    allocatedMinor: allocated,
    remainingMinor: remaining,
    status: remaining === 0 ? "paired" : allocated === 0 ? "unpaired" : "partial",
  };
}

const sign = (n: number) => (n < 0 ? -1 : n > 0 ? 1 : 0);

/** Kontrola rozpadu na víc oddílů. Vrací českou větu s důvodem, nebo `null`, když je rozpad v pořádku. */
export function validateParts(
  amountMinor: number,
  parts: readonly { sectionId: string; itemId?: string | null; amountMinor?: number | null }[],
  fmt: (n: number) => string = (n) => String(n / 100),
): string | null {
  if (!parts.length) return null;
  if (parts.length === 1) {
    const a = parts[0]!.amountMinor;
    if (a != null && a !== amountMinor)
      return `Jediná část musí pokrýt celý náklad (${fmt(amountMinor)}), nebo částku nevyplňujte.`;
    return null;
  }
  let sum = 0;
  for (const p of parts) {
    if (p.amountMinor == null || p.amountMinor === 0)
      return "U rozpadu na víc oddílů vyplňte částku každé části.";
    if (sign(p.amountMinor) !== sign(amountMinor))
      return "Části rozpadu musí mít stejné znaménko jako celý náklad.";
    sum += p.amountMinor;
  }
  if (sum !== amountMinor)
    return `Součet částí (${fmt(sum)}) se musí rovnat částce nákladu (${fmt(amountMinor)}).`;
  return null;
}

/** Části v podobě uložené v `cost_allocation`: jediná část pokrývá celý náklad (bez částky). */
export function normalizeParts(
  parts: readonly { sectionId: string; itemId?: string | null; amountMinor?: number | null }[],
): Allocation[] {
  if (parts.length === 1)
    return [
      { sectionId: parts[0]!.sectionId, itemId: parts[0]!.itemId ?? null, amountMinor: null },
    ];
  return parts.map((p) => ({
    sectionId: p.sectionId,
    itemId: p.itemId ?? null,
    amountMinor: p.amountMinor ?? null,
  }));
}

/**
 * Návrh oddílu pro automatický náklad: oddíl, jehož `costCategory` odpovídá kategorii nákladu. Jednoznačný jen
 * tehdy, když takový oddíl je přesně jeden; jinak `null` (zůstane nespárovaný a spáruje ho člověk).
 */
export function suggestSection(
  category: string,
  sections: readonly { id: string; costCategory: string | null }[],
): string | null {
  const hits = sections.filter((s) => s.costCategory === category);
  return hits.length === 1 ? hits[0]!.id : null;
}

export type CostOut = {
  /** `source:ref` – stabilní klíč řádku v seznamu. */
  key: string;
  /** Zdroj pro párování (`cost_allocation.source`); u ručních nákladů vždy `manual`. */
  allocSource: string;
  /** Zobrazený zdroj (ruční náklad z deníku má `diary`). */
  source: string;
  ref: string;
  /** Id ručního nákladu (`job_cost`), jen u upravitelných řádků. */
  id: string | null;
  date: string | null;
  category: string;
  label: string;
  supplier: string | null;
  amountMinor: number;
  href: string | null;
  orderId: string | null;
  allocations: { sectionId: string; itemId: string | null; amountMinor: number | null }[];
  status: AllocationStatus;
  remainingMinor: number;
  /** Ruční (vlastní) náklad lze upravit a smazat; ostatní jen párovat. */
  editable: boolean;
};
