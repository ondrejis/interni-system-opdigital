import { z } from "zod";
import { BULK_DOMAIN_LIMIT } from "./domains/logic";

/*
  Kontrakt příkazů modulu „muj-prostor“: zod vstupy příkazů (M1 agenta „A“ modulu). Tvary výsledků jsou v `types.ts`.
  Sekce jsou po oblastech (MPR-1 hosting a domény, MPR-2 knihovna a soukromé, MPR-3 faktury); každý agent píše jen svou.
*/

const id = z.uuid();
const isoDate = z.iso.date();

/* ===== MPR-1: hosting a domény ===== */

/** `muj-prostor.hosting.overview`: souhrn a nejbližší obnovy. */
export const hostingOverviewInput = z.object({});

/**
 * `muj-prostor.hosting.markRenewed`: označí obnovu jako vyfakturovanou a posune další obnovu o období (R-47).
 * `expectedNextRenewal` je datum, které uživatel viděl; při neshodě (někdo už posunul) se nic nezmění.
 */
export const hostingMarkRenewedInput = z.object({
  id,
  expectedNextRenewal: isoDate,
});

/** `muj-prostor.hosting.undoRenewed`: vrátí datum obnovy z `from` (hodnota po posunu) zpět na `to`. */
export const hostingUndoRenewedInput = z.object({ id, from: isoDate, to: isoDate });

/** `muj-prostor.domains.list`: domény s popisky klienta a hostingu a souhrnem (hledání a filtry dělá UI). */
export const domainsListInput = z.object({});

/** Výchozí hodnoty použité u všech domén hromadného vložení. */
export const bulkDomainDefaults = z.object({
  companyId: id.nullish(),
  registrar: z.string().trim().max(120).nullish(),
  payer: z.enum(["agency", "client"]).optional(),
  autoRenew: z.boolean().optional(),
  warnDays: z.number().int().min(1).max(365).optional(),
});

/** `muj-prostor.domains.bulkAdd`: text se seznamem domén (každá na řádek). */
export const domainsBulkAddInput = z.object({
  text: z.string().max(200_000),
  defaults: bulkDomainDefaults.optional(),
});
/** Strop počtu domén v jednom hromadném vložení. */
export const DOMAINS_BULK_MAX = BULK_DOMAIN_LIMIT;

/** `muj-prostor.domains.assignClient`: přiřadí (nebo odebere) klienta u vybraných domén. */
export const domainsAssignClientInput = z.object({
  ids: z.array(id).min(1).max(500),
  companyId: id.nullable(),
});

/** `muj-prostor.client.overview`: hosting, údržba a domény jednoho klienta. */
export const clientOverviewInput = z.object({ companyId: id });

/* ===== MPR-2: knihovna a soukromé (doplní MPR-2) ===== */

/* ===== MPR-3: opakované faktury (doplní MPR-3) ===== */
