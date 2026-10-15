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

/* ===== MPR-2: knihovna a soukromé ===== */
export * from "./library/contract";
export * from "./private/contract";

/* ===== MPR-3: opakované faktury ===== */

/** `muj-prostor.invoices.overview`: návrhy a hotové faktury (volitelně jen jednoho klienta), souhrn a stav Fakturoidu. */
export const invoicesOverviewInput = z.object({ companyId: id.optional() });

/** `muj-prostor.invoices.prepare`: ručně připraví návrhy (totéž co denní úloha); idempotentní. */
export const invoicesPrepareInput = z.object({});

/** `muj-prostor.invoices.update`: upraví částku konceptu (haléře, kladná). */
export const invoicesUpdateInput = z.object({
  id,
  amountMinor: z.number().int().positive().max(9_999_999_999),
});

/**
 * `muj-prostor.invoices.approve`: **Schválit a vytvořit ve Fakturoidu**. `expectedAmountMinor` je částka, kterou
 * uživatel viděl (při neshodě se nic nevytvoří). Opakované volání nevytvoří druhou fakturu.
 */
export const invoicesApproveInput = z.object({
  id,
  expectedAmountMinor: z.number().int().positive(),
});

/** `muj-prostor.invoices.cancel` / `.reopen` / `.retryPayment`: akce nad jedním návrhem. */
export const invoicesIdInput = z.object({ id });

/** `muj-prostor.fakturoid.status` a `.disconnect` a `.test`: bez vstupu. */
export const fakturoidNoInput = z.object({});

/** `muj-prostor.fakturoid.save`: uloží přístup k Fakturoidu (šifrovaně). Prázdný Client Secret ponechá uložený. */
export const fakturoidSaveInput = z.object({
  account: z.string().trim().min(1).max(100),
  clientId: z.string().trim().min(1).max(200),
  clientSecret: z.string().max(500).optional(),
  contactEmail: z.email().max(200),
});
