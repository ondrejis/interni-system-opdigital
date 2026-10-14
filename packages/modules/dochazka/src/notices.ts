import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { schema, type Executor } from "@rebar/core/db";
import { notify, usersWithPermission } from "@rebar/core/notifications";
import { loadActor } from "@rebar/core/rbac";
import { isWorkday, localParts } from "@rebar/core/time";
import { clockRunText, expectedToWork, forgottenClockStage } from "./notice-rules";
import {
  FORGOT_CLOCK_OUT,
  FORGOT_CLOCK_OUT_TEAM,
  MISSING_CLOCK_IN,
  TIME_REMINDER,
} from "./notifications";
import { timeEntry } from "./schema";
import type { DochazkaSettings } from "./settings";

/*
  Plánovaná upozornění docházky (volají je úlohy v server.ts). Každá funkce dostává čas parametrem a je idempotentní:
  události mají `dedupe: "day"`, takže opakované spuštění téhož dne nic nezdvojí.
*/

/** Záznamy docházky, které dnes „pokrývají“ uživatele: jakýkoli dnešní záznam (i absence), nebo běžící píchačka. */
async function coveredToday(db: Executor, userIds: readonly string[], today: string) {
  if (!userIds.length) return new Set<string>();
  const dated = await db
    .selectDistinct({ id: timeEntry.userId })
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.date, today),
        inArray(timeEntry.userId, [...userIds]),
        isNull(timeEntry.deletedAt),
      ),
    );
  const running = await db
    .selectDistinct({ id: timeEntry.userId })
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.source, "clock"),
        isNull(timeEntry.endedAt),
        isNotNull(timeEntry.startedAt),
        inArray(timeEntry.userId, [...userIds]),
        isNull(timeEntry.deletedAt),
      ),
    );
  return new Set([...dated, ...running].map((r) => r.id));
}

/** Odpolední připomínka (17:30 v pracovní dny): kdo dnes nezapsal nic, dostane jedno upozornění. */
export async function sendEveningReminders(
  db: Executor,
  settings: Pick<DochazkaSettings, "reminder" | "workDays">,
  now = new Date(),
): Promise<{ created: number }> {
  const today = localParts(now).date;
  if (!settings.reminder || !isWorkday(today, settings.workDays)) return { created: 0 };
  const users = await usersWithPermission(db, "dochazka.own");
  if (!users.length) return { created: 0 };
  const wrote = await db
    .selectDistinct({ id: timeEntry.userId })
    .from(timeEntry)
    .where(
      and(eq(timeEntry.date, today), inArray(timeEntry.userId, users), isNull(timeEntry.deletedAt)),
    );
  const done = new Set(wrote.map((r) => r.id));
  const r = await notify(db, TIME_REMINDER, {
    params: {},
    to: { person: users.filter((u) => !done.has(u)) },
    at: now,
  });
  return { created: r.created };
}

/**
 * Ráno v pracovní den: očekávaný zaměstnanec (viz `expectedToWork`), který nemá žádný dnešní záznam ani běžící
 * píchačku, dostane upozornění „chybí příchod“. Pracovní dny podle nastavení docházky a státních svátků.
 */
export async function sendMissingClockIn(
  db: Executor,
  settings: Pick<DochazkaSettings, "workDays">,
  now = new Date(),
): Promise<{ created: number; expected: number }> {
  const today = localParts(now).date;
  if (!isWorkday(today, settings.workDays)) return { created: 0, expected: 0 };
  const holders = await usersWithPermission(db, "dochazka.own");
  if (!holders.length) return { created: 0, expected: 0 };
  const people = await db
    .select({
      userId: schema.employee.userId,
      employmentType: schema.employee.employmentType,
      startDate: schema.employee.startDate,
    })
    .from(schema.employee)
    .where(and(inArray(schema.employee.userId, holders), isNull(schema.employee.deletedAt)));
  const covered = await coveredToday(
    db,
    people.map((p) => p.userId),
    today,
  );
  const who = expectedToWork(people, today, covered);
  if (!who.length) return { created: 0, expected: 0 };
  const r = await notify(db, MISSING_CLOCK_IN, { params: {}, to: { person: who }, at: now });
  return { created: r.created, expected: who.length };
}

/** Schvalovatelé, kteří vidí docházku všech (rozsah „vše“, nebo vlastník). */
async function approversOfEveryone(db: Executor): Promise<string[]> {
  const out: string[] = [];
  for (const id of await usersWithPermission(db, "dochazka.approve")) {
    const actor = await loadActor(db, id);
    if (actor && (actor.systemRole || actor.permissions.get("dochazka.approve") === "all"))
      out.push(id);
  }
  return out;
}

/**
 * Zapomenutý odchod: běžící píchačky, které `forgottenClockStage` označí. Zaměstnanec dostane naléhavé upozornění
 * (jednou za den a záznam); běží-li píchačka od předchozího dne, vědí o tom i schvalovatelé s rozsahem „vše“.
 */
export async function sendForgottenClockOut(
  db: Executor,
  now = new Date(),
): Promise<{ person: number; team: number }> {
  const rows = await db
    .select({
      id: timeEntry.id,
      userId: timeEntry.userId,
      startedAt: timeEntry.startedAt,
      name: schema.user.name,
    })
    .from(timeEntry)
    .innerJoin(schema.user, eq(schema.user.id, timeEntry.userId))
    .where(
      and(
        eq(timeEntry.source, "clock"),
        isNull(timeEntry.endedAt),
        isNotNull(timeEntry.startedAt),
        isNull(timeEntry.deletedAt),
        isNull(schema.user.deletedAt),
        eq(schema.user.active, true),
      ),
    );
  let person = 0;
  let team = 0;
  let approvers: string[] | null = null;
  for (const r of rows) {
    const stage = forgottenClockStage(r.startedAt!, now);
    if (!stage) continue;
    const text = clockRunText(r.startedAt!, now);
    const mine = await notify(db, FORGOT_CLOCK_OUT, {
      params: text,
      to: { person: [r.userId] },
      dedupe: r.id,
      at: now,
    });
    person += mine.created;
    if (stage === "carried") {
      approvers ??= await approversOfEveryone(db);
      const t = await notify(db, FORGOT_CLOCK_OUT_TEAM, {
        params: { name: r.name, ...text },
        to: { approver: approvers },
        actorId: r.userId,
        dedupe: r.id,
        at: now,
      });
      team += t.created;
    }
  }
  return { person, team };
}
