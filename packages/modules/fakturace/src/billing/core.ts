import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { defaultVatRateBp } from "@rebar/core/config-data";
import type { Executor } from "@rebar/core/db";
import type { ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { companySetting } from "@rebar/core/settings";
import { company } from "@rebar/kontakty/schema";
import { invoice, invoiceLine, type PartySnapshot } from "../schema";
import type { FakturaceSettings } from "../settings";
import { documentTotals, lineTotals, type LineRole, type VatMode } from "../totals";
import { applyVatMode, retainedOf, withRetention, type DraftLine } from "./lines";

/** Společné pomocné funkce vydaných faktur (sdílí `server.ts` a oblast „billing“; nic odtud neimportuje `server.ts`). */

export const KINDS = ["proforma", "partial", "final", "credit_note", "retention"] as const;
export type InvoiceKind = (typeof KINDS)[number];
export const SERIES: Record<InvoiceKind, string> = {
  proforma: "fakturace.zalohova",
  partial: "fakturace.faktura",
  final: "fakturace.faktura",
  credit_note: "fakturace.dobropis",
  retention: "fakturace.faktura",
};
export const KIND_TITLE: Record<InvoiceKind, string> = {
  proforma: "Zálohová faktura",
  partial: "Faktura",
  final: "Vyúčtování",
  credit_note: "Dobropis",
  retention: "Uvolnění zádržného",
};
/** Doklady, které strhávají zádržné. */
export const RETAINS_KINDS: readonly string[] = ["partial", "final"];
/** Stavy vystaveného dokladu (včetně stornovaného dobropisem, který se v součtech s dobropisem vyruší). */
export const ISSUED_STATES = ["issued", "partial", "paid", "credited"] as const;

export async function loadInvoice(db: Executor, id: string) {
  const [row] = await db
    .select()
    .from(invoice)
    .where(and(eq(invoice.id, id), isNull(invoice.deletedAt)));
  if (!row) throw new NotFoundError("Faktura nenalezena.");
  return row;
}

export const loadLines = async (db: Executor, id: string) =>
  (
    await db
      .select()
      .from(invoiceLine)
      .where(eq(invoiceLine.invoiceId, id))
      .orderBy(asc(invoiceLine.position))
  ).map((l) => ({ ...l, role: l.role as LineRole }));

export async function supplierNow(ctx: Ctx, deps: ModuleDeps): Promise<PartySnapshot> {
  const c = await deps.settings.get(ctx.db, companySetting);
  return {
    name: c.name || "—",
    ico: c.ico,
    dic: c.dic,
    street: c.street,
    city: c.city,
    zip: c.zip,
    email: c.email,
    phone: c.phone,
    web: c.web,
    bankAccount: c.bankAccount,
  };
}

export async function customerNow(db: Executor, id: string): Promise<PartySnapshot> {
  const [c] = await db.select().from(company).where(eq(company.id, id));
  if (!c) throw new UserError("Odběratel nenalezen.");
  return {
    name: c.name,
    ico: c.ico,
    dic: c.dic,
    street: c.street,
    city: c.city,
    zip: c.zip,
    email: c.email,
    phone: c.phone,
    web: c.web,
  };
}

export const isVatPayer = (supplier: PartySnapshot, s: FakturaceSettings) =>
  s.vatPayer ?? !!supplier.dic;

/** Výchozí sazba DPH nových řádků: sazba zvolená v Nastavení (jinak nejvyšší platná), plátce DPH; neplátce 0 %. */
export async function defaultVatBp(db: Executor, payer: boolean, at: string): Promise<number> {
  if (!payer) return 0;
  return defaultVatRateBp(db, at);
}

/** Řádek ve vstupu příkazů; role a odkazy se vracejí zpět z klienta, aby se odpočty neztratily. */
export const lineInput = z.object({
  description: z.string().trim().min(1, "Popište položku.").max(300),
  quantity: z
    .string()
    .regex(/^-?\d{1,11}([.,]\d{1,3})?$/, "Množství zadejte jako číslo (nejvýš 3 desetinná místa).")
    .transform((v) => v.replace(",", ".")),
  unit: z.string().trim().min(1).max(12),
  unitPriceMinor: z.number().int().min(-9_000_000_000_000).max(9_000_000_000_000),
  vatRateBp: z.number().int().min(0).max(10_000),
  role: z.enum(["work", "previous", "advance", "retention", "release"]).optional(),
  budgetItemId: z.uuid().nullish(),
  refInvoiceId: z.uuid().nullish(),
});

export const vatModeSchema = z.enum(["standard", "reverse_charge"]);

export type LineIn = {
  description: string;
  quantity: string;
  unit: string;
  unitPriceMinor: number;
  vatRateBp: number;
  role?: LineRole;
  budgetItemId?: string | null;
  refInvoiceId?: string | null;
};

/**
 * Nahradí položky konceptu a přepočítá součty. Přenesená daňová povinnost vynutí sazbu 0, u průběžné a konečné faktury
 * se znovu spočítá zádržné ze sazby zakázky (ruční řádky zádržného ve vstupu se zahazují). Vše v transakci volajícího.
 */
export async function replaceLines(
  c: Ctx,
  inv: { id: string; kind: string; currency: string },
  input: readonly LineIn[],
  opts: { vatMode: VatMode; retentionBp: number },
) {
  let lines: DraftLine[] = input.map((l) => ({
    ...l,
    role: l.role ?? "work",
  }));
  lines = applyVatMode(lines, opts.vatMode);
  if (RETAINS_KINDS.includes(inv.kind))
    lines = withRetention(lines, opts.retentionBp, opts.vatMode, inv.currency);
  await c.db.delete(invoiceLine).where(eq(invoiceLine.invoiceId, inv.id));
  if (lines.length)
    await c.db.insert(invoiceLine).values(
      lines.map((l, i) => {
        const t = lineTotals(l, opts.vatMode);
        return {
          invoiceId: inv.id,
          position: i,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unitPriceMinor: l.unitPriceMinor,
          vatRateBp: l.vatRateBp,
          netMinor: t.netMinor,
          vatMinor: t.vatMinor,
          grossMinor: t.grossMinor,
          budgetItemId: l.budgetItemId ?? null,
          role: l.role,
          refInvoiceId: l.refInvoiceId ?? null,
        };
      }),
    );
  const total = documentTotals(lines, { vatMode: opts.vatMode });
  await c.db
    .update(invoice)
    .set({
      netMinor: total.netMinor,
      vatMinor: total.vatMinor,
      grossMinor: total.grossMinor,
      vatMode: opts.vatMode,
      retentionMinor: RETAINS_KINDS.includes(inv.kind) ? retainedOf(lines) : 0,
      updatedBy: c.actor.userId,
    })
    .where(eq(invoice.id, inv.id));
  return total;
}

/** Proč je doklad zamčený (pro UI i hlášky příkazů); `null` = koncept, jde měnit. */
export function lockReason(row: {
  state: string;
  number: string | null;
  lockedAt: Date | null;
}): string | null {
  if (row.state === "draft" && !row.lockedAt) return null;
  return `${row.number ? `Faktura ${row.number}` : "Faktura"} je vystavená a zamčená, proto už nejde měnit (mohla odejít zákazníkovi a je v účetnictví). Chybu opravíte dobropisem; vrátit ji do konceptu může jen držitel oprávnění „Schvaluje doklady bez limitu“.`;
}

export function assertInvoiceUnlocked(row: {
  state: string;
  number: string | null;
  lockedAt: Date | null;
}): void {
  const why = lockReason(row);
  if (why) throw new UserError(why);
}
