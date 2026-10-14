import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { claimReminder } from "@rebar/core/collab";
import type { Executor } from "@rebar/core/db";
import { notify } from "@rebar/core/notifications";
import { formatDate } from "@rebar/core/shared";
import { addDaysIso, todayIso } from "@rebar/core/time";
import {
  deadlineState,
  deadlinesFor,
  formatMeter,
  intervalDue,
  intervalText,
  type DeadlineKey,
} from "./fleet";
import {
  STROJE_DEADLINE,
  STROJE_DEADLINE_URGENT,
  STROJE_RESERVATION_TOMORROW,
} from "./notifications";
import { asset, assetInterval, assetReservation } from "./schema";

/*
  Plánovaná upozornění modulu (úlohy v server.ts). Rozhodování je čisté a bere „dnes“ parametrem; odeslání je
  idempotentní: připomínka termínu se zabere v `reminder_sent` (klíč stroj + termín + datum + stupeň), takže se po
  změně data termínu pošle znovu, ale jinak nikdy dvakrát.
*/

/** Stupeň upozornění na termín: do 30 dní, do 7 dní, po termínu; každý se pošle jen jednou. */
export function stageOf(days: number | null): "overdue" | "7" | "30" | null {
  if (days === null) return null;
  return days < 0 ? "overdue" : days <= 7 ? "7" : days <= 30 ? "30" : null;
}

/** Stroj tak, jak ho potřebuje rozhodování o připomínkách. */
export type ReminderAsset = {
  id: string;
  name: string;
  kind: string;
  plate: string | null;
  meter: string;
  meterValue: string | number;
  stkDate: string | null;
  insuranceDate: string | null;
  vignetteDate: string | null;
};
/** Servisní interval stroje. */
export type ReminderInterval = {
  id: string;
  assetId: string;
  title: string;
  everyMeter: number | null;
  everyMonths: number | null;
  lastDate: string | null;
  lastMeter: string | number | null;
};

/** Jedna připomínka k odeslání. `token` je klíč idempotence: stroj + termín + datum + stupeň. */
export type DeadlineReminder = {
  assetId: string;
  assetName: string;
  /** Naléhavé: do 7 dní, po termínu, překročený interval. */
  urgent: boolean;
  what: string;
  detail: string;
  token: string;
};

/**
 * Které připomínky mají dnes u stroje vzniknout: termíny STK, ručení a známky (30 dní předem, 7 dní, po termínu)
 * a servisní intervaly (blíží se / překročeno). Čistá funkce.
 */
export function deadlineReminders(
  a: ReminderAsset,
  intervals: readonly ReminderInterval[],
  today: string,
): DeadlineReminder[] {
  const out: DeadlineReminder[] = [];
  for (const dl of deadlinesFor(a.kind)) {
    const date = a[dl.key as DeadlineKey];
    const st = deadlineState(date, today);
    const stage = stageOf(st.days);
    if (!stage || !date) continue;
    out.push({
      assetId: a.id,
      assetName: a.name,
      urgent: stage !== "30",
      what: `${dl.label} ${st.text}`,
      detail: `${dl.label} platí do ${formatDate(date)}.${a.plate ? ` SPZ ${a.plate}.` : ""}`,
      token: `${dl.key}:${date}:${stage}`,
    });
  }
  for (const iv of intervals.filter((v) => v.assetId === a.id)) {
    const due = intervalDue(
      {
        everyMeter: iv.everyMeter,
        everyMonths: iv.everyMonths,
        lastDate: iv.lastDate,
        lastMeter: iv.lastMeter === null ? null : Number(iv.lastMeter),
      },
      Number(a.meterValue),
      today,
    );
    if (due.tone === "ok") continue;
    out.push({
      assetId: a.id,
      assetName: a.name,
      urgent: due.tone === "overdue",
      what: `${iv.title}: ${intervalText(due, a.meter)}`,
      detail: `Naposledy ${formatDate(iv.lastDate)}${iv.lastMeter !== null ? ` při ${formatMeter(iv.lastMeter, a.meter)}` : ""}. Objednejte servis.`,
      token: `iv:${iv.id}:${iv.lastDate}:${iv.lastMeter}:${due.tone}`,
    });
  }
  return out;
}

/**
 * Denní kontrola termínů a servisních intervalů. Příjemci: odpovědná osoba stroje a správci vozového parku
 * (podle pravidel události). Zabrání klíče a upozornění běží v jedné transakci, takže se připomínka neztratí.
 */
export async function sendDeadlineReminders(
  db: Executor,
  now = new Date(),
): Promise<{ sent: number }> {
  const today = todayIso(undefined, now);
  const assets = await db
    .select()
    .from(asset)
    .where(and(isNull(asset.deletedAt), ne(asset.status, "retired")));
  if (!assets.length) return { sent: 0 };
  const intervals = await db
    .select()
    .from(assetInterval)
    .where(
      and(
        inArray(
          assetInterval.assetId,
          assets.map((a) => a.id),
        ),
        isNull(assetInterval.deletedAt),
      ),
    );
  let sent = 0;
  for (const a of assets) {
    for (const r of deadlineReminders(a, intervals, today)) {
      const key = `stroje:${a.id}:${r.token}`;
      const created = await db.transaction(async (tx) => {
        if (!(await claimReminder(tx, key))) return 0;
        const res = await notify(tx, r.urgent ? STROJE_DEADLINE_URGENT : STROJE_DEADLINE, {
          params: { asset: r.assetName, what: r.what, detail: r.detail },
          to: { responsible: [a.responsibleId] },
          record: { type: "asset", id: a.id },
          dedupe: r.token,
          at: now,
        });
        return res.created;
      });
      sent += created;
    }
  }
  return { sent };
}

/** Odpoledne před začátkem rezervace: obsluha dostane připomínku (jednou na rezervaci a datum začátku). */
export async function sendReservationReminders(
  db: Executor,
  now = new Date(),
): Promise<{ sent: number }> {
  const tomorrow = addDaysIso(todayIso(undefined, now), 1);
  const rows = await db
    .select({
      id: assetReservation.id,
      userId: assetReservation.userId,
      note: assetReservation.note,
      assetId: asset.id,
      name: asset.name,
    })
    .from(assetReservation)
    .innerJoin(asset, eq(asset.id, assetReservation.assetId))
    .where(
      and(
        eq(assetReservation.dateFrom, tomorrow),
        isNull(assetReservation.deletedAt),
        isNull(asset.deletedAt),
      ),
    );
  let sent = 0;
  for (const r of rows) {
    if (!r.userId) continue;
    const res = await notify(db, STROJE_RESERVATION_TOMORROW, {
      params: { asset: r.name, detail: r.note ?? "Rezervace stroje" },
      to: { driver: [r.userId] },
      record: { type: "asset", id: r.assetId },
      dedupe: `${r.id}:${tomorrow}`,
      at: now,
    });
    sent += res.created;
  }
  return { sent };
}
