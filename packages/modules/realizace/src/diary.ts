import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { schema } from "@rebar/core/db";
import { assertEntityAccess, createRecord, resolveEntity } from "@rebar/core/entities";
import { defineCommand, type ModuleDeps } from "@rebar/core/module-server";
import { can, inTx, NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { todayIso } from "@rebar/core/time";
import { job, jobMember } from "@rebar/zakazky/schema";
import { costsApi } from "@rebar/zakazky/server";
import {
  materialAmountMinor,
  mergeMaterialRows,
  qtyThousandths,
  stripMaterialPrices,
  summarizeMachines,
  summarizeMaterials,
  summarizeWorkers,
  type DiaryIncident,
  type DiaryMachine,
  type DiaryMaterial,
  type DiaryWeather,
  type DiaryWorker,
} from "./diary-shared";
import { siteDiary } from "./schema";
import { fetchWeather, geocodeAddress } from "./weather";

const jobId = z.uuid();
const nz = <T extends z.ZodType>(s: T) => s.nullish().transform((v) => v ?? null);

/* ---------- oprávnění ---------- */

async function readJob(ctx: Ctx, id: string) {
  await assertEntityAccess(ctx, "job", id, "read");
  if (!can(ctx, "realizace.read")) throw new PermissionError();
}

/** Zápis do deníku smí ten, kdo má `realizace.write`, a vždy vedoucí nebo člen týmu zakázky (montér s „jen moje“). */
export async function canWriteDiary(ctx: Ctx, id: string): Promise<boolean> {
  await assertEntityAccess(ctx, "job", id, "read");
  if (can(ctx, "realizace.write")) return true;
  const me = ctx.actor.userId;
  if (!me) return false;
  const [j] = await ctx.db.select({ managerId: job.managerId }).from(job).where(eq(job.id, id));
  if (j?.managerId === me) return true;
  const [m] = await ctx.db
    .select({ u: jobMember.userId })
    .from(jobMember)
    .where(and(eq(jobMember.jobId, id), eq(jobMember.userId, me)));
  return !!m;
}

/** Ceny v deníku vidí jen držitel ekonomiky; zapisuje je ten, kdo smí i rozpočet a náklady. */
const canSeePrices = (ctx: Ctx) => can(ctx, "zakazky.economics");
const canWritePrices = (ctx: Ctx) => can(ctx, "zakazky.economics") && can(ctx, "zakazky.budget");

/** Do uzavřené nebo prohrané zakázky se už nezapisuje. */
export async function assertJobWritable(ctx: Ctx, id: string) {
  const [j] = await ctx.db.select({ phase: job.phase }).from(job).where(eq(job.id, id));
  if (!j) throw new NotFoundError("Zakázka nenalezena.");
  if (j.phase === "closed" || j.phase === "lost")
    throw new UserError("Zakázka je uzavřená, do deníku se už nezapisuje.");
}

async function writeJob(ctx: Ctx, id: string) {
  await assertEntityAccess(ctx, "job", id, "write");
}

/* ---------- počasí ---------- */

export type WeatherResult = {
  weather: DiaryWeather | null;
  /** `no-location`: zakázka nemá adresu ani souřadnice; `unavailable`: služba neodpověděla. */
  reason: "ok" | "no-location" | "unavailable";
};

/** Počasí na stavbě za den: souřadnice zakázky, jinak podle obce z adresy. Nikdy nevyhodí chybu. */
export async function resolveWeather(ctx: Ctx, id: string, date: string): Promise<WeatherResult> {
  const [j] = await ctx.db
    .select({ lat: job.siteLat, lng: job.siteLng, address: job.address })
    .from(job)
    .where(eq(job.id, id));
  if (!j) return { weather: null, reason: "no-location" };
  let coords: { lat: number; lng: number } | null =
    j.lat !== null && j.lng !== null ? { lat: Number(j.lat), lng: Number(j.lng) } : null;
  if (!coords && j.address?.trim()) coords = await geocodeAddress(j.address);
  if (!coords) return { weather: null, reason: j.address?.trim() ? "unavailable" : "no-location" };
  const weather = await fetchWeather(coords.lat, coords.lng, date, todayIso());
  return weather ? { weather, reason: "ok" } : { weather: null, reason: "unavailable" };
}

export const diaryWeather = defineCommand({
  name: "realizace.diary.weather",
  permission: "realizace.read",
  input: z.object({ jobId, date: z.iso.date() }),
  handler: async (ctx, i) => {
    if (!(await canWriteDiary(ctx, i.jobId))) throw new PermissionError();
    return resolveWeather(ctx, i.jobId, i.date);
  },
});

/* ---------- čtení ---------- */

type DiaryRow = typeof siteDiary.$inferSelect;

export function toEntry(d: DiaryRow, author: string | null, prices: boolean) {
  const materials = d.materialRows ?? [];
  return {
    id: d.id,
    date: d.date,
    weather: d.weather,
    temperature: d.temperature,
    weatherData: d.weatherData ?? null,
    people: d.people,
    work: d.work,
    machines: d.machines,
    materials: d.materials,
    events: d.events,
    workers: d.workers ?? [],
    materialRows: prices ? materials : stripMaterialPrices(materials),
    machineRows: d.machineRows ?? [],
    incidents: d.incidents ?? [],
    photoIds: d.photoIds ?? [],
    forInvestor: d.forInvestor,
    signed: d.signedAt
      ? {
          at: d.signedAt.toISOString(),
          name: d.signedName,
          signatureFileId: d.signatureFileId,
        }
      : null,
    author,
    updatedAt: d.updatedAt.toISOString(),
  };
}

export const diaryList = defineCommand({
  name: "realizace.diary.list",
  permission: "realizace.read",
  input: z.object({ jobId }),
  handler: async (ctx, i) => {
    await readJob(ctx, i.jobId);
    const rows = await ctx.db
      .select({ d: siteDiary, author: schema.user.name })
      .from(siteDiary)
      .leftJoin(schema.user, eq(siteDiary.createdBy, schema.user.id))
      .where(and(eq(siteDiary.jobId, i.jobId), isNull(siteDiary.deletedAt)))
      .orderBy(desc(siteDiary.date))
      .limit(500);
    const prices = canSeePrices(ctx);
    return {
      canWrite: await canWriteDiary(ctx, i.jobId),
      canPrice: canWritePrices(ctx),
      canUnsign: can(ctx, "realizace.write"),
      entries: rows.map(({ d, author }) => toEntry(d, author, prices)),
    };
  },
});

/** Všechny zápisy v období pro tisk deníku (bez cen). */
export const diaryPrint = defineCommand({
  name: "realizace.diary.print",
  permission: "realizace.read",
  input: z.object({ jobId, from: z.iso.date().nullish(), to: z.iso.date().nullish() }),
  handler: async (ctx, i) => {
    await readJob(ctx, i.jobId);
    const [j] = await ctx.db
      .select({
        number: job.number,
        title: job.title,
        address: job.address,
        startDate: job.startDate,
        endDate: job.endDate,
      })
      .from(job)
      .where(eq(job.id, i.jobId));
    if (!j) throw new NotFoundError("Zakázka nenalezena.");
    const rows = await ctx.db
      .select({ d: siteDiary, author: schema.user.name })
      .from(siteDiary)
      .leftJoin(schema.user, eq(siteDiary.createdBy, schema.user.id))
      .where(
        and(
          eq(siteDiary.jobId, i.jobId),
          isNull(siteDiary.deletedAt),
          i.from ? gte(siteDiary.date, i.from) : undefined,
          i.to ? lte(siteDiary.date, i.to) : undefined,
        ),
      )
      .orderBy(siteDiary.date);
    return { job: j, entries: rows.map(({ d, author }) => toEntry(d, author, false)) };
  },
});

/* ---------- zápis ---------- */

const weatherInput = z.object({
  code: z
    .number()
    .int()
    .min(0)
    .max(99)
    .nullish()
    .transform((v) => v ?? null),
  label: z.string().trim().min(1).max(60),
  tempMin: z
    .number()
    .min(-60)
    .max(60)
    .nullish()
    .transform((v) => v ?? null),
  tempMax: z
    .number()
    .min(-60)
    .max(60)
    .nullish()
    .transform((v) => v ?? null),
  precipMm: z
    .number()
    .min(0)
    .max(1000)
    .nullish()
    .transform((v) => v ?? null),
  windKmh: z
    .number()
    .min(0)
    .max(400)
    .nullish()
    .transform((v) => v ?? null),
  source: z.enum(["open-meteo", "manual"]).default("manual"),
  fetchedAt: z.string().max(40).optional(),
});

const workerInput = z.object({
  userId: nz(z.uuid()),
  name: z.string().trim().min(1, "Pracovník musí mít jméno.").max(120),
  hours: z
    .number()
    .min(0)
    .max(24)
    .nullish()
    .transform((v) => v ?? null),
  source: z.enum(["attendance", "manual"]).default("manual"),
});

const materialInput = z.object({
  id: z.string().trim().min(8).max(64),
  name: z.string().trim().min(1, "Materiál musí mít název.").max(160),
  qty: z
    .string()
    .trim()
    .refine((v) => qtyThousandths(v) > 0, "Množství materiálu musí být kladné číslo."),
  unit: z.string().trim().min(1, "Doplňte jednotku materiálu.").max(20),
  supplier: nz(z.string().trim().max(120)),
  unitPriceMinor: z
    .number()
    .int()
    .min(0)
    .max(1_000_000_000_000)
    .nullish()
    .transform((v) => v ?? null),
  source: z.enum(["manual", "sklad"]).default("manual"),
});

const machineInput = z.object({
  name: z.string().trim().min(1, "Stroj musí mít název.").max(120),
  hours: z
    .number()
    .min(0)
    .max(24)
    .nullish()
    .transform((v) => v ?? null),
  note: nz(z.string().trim().max(300)),
  source: z.enum(["manual", "stroje"]).default("manual"),
});

const incidentInput = z.object({
  id: z.string().trim().min(8).max(64),
  kind: z.enum(["incident", "defect"]),
  text: z.string().trim().min(1, "Popište nehodu nebo vadu.").max(2000),
  defectId: nz(z.uuid()),
});

const saveInput = z.object({
  jobId,
  date: z.iso.date("Vyplňte datum."),
  weather: z.string().trim().max(60).nullish(),
  temperature: z.number().int().min(-60).max(60).nullish(),
  weatherData: weatherInput.nullish(),
  /** Při vzniku nového zápisu doplnit počasí z veřejné služby (výchozí ano). */
  autoWeather: z.boolean().optional(),
  people: z.string().trim().max(2000).nullish(),
  work: z.string().trim().max(5000).nullish(),
  machines: z.string().trim().max(2000).nullish(),
  materials: z.string().trim().max(2000).nullish(),
  events: z.string().trim().max(5000).nullish(),
  workers: z.array(workerInput).max(60).optional(),
  materialRows: z.array(materialInput).max(100).optional(),
  machineRows: z.array(machineInput).max(40).optional(),
  incidents: z.array(incidentInput).max(30).optional(),
  photoIds: z.array(z.uuid()).max(40).optional(),
  forInvestor: z.boolean().optional(),
});

const SOURCE = "diary";

/** Náklady zakázky k řádkům materiálu: nový řádek s cenou náklad vytvoří, změněný ho přepíše, odebraný zruší. */
async function syncMaterialCosts(
  c: Ctx,
  p: {
    entryId: string;
    jobId: string;
    date: string;
    prev: readonly DiaryMaterial[];
    next: DiaryMaterial[];
  },
) {
  const prevById = new Map(p.prev.map((m) => [m.id, m]));
  const nextIds = new Set(p.next.map((m) => m.id));
  const ref = (m: Pick<DiaryMaterial, "id">) => `${p.entryId}:${m.id}`;
  const sig = (m: DiaryMaterial) =>
    `${materialAmountMinor(m)}|${m.name}|${m.supplier ?? ""}|${m.qty}|${m.unit}`;

  for (const old of p.prev)
    if (old.costRef && !nextIds.has(old.id))
      await costsApi.deleteManualCostsBySource(c, p.jobId, SOURCE, ref(old));

  for (const m of p.next) {
    const old = prevById.get(m.id);
    const amount = materialAmountMinor(m);
    if (amount <= 0) {
      if (old?.costRef) await costsApi.deleteManualCostsBySource(c, p.jobId, SOURCE, ref(m));
      m.costRef = null;
      continue;
    }
    if (old?.costRef && sig(old) === sig(m)) {
      m.costRef = old.costRef;
      continue;
    }
    if (old?.costRef) await costsApi.deleteManualCostsBySource(c, p.jobId, SOURCE, ref(m));
    const created = await costsApi.createManualCost(c, {
      jobId: p.jobId,
      date: p.date,
      category: "material",
      title: `${m.name} (${m.qty.replace(".", ",")} ${m.unit}) — stavební deník`,
      supplierName: m.supplier,
      amountMinor: amount,
      source: SOURCE,
      sourceRef: ref(m),
    });
    m.costRef = created.id;
  }
}

/** Fotky zápisu musí být obrázky připojené k téže zakázce. */
async function assertPhotos(c: Ctx, id: string, photoIds: readonly string[]) {
  if (!photoIds.length) return;
  const found = await c.db
    .select({ fileId: schema.attachment.fileId })
    .from(schema.attachment)
    .innerJoin(schema.file, eq(schema.file.id, schema.attachment.fileId))
    .where(
      and(
        eq(schema.attachment.entityType, "job"),
        eq(schema.attachment.entityId, id),
        inArray(schema.attachment.fileId, [...photoIds]),
        isNull(schema.attachment.deletedAt),
        eq(schema.file.kind, "image"),
      ),
    );
  if (new Set(found.map((f) => f.fileId)).size !== new Set(photoIds).size)
    throw new UserError("Některá fotka nepatří k této zakázce. Nahrajte ji znovu.");
}

/** Vada z deníku: založí se vada zakázky (stejně jako ruční zápis na záložce Vady). */
async function createDefect(
  c: Ctx,
  deps: ModuleDeps,
  p: { jobId: string; date: string; text: string },
): Promise<string> {
  const def = deps.registry.get("defect");
  if (!def) throw new UserError("Vady nejsou zapnuté.");
  const e = await resolveEntity(c.db, def);
  const created = await createRecord(c, deps.registry, e, {
    title: p.text.length > 80 ? `${p.text.slice(0, 77)}…` : p.text,
    job: p.jobId,
    description: p.text,
    foundAt: p.date,
  });
  return String(created.row.id);
}

export const diarySave = defineCommand({
  name: "realizace.diary.save",
  permission: "realizace.read",
  input: saveInput,
  handler: async (ctx, d, deps) => {
    if (!(await canWriteDiary(ctx, d.jobId)))
      throw new PermissionError("Do deníku zapisuje stavbyvedoucí a tým zakázky.");
    if (d.date > todayIso()) throw new UserError("Do deníku nejde zapisovat dopředu.");
    await assertJobWritable(ctx, d.jobId);
    const [existing] = await ctx.db
      .select({ id: siteDiary.id })
      .from(siteDiary)
      .where(
        and(eq(siteDiary.jobId, d.jobId), eq(siteDiary.date, d.date), isNull(siteDiary.deletedAt)),
      );
    const hasContent =
      d.work || d.events || d.workers?.length || d.materialRows?.length || d.machineRows?.length;
    const touches = [
      d.work,
      d.events,
      d.workers,
      d.materialRows,
      d.machineRows,
      d.incidents,
      d.photoIds,
      d.weatherData,
      d.weather,
      d.temperature,
      d.forInvestor,
      d.people,
      d.machines,
      d.materials,
    ].some((v) => v !== undefined);
    const empty = !hasContent && !d.incidents?.length && !d.photoIds?.length;
    // nový zápis musí něco obsahovat; úprava existujícího aspoň něco měnit
    if (!touches || (!existing && empty))
      throw new UserError("Vyplňte provedené práce nebo události dne.");

    // Počasí se bere mimo transakci (volání má limit 4 s); při selhání se deník uloží a počasí se doplní ručně.
    let weatherData: DiaryWeather | null | undefined = d.weatherData
      ? { ...d.weatherData }
      : d.weatherData;
    if (!existing && weatherData === undefined && d.autoWeather !== false)
      weatherData = (await resolveWeather(ctx, d.jobId, d.date)).weather ?? undefined;

    return inTx(ctx, async (c) => {
      const [cur] = await c.db
        .select()
        .from(siteDiary)
        .where(
          and(
            eq(siteDiary.jobId, d.jobId),
            eq(siteDiary.date, d.date),
            isNull(siteDiary.deletedAt),
          ),
        )
        .for("update");
      if (cur?.signedAt)
        throw new UserError("Zápis je podepsaný a nejde měnit. Podpis může zrušit stavbyvedoucí.");
      if (d.photoIds) await assertPhotos(c, d.jobId, d.photoIds);

      const entryId = cur?.id ?? randomUUID();
      const set: Partial<typeof siteDiary.$inferInsert> = { updatedBy: c.actor.userId };

      const w = weatherData;
      if (w !== undefined) {
        set.weatherData = w;
        if (w) {
          set.weather = w.label;
          if (w.tempMax !== null || w.tempMin !== null)
            set.temperature = Math.round(
              ((w.tempMax ?? w.tempMin!) + (w.tempMin ?? w.tempMax!)) / 2,
            );
        }
      }
      if (d.weather !== undefined) set.weather = d.weather || null;
      if (d.temperature !== undefined) set.temperature = d.temperature ?? null;
      if (d.work !== undefined) set.work = d.work || null;
      if (d.events !== undefined) set.events = d.events || null;

      // pracovníci, stroje a materiál: strukturované řádky jsou pravda, text je jejich čitelný souhrn
      if (d.workers) {
        set.workers = d.workers as DiaryWorker[];
        set.people = summarizeWorkers(d.workers) || null;
      } else if (d.people !== undefined) set.people = d.people || null;
      if (d.machineRows) {
        set.machineRows = d.machineRows as DiaryMachine[];
        set.machines = summarizeMachines(d.machineRows) || null;
      } else if (d.machines !== undefined) set.machines = d.machines || null;

      if (d.materialRows) {
        const prev = cur?.materialRows ?? [];
        const merged = mergeMaterialRows(
          d.materialRows.map((m) => ({ ...m, costRef: null })),
          prev,
          canWritePrices(c),
        );
        await syncMaterialCosts(c, { entryId, jobId: d.jobId, date: d.date, prev, next: merged });
        set.materialRows = merged;
        set.materials = summarizeMaterials(merged) || null;
      } else if (d.materials !== undefined) set.materials = d.materials || null;

      if (d.incidents) {
        const prev = new Map((cur?.incidents ?? []).map((x) => [x.id, x]));
        const next: DiaryIncident[] = [];
        for (const inc of d.incidents) {
          const old = prev.get(inc.id);
          let defectId = old?.defectId ?? null;
          if (inc.kind === "defect" && !defectId)
            defectId = await createDefect(c, deps, {
              jobId: d.jobId,
              date: d.date,
              text: inc.text,
            });
          next.push({ id: inc.id, kind: inc.kind, text: inc.text, defectId });
        }
        set.incidents = next;
        const text = next.map((x) => `${x.kind === "defect" ? "Vada" : "Nehoda"}: ${x.text}`);
        if (d.events === undefined && text.length && !cur?.events) set.events = text.join("\n");
      }
      if (d.photoIds) set.photoIds = d.photoIds;
      if (d.forInvestor !== undefined) set.forInvestor = d.forInvestor;

      if (cur) {
        await c.db.update(siteDiary).set(set).where(eq(siteDiary.id, cur.id));
      } else {
        await c.db.insert(siteDiary).values({
          ...set,
          id: entryId,
          jobId: d.jobId,
          date: d.date,
          createdBy: c.actor.userId,
        });
      }
      await recordAudit(c, {
        action: cur ? "update" : "create",
        entityType: "job",
        entityId: d.jobId,
        summary: `Stavební deník ${d.date}${cur ? " upraven" : ": nový zápis"}`,
      });
      return { id: entryId };
    });
  },
});

/** Podpis zápisu: soubor s podpisem (ručně, nebo podpis z předání) musí být připojený k téže zakázce. */
export const diarySign = defineCommand({
  name: "realizace.diary.sign",
  permission: "realizace.read",
  input: z.object({
    id: z.uuid(),
    signatureFileId: z.uuid(),
    name: z.string().trim().min(2, "Napište jméno podepisujícího.").max(120),
  }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const [row] = await c.db
        .select()
        .from(siteDiary)
        .where(and(eq(siteDiary.id, i.id), isNull(siteDiary.deletedAt)))
        .for("update");
      if (!row) throw new NotFoundError("Zápis nenalezen.");
      if (!(await canWriteDiary(c, row.jobId)))
        throw new PermissionError("Zápis podepisuje stavbyvedoucí a tým zakázky.");
      if (row.signedAt) throw new UserError("Zápis už je podepsaný.");
      const [att] = await c.db
        .select({ id: schema.attachment.id })
        .from(schema.attachment)
        .where(
          and(
            eq(schema.attachment.fileId, i.signatureFileId),
            eq(schema.attachment.entityType, "job"),
            eq(schema.attachment.entityId, row.jobId),
            isNull(schema.attachment.deletedAt),
          ),
        );
      if (!att)
        throw new UserError("Podpis se nepodařilo najít u této zakázky. Zkuste ho nahrát znovu.");
      await c.db
        .update(siteDiary)
        .set({
          signedAt: new Date(),
          signedById: c.actor.userId,
          signedName: i.name,
          signatureFileId: i.signatureFileId,
          updatedBy: c.actor.userId,
        })
        .where(eq(siteDiary.id, i.id));
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: row.jobId,
        summary: `Stavební deník ${row.date} podepsán (${i.name})`,
      });
    });
  },
});

export const diaryUnsign = defineCommand({
  name: "realizace.diary.unsign",
  permission: "realizace.write",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const [row] = await c.db
        .select()
        .from(siteDiary)
        .where(and(eq(siteDiary.id, i.id), isNull(siteDiary.deletedAt)))
        .for("update");
      if (!row) throw new NotFoundError("Zápis nenalezen.");
      await writeJob(c, row.jobId);
      if (!row.signedAt) return;
      await c.db
        .update(siteDiary)
        .set({
          signedAt: null,
          signedById: null,
          signedName: null,
          signatureFileId: null,
          updatedBy: c.actor.userId,
        })
        .where(eq(siteDiary.id, i.id));
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: row.jobId,
        summary: `Podpis stavebního deníku ${row.date} zrušen`,
      });
    });
  },
});

export const diaryDelete = defineCommand({
  name: "realizace.diary.delete",
  permission: "realizace.write",
  input: z.object({ id: z.uuid() }),
  handler: async (ctx, i) => {
    await inTx(ctx, async (c) => {
      const [row] = await c.db
        .select()
        .from(siteDiary)
        .where(and(eq(siteDiary.id, i.id), isNull(siteDiary.deletedAt)))
        .for("update");
      if (!row) throw new NotFoundError("Zápis nenalezen.");
      await writeJob(c, row.jobId);
      if (row.signedAt) throw new UserError("Podepsaný zápis nejde smazat. Nejdřív zrušte podpis.");
      // náklady z materiálu se ruší spolu se zápisem
      await costsApi.deleteManualCostsBySource(c, row.jobId, SOURCE, `${row.id}:`);
      await c.db
        .update(siteDiary)
        .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
        .where(eq(siteDiary.id, i.id));
      await recordAudit(c, {
        action: "delete",
        entityType: "job",
        entityId: row.jobId,
        summary: `Stavební deník ${row.date}: zápis smazán`,
      });
    });
  },
});

/* ---------- předvyplnění ---------- */

/** Předvyplnění zápisu z docházky, strojů a skladu toho dne (dodávají je ostatní moduly, pokud běží). */
export const diaryPrefill = defineCommand({
  name: "realizace.diary.prefill",
  permission: "realizace.read",
  input: z.object({ jobId, date: z.iso.date() }),
  handler: async (ctx, i, deps) => {
    await readJob(ctx, i.jobId);
    const parts = (
      await Promise.allSettled(deps.diaryPrefill.map((p) => p(ctx, i.jobId, i.date, deps)))
    ).flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const join = (k: "people" | "work" | "machines" | "materials") =>
      parts
        .map((p) => p[k])
        .filter(Boolean)
        .join("; ");
    return {
      people: join("people"),
      work: join("work"),
      machines: join("machines"),
      materials: join("materials"),
      workers: parts.flatMap((p) =>
        (p.workers ?? []).map((w): DiaryWorker => ({
          userId: w.userId ?? null,
          name: w.name,
          hours: w.hours,
          source: "attendance",
        })),
      ),
      machineRows: parts.flatMap((p) =>
        (p.machineRows ?? []).map((m): DiaryMachine => ({
          name: m.name,
          hours: m.hours,
          note: m.note ?? null,
          source: "stroje",
        })),
      ),
      materialRows: parts.flatMap((p) =>
        (p.materialRows ?? []).map((m): DiaryMaterial => ({
          id: randomUUID(),
          name: m.name,
          qty: m.qty,
          unit: m.unit,
          supplier: null,
          unitPriceMinor: null,
          source: "sklad",
          costRef: null,
        })),
      ),
    };
  },
});

export const diaryCommands = [
  diaryList,
  diarySave,
  diaryDelete,
  diaryPrefill,
  diaryWeather,
  diarySign,
  diaryUnsign,
  diaryPrint,
];
