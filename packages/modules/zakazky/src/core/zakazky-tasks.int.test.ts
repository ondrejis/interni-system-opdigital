import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@rebar/core/db";
import { createEntityRegistry } from "@rebar/core/entities";
import { createModuleDeps, type ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { entities as kontaktyEntities } from "@rebar/kontakty/server";
import { company } from "@rebar/kontakty/schema";
import { entities as ukolyEntities, task } from "../../../ukoly/src/entities";
import { createTasksService } from "../../../ukoly/src/service";
import { ensureTaskTypes } from "../../../ukoly/src/tasks/types";
import { createJob } from "../api";
import { manifest } from "../index";
import { jobEntity, jobTemplateEntity } from "../entities";
import { job, jobPhase } from "../schema";
import { ensureDefaultTemplates } from "../templates/defaults";
import { commands } from "./commands";
import { commands as templateCommands } from "../templates/commands";

/*
  Zakázky proti skutečné službě `tasks` modulu Úkoly (ne stubu): úkoly ze šablony po fázích, počty otevřených úkolů,
  dokončení otevřených úkolů při dokončení fáze (včetně soukromých) a uložení hotové zakázky jako šablony.
*/

const app = connectAppDb();
afterAll(() => app.close());

type Person = Awaited<ReturnType<typeof makeUser>>;
let owner: Person;
let partner: Person;
let deps: ModuleDeps;
let companyId: string;

const run = (who: Person, name: string, input: unknown) => {
  const c = [...commands, ...templateCommands].find((x) => x.name === name)! as unknown as {
    input: { parse(i: unknown): unknown };
    handler(ctx: Person["ctx"], input: unknown, deps: ModuleDeps): Promise<unknown>;
  };
  return c.handler(who.ctx, c.input.parse(input), deps);
};
const tasksOf = (jobId: string) => app.db.select().from(task).where(eq(task.jobId, jobId));
const phasesOf = (jobId: string) =>
  app.db
    .select()
    .from(jobPhase)
    .where(and(eq(jobPhase.jobId, jobId), isNull(jobPhase.deletedAt)))
    .orderBy(jobPhase.position);

beforeAll(async () => {
  await ensureSeries(app.db, manifest.seed?.series ?? []);
  await ensureTaskTypes(app.db);
  await ensureDefaultTemplates(app.db);
  const all = ["read", "create", "write", "templates"].map((a): [string, "all"] => [
    `zakazky.${a}`,
    "all",
  ]);
  const tasks = ["read", "create", "write"].map((a): [string, "all"] => [`ukoly.${a}`, "all"]);
  owner = await makeUser(app.db, [
    ...all,
    ...tasks,
    ["private.read", "all"],
    ["finance.read", "all"],
  ]);
  partner = await makeUser(app.db, [...all, ...tasks, ["finance.read", "all"]]);
  companyId = (
    await app.db.insert(company).values({ name: "Úkolová s.r.o." }).returning({ id: company.id })
  )[0]!.id;
  const registry = createEntityRegistry([
    ...kontaktyEntities,
    jobEntity,
    jobTemplateEntity,
    ...ukolyEntities,
  ]);
  deps = createModuleDeps({ registry, calendarLayers: [], emit: async () => {} } as never, {
    services: { tasks: (d) => createTasksService(d) },
    contributions: {},
  });
});

describe("zakázky se skutečnou službou úkolů", () => {
  it("úkoly ze šablony po fázích, počty, dokončení při dokončení fáze (i soukromých) a šablona z hotové zakázky", async () => {
    const out = await createJob(owner.ctx, deps, {
      title: "Web s úkoly",
      type: "web",
      companyId,
      ownerId: owner.id,
      startDate: "2026-10-01",
    });
    const phases = await phasesOf(out.id);
    const created = await tasksOf(out.id);
    expect(created).toHaveLength(11);
    expect(created.every((t) => t.jobPhaseId && t.dueDate)).toBe(true);
    expect(created.find((t) => t.title === "Domluvit přístupy k doméně a hostingu")).toMatchObject({
      jobPhaseId: phases[0]!.id,
      dueDate: "2026-10-06",
      assigneeId: owner.id,
    });

    // jeden úkol v první fázi je soukromý (zámek)
    const secret = created.find((t) => t.jobPhaseId === phases[0]!.id)!;
    await app.db.update(task).set({ isPrivate: true }).where(eq(task.id, secret.id));
    await app.db.insert(schema.privateRecord).values({ entityType: "task", entityId: secret.id });

    const preview = (who: Person) =>
      run(who, "zakazky.phase.preview", { jobId: out.id, phaseId: phases[2]!.id }) as Promise<{
        completing: { name: string; openTasks: number }[];
        totalOpenTasks: number;
      }>;
    const asOwner = await preview(owner);
    const asPartner = await preview(partner);
    const open = (p: { completing: { name: string; openTasks: number }[] }, name: string) =>
      p.completing.find((c) => c.name === name)!.openTasks;
    expect(open(asOwner, "Podklady")).toBe(2);
    expect(open(asPartner, "Podklady")).toBe(1); // soukromý úkol partner nevidí v počtu
    expect(asOwner.totalOpenTasks).toBeGreaterThan(asPartner.totalOpenTasks);

    // dokončení fází 1 a 2 s dokončením úkolů: dokončí i soukromý úkol
    const res = (await run(partner, "zakazky.setPhase", {
      jobId: out.id,
      phaseId: phases[2]!.id,
      completeOpenTasks: true,
    })) as { completedPhaseIds: string[]; completedTasks: number };
    expect(res.completedPhaseIds).toEqual([phases[0]!.id, phases[1]!.id]);
    const after = await tasksOf(out.id);
    const inDone = after.filter((t) => [phases[0]!.id, phases[1]!.id].includes(t.jobPhaseId!));
    expect(inDone.length).toBe(res.completedTasks);
    expect(inDone.every((t) => t.status === "done")).toBe(true);
    expect(after.find((t) => t.id === secret.id)!.status).toBe("done");
    expect(after.filter((t) => t.status !== "done").length).toBe(11 - inDone.length);

    // šablona z hotové zakázky: otevřené úkoly zůstaly jen v pozdějších fázích
    const saved = (await run(owner, "zakazky.template.saveFromJob", {
      jobId: out.id,
      name: "Z úkolové zakázky",
    })) as {
      payload: {
        phases: unknown[];
        tasks: {
          title: string;
          phaseIndex: number;
          dueOffsetDays: number | null;
          assignee: { rule: string };
        }[];
      };
    };
    expect(saved.payload.phases).toHaveLength(6);
    expect(saved.payload.tasks).toHaveLength(11 - inDone.length);
    expect(saved.payload.tasks.every((t) => t.phaseIndex >= 2)).toBe(true);
    expect(saved.payload.tasks.find((t) => t.title === "Naprogramovat web")).toMatchObject({
      phaseIndex: 2,
      dueOffsetDays: 35,
      assignee: { rule: "owner" },
    });
    // a zakázka z ní má stejné úkoly
    const copy = await createJob(owner.ctx, deps, {
      title: "Kopie",
      type: "web",
      companyId,
      ownerId: owner.id,
      startDate: "2026-12-01",
      templateId: (saved as unknown as { id: string }).id,
    });
    expect(await tasksOf(copy.id)).toHaveLength(saved.payload.tasks.length);
    expect((await app.db.select().from(job).where(eq(job.id, copy.id)))[0]!.templateId).toBe(
      (saved as unknown as { id: string }).id,
    );
  });
});
