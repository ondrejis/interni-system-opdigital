import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  registerEntityPolicies,
  resolveEntity,
  setPhaseHooks,
  updateRecord,
  type EntityRegistry,
  type ResolvedEntity,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import {
  configureNotifications,
  notificationsConfigSchema,
  resetNotifications,
} from "@rebar/core/notifications";
import { ensureSeries } from "@rebar/core/numbering";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { createSettings } from "@rebar/core/settings";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { jobEntity, server as zakazkyServer } from "@rebar/zakazky/server";
import { manifest } from "../../index";
import { inquiryEntity } from "../../server";
import { loseCommand, setFieldRulesCommand, winCommand } from "../deals/commands";
import { crmHooks } from "../hooks";
import { ensureCrmDefaults } from "../seed";
import { followCommand, followerListCommand, moveCheckCommand, unfollowCommand } from "./index";
import { followerHooks } from "./followers";
import { CRM_BOARD_NOTIFICATIONS } from "./notifications";

const app = connectAppDb();
afterAll(() => {
  resetNotifications();
  return app.close();
});

let registry: EntityRegistry;
let jobE: ResolvedEntity;
let stages: { id: string; name: string; phase: string | null; position: number }[];
const settings = createSettings(
  createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") })),
);
const deps = () => ({ registry, settings, baseURL: "http://localhost" }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, inquiryEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const m of [manifest, zakazkyManifest]) {
    for (const p of m.seed.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of "lookups" in m.seed ? m.seed.lookups : []) await ensureLookup(app.db, l);
    if ("series" in m.seed) await ensureSeries(app.db, m.seed.series);
  }
  await ensureCrmDefaults(app.db);
  jobE = await resolveEntity(app.db, jobEntity);
  stages = (await getPipeline(app.db, "job", "default"))!.stages as typeof stages;
  configureNotifications({
    events: [...CRM_BOARD_NOTIFICATIONS],
    config: notificationsConfigSchema.parse({
      quietHours: { enabled: false, start: "20:00", end: "06:00" },
    }),
  });
});
beforeEach(() =>
  setPhaseHooks([...(zakazkyServer.phaseHooks ?? []), ...crmHooks, ...followerHooks]),
);

const stage = (name: string) => stages.find((s) => s.name === name)!;
const boss = () =>
  makeUser(app.db, [
    ["zakazky.read", "all"],
    ["zakazky.write", "all"],
    ["zakazky.finance", "all"],
    ["kontakty.read", "all"],
    ["kontakty.write", "all"],
    ["settings.manage", "all"],
  ]);
type User = Awaited<ReturnType<typeof boss>>;

async function mkJob(u: User, extra: Record<string, unknown> = {}) {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
    .returning();
  const r = await createRecord(u.ctx, registry, jobE, {
    title: `Zakázka ${randomBytes(3).toString("hex")}`,
    company: c!.id,
    value: 1_000_000_00,
    ...extra,
  });
  return r.row;
}
const upd = (u: User, id: string, patch: Record<string, unknown>) =>
  updateRecord(u.ctx, registry, jobE, id, patch);
const inbox = (userId: string) =>
  app.db.select().from(schema.notification).where(eq(schema.notification.userId, userId));

describe("kontrola přesunu do stavu (crm.deal.moveCheck)", () => {
  it("chybějící adresa stavby před nabídkou vrátí větu a pole k doplnění", async () => {
    const u = await boss();
    const j = await mkJob(u);
    const check = await moveCheckCommand.handler(
      u.ctx,
      { jobId: j.id, stageId: stage("Nabídka v přípravě").id },
      deps(),
    );
    expect(check.target.name).toBe("Nabídka v přípravě");
    expect(check.problems).toHaveLength(1);
    expect(check.problems[0]).toMatchObject({ attr: "address", label: "Adresa stavby" });
    expect(check.problems[0]!.message).toContain("adresu stavby");
  });

  it("po doplnění adresy kontrola projde a přesun opravdu jde", async () => {
    const u = await boss();
    const j = await mkJob(u);
    await upd(u, j.id, { address: "Kolárova 12, Plzeň" });
    const check = await moveCheckCommand.handler(
      u.ctx,
      { jobId: j.id, stageId: stage("Nabídka v přípravě").id },
      deps(),
    );
    expect(check.problems).toEqual([]);
    const moved = await upd(u, j.id, { stage: stage("Nabídka v přípravě").id });
    expect(moved.row.phase).toBe("offer");
  });

  it("přesun uvnitř fáze nevyžaduje adresu, dokud nezná pravidlo; povinné pole od stavu ho vyžádá", async () => {
    const u = await boss();
    const j = await mkJob(u);
    const inside = await moveCheckCommand.handler(
      u.ctx,
      { jobId: j.id, stageId: stage("Kontaktováno").id },
      deps(),
    );
    expect(inside.problems).toEqual([]);
    await setFieldRulesCommand.handler(
      u.ctx,
      { rules: [{ attr: "endDate", fromStageId: stage("Obhlídka").id, level: "required" }] },
      deps(),
    );
    try {
      const blocked = await moveCheckCommand.handler(
        u.ctx,
        { jobId: j.id, stageId: stage("Obhlídka").id },
        deps(),
      );
      expect(blocked.problems).toHaveLength(1);
      expect(blocked.problems[0]).toMatchObject({ attr: "endDate", label: "Termín" });
      // stejnou větu vrátí i skutečný přechod
      await expect(upd(u, j.id, { stage: stage("Obhlídka").id })).rejects.toThrow(/vyplňte pole/);
    } finally {
      await setFieldRulesCommand.handler(u.ctx, { rules: [] }, deps());
    }
  });

  it("výhra a prohra se kontrolují podle cílové fáze", async () => {
    const u = await boss();
    const j = await mkJob(u);
    const win = await moveCheckCommand.handler(
      u.ctx,
      { jobId: j.id, toPhase: "preparation" },
      deps(),
    );
    expect(win.target.phase).toBe("preparation");
    const lose = await moveCheckCommand.handler(u.ctx, { jobId: j.id, toPhase: "lost" }, deps());
    expect(lose.target.phase).toBe("lost");
    expect(lose.problems).toEqual([]);
  });

  it("zakázku mimo rozsah „jen moje“ nezkontroluje", async () => {
    const owner = await boss();
    const j = await mkJob(owner);
    const stranger = await makeUser(app.db, [["zakazky.read", "own"]]);
    await expect(
      moveCheckCommand.handler(
        stranger.ctx,
        { jobId: j.id, stageId: stage("Kontaktováno").id },
        deps(),
      ),
    ).rejects.toThrow();
  });
});

describe("sledující zakázky", () => {
  it("sledování je idempotentní a seznam ukazuje počet a mě", async () => {
    const u = await boss();
    const j = await mkJob(u);
    expect((await followerListCommand.handler(u.ctx, { jobId: j.id }, deps())).count).toBe(0);
    await followCommand.handler(u.ctx, { jobId: j.id }, deps());
    const twice = await followCommand.handler(u.ctx, { jobId: j.id }, deps());
    expect(twice).toMatchObject({ count: 1, following: true });
    expect(twice.followers[0]).toMatchObject({ userId: u.id, name: u.name });
    const off = await unfollowCommand.handler(u.ctx, { jobId: j.id }, deps());
    expect(off).toMatchObject({ count: 0, following: false });
  });

  it("jiného uživatele přidá jen ten, kdo smí zakázku upravovat", async () => {
    const u = await boss();
    const j = await mkJob(u);
    const colleague = await boss();
    const added = await followCommand.handler(u.ctx, { jobId: j.id, userId: colleague.id }, deps());
    expect(added.followers.map((f) => f.userId)).toEqual([colleague.id]);
    expect(added.following).toBe(false);

    const reader = await makeUser(app.db, [["zakazky.read", "all"]]);
    await expect(
      followCommand.handler(reader.ctx, { jobId: j.id, userId: u.id }, deps()),
    ).rejects.toThrow();
    // sebe sledovat smí i ten, kdo zakázku jen čte
    const self = await followCommand.handler(reader.ctx, { jobId: j.id }, deps());
    expect(self.following).toBe(true);
    const removed = await unfollowCommand.handler(
      u.ctx,
      { jobId: j.id, userId: colleague.id },
      deps(),
    );
    expect(removed.followers.map((f) => f.userId)).toEqual([reader.id]);
  });

  it("zakázku mimo rozsah nejde sledovat", async () => {
    const owner = await boss();
    const j = await mkJob(owner);
    const stranger = await makeUser(app.db, [["zakazky.read", "own"]]);
    await expect(followCommand.handler(stranger.ctx, { jobId: j.id }, deps())).rejects.toThrow();
  });
});

describe("upozornění sledujícím", () => {
  it("změna stavu upozorní sledujícího, ne toho, kdo změnu udělal", async () => {
    const actor = await boss();
    const watcher = await boss();
    const j = await mkJob(actor);
    await followCommand.handler(actor.ctx, { jobId: j.id }, deps());
    await followCommand.handler(watcher.ctx, { jobId: j.id }, deps());
    await upd(actor, j.id, { stage: stage("Kontaktováno").id });
    const mine = await inbox(watcher.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.title).toContain("Kontaktováno");
    expect(await inbox(actor.id)).toEqual([]);
  });

  it("výhra a prohra mají vlastní upozornění (prohra s důvodem)", async () => {
    const actor = await boss();
    const watcher = await boss();
    const won = await mkJob(actor, { address: "Poštovní 1, Plzeň" });
    const lost = await mkJob(actor);
    await followCommand.handler(watcher.ctx, { jobId: won.id }, deps());
    await followCommand.handler(watcher.ctx, { jobId: lost.id }, deps());
    await winCommand.handler(actor.ctx, { jobId: won.id }, deps());
    await loseCommand.handler(
      actor.ctx,
      { jobId: lost.id, reasonKey: "price", note: "Dražší o 8 %" },
      deps(),
    );
    const titles = (await inbox(watcher.id)).map((n) => n.title);
    expect(titles.some((t) => t.startsWith("Vyhráno"))).toBe(true);
    expect(titles.some((t) => t.startsWith("Prohráno"))).toBe(true);
    const lostRow = (await inbox(watcher.id)).find((n) => n.title.startsWith("Prohráno"))!;
    expect(lostRow.body).toContain("Cena");
  });

  it("bez sledujících se nic neposílá a sledující bez práva na zakázku nic nedostane", async () => {
    const actor = await boss();
    const j = await mkJob(actor);
    await upd(actor, j.id, { stage: stage("Kontaktováno").id });
    const stranger = await makeUser(app.db, [["zakazky.read", "own"]]);
    // sledující bez práva na zakázku (přidaný napřímo v databázi): katalog mu obsah nedoručí
    await app.db.insert((await import("../../schema")).crmFollower).values({
      jobId: j.id,
      userId: stranger.id,
    });
    await upd(actor, j.id, { stage: stage("Obhlídka").id });
    expect(await inbox(stranger.id)).toEqual([]);
  });
});
