import type { AuditChange } from "@rebar/core/db";
import { recordAudit } from "@rebar/core/audit";
import type { Ctx } from "@rebar/core/rbac";
import { PAYMENT_KIND_LABELS, PAYMENT_STATUS_LABELS } from "../entities";
import { formatMoney, type Allocation } from "../logic";
import type { PayRec } from "./model";

/** Popis rozdělení do historie: „Ondřej 6 000 Kč, Patrik 4 000 Kč“. */
export function describeAllocations(
  allocs: readonly Allocation[],
  names: Record<string, string>,
): string {
  const parts = allocs
    .filter((a) => a.amountMinor > 0)
    .map((a) => `${names[a.userId] ?? "?"} ${formatMoney(a.amountMinor)}`);
  return parts.length ? parts.join(", ") : "—";
}

/** Změněná pole platby česky (částky a stavy čitelně) pro historii. */
export function paymentChanges(
  before: PayRec | null,
  after: PayRec,
  names: Record<string, string>,
): AuditChange[] {
  const fields: [string, (p: PayRec) => unknown][] = [
    ["Popis", (p) => p.description],
    ["Druh", (p) => PAYMENT_KIND_LABELS[p.kind]],
    ["Měsíc", (p) => p.periodMonth],
    ["Částka", (p) => formatMoney(p.amountMinor)],
    ["Fakturuje", (p) => (p.issuerId ? (names[p.issuerId] ?? p.issuerId) : null)],
    ["Stav", (p) => PAYMENT_STATUS_LABELS[p.status]],
    ["Číslo faktury", (p) => p.invoiceNumber],
    ["Odkaz na fakturu", (p) => p.invoiceUrl],
    ["Vystaveno", (p) => p.issuedOn],
    ["Splatnost", (p) => p.dueOn],
    ["Zaplaceno", (p) => p.paidOn],
    ["Rozdělení ručně", (p) => p.allocationMode === "manual"],
    ["Poznámka", (p) => p.note],
  ];
  const out: AuditChange[] = [];
  for (const [field, get] of fields) {
    const o = before ? (get(before) ?? null) : null;
    const n = get(after) ?? null;
    if (JSON.stringify(o) !== JSON.stringify(n)) out.push({ field, old: o, new: n });
  }
  return out;
}

/** Zapíše změnu platby do historie (v transakci změny). */
export async function auditPayment(
  c: Ctx,
  action: "create" | "update" | "delete",
  p: PayRec,
  summary: string,
  changes: AuditChange[],
): Promise<void> {
  await recordAudit(c, {
    action,
    entityType: "payment",
    entityId: p.id,
    summary,
    entityTitle: p.description,
    changes,
    context: { jobId: p.jobId, companyId: p.companyId },
  });
}
