import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { schema } from "@rebar/core/db";
import { setDomainEvents, type DomainEventHandlers } from "@rebar/core/events";
import { NotFoundError, UserError, type Ctx } from "@rebar/core/rbac";
import {
  applyEntityExtensions,
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
} from "@rebar/core/entities";
import { createModuleDeps } from "@rebar/core/module-server";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { createSettings } from "@rebar/core/settings";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { companyEntity, server as kontaktySrv } from "@rebar/kontakty/server";
import { company } from "@rebar/kontakty/schema";
import { jobEntity, server as zakazkySrv } from "@rebar/zakazky/server";
import { job } from "@rebar/zakazky/schema";
import { server as financeSrv } from "@rebar/finance/server";
import { payment } from "@rebar/finance/schema";
import { driveFolder, driveRequest, server as diskSrv } from "@rebar/disk/server";
import { server as klientiSrv } from "@rebar/klienti/server";
import {
  clientSummary,
  clientTabs,
  listClients,
  saveContext,
  setClientStatus,
  setServices,
} from "@rebar/klienti/server";

/*
  Modul „klienti“ nad skutečnou databází (KLI-01…07, 10, 11, AS-01 část karta): přechody stavů s pravidly „klient od“ a
  Bývalý, události `client.*` (a na ně navázané požadavky Disku), služba `clients` pro Obchody a Zakázky, seznam
  klientů se sloupci z příspěvků modulů, souhrn a počty záložek karty, kontext a soukromí (canary: Patrik nevidí
  soukromého klienta nikde a v součtech jsou jen sdílené zakázky).
*/
const app = connectAppDb();
afterAll(() => app.close());

type Seen = { name: string; data: Record<string, unknown>; isPrivate: boolean };
let seen: Seen[] = [];
let n = 0;
const rid = () => randomBytes(6).toString("hex");
const CANARY = "CANARY-SOUKROMY-KLIENT";

async function setup() {
  clearEntityPolicies();
  const registry = createEntityRegistry(
    applyEntityExtensions([companyEntity, jobEntity, ...(klientiSrv.entities ?? [])]),
  );
  registerEntityPolicies(registry);
  const cipher = createCipher(
    parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }),
  );
  const deps = createModuleDeps(
    {
      registry,
      queue: { send: async () => null },
      storage: {} as never,
      settings: createSettings(cipher),
      cipher,
      baseURL: "http://localhost:3100",
      emit: async () => {},
      calendarLayers: [],
    },
    {
      services: { ...klientiSrv.services, ...diskSrv.services },
      contributions: {
        clientCard: [
          ...(kontaktySrv.contributions?.clientCard ?? []),
          ...(zakazkySrv.contributions?.clientCard ?? []),
          ...(financeSrv.contributions?.clientCard ?? []),
          ...(diskSrv.contributions?.clientCard ?? []),
        ],
      },
    },
  );
  const common: [string, "all"][] = [
    ["klienti.read", "all"],
    ["klienti.write", "all"],
    ["kontakty.read", "all"],
    ["kontakty.write", "all"],
    ["zakazky.read", "all"],
    ["finance.read", "all"],
    ["disk.read", "all"],
  ];
  const owner = await makeUser(app.db, [...common, ["private.read", "all"]], { name: "Ondřej T" });
  const partner = await makeUser(app.db, common, { name: "Patrik T" });
  const readOnly = await makeUser(app.db, [
    ["klienti.read", "all"],
    ["kontakty.read", "all"],
  ]);
  return { deps, owner, partner, readOnly };
}
let f: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  f = await setup();
  const handlers: Record<string, unknown> = Object.fromEntries(
    Object.entries((diskSrv.eventHandlers ?? {}) as DomainEventHandlers).map(([k, v]) => [
      k,
      [v].flat(),
    ]),
  );
  for (const name of ["client.status_changed", "client.renamed", "client.service_added"] as const)
    handlers[name] = [
      async (_c: Ctx, e: never) => {
        const ev = e as unknown as {
          data: Record<string, unknown>;
          entity: { isPrivate: boolean };
        };
        seen.push({ name, data: ev.data, isPrivate: ev.entity.isPrivate });
      },
      ...[handlers[name] ?? []].flat(),
    ];
  setDomainEvents(handlers as DomainEventHandlers, () => f.deps);
});
afterAll(() => setDomainEvents(undefined, undefined));
beforeEach(() => {
  seen = [];
});

const tx = <T>(who: { ctx: Ctx }, fn: (ctx: Ctx) => Promise<T>) =>
  app.db.transaction((t) => fn({ ...who.ctx, db: t }));
async function mk(over: Partial<typeof company.$inferInsert> = {}) {
  n += 1;
  const [c] = await app.db
    .insert(company)
    .values({ name: `Klient ${n} ${rid()}`, ...over })
    .returning();
  return c!;
}
const row = async (id: string) =>
  (await app.db.select().from(company).where(eq(company.id, id)))[0]!;
const setStatus = (
  who: { ctx: Ctx },
  companyId: string,
  status: "lead" | "active" | "paused" | "former",
  extra: { reason?: string; endedOn?: string; source?: "manual" | "deal_won" | "job_ended" } = {},
) =>
  tx(who, (ctx) =>
    setClientStatus(
      ctx,
      f.deps,
      {
        companyId,
        status,
        source: extra.source ?? "manual",
        ...(extra.reason ? { reason: extra.reason } : {}),
        ...(extra.endedOn ? { endedOn: extra.endedOn } : {}),
      },
      { strict: true },
    ),
  );
const requests = async (id: string) =>
  (await app.db.select().from(driveRequest).where(eq(driveRequest.entityId, id))).map(
    (r) => r.event,
  );

describe("přechody stavů (KLI-02, R-17, KLI-11)", () => {
  it("Lead → Aktivní: „klient od“ dnes jen poprvé, události a požadavky Disku", async () => {
    const c = await mk();
    const lead = await setStatus(f.owner, c.id, "lead");
    expect(lead).toEqual({ changed: true, clientSince: null });
    expect(seen.map((s) => s.name)).toEqual(["client.status_changed"]);
    expect(seen[0]!.data).toMatchObject({
      from: null,
      to: "lead",
      client: { id: c.id, since: null },
    });
    expect(await requests(c.id)).toEqual(["drive.client.create"]);

    const act = await setStatus(f.owner, c.id, "active");
    expect(act.changed).toBe(true);
    const since = (await row(c.id)).clientSince;
    expect(since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(act.clientSince).toBe(since);

    // pozastavit a znovu aktivovat: „klient od“ zůstane
    await setStatus(f.owner, c.id, "paused");
    await app.db.update(company).set({ clientSince: "2020-02-02" }).where(eq(company.id, c.id));
    const again = await setStatus(f.owner, c.id, "active");
    expect(again.clientSince).toBe("2020-02-02");
    expect((await row(c.id)).clientSince).toBe("2020-02-02");
  });

  it("stejný stav = beze změny a bez události", async () => {
    const c = await mk({ clientStatus: "active", clientSince: "2024-01-01" });
    const out = await setStatus(f.owner, c.id, "active");
    expect(out).toEqual({ changed: false, clientSince: "2024-01-01" });
    expect(seen).toEqual([]);
  });

  it("Bývalý: důvod je povinný, datum výchozí dnes, složka do Archivu; návrat vrací složku a maže datum", async () => {
    const c = await mk({ clientStatus: "active", clientSince: "2024-01-01" });
    await expect(setStatus(f.owner, c.id, "former")).rejects.toBeInstanceOf(UserError);
    expect((await row(c.id)).clientStatus).toBe("active");

    // složka existuje (Disk ji znal): simulace hotového požadavku → složka v databázi
    await setStatus(f.owner, c.id, "paused");
    await setStatus(f.owner, c.id, "former", {
      reason: "Přešli ke konkurenci",
      endedOn: "2026-09-30",
    });
    const r = await row(c.id);
    expect(r).toMatchObject({
      clientStatus: "former",
      clientUntil: "2026-09-30",
      clientEndReason: "Přešli ke konkurenci",
    });
    const ev = seen.filter((s) => s.name === "client.status_changed").at(-1)!;
    expect(ev.data).toMatchObject({
      from: "paused",
      to: "former",
      reason: "Přešli ke konkurenci",
      endedOn: "2026-09-30",
    });

    await setStatus(f.owner, c.id, "active", { source: "deal_won" });
    expect(await row(c.id)).toMatchObject({
      clientStatus: "active",
      clientUntil: null,
      clientSince: "2024-01-01",
    });
  });

  it("Disk: Archiv a obnova složky podle událostí (složka existuje, hotová)", async () => {
    const c = await mk({ clientStatus: "active", clientSince: "2024-01-01" });
    await app.db
      .insert(driveFolder)
      .values({ entityType: "company", entityId: c.id, subkey: "", folderId: `f-${rid()}` });
    await setStatus(f.owner, c.id, "former", { reason: "Konec" });
    expect(await requests(c.id)).toContain("drive.client.archive");
    await setStatus(f.owner, c.id, "active", { source: "deal_won" });
    expect(await requests(c.id)).toContain("drive.client.restore");
  });

  it("zakázka: Bývalý bez důvodu projde s výchozím textem (job_ended)", async () => {
    const c = await mk({ clientStatus: "active", clientSince: "2024-01-01" });
    await setStatus(f.owner, c.id, "former", { source: "job_ended", endedOn: "2026-10-01" });
    expect(await row(c.id)).toMatchObject({ clientStatus: "former", clientUntil: "2026-10-01" });
    expect((await row(c.id)).clientEndReason).toBeTruthy();
  });

  it("úprava Stavu přímo na organizaci (inline) spouští stejná pravidla a události", async () => {
    const c = await mk();
    const { updateRecord, resolveEntity } = await import("@rebar/core/entities");
    await tx(f.owner, async (ctx) =>
      updateRecord(
        ctx,
        f.deps.registry,
        await resolveEntity(ctx.db, f.deps.registry.get("company")!),
        c.id,
        { clientStatus: "active" },
      ),
    );
    expect((await row(c.id)).clientSince).toMatch(/^\d{4}-/);
    expect(seen.map((s) => s.name)).toEqual(["client.status_changed"]);
  });

  it("přejmenování a nová služba klienta vyšlou události; organizace bez stavu nic", async () => {
    const c = await mk({ clientStatus: "active", clientSince: "2024-01-01", services: ["web"] });
    await tx(f.owner, (ctx) => setServices(ctx, f.deps, c.id, ["web", "marketing"]));
    expect(seen.map((s) => [s.name, s.data.service])).toEqual([
      ["client.service_added", "marketing"],
    ]);
    expect(await requests(c.id)).toEqual([]); // složka klienta ještě není hotová → dovytvoří ji reconcile

    seen = [];
    const { updateRecord, resolveEntity } = await import("@rebar/core/entities");
    const rename = async (id: string, name: string) =>
      tx(f.owner, async (ctx) =>
        updateRecord(
          ctx,
          f.deps.registry,
          await resolveEntity(ctx.db, f.deps.registry.get("company")!),
          id,
          { name },
        ),
      );
    await rename(c.id, `${c.name} s.r.o.`);
    expect(seen.map((s) => s.name)).toEqual(["client.renamed"]);
    expect(seen[0]!.data).toMatchObject({ clientId: c.id, from: c.name, to: `${c.name} s.r.o.` });

    seen = [];
    const plain = await mk();
    await rename(plain.id, "Jen firma");
    expect(seen).toEqual([]);
  });
});

describe("služba clients pro Obchody a Zakázky", () => {
  it("výhra: Lead → Aktivní a služby z obchodu; bývalý klient se vrací (R-16)", async () => {
    const svc = f.deps.services.get("clients");
    const c = await mk({
      clientStatus: "former",
      clientSince: "2022-02-02",
      clientUntil: "2025-01-01",
      clientEndReason: "Konec",
    });
    const out = await tx(f.owner, async (ctx) => {
      const r = await svc.setStatus(ctx, { companyId: c.id, status: "active", source: "deal_won" });
      await svc.addServices(ctx, c.id, ["web", "marketing"]);
      await svc.addServices(ctx, c.id, ["web"]); // bez změny
      return r;
    });
    expect(out).toEqual({ changed: true, clientSince: "2022-02-02" });
    expect(await row(c.id)).toMatchObject({
      clientStatus: "active",
      clientUntil: null,
      services: ["web", "marketing"],
    });
    expect(seen.filter((s) => s.name === "client.service_added")).toHaveLength(2);
  });

  it("neviditelná (soukromá) organizace: služba nic nezmění a nespadne", async () => {
    const svc = f.deps.services.get("clients");
    const c = await mk({ isPrivate: true, clientStatus: "lead" });
    const out = await tx(f.partner, async (ctx) => {
      const r = await svc.setStatus(ctx, { companyId: c.id, status: "active", source: "deal_won" });
      await svc.addServices(ctx, c.id, ["web"]);
      return r;
    });
    expect(out).toEqual({ changed: false, clientSince: null });
    expect(await row(c.id)).toMatchObject({ clientStatus: "lead", services: [] });
  });
});

describe("seznam klientů (KLI-03)", () => {
  it("výchozí bez bývalých, sloupce z modulů, příjem jen s právem na finance", async () => {
    const act = await mk({ clientStatus: "active", clientSince: "2024-01-01", services: ["web"] });
    const former = await mk({ clientStatus: "former" });
    const notClient = await mk();
    const [j] = await app.db
      .insert(job)
      .values({
        number: `Z-2026-${rid()}`,
        title: "Web",
        companyId: act.id,
        type: "web",
        status: "active",
        startDate: "2026-10-01",
      })
      .returning();
    await app.db.insert(payment).values({
      jobId: j!.id,
      companyId: act.id,
      description: "Platba",
      amountMinor: 1_000_000,
      status: "paid",
      paidOn: new Date().toISOString().slice(0, 10),
      isPrivate: false,
    } as never);
    const res = await tx(f.owner, (ctx) => listClients(ctx, f.deps, { includeFormer: false }));
    const mine = res.rows.find((r) => r.id === act.id)!;
    expect(mine).toMatchObject({
      status: "active",
      activeJobs: 1,
      income12mMinor: 1_000_000,
      clientSince: "2024-01-01",
      driveState: "none",
    });
    expect(res.rows.some((r) => r.id === former.id)).toBe(false);
    expect(res.rows.some((r) => r.id === notClient.id)).toBe(false);
    const all = await tx(f.owner, (ctx) => listClients(ctx, f.deps, { includeFormer: true }));
    expect(all.rows.some((r) => r.id === former.id)).toBe(true);

    const ro = await tx(f.readOnly, (ctx) => listClients(ctx, f.deps, { includeFormer: false }));
    expect(ro.canSeeIncome).toBe(false);
    expect(ro.rows.find((r) => r.id === act.id)!.income12mMinor).toBeNull();
  });
});

describe("karta: souhrn a záložky (KLI-05, KLI-07, KLI-10, ORG-08)", () => {
  it("počty záložek a záložky bez dat se skryjí", async () => {
    const c = await mk({ clientStatus: "active", clientSince: "2024-01-01" });
    const empty = await tx(f.owner, (ctx) => clientTabs(ctx, f.deps, c.id));
    expect(empty.hidden).toEqual(
      expect.arrayContaining(["kontakty", "zakazky", "obchody", "finance"]),
    );
    expect(empty.hidden).not.toContain("kontext");
    await app.db.insert(job).values({
      number: `Z-2026-${rid()}`,
      title: "Web",
      companyId: c.id,
      type: "web",
      startDate: "2026-10-01",
    });
    const withJob = await tx(f.owner, (ctx) => clientTabs(ctx, f.deps, c.id));
    expect(withJob.counts.zakazky).toBe(1);
    expect(withJob.hidden).not.toContain("zakazky");
    expect(withJob.hidden).toContain("obchody"); // žádný poskytovatel obchodů v téhle sestavě
  });

  it("finanční souhrn: Patrik jen sdílené zakázky, Ondřej všechny (canary)", async () => {
    const c = await mk({ clientStatus: "active", clientSince: "2024-01-01" });
    const today = new Date().toISOString().slice(0, 10);
    const [shared] = await app.db
      .insert(job)
      .values({
        number: `Z-2026-${rid()}`,
        title: "Sdílená",
        companyId: c.id,
        type: "web",
        startDate: "2026-10-01",
      })
      .returning();
    const [priv] = await app.db
      .insert(job)
      .values({
        number: `Z-2026-${rid()}`,
        title: CANARY,
        companyId: c.id,
        type: "web",
        startDate: "2026-10-01",
        isPrivate: true,
      })
      .returning();
    const pay = (jobId: string, amountMinor: number, isPrivate: boolean) =>
      app.db.insert(payment).values({
        jobId,
        companyId: c.id,
        description: "P",
        amountMinor,
        status: "paid",
        paidOn: today,
        isPrivate,
      } as never);
    await pay(shared!.id, 10_000_00, false);
    await pay(priv!.id, 99_999_00, true);
    const p = await tx(f.partner, (ctx) => clientSummary(ctx, f.deps, c.id));
    expect(p.summary.finance.incomeTotalMinor).toBe(10_000_00);
    expect(p.summary.finance.income12mMinor).toBe(10_000_00);
    expect(p.summary.jobs.total).toBe(1);
    expect(p.financeSharedOnly).toBe(true);
    expect(JSON.stringify(p)).not.toContain(CANARY);
    const o = await tx(f.owner, (ctx) => clientSummary(ctx, f.deps, c.id));
    expect(o.summary.finance.incomeTotalMinor).toBe(109_999_00);
    expect(o.summary.jobs.total).toBe(2);
    expect(o.financeSharedOnly).toBe(false);
    // bez práva na finance finanční souhrn není
    const ro = await tx(f.readOnly, (ctx) => clientSummary(ctx, f.deps, c.id));
    expect(ro.canSeeFinance).toBe(false);
    expect(ro.summary.finance.incomeTotalMinor).toBe(0);
  });

  it("kontext se ukládá po polích, zapisuje do historie a nepřepisuje ostatní pole", async () => {
    const c = await mk({ clientStatus: "active", clientSince: "2024-01-01" });
    await tx(f.owner, (ctx) =>
      saveContext(ctx, { companyId: c.id, decisionMaker: "Jana Nováková" }),
    );
    await tx(f.partner, (ctx) =>
      saveContext(ctx, { companyId: c.id, howToCommunicate: "Raději telefon" }),
    );
    const s = await tx(f.owner, (ctx) => clientSummary(ctx, f.deps, c.id));
    expect(s.context).toMatchObject({
      decisionMaker: "Jana Nováková",
      howToCommunicate: "Raději telefon",
      history: "",
      notes: "",
    });
    await tx(f.owner, (ctx) => saveContext(ctx, { companyId: c.id, decisionMaker: "" }));
    expect((await row(c.id)).clientContext).toEqual({ howToCommunicate: "Raději telefon" });
    const log = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, c.id));
    expect(log.filter((l) => l.summary === "Kontext klienta")).toHaveLength(3);
    // bez práva zápisu nejde
    await expect(
      tx(f.readOnly, (ctx) => saveContext(ctx, { companyId: c.id, notes: "x" })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("soukromí: Patrik soukromého klienta nevidí nikde", () => {
  it("seznam, souhrn, záložky, kontext a změna stavu", async () => {
    const c = await mk({
      name: `${CANARY} ${rid()}`,
      clientStatus: "active",
      clientSince: "2024-01-01",
      isPrivate: true,
      services: ["web"],
    });
    const visible = await tx(f.partner, (ctx) => listClients(ctx, f.deps, { includeFormer: true }));
    expect(JSON.stringify(visible)).not.toContain(CANARY);
    expect(visible.rows.some((r) => r.id === c.id)).toBe(false);
    await expect(tx(f.partner, (ctx) => clientSummary(ctx, f.deps, c.id))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(tx(f.partner, (ctx) => clientTabs(ctx, f.deps, c.id))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      tx(f.partner, (ctx) => saveContext(ctx, { companyId: c.id, notes: "x" })),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      tx(f.partner, (ctx) => setServices(ctx, f.deps, c.id, ["web", "systemy"])),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(setStatus(f.partner, c.id, "paused")).rejects.toBeInstanceOf(UserError);
    // vlastník ho vidí a událost nese příznak soukromí
    const mine = await tx(f.owner, (ctx) => listClients(ctx, f.deps, { includeFormer: true }));
    expect(mine.rows.find((r) => r.id === c.id)?.isPrivate).toBe(true);
    await setStatus(f.owner, c.id, "paused");
    expect(seen.at(-1)).toMatchObject({ name: "client.status_changed", isPrivate: true });
    expect(await requests(c.id)).toEqual([]); // soukromý klient složku sám nezakládá (R-13)
  });

  it("ruční čtecí cesty modulu nenesou canary pro Patrika", async () => {
    await mk({ name: `${CANARY} ${rid()}`, clientStatus: "lead", isPrivate: true });
    for (const p of klientiSrv.privatePaths ?? []) {
      const out = await tx(f.partner, (ctx) => p.run(ctx, f.deps));
      expect(JSON.stringify(out)).not.toContain(CANARY);
    }
  });
});
