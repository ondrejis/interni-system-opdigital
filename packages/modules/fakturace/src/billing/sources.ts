import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Executor } from "@rebar/core/db";
import { NotFoundError } from "@rebar/core/rbac";
import {
  budgetItem,
  budgetObject,
  budgetSection,
  budgetVersion,
  job,
  jobChange,
} from "@rebar/zakazky/schema";
import { invoice, invoiceLine } from "../schema";
import { lineNetMinor } from "../totals";
import { ISSUED_STATES } from "./core";
import type { AdvanceDoc, BudgetItemRow, ExtraChange, PreviousDoc } from "./lines";

/**
 * Čtení vstupů pro fakturaci z ostatních oblastí a z historie faktur. Rozpočet a soupisy se čtou přímo z tabulek
 * (schéma je ustálené); rozhraní oblastí rozpočtu a soupisů přibude, až bude potřeba víc než čtení.
 */

export async function loadJob(db: Executor, jobId: string) {
  const [j] = await db
    .select()
    .from(job)
    .where(and(eq(job.id, jobId), isNull(job.deletedAt)));
  if (!j) throw new NotFoundError("Zakázka nenalezena.");
  return j;
}

export type JobBudget = {
  versionId: string | null;
  kind: "offer" | "realization" | null;
  items: BudgetItemRow[];
  sellMinor: number;
};

/** Aktuální rozpočet zakázky: realizační verze, jinak poslední nabídka. Částky bez DPH. */
export async function loadBudget(db: Executor, jobId: string): Promise<JobBudget> {
  const versions = await db
    .select()
    .from(budgetVersion)
    .where(and(eq(budgetVersion.jobId, jobId), isNull(budgetVersion.deletedAt)))
    .orderBy(asc(budgetVersion.number));
  const real = versions.filter((v) => v.kind === "realization").at(-1);
  const offer = versions.filter((v) => v.kind === "offer").at(-1);
  const v = real ?? offer;
  if (!v) return { versionId: null, kind: null, items: [], sellMinor: 0 };
  const rows = await db
    .select({
      id: budgetItem.id,
      title: budgetItem.title,
      code: budgetItem.code,
      unit: budgetItem.unit,
      quantity: budgetItem.quantity,
      unitPriceMinor: budgetItem.unitPriceMinor,
      vatRateBp: budgetItem.vatRateBp,
    })
    .from(budgetItem)
    .innerJoin(budgetSection, eq(budgetSection.id, budgetItem.sectionId))
    .innerJoin(budgetObject, eq(budgetObject.id, budgetSection.objectId))
    .where(and(eq(budgetItem.versionId, v.id), isNull(budgetItem.deletedAt)))
    .orderBy(asc(budgetObject.position), asc(budgetSection.position), asc(budgetItem.position));
  const items = rows.filter((r) => Number(r.quantity) !== 0);
  return {
    versionId: v.id,
    kind: v.kind as "offer" | "realization",
    items,
    sellMinor: items.reduce((a, it) => a + lineNetMinor(it.quantity, it.unitPriceMinor), 0),
  };
}

/**
 * Schválené změny, které se nepropsaly do rozpočtu (starší změny bez řádků): přičítají se k ceně nad rozpočet.
 * Bez rozpočtu se přičtou všechny schválené.
 */
export async function loadExtraChanges(
  db: Executor,
  jobId: string,
  hasBudget: boolean,
): Promise<ExtraChange[]> {
  const rows = await db
    .select()
    .from(jobChange)
    .where(
      and(
        eq(jobChange.jobId, jobId),
        eq(jobChange.status, "approved"),
        isNull(jobChange.deletedAt),
      ),
    )
    .orderBy(asc(jobChange.number));
  return rows
    .filter((r) => !hasBudget || !r.appliedAt)
    .map((r) => ({
      number: `${r.amountMinor < 0 ? "MP" : "VP"}-${r.number}`,
      title: r.title,
      amountMinor: r.amountMinor,
    }));
}

/** Součet všech schválených změn zakázky (propsaných do rozpočtu i ne); stejný údaj, ze kterého vychází cena v hlavičce zakázky. */
export async function approvedChangesTotal(db: Executor, jobId: string): Promise<number> {
  const rows = await db
    .select({ amountMinor: jobChange.amountMinor })
    .from(jobChange)
    .where(
      and(
        eq(jobChange.jobId, jobId),
        eq(jobChange.status, "approved"),
        isNull(jobChange.deletedAt),
      ),
    );
  return rows.reduce((a, r) => a + r.amountMinor, 0);
}

export type ContractInfo = {
  budget: JobBudget;
  extraChanges: ExtraChange[];
  /** Původní cena zakázky (rozpočet, jinak hodnota zakázky) bez schválených změn mimo rozpočet. */
  baseMinor: number;
  /** Smluvní cena bez DPH včetně schválených změn. */
  contractMinor: number;
};

export async function loadContract(
  db: Executor,
  j: { id: string; valueMinor: number },
): Promise<ContractInfo> {
  const budget = await loadBudget(db, j.id);
  const hasBudget = budget.items.length > 0 && budget.sellMinor !== 0;
  const extraChanges = await loadExtraChanges(db, j.id, hasBudget);
  const baseMinor = hasBudget ? budget.sellMinor : j.valueMinor;
  return {
    budget: hasBudget ? budget : { ...budget, items: [], sellMinor: 0 },
    extraChanges,
    baseMinor,
    contractMinor: baseMinor + extraChanges.reduce((a, c) => a + c.amountMinor, 0),
  };
}

/* ---------- historie faktur zakázky ---------- */

type InvRow = typeof invoice.$inferSelect;
type LineRow = typeof invoiceLine.$inferSelect;

export type JobHistory = {
  docs: InvRow[];
  lines: Map<string, LineRow[]>;
  /** Druh původního dokladu u dobropisů. */
  kindOf: Map<string, string>;
};

/** Vystavené doklady zakázky (včetně stornovaných dobropisem) s řádky. */
export async function loadHistory(db: Executor, jobId: string): Promise<JobHistory> {
  const docs = await db
    .select()
    .from(invoice)
    .where(
      and(
        eq(invoice.jobId, jobId),
        isNull(invoice.deletedAt),
        inArray(invoice.state, [...ISSUED_STATES]),
      ),
    )
    .orderBy(asc(invoice.issuedAt), asc(invoice.number));
  const lines = new Map<string, LineRow[]>();
  if (docs.length) {
    const rows = await db
      .select()
      .from(invoiceLine)
      .where(
        inArray(
          invoiceLine.invoiceId,
          docs.map((d) => d.id),
        ),
      )
      .orderBy(asc(invoiceLine.position));
    for (const r of rows) lines.set(r.invoiceId, [...(lines.get(r.invoiceId) ?? []), r]);
  }
  return { docs, lines, kindOf: new Map(docs.map((d) => [d.id, d.kind])) };
}

/** Doklad, ke kterému se dobropis vztahuje (u běžných dokladů on sám). */
const rootOf = (d: InvRow) =>
  d.kind === "credit_note" && d.originalInvoiceId ? d.originalInvoiceId : d.id;

export type BilledState = {
  billedByItem: Map<string, { netMinor: number; quantity: number }>;
  previous: PreviousDoc[];
  /** Zaplacené zálohy, které ještě nebyly odečteny na vystavené faktuře. */
  advances: AdvanceDoc[];
  /** Vystavené zálohy, které zatím nejsou (celé) zaplacené, a proto se neodečítají. */
  unpaidAdvances: { invoiceId: string; number: string; remainingMinor: number }[];
  finalIssued: boolean;
};

export function billedState(h: JobHistory): BilledState {
  const byItem = new Map<string, { netMinor: number; quantity: number }>();
  const unlinkedBy = new Map<string, Map<number, number>>();
  const numberOf = new Map<string, string>();
  const deducted = new Set<string>();
  let finalIssued = false;

  for (const d of h.docs) {
    numberOf.set(d.id, d.number ?? "");
    const rootKind = d.kind === "credit_note" ? h.kindOf.get(d.originalInvoiceId ?? "") : d.kind;
    if (d.kind === "final" && d.state !== "credited") finalIssued = true;
    const lines = h.lines.get(d.id) ?? [];
    for (const l of lines) {
      if (
        l.role === "advance" &&
        l.refInvoiceId &&
        d.kind !== "credit_note" &&
        d.state !== "credited"
      )
        deducted.add(l.refInvoiceId);
      // fakturované plnění: průběžné a konečné faktury (a jejich dobropisy)
      if (rootKind !== "partial" && rootKind !== "final") continue;
      if (l.role !== "work") continue;
      if (l.budgetItemId) {
        const cur = byItem.get(l.budgetItemId) ?? { netMinor: 0, quantity: 0 };
        cur.netMinor += l.netMinor;
        cur.quantity += Number(l.quantity) * (d.kind === "credit_note" ? -1 : 1);
        byItem.set(l.budgetItemId, cur);
      } else if (rootKind === "partial") {
        const root = rootOf(d);
        const m = unlinkedBy.get(root) ?? new Map<number, number>();
        m.set(l.vatRateBp, (m.get(l.vatRateBp) ?? 0) + l.netMinor);
        unlinkedBy.set(root, m);
      }
    }
  }
  const previous: PreviousDoc[] = [...unlinkedBy.entries()]
    .map(([invoiceId, m]) => ({
      invoiceId,
      number: numberOf.get(invoiceId) ?? "",
      unlinked: [...m.entries()]
        .filter(([, net]) => net !== 0)
        .map(([vatRateBp, netMinor]) => ({ vatRateBp, netMinor })),
    }))
    .filter((p) => p.unlinked.length);

  const advances: AdvanceDoc[] = [];
  const unpaidAdvances: BilledState["unpaidAdvances"] = [];
  for (const d of h.docs) {
    if (d.kind !== "proforma" || d.state === "credited" || deducted.has(d.id)) continue;
    if (d.state === "paid") {
      const groups = new Map<number, number>();
      for (const l of h.lines.get(d.id) ?? [])
        groups.set(l.vatRateBp, (groups.get(l.vatRateBp) ?? 0) + l.netMinor);
      advances.push({
        invoiceId: d.id,
        number: d.number ?? "",
        groups: [...groups.entries()].map(([vatRateBp, netMinor]) => ({ vatRateBp, netMinor })),
      });
    } else
      unpaidAdvances.push({
        invoiceId: d.id,
        number: d.number ?? "",
        remainingMinor: d.grossMinor - d.paidMinor,
      });
  }
  return { billedByItem: byItem, previous, advances, unpaidAdvances, finalIssued };
}

/** Zádržné po sazbách DPH: stržené z vystavených dokladů, uvolněné dokladem o uvolnění a zbývající drženo. */
export function retentionState(h: JobHistory) {
  const held = new Map<number, number>();
  const released = new Map<number, number>();
  for (const d of h.docs) {
    for (const l of h.lines.get(d.id) ?? []) {
      if (l.role === "retention") held.set(l.vatRateBp, (held.get(l.vatRateBp) ?? 0) - l.netMinor);
      if (l.role === "release")
        released.set(l.vatRateBp, (released.get(l.vatRateBp) ?? 0) + l.netMinor);
    }
  }
  const rates = new Set([...held.keys(), ...released.keys()]);
  const groups = [...rates]
    .map((vatRateBp) => ({
      vatRateBp,
      netMinor: (held.get(vatRateBp) ?? 0) - (released.get(vatRateBp) ?? 0),
    }))
    .sort((a, b) => b.vatRateBp - a.vatRateBp);
  const sum = (m: Map<number, number>) => [...m.values()].reduce((a, n) => a + n, 0);
  return {
    heldTotalMinor: sum(held),
    releasedMinor: sum(released),
    /** Zbývá uvolnit (drženo), po sazbách i celkem. */
    outstandingGroups: groups,
    outstandingMinor: sum(held) - sum(released),
  };
}
