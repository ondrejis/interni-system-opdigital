import { today } from "./dates";
import type { DemoJob, World } from "./world";
import { money } from "./world";

/** Vrátí `approvalId` žádosti o schválení dokladu. */
async function approvalId(w: World, docType: string, docId: string): Promise<string> {
  const st = await w.kit.run<{ approvalId: string | null }>(
    w.cast.owner.ctx,
    "zakazky.approval.state",
    {
      docType,
      docId,
    },
  );
  if (!st.approvalId) throw new Error(`Doklad ${docType} ${docId} nemá žádost o schválení.`);
  return st.approvalId;
}

/** Majitel rozhodne o dokladu čekajícím na schválení. */
export async function decide(
  w: World,
  docType: "change" | "statement" | "order" | "received_invoice",
  docId: string,
  approve = true,
  comment?: string,
) {
  await w.kit.run(w.cast.owner.ctx, "zakazky.approval.decide", {
    approvalId: await approvalId(w, docType, docId),
    approve,
    ...(comment ? { comment } : {}),
  });
}

export type OrderSpec = {
  title: string;
  supplier: string;
  section?: string;
  orderDate: string;
  deliveryDate?: string;
  lines: {
    description: string;
    qty: number | string;
    unit: string;
    priceKc: number;
    vatBp?: number;
    item?: string;
  }[];
  /** `approved` = schválená a přijatá; `pending` = čeká na schválení; `draft` = koncept. */
  state: "draft" | "pending" | "approved" | "received";
};

export async function addOrder(w: World, job: DemoJob, spec: OrderSpec) {
  const c = w.cast.office.ctx;
  const res = await w.kit.run<{ id: string; number: string }>(c, "zakazky.orders.save", {
    jobId: job.id,
    title: spec.title,
    supplierId: w.contacts.company[spec.supplier],
    ...(spec.section ? { sectionId: job.sections[spec.section] } : {}),
    orderDate: spec.orderDate,
    ...(spec.deliveryDate ? { deliveryDate: spec.deliveryDate } : {}),
    lines: spec.lines.map((l) => ({
      description: l.description,
      quantity: String(l.qty),
      unit: l.unit,
      unitPriceMinor: money(l.priceKc),
      vatRateBp: l.vatBp ?? 2100,
      ...(l.item ? { itemId: job.items.find((i) => i.title === l.item)?.id } : {}),
    })),
  });
  if (spec.state === "draft") return res;
  await w.kit.run(c, "zakazky.orders.submit", { id: res.id });
  if (spec.state === "pending") return res;
  await decide(w, "order", res.id);
  if (spec.state === "received") await w.kit.run(c, "zakazky.orders.receive", { id: res.id });
  return res;
}

export type ReceivedSpec = {
  number: string;
  supplier: string;
  issueDate: string;
  dueDate: string;
  order?: string;
  note?: string;
  vatBp?: number;
  lines: {
    description: string;
    category: "labour" | "material" | "machines" | "subcontract" | "other";
    netKc: number;
    section?: string;
  }[];
  state: "draft" | "pending" | "approved" | "paid";
  paidDate?: string;
};

export async function addReceived(w: World, job: DemoJob, spec: ReceivedSpec) {
  const c = w.cast.office.ctx;
  const vat = spec.vatBp ?? 2100;
  const lines = spec.lines.map((l) => ({
    description: l.description,
    category: l.category,
    netMinor: money(l.netKc),
    vatRateBp: vat,
    ...(l.section ? { sectionId: job.sections[l.section] } : {}),
  }));
  const net = lines.reduce((a, l) => a + l.netMinor, 0);
  const vatTotal = lines.reduce((a, l) => a + Math.round((l.netMinor * vat) / 10000), 0);
  const res = await w.kit.run<{ id: string }>(c, "fakturace.received.create", {
    number: spec.number,
    supplierId: w.contacts.company[spec.supplier],
    jobId: job.id,
    ...(spec.order ? { orderId: spec.order } : {}),
    variableSymbol: spec.number.replace(/\D/g, "").slice(0, 10),
    issueDate: spec.issueDate,
    taxableDate: spec.issueDate,
    dueDate: spec.dueDate,
    receivedDate: spec.issueDate,
    netMinor: net,
    grossMinor: net + vatTotal,
    ...(spec.note ? { note: spec.note } : {}),
    lines,
  });
  if (spec.state === "draft") return res;
  await w.kit.run(c, "fakturace.received.submit", { id: res.id });
  if (spec.state === "pending") return res;
  await decide(w, "received_invoice", res.id);
  if (spec.state === "approved") return res;
  await w.kit.run(c, "fakturace.received.pay", {
    id: res.id,
    paidDate: spec.paidDate ?? spec.dueDate,
  });
  return res;
}

/** Ruční náklad zakázky (např. drobný nákup, který nemá fakturu). */
export async function addCost(
  w: World,
  job: DemoJob,
  c: {
    date: string;
    category: "labour" | "material" | "machines" | "subcontract" | "other";
    title: string;
    supplier?: string;
    amountKc: number;
    section?: string;
  },
) {
  await w.kit.run(w.cast.office.ctx, "zakazky.costs.save", {
    jobId: job.id,
    date: c.date,
    category: c.category,
    title: c.title,
    ...(c.supplier ? { supplierId: w.contacts.company[c.supplier] } : {}),
    amountMinor: money(c.amountKc),
    ...(c.section ? { sectionId: job.sections[c.section] } : {}),
  });
}

export type ChangeSpec = {
  title: string;
  description?: string;
  reason?: string;
  lines: (
    | {
        kind: "add";
        title: string;
        unit: string;
        qty: number;
        costKc: number;
        priceKc: number;
        section: string;
        itemKind?: string;
        vatBp?: number;
      }
    | { kind: "qty"; item: string; qty: number }
    | { kind: "remove"; item: string }
  )[];
  /** `draft` = koncept; `pending` = ke schválení; `approved` = schválená a propsaná do rozpočtu; `rejected` = zamítnutá. */
  state: "draft" | "pending" | "approved" | "rejected";
  comment?: string;
};

export async function addChange(w: World, job: DemoJob, spec: ChangeSpec) {
  const c = w.cast.office.ctx;
  const { id } = await w.kit.run<{ id: string }>(c, "zakazky.change.create", {
    jobId: job.id,
    title: spec.title,
  });
  await w.kit.run(c, "zakazky.change.save", {
    id,
    title: spec.title,
    description: spec.description ?? null,
    reason: spec.reason ?? null,
  });
  for (const l of spec.lines) {
    if (l.kind === "add")
      await w.kit.run(c, "zakazky.change.line.save", {
        changeId: id,
        kind: "add",
        title: l.title,
        unit: l.unit,
        quantityAfter: String(l.qty),
        unitCostMinor: money(l.costKc),
        unitPriceMinor: money(l.priceKc),
        sectionId: job.sections[l.section],
        itemKind: l.itemKind ?? "other",
        ...(l.vatBp !== undefined ? { vatRateBp: l.vatBp } : {}),
      });
    else {
      const item = job.items.find((i) => i.title === l.item);
      if (!item) throw new Error(`Položka „${l.item}“ v rozpočtu není.`);
      await w.kit.run(c, "zakazky.change.line.save", {
        changeId: id,
        kind: l.kind,
        itemId: item.id,
        ...(l.kind === "qty" ? { quantityAfter: String(l.qty) } : {}),
      });
    }
  }
  if (spec.state === "draft") return { id };
  await w.kit.run(c, "zakazky.change.submit", { id });
  if (spec.state === "pending") return { id };
  await decide(w, "change", id, spec.state === "approved", spec.comment);
  return { id };
}

/* ---------- vydané faktury ---------- */

type Invoice = { id: string; number?: string; grossMinor?: number };

/** Vystaví koncept faktury k danému datu a volitelně zapíše úhradu (celou, nebo její část). */
export async function issueInvoice(
  w: World,
  invoiceId: string,
  o: { issueDate: string; dueDate: string; paidDate?: string; paidPart?: number },
): Promise<Invoice> {
  const c = w.cast.office.ctx;
  // číselná řada je po letech: doklad nesmí být z dřívějšího roku než poslední vystavený (seed v lednu)
  const floor = `${today().slice(0, 4)}-01-02`;
  const later = (a: string, b: string) => (a > b ? a : b);
  const issueDate = later(o.issueDate, floor);
  const dueDate = later(o.dueDate, issueDate);
  const paidDate = o.paidDate ? later(o.paidDate, issueDate) : undefined;
  const { number } = await w.kit.run<{ number: string }>(c, "fakturace.issue", {
    id: invoiceId,
    issueDate,
    taxableDate: issueDate,
    dueDate,
  });
  const inv = await w.kit.run<{ grossMinor: number }>(c, "fakturace.get", { id: invoiceId });
  if (paidDate) {
    const amount =
      o.paidPart !== undefined ? Math.round(inv.grossMinor * o.paidPart) : inv.grossMinor;
    await w.kit.run(c, "fakturace.addPayment", {
      invoiceId,
      date: paidDate,
      amountMinor: amount,
      method: "Bankovní převod",
    });
  }
  return { id: invoiceId, number, grossMinor: inv.grossMinor };
}

/** Zálohová faktura na procento ceny zakázky. */
export async function advanceInvoice(
  w: World,
  job: DemoJob,
  o: { percent: number; issueDate: string; dueDate: string; paidDate?: string },
) {
  const { id } = await w.kit.run<{ id: string }>(w.cast.office.ctx, "fakturace.createFromJob", {
    jobId: job.id,
    kind: "proforma",
    percent: o.percent,
  });
  return issueInvoice(w, id, o);
}

export type StatementSpec = {
  from: string;
  to: string;
  /** Provedené množství za období podle názvu položky rozpočtu. */
  done: Record<string, number>;
  object?: string;
  note?: string;
  /** `draft` rozpracovaný; `submitted` čeká na schválení; `approved` schválený; `invoiced` vyfakturovaný (vystavená faktura); `paid` uhrazený. */
  state: "draft" | "submitted" | "approved" | "invoiced" | "paid";
  issueDate?: string;
  dueDate?: string;
  paidDate?: string;
};

export async function addStatement(w: World, job: DemoJob, spec: StatementSpec) {
  const c = w.cast.office.ctx;
  const { id } = await w.kit.run<{ id: string }>(c, "zakazky.statement.create", {
    jobId: job.id,
    periodFrom: spec.from,
    periodTo: spec.to,
  });
  if (spec.note)
    await w.kit.run(c, "zakazky.statement.save", {
      id,
      periodFrom: spec.from,
      periodTo: spec.to,
      note: spec.note,
    });
  await w.kit.run(c, "zakazky.statement.line.set", {
    statementId: id,
    lines: Object.entries(spec.done).map(([title, q]) => {
      const item = job.items.find((i) => i.title === title);
      if (!item) throw new Error(`Položka „${title}“ v rozpočtu není.`);
      return { itemId: item.id, quantityPeriod: String(q) };
    }),
  });
  if (spec.state === "draft") return { id };
  await w.kit.run(c, "zakazky.statement.submit", { id });
  if (spec.state === "submitted") return { id };
  await decide(w, "statement", id);
  if (spec.state === "approved") return { id };
  const inv = await w.kit.run<{ id: string }>(c, "fakturace.createFromStatement", {
    statementId: id,
  });
  const issued = await issueInvoice(w, inv.id, {
    issueDate: spec.issueDate!,
    dueDate: spec.dueDate!,
    ...(spec.state === "paid" ? { paidDate: spec.paidDate! } : {}),
  });
  return { id, invoice: issued };
}
