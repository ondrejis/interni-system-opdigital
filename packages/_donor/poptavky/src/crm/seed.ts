import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Executor } from "@rebar/core/db";
import { systemCtx } from "@rebar/core/rbac";
import { PHASES, isPhaseKey } from "@rebar/zakazky/phases";
import { CRM_DEAL_STAGES } from "@rebar/zakazky";
import { crmActivityType, inquiry } from "../schema";
import { recomputeAllJobsCrm } from "./deals/recompute";

/** Výchozí typy aktivit (klíč, název, ikona, výchozí délka v minutách). Konfiguruje se, seed jen doplní chybějící klíče. */
export const DEFAULT_ACTIVITY_TYPES = [
  { key: "call", name: "Hovor", icon: "phone", defaultDurationMin: 15 },
  { key: "meeting", name: "Schůzka", icon: "users", defaultDurationMin: 60 },
  { key: "task", name: "Úkol", icon: "check-square", defaultDurationMin: null },
  { key: "deadline", name: "Termín", icon: "flag", defaultDurationMin: null },
  { key: "email", name: "E-mail", icon: "mail", defaultDurationMin: null },
  {
    key: "site_visit",
    name: "Zaměření / obhlídka na místě",
    icon: "map-pin",
    defaultDurationMin: 90,
  },
] as const;

/** Co `ensureCrmDefaults` doplnilo nebo změnilo (pro výpis a testy). */
export type CrmEnsureReport = {
  activityTypesAdded: number;
  jobStagesAdded: number;
  jobStagesRenamed: number;
  inquiryStagesRemoved: number;
  inquiryStagesRenamed: number;
  jobsRecomputed: number;
};

type StageRow = typeof schema.pipelineStage.$inferSelect;
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function pipelineStages(db: Executor, entityType: string, key: string) {
  const [p] = await db
    .select({ id: schema.pipeline.id })
    .from(schema.pipeline)
    .where(
      and(
        eq(schema.pipeline.entityType, entityType),
        eq(schema.pipeline.key, key),
        isNull(schema.pipeline.deletedAt),
      ),
    );
  if (!p) return null;
  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(and(eq(schema.pipelineStage.pipelineId, p.id), isNull(schema.pipelineStage.deletedAt)))
    .orderBy(asc(schema.pipelineStage.position));
  return { pipelineId: p.id, stages };
}

async function renumber(db: Executor, ordered: readonly StageRow[]) {
  for (const [i, s] of ordered.entries())
    if (s.position !== i)
      await db
        .update(schema.pipelineStage)
        .set({ position: i })
        .where(eq(schema.pipelineStage.id, s.id));
}

/** Typy aktivit: doplní chybějící výchozí klíče (existující typy, i přejmenované nebo vypnuté, nechá být). */
async function ensureActivityTypes(db: Executor): Promise<number> {
  const existing = await db
    .select({ key: crmActivityType.key })
    .from(crmActivityType)
    .where(isNull(crmActivityType.deletedAt));
  const have = new Set(existing.map((r) => r.key));
  const missing = DEFAULT_ACTIVITY_TYPES.map((t, position) => ({ ...t, position })).filter(
    (t) => !have.has(t.key),
  );
  if (missing.length) await db.insert(crmActivityType).values(missing).onConflictDoNothing();
  return missing.length;
}

/**
 * Obchodní stavy pipeline zakázek (`job/default`): tři ve fázi poptávka a tři ve fázi nabídka s pravděpodobností a dny
 * hnití podle `CRM_DEAL_STAGES`. Starý stav „Poptávka“ se přejmenuje na „Nová poptávka“ a „Nabídka“ na „Nabídka
 * v přípravě“ (zakázky v nich zůstanou), chybějící stavy se přidají a stavy se seřadí podle fází. Co už existuje pod novým
 * jménem, se nemění (pravděpodobnosti a pořadí patří správci). Pořadí se přepočítá jen, když se něco přidalo nebo přejmenovalo.
 */
async function ensureJobStages(db: Executor): Promise<{ added: number; renamed: number }> {
  const found = await pipelineStages(db, "job", "default");
  if (!found) return { added: 0, renamed: 0 };
  const stages = [...found.stages];
  let added = 0;
  let renamed = 0;
  const LEGACY: Record<string, { name: string; phase: string }> = {
    "Nová poptávka": { name: "Poptávka", phase: "inquiry" },
    "Nabídka v přípravě": { name: "Nabídka", phase: "offer" },
  };

  for (const def of CRM_DEAL_STAGES) {
    if (stages.some((s) => sameName(s.name, def.name))) continue;
    const legacy = LEGACY[def.name];
    const old = legacy
      ? stages.find((s) => sameName(s.name, legacy.name) && s.phase === legacy.phase)
      : undefined;
    const values = {
      probabilityPct: def.probabilityPct ?? null,
      rottingDays: def.rottingDays ?? null,
    };
    if (old) {
      const [row] = await db
        .update(schema.pipelineStage)
        .set({ name: def.name, ...values })
        .where(eq(schema.pipelineStage.id, old.id))
        .returning();
      stages[stages.indexOf(old)] = row!;
      renamed += 1;
    } else {
      const [row] = await db
        .insert(schema.pipelineStage)
        .values({
          pipelineId: found.pipelineId,
          name: def.name,
          color: def.color,
          kind: "open",
          phase: def.phase,
          position: stages.length,
          ...values,
        })
        .returning();
      stages.push(row!);
      added += 1;
    }
  }

  if (added || renamed) {
    const phaseRank = (s: StageRow) => (isPhaseKey(s.phase) ? PHASES[s.phase].order : 1000);
    const dealRank = (s: StageRow) => {
      const i = CRM_DEAL_STAGES.findIndex((d) => sameName(d.name, s.name));
      return i < 0 ? CRM_DEAL_STAGES.length : i;
    };
    const ordered = [...stages].sort(
      (a, b) =>
        phaseRank(a) - phaseRank(b) ||
        dealRank(a) - dealRank(b) ||
        a.position - b.position ||
        a.name.localeCompare(b.name, "cs"),
    );
    await renumber(db, ordered);
  }
  return { added, renamed };
}

/**
 * Poptávky jako schránka: pipeline `inquiry/default` se zredukuje na Nová / Kvalifikovaná (vyhraná) / Zamítnutá (ztracená).
 * Starý „Vyhráno“ a „Prohráno“ se přejmenují, poptávky ve starých otevřených stavech (Kvalifikace, Nabídka odeslána,
 * Vyjednávání) se přesunou do „Nová“ a tyto stavy se smažou. Vlastní stavy správce se nedotýkají.
 */
async function ensureInquiryStages(db: Executor): Promise<{ removed: number; renamed: number }> {
  const found = await pipelineStages(db, "inquiry", "default");
  if (!found) return { removed: 0, renamed: 0 };
  const stages = [...found.stages];
  const byName = (n: string) => stages.find((s) => sameName(s.name, n));
  let renamed = 0;
  let removed = 0;

  for (const [from, to, kind] of [
    ["Vyhráno", "Kvalifikovaná", "won"],
    ["Prohráno", "Zamítnutá", "lost"],
  ] as const) {
    const old = byName(from);
    if (old && old.kind === kind && !byName(to)) {
      await db
        .update(schema.pipelineStage)
        .set({ name: to })
        .where(eq(schema.pipelineStage.id, old.id));
      old.name = to;
      renamed += 1;
    }
  }

  const fresh = byName("Nová");
  const legacyOpen = ["Kvalifikace", "Nabídka odeslána", "Vyjednávání"]
    .map(byName)
    .filter((s): s is StageRow => !!s && s.kind === "open");
  if (fresh && legacyOpen.length) {
    const ids = legacyOpen.map((s) => s.id);
    await db.update(inquiry).set({ stageId: fresh.id }).where(inArray(inquiry.stageId, ids));
    await db
      .update(schema.pipelineStage)
      .set({ deletedAt: new Date() })
      .where(inArray(schema.pipelineStage.id, ids));
    removed = legacyOpen.length;
    await renumber(
      db,
      stages.filter((s) => !ids.includes(s.id)),
    );
  }
  return { removed, renamed };
}

/**
 * Idempotentní doplnění dat CRM do libovolné instance (nová i stávající): typy aktivit, obchodní stavy zakázek,
 * schránka poptávek a přepočet `crm_*` sloupců zakázek. Volá se z `db:seed` a `demo:seed` (`ModuleServer.ensure`);
 * při opakování nic nemění. Co správce změnil v administraci (pravděpodobnosti, názvy, pořadí), nepřepisuje.
 */
export async function ensureCrmDefaults(db: Executor): Promise<CrmEnsureReport> {
  return db.transaction(async (tx) => {
    // souběžný seed (dva procesy, testy) nesmí stavy založit dvakrát
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('crm:ensure-defaults'))`);
    const activityTypesAdded = await ensureActivityTypes(tx);
    const job = await ensureJobStages(tx);
    const inq = await ensureInquiryStages(tx);
    const jobsRecomputed = await recomputeAllJobsCrm(systemCtx(tx));
    return {
      activityTypesAdded,
      jobStagesAdded: job.added,
      jobStagesRenamed: job.renamed,
      inquiryStagesRemoved: inq.removed,
      inquiryStagesRenamed: inq.renamed,
      jobsRecomputed,
    };
  });
}
