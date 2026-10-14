import type { Amounts, ObjectNode, VatBreakdown } from "./math";

/** Tvary dat rozpočtu pro klienta. Soubor je bez serverových importů, smí ho importovat `ui.tsx`. */

/** Položka rozpočtu tak, jak ji dostane klient (bez auditních sloupců). */
export type ItemView = {
  id: string;
  sectionId: string;
  position: number;
  code: string | null;
  title: string;
  kind: string;
  unit: string;
  quantity: string;
  unitCostMinor: number;
  unitPriceMinor: number;
  vatRateBp: number;
  startDate: string | null;
  endDate: string | null;
  spec: string | null;
  note: string | null;
  originalQuantity: string | null;
  originalUnitCostMinor: number | null;
  originalUnitPriceMinor: number | null;
  changeId: string | null;
  /** Počet řádků výkazu výměr; s nimi je množství dopočtené a nejde ho psát ručně. */
  calcCount: number;
};
export type SectionView = {
  id: string;
  objectId: string;
  parentId: string | null;
  position: number;
  code: string | null;
  title: string;
  costCategory: string | null;
};
export type ObjectView = {
  id: string;
  position: number;
  code: string | null;
  title: string;
  isDefault: boolean;
  responsibleId: string | null;
};
export type VersionView = {
  id: string;
  jobId: string;
  kind: string;
  number: number;
  title: string | null;
  status: string;
  lockedAt: string | null;
  note: string | null;
  sourceVersionId: string | null;
  lockReason: string | null;
};
export type VersionSummary = VersionView & { sellMinor: number; costMinor: number };

export type BudgetTreeView = {
  job: {
    id: string;
    number: string;
    title: string;
    phase: string;
    vatMode: string;
    currency: string;
    valueMinor: number;
  };
  versions: VersionSummary[];
  version: VersionView | null;
  objects: ObjectNode<ObjectView, SectionView, ItemView>[];
  totals: Amounts;
  vat: VatBreakdown;
  /** Má verze jen výchozí objekt (pak se úroveň objektu v UI nezobrazuje)? */
  singleObject: boolean;
};
