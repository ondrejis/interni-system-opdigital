import { and, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import type { Executor } from "@rebar/core/db";
import { notify } from "@rebar/core/notifications";
import { formatDate, formatMinor } from "@rebar/core/shared";
import { addDaysIso, diffDaysIso, isWorkday, todayIso } from "@rebar/core/time";
import { invoice, receivedInvoice } from "./schema";
import {
  INVOICE_DUE_SOON,
  INVOICE_OVERDUE,
  INVOICE_PAID,
  RECEIVED_INVOICE_OVERDUE,
} from "./notifications";

/*
  Plánovaná upozornění fakturace. Rozhodování je v čistých funkcích s vloženým časem (`now`), aby šlo testovat
  hranici dne i přechod letního času: „dnes“ je vždy české místní datum, ne datum v UTC.
*/

/** Kolik dní před splatností se ozve upozornění „brzy po splatnosti“. */
export const DUE_SOON_DAYS = 3;

/** „dnes“, „zítra“, „za 3 dny“. */
export function dueIn(days: number): string {
  if (days <= 0) return "dnes";
  if (days === 1) return "zítra";
  return `za ${days} ${days >= 2 && days <= 4 ? "dny" : "dní"}`;
}

/** Faktury, kterým včera uplynula splatnost, se označí a fakturanti dostanou upozornění (jednou za fakturu). */
export async function markOverdueInvoices(db: Executor, now = new Date()): Promise<number> {
  const rows = await db
    .update(invoice)
    .set({ overdue: true })
    .where(
      and(
        inArray(invoice.state, ["issued", "partial"]),
        // dobropis se neplatí, takže po splatnosti být nemůže (jeho „splatnost“ je jen datum vystavení)
        ne(invoice.kind, "credit_note"),
        eq(invoice.overdue, false),
        lte(invoice.dueDate, addDaysIso(todayIso("Europe/Prague", now), -1)),
        isNull(invoice.deletedAt),
      ),
    )
    .returning({
      id: invoice.id,
      number: invoice.number,
      title: invoice.title,
      gross: invoice.grossMinor,
      paid: invoice.paidMinor,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      customer: invoice.customer,
    });
  for (const r of rows)
    await notify(db, INVOICE_OVERDUE, {
      params: {
        number: r.number ?? r.title,
        customer: r.customer?.name,
        dueDate: formatDate(r.dueDate),
        remaining: formatMinor(r.gross - r.paid, r.currency),
      },
      record: { id: r.id },
      at: now,
    });
  return rows.length;
}

/**
 * Pracovní den ráno upozorní na vydané neuhrazené faktury, jejichž splatnost nastává do `DUE_SOON_DAYS` dní.
 * Okno sahá od dneška, takže faktura splatná o víkendu se ohlásí v pátek; opakování téhož dne ani dalšího dne
 * nic nezdvojí (jednou za fakturu a datum splatnosti, takže po posunu splatnosti přijde nové upozornění).
 */
export async function notifyInvoicesDueSoon(db: Executor, now = new Date()): Promise<number> {
  const today = todayIso("Europe/Prague", now);
  if (!isWorkday(today)) return 0;
  const rows = await db
    .select({
      id: invoice.id,
      number: invoice.number,
      title: invoice.title,
      gross: invoice.grossMinor,
      paid: invoice.paidMinor,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      customer: invoice.customer,
    })
    .from(invoice)
    .where(
      and(
        inArray(invoice.state, ["issued", "partial"]),
        ne(invoice.kind, "credit_note"),
        eq(invoice.overdue, false),
        gte(invoice.dueDate, today),
        lte(invoice.dueDate, addDaysIso(today, DUE_SOON_DAYS)),
        isNull(invoice.deletedAt),
      ),
    );
  let created = 0;
  for (const r of rows) {
    const res = await notify(db, INVOICE_DUE_SOON, {
      params: {
        number: r.number ?? r.title,
        when: dueIn(diffDaysIso(today, r.dueDate!)),
        customer: r.customer?.name,
        dueDate: formatDate(r.dueDate),
        remaining: formatMinor(r.gross - r.paid, r.currency),
      },
      record: { id: r.id },
      dedupe: r.dueDate!,
      at: now,
    });
    created += res.created;
  }
  return created;
}

/** Přijaté faktury, kterým včera uplynula splatnost a nejsou uhrazené. */
export async function notifyReceivedOverdue(db: Executor, now = new Date()): Promise<number> {
  const yesterday = addDaysIso(todayIso("Europe/Prague", now), -1);
  const rows = await db
    .select({
      id: receivedInvoice.id,
      number: receivedInvoice.number,
      gross: receivedInvoice.grossMinor,
      paid: receivedInvoice.paidMinor,
      currency: receivedInvoice.currency,
      dueDate: receivedInvoice.dueDate,
    })
    .from(receivedInvoice)
    .where(
      and(
        eq(receivedInvoice.state, "approved"),
        eq(receivedInvoice.dueDate, yesterday),
        isNull(receivedInvoice.deletedAt),
      ),
    );
  for (const r of rows)
    await notify(db, RECEIVED_INVOICE_OVERDUE, {
      params: {
        number: r.number,
        dueDate: formatDate(r.dueDate),
        remaining: formatMinor(r.gross - r.paid, r.currency),
      },
      record: { id: r.id },
      at: now,
    });
  return rows.length;
}

/** Zaplacená faktura: komu a co se oznámí (volá se z transakce, ve které se zaznamenala poslední úhrada). */
export async function notifyInvoicePaid(
  db: Executor,
  inv: {
    id: string;
    number: string | null;
    title: string;
    grossMinor: number;
    currency: string;
    createdBy: string | null;
    customer: { name?: string | null } | null;
    managerId: string | null;
  },
  actorId: string | null,
) {
  return notify(db, INVOICE_PAID, {
    params: {
      number: inv.number ?? inv.title,
      customer: inv.customer?.name,
      amount: formatMinor(inv.grossMinor, inv.currency),
    },
    to: { creator: [inv.createdBy], manager: [inv.managerId] },
    record: { id: inv.id },
    actorId,
  });
}
