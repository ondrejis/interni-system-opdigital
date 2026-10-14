import { and, asc, eq, gt, gte, inArray, isNull, lte, ne, type SQL } from "drizzle-orm";
import type { Executor } from "@rebar/core/db";
import { countOf, notify } from "@rebar/core/notifications";
import { formatDate } from "@rebar/core/shared";
import { addDaysIso, isWorkday, localParts } from "@rebar/core/time";
import { job, jobMember } from "@rebar/zakazky/schema";
import {
  DIARY_MISSING,
  PHASE_DEADLINE,
  PHASE_OVERDUE,
  PHASE_STARTS,
  REALIZACE_TODAY,
} from "./notifications";
import { jobPhase, siteDiary } from "./schema";

/*
  Plánovaná upozornění modulu Realizace. Každá funkce je čistá vzhledem k hodinám (`now` se předává) a idempotentní:
  upozornění mají klíč idempotence, takže opakované spuštění (opakování úlohy, dohánění po výpadku) nic nezdvojí.
  „Dnes“ je vždy místní den v Europe/Prague, ne UTC, takže hranice dne drží i přes přechod letního času.
*/

/** Fáze životního cyklu zakázky, ve kterých má smysl připomínat harmonogram (ne nabídka, pozastavená, uzavřená, ztracená). */
const LIVE_JOB_PHASES = ["preparation", "execution", "handover"] as const;

export type ScheduledResult = { users: number; created: number };

const fmtRange = (a: string, b: string) =>
  a === b ? formatDate(a) : `${formatDate(a)} – ${formatDate(b)}`;

/** Poslední pracovní den před `date`. */
export function previousWorkday(date: string): string {
  let d = addDaysIso(date, -1);
  for (let i = 0; i < 14 && !isWorkday(d); i++) d = addDaysIso(d, -1);
  return d;
}

/** První pracovní den po `date`. */
export function nextWorkday(date: string): string {
  let d = addDaysIso(date, 1);
  for (let i = 0; i < 14 && !isWorkday(d); i++) d = addDaysIso(d, 1);
  return d;
}

/** Vedoucí a členové týmu zakázek: `jobId → userId[]`. */
async function teamsOf(db: Executor, rows: readonly { jobId: string; managerId: string | null }[]) {
  const ids = [...new Set(rows.map((r) => r.jobId))];
  const team = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = team.get(r.jobId) ?? new Set<string>();
    if (r.managerId) s.add(r.managerId);
    team.set(r.jobId, s);
  }
  if (ids.length) {
    const members = await db
      .select({ jobId: jobMember.jobId, userId: jobMember.userId })
      .from(jobMember)
      .where(inArray(jobMember.jobId, ids));
    for (const m of members) team.get(m.jobId)?.add(m.userId);
  }
  return team;
}

/** Fáze (nesmazané, nehotové) živých zakázek, které splňují podmínku. */
function phasesWhere(...conds: SQL[]) {
  return and(
    isNull(jobPhase.deletedAt),
    isNull(job.deletedAt),
    ne(jobPhase.status, "done"),
    inArray(job.phase, LIVE_JOB_PHASES),
    ...conds,
  );
}

const phaseSelect = {
  phaseId: jobPhase.id,
  name: jobPhase.name,
  startDate: jobPhase.startDate,
  endDate: jobPhase.endDate,
  progress: jobPhase.progress,
  responsibleId: jobPhase.responsibleId,
  jobId: jobPhase.jobId,
  number: job.number,
  managerId: job.managerId,
};

const MAX_LINES = 4;

/**
 * Ranní přehled „Dnes na stavbě“: každému, kdo vede zakázku, je v jejím týmu nebo odpovídá za fázi a dnes běží fáze
 * (začátek ≤ dnes ≤ konec, nehotová), přijde jedno upozornění se zakázkami a fázemi. Odpovědný za fázi, který není
 * v týmu, vidí jen své fáze. O víkendech a svátcích se neposílá.
 */
export async function sendMorningOverview(
  db: Executor,
  now = new Date(),
): Promise<ScheduledResult> {
  const today = localParts(now).date;
  if (!isWorkday(today)) return { users: 0, created: 0 };
  const rows = await db
    .select(phaseSelect)
    .from(jobPhase)
    .innerJoin(job, eq(job.id, jobPhase.jobId))
    .where(phasesWhere(lte(jobPhase.startDate, today), gte(jobPhase.endDate, today)))
    .orderBy(asc(job.number), asc(jobPhase.position));
  if (!rows.length) return { users: 0, created: 0 };
  const teams = await teamsOf(db, rows);

  // uživatel → zakázka → názvy fází
  const byUser = new Map<string, Map<string, { number: string; phases: string[] }>>();
  for (const r of rows) {
    const people = new Set(teams.get(r.jobId) ?? []);
    if (r.responsibleId) people.add(r.responsibleId);
    for (const userId of people) {
      const jobs = byUser.get(userId) ?? new Map();
      const e = jobs.get(r.jobId) ?? { number: r.number, phases: [] };
      e.phases.push(r.name);
      jobs.set(r.jobId, e);
      byUser.set(userId, jobs);
    }
  }

  let created = 0;
  for (const [userId, jobs] of byUser) {
    const lines = [...jobs.values()].map((j) => `${j.number} · ${j.phases.join(", ")}`);
    const list =
      lines.slice(0, MAX_LINES).join("\n") +
      (lines.length > MAX_LINES ? `\n…a ${lines.length - MAX_LINES} dalších` : "");
    const r = await notify(db, REALIZACE_TODAY, {
      params: { summary: countOf(jobs.size, "zakázka", "zakázky", "zakázek"), list },
      to: { person: [userId] },
      at: now,
    });
    created += r.created;
  }
  return { users: byUser.size, created };
}

/**
 * „Fáze začíná“: fáze, která ještě nezačala (0 %) a její začátek připadl na dnešek nebo na dny od posledního
 * pracovního dne (víkend, svátek). Jednou pro fázi a termín začátku.
 */
export async function sendPhaseStarts(db: Executor, now = new Date()): Promise<ScheduledResult> {
  const today = localParts(now).date;
  if (!isWorkday(today)) return { users: 0, created: 0 };
  const since = previousWorkday(today);
  const rows = await db
    .select(phaseSelect)
    .from(jobPhase)
    .innerJoin(job, eq(job.id, jobPhase.jobId))
    .where(
      phasesWhere(
        eq(jobPhase.status, "planned"),
        gt(jobPhase.startDate, since),
        lte(jobPhase.startDate, today),
      ),
    )
    .orderBy(asc(job.number), asc(jobPhase.position));
  if (!rows.length) return { users: 0, created: 0 };
  const teams = await teamsOf(db, rows);
  const users = new Set<string>();
  let created = 0;
  for (const r of rows) {
    const team = [...(teams.get(r.jobId) ?? [])];
    const res = await notify(db, PHASE_STARTS, {
      params: {
        number: r.number,
        phase: r.name,
        dates: fmtRange(r.startDate, r.endDate),
      },
      to: { responsible: [r.responsibleId], team },
      record: { type: "job", id: r.jobId },
      dedupe: `${r.phaseId}:${r.startDate}`,
      at: now,
    });
    created += res.created;
    for (const u of [r.responsibleId, ...team]) if (u) users.add(u);
  }
  return { users: users.size, created };
}

/** Skutečný stav fáze po termínu: průběh jako text. */
const percent = (n: number) => `${n} %`;

/**
 * Termíny fází: (1) „končí dnes / zítra“ pro nehotové fáze, které končí dnes nebo v nejbližší pracovní den
 * (jednodenní fáze a milníky se vynechávají, ty připomíná začátek); (2) „po termínu“ (naléhavé) pro nehotové fáze,
 * jejichž konec už byl (nejvýš 7 dní zpět, kdyby úloha nějaký den neběžela). Každý stupeň přijde jednou pro fázi
 * a termín konce, takže po posunu termínu se připomene znovu.
 */
export async function sendPhaseDeadlines(
  db: Executor,
  now = new Date(),
): Promise<{ upcoming: number; overdue: number }> {
  const today = localParts(now).date;
  if (!isWorkday(today)) return { upcoming: 0, overdue: 0 };
  const horizon = nextWorkday(today);
  const rows = await db
    .select(phaseSelect)
    .from(jobPhase)
    .innerJoin(job, eq(job.id, jobPhase.jobId))
    .where(
      phasesWhere(gte(jobPhase.endDate, addDaysIso(today, -7)), lte(jobPhase.endDate, horizon)),
    )
    .orderBy(asc(job.number), asc(jobPhase.position));
  let upcoming = 0;
  let overdue = 0;
  for (const r of rows) {
    const to = { responsible: [r.responsibleId], manager: [r.managerId] };
    const record = { type: "job", id: r.jobId };
    if (r.endDate < today) {
      const res = await notify(db, PHASE_OVERDUE, {
        params: {
          number: r.number,
          phase: r.name,
          end: formatDate(r.endDate),
          progress: percent(r.progress),
        },
        to,
        record,
        dedupe: `${r.phaseId}:overdue:${r.endDate}`,
        at: now,
      });
      overdue += res.created;
    } else if (r.startDate < r.endDate) {
      const stage = r.endDate === today ? "end" : "end-1";
      const when =
        r.endDate === today
          ? "dnes"
          : r.endDate === addDaysIso(today, 1)
            ? "zítra"
            : formatDate(r.endDate);
      const res = await notify(db, PHASE_DEADLINE, {
        params: {
          number: r.number,
          phase: r.name,
          when,
          dates: fmtRange(r.startDate, r.endDate),
          progress: percent(r.progress),
        },
        to,
        record,
        dedupe: `${r.phaseId}:${stage}:${r.endDate}`,
        at: now,
      });
      upcoming += res.created;
    }
  }
  return { upcoming, overdue };
}

/**
 * Odpoledne: zakázky v realizaci, na kterých se dnes pracuje (běží nehotová fáze, nebo zakázka žádný harmonogram
 * nemá) a které nemají dnešní zápis ve stavebním deníku, připomenou zápis vedoucímu a týmu. Jednou za den a zakázku.
 */
export async function sendDiaryReminders(db: Executor, now = new Date()): Promise<ScheduledResult> {
  const today = localParts(now).date;
  if (!isWorkday(today)) return { users: 0, created: 0 };
  const jobs = await db
    .select({ jobId: job.id, number: job.number, managerId: job.managerId })
    .from(job)
    .where(and(isNull(job.deletedAt), eq(job.phase, "execution")))
    .orderBy(asc(job.number));
  if (!jobs.length) return { users: 0, created: 0 };
  const ids = jobs.map((j) => j.jobId);
  const written = new Set(
    (
      await db
        .select({ jobId: siteDiary.jobId })
        .from(siteDiary)
        .where(
          and(
            inArray(siteDiary.jobId, ids),
            eq(siteDiary.date, today),
            isNull(siteDiary.deletedAt),
          ),
        )
    ).map((r) => r.jobId),
  );
  const phases = await db
    .select({
      jobId: jobPhase.jobId,
      startDate: jobPhase.startDate,
      endDate: jobPhase.endDate,
      status: jobPhase.status,
    })
    .from(jobPhase)
    .where(and(inArray(jobPhase.jobId, ids), isNull(jobPhase.deletedAt)));
  const withPhases = new Set(phases.map((p) => p.jobId));
  const workingToday = new Set(
    phases
      .filter((p) => p.status !== "done" && p.startDate <= today && p.endDate >= today)
      .map((p) => p.jobId),
  );
  const open = jobs.filter(
    (j) => !written.has(j.jobId) && (!withPhases.has(j.jobId) || workingToday.has(j.jobId)),
  );
  if (!open.length) return { users: 0, created: 0 };
  const teams = await teamsOf(db, open);
  const users = new Set<string>();
  let created = 0;
  for (const j of open) {
    const team = [...(teams.get(j.jobId) ?? [])];
    if (!team.length) continue;
    const res = await notify(db, DIARY_MISSING, {
      params: { number: j.number },
      to: { team },
      record: { type: "job", id: j.jobId },
      at: now,
    });
    created += res.created;
    for (const u of team) users.add(u);
  }
  return { users: users.size, created };
}
