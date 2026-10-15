import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { schema } from "@rebar/core/db";
import { emitDomain, setDomainEvents, type DomainEventHandlers } from "@rebar/core/events";
import { NotFoundError, systemCtx, type Ctx } from "@rebar/core/rbac";
import type { DomainEventMap } from "@rebar/core/contracts";
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
import { companyEntity } from "@rebar/kontakty/server";
import { jobEntity } from "@rebar/zakazky/server";
import { company } from "@rebar/kontakty/schema";
import { job } from "@rebar/zakazky/schema";
import {
  driveFolder,
  driveRequest,
  handleDriveCallback,
  maintainRequests,
  requestFolder,
  retryFolder,
  folderInfo,
  server,
} from "@rebar/disk/server";
import { driveCallbackSchema } from "../packages/modules/disk/src/contract";
import { structureGetCommand, structureSetCommand } from "../packages/modules/disk/src/commands";
import { driveButtonModel } from "../packages/modules/disk/src/state";
import { defaultStructure, addNode } from "../packages/modules/disk/src/tree";

/*
  Modul „disk“ nad skutečnou databází s falešným n8n: události → požadavek → odeslaná událost `drive.*` → callback
  (AS-09, DRV-01…08, R-13, R-14). Odeslání: `emitDomain` s obsluhou, která události zachytí (stejné rozhraní jako
  outbox C2); callback: `handleDriveCallback`, tedy tělo `defineIngest("drive")`.
*/
const app = connectAppDb();
afterAll(() => app.close());

type Sent = {
  name: string;
  id: string;
  data: DomainEventMap["drive.client.create"];
  isPrivate: boolean;
};
let f: Awaited<ReturnType<typeof setup>>;
let sent: Sent[] = [];
let n = 0;
const sys = () => systemCtx(app.db);
const rid = () => randomBytes(8).toString("hex").slice(0, 10) + "AbC";

async function setup() {
  clearEntityPolicies();
  const registry = createEntityRegistry(applyEntityExtensions([companyEntity, jobEntity]));
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
    { services: server.services ?? {}, contributions: server.contributions ?? {} },
  );
  const common: [string, "all"][] = [
    ["kontakty.read", "all"],
    ["zakazky.read", "all"],
    ["disk.read", "all"],
    ["disk.write", "all"],
  ];
  const owner = await makeUser(app.db, [
    ...common,
    ["disk.manage", "all"],
    ["settings.manage", "all"],
    ["private.read", "all"],
  ]);
  const partner = await makeUser(app.db, common);
  return {
    deps,
    people: { owner, partner },
    collected: { eventHandlers: server.eventHandlers as DomainEventHandlers },
  };
}

beforeAll(async () => {
  f = await setup();
  const handlers: Record<string, unknown> = Object.fromEntries(
    Object.entries(f.collected.eventHandlers).map(([k, v]) => [k, [v].flat()]),
  );
  for (const name of [
    "drive.client.create",
    "drive.client.add_service",
    "drive.client.rename",
    "drive.client.archive",
    "drive.client.restore",
    "drive.project.create",
  ] as const)
    handlers[name] = [
      async (_c: Ctx, e: never) => {
        const ev = e as unknown as {
          id: string;
          data: Sent["data"];
          entity: { isPrivate: boolean };
        };
        sent.push({ name, id: ev.id, data: ev.data, isPrivate: ev.entity.isPrivate });
      },
      ...[f.collected.eventHandlers[name] ?? []].flat(),
    ];
  setDomainEvents(handlers as DomainEventHandlers, () => f.deps);
});
afterAll(() => setDomainEvents(undefined, undefined));
beforeEach(() => {
  sent = [];
});

async function mkClient(over: Partial<typeof company.$inferInsert> = {}) {
  n += 1;
  const [c] = await app.db
    .insert(company)
    .values({ name: `Klient ${n} ${rid()}`, ...over })
    .returning();
  return c!;
}
async function mkJob(companyId: string, over: Partial<typeof job.$inferInsert> = {}) {
  n += 1;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `Z-2026-${rid()}`,
      title: `Zakázka ${n}`,
      companyId,
      type: "web",
      startDate: "2026-10-14",
      ...over,
    })
    .returning();
  return j!;
}
const snap = (c: typeof company.$inferSelect, status: "lead" | "active" | "paused" | "former") => ({
  id: c.id,
  name: c.name,
  ico: c.ico,
  status,
  since: null,
});
const tx = <T>(fn: (ctx: Ctx) => Promise<T>) =>
  app.db.transaction((t) => fn({ ...f.people.owner.ctx, db: t }));
const status = (
  c: typeof company.$inferSelect,
  to: "lead" | "active" | "paused" | "former" | null,
  from = null as never,
  isPrivate = false,
) =>
  tx((ctx) =>
    emitDomain(
      ctx,
      "client.status_changed",
      { client: snap(c, to ?? "paused"), from, to },
      { entity: { type: "company", id: c.id, isPrivate } },
    ),
  );
const created = (j: typeof job.$inferSelect, isPrivate = false) =>
  tx((ctx) =>
    emitDomain(
      ctx,
      "project.created",
      {
        project: {
          id: j.id,
          number: j.number,
          title: j.title,
          type: j.type,
          companyId: j.companyId,
          ownerId: null,
          startDate: j.startDate,
          dueDate: null,
        } as never,
      },
      { entity: { type: "job", id: j.id, isPrivate } },
    ),
  );
const reply = (ev: Sent, status: "ok" | "error", folders?: object, error?: string) =>
  handleDriveCallback(
    sys(),
    driveCallbackSchema.parse({ eventId: ev.data.requestId, status, folders, error }),
    f.deps,
  );
const row = async (id: string) =>
  (await app.db.select().from(company).where(eq(company.id, id)))[0]!;
const info = (id: string, type: "company" | "job" = "company") =>
  folderInfo(f.people.owner.ctx, f.deps, type, id);

describe("AS-09: tlačítko a události klienta", () => {
  it("Lead → složka: Vytváří se… → po callbacku Otevřít Disk, ID složky na klientovi", async () => {
    const c = await mkClient({ services: ["web"] });
    expect((await info(c.id)).state).toBe("none");
    await status(c, "lead");
    expect(sent.map((s) => s.name)).toEqual(["drive.client.create"]);
    const ev = sent[0]!;
    expect(ev.data.client).toMatchObject({ id: c.id, name: c.name, folderId: null });
    expect(ev.data.callbackUrl).toBe("http://localhost:3100/api/ingest/drive");
    const s = ev.data.structure as {
      clientFolder: { children: { name: string }[] };
      clientsRoot: string;
    };
    expect(s.clientsRoot).toBe("Klienti");
    // jen složky služeb, které klient má
    expect(s.clientFolder.children.map((x) => x.name)).toEqual(["00 Klient", "10 Web"]);
    expect(driveButtonModel(await info(c.id), true).label).toBe("Vytváří se…");
    expect((await row(c.id)).driveStatus).toBe("pending");

    const root = rid();
    await reply(ev, "ok", { root, services: { web: rid() } });
    const i = await info(c.id);
    expect(i).toMatchObject({ state: "ready", folderId: root });
    expect(driveButtonModel(i, true)).toMatchObject({
      label: "Otevřít Disk",
      href: `https://drive.google.com/drive/folders/${root}`,
    });
    expect(await row(c.id)).toMatchObject({ driveStatus: "ready", driveFolderId: root });
    // stejný callback podruhé nic nerozbije
    await reply(ev, "ok", { root });
    expect((await info(c.id)).state).toBe("ready");
  });

  it("10 minut bez odpovědi → Zkusit znovu; nový pokus; pozdní odpověď prvního se přijme", async () => {
    const c = await mkClient();
    await status(c, "active");
    const first = sent[0]!;
    const out = await maintainRequests(sys(), f.deps, new Date(Date.now() + 11 * 60_000));
    expect(out.failed + out.timedOut).toBeGreaterThan(0);
    const i = await info(c.id);
    expect(["error", "timeout"]).toContain(i.state);
    expect(driveButtonModel(i, true).label).toBe("Zkusit znovu");
    const r = await retryFolder(f.people.owner.ctx, f.deps, { entityType: "company", id: c.id });
    expect(r.requestId).toBeTruthy();
    expect(sent).toHaveLength(2);
    expect(
      (await app.db.select().from(driveRequest).where(eq(driveRequest.id, r.requestId!)))[0]!
        .attempts,
    ).toBe(2);
    expect((await info(c.id)).state).toBe("pending");
    await reply(first, "ok", { root: rid() }); // pozdní odpověď staršího požadavku
    expect((await info(c.id)).state).toBe("ready");
  });

  it("chyba z n8n → Zkusit znovu s textem chyby", async () => {
    const c = await mkClient();
    await status(c, "lead");
    await reply(sent[0]!, "error", undefined, "Chybí oprávnění ke sdílenému disku");
    const i = await info(c.id);
    expect(i.state).toBe("error");
    expect(i.issue?.message).toContain("sdílenému disku");
    expect((await row(c.id)).driveStatus).toBe("error");
  });

  it("klient bez složky: Vytvořit složku; po kliknutí složka vznikne", async () => {
    const c = await mkClient();
    const i = await info(c.id);
    expect(driveButtonModel(i, true).label).toBe("Vytvořit složku");
    const r = await requestFolder(f.people.owner.ctx, f.deps, { entityType: "company", id: c.id });
    expect(r.requestId).toBeTruthy();
    expect(sent[0]!.name).toBe("drive.client.create");
    // druhý klik nezaloží druhou složku
    expect(
      (await requestFolder(f.people.owner.ctx, f.deps, { entityType: "company", id: c.id }))
        .requestId,
    ).toBeNull();
  });

  it("přejmenování přejmenuje složku (podle ID); bez složky nic", async () => {
    const c = await mkClient();
    const rename = () =>
      tx((ctx) =>
        emitDomain(
          ctx,
          "client.renamed",
          { clientId: c.id, from: "A", to: "B" },
          { entity: { type: "company", id: c.id, isPrivate: false } },
        ),
      );
    await rename();
    expect(sent).toHaveLength(0);
    await status(c, "lead");
    await reply(sent[0]!, "ok", { root: "ROOT1" + rid() });
    sent = [];
    await app.db.update(company).set({ name: "Nový název s.r.o." }).where(eq(company.id, c.id));
    await rename();
    expect(sent[0]!.name).toBe("drive.client.rename");
    expect(sent[0]!.data.client.name).toBe("Nový název s.r.o.");
    expect(sent[0]!.data.client.folderId).toBeTruthy();
  });

  it("Bývalý → Archiv, návrat → zpět; ID složky se nemění", async () => {
    const c = await mkClient();
    await status(c, "active");
    const root = rid();
    await reply(sent[0]!, "ok", { root });
    sent = [];
    await status(c, "former");
    expect(sent.map((s) => s.name)).toEqual(["drive.client.archive"]);
    expect((sent[0]!.data.structure as { archiveRoot: string }).archiveRoot).toBe("Archiv");
    await reply(sent[0]!, "ok", { archive: root });
    expect(await info(c.id)).toMatchObject({ archived: true, state: "ready", folderId: root });
    sent = [];
    await status(c, "active");
    expect(sent.map((s) => s.name)).toEqual(["drive.client.restore"]);
    await reply(sent[0]!, "ok");
    expect(await info(c.id)).toMatchObject({ archived: false, folderId: root });
  });

  it("nová služba dovytvoří složku služby, jen chybějící", async () => {
    const c = await mkClient({ services: ["web"] });
    await status(c, "active");
    await reply(sent[0]!, "ok", { root: rid(), services: { web: rid() } });
    sent = [];
    await app.db
      .update(company)
      .set({ services: ["web", "marketing"] })
      .where(eq(company.id, c.id));
    await tx((ctx) =>
      emitDomain(
        ctx,
        "client.service_added",
        { clientId: c.id, service: "marketing" },
        { entity: { type: "company", id: c.id, isPrivate: false } },
      ),
    );
    expect(sent[0]!.name).toBe("drive.client.add_service");
    const services = (sent[0]!.data.structure as { services: { service: string; name: string }[] })
      .services;
    expect(services.map((s) => `${s.service}:${s.name}`)).toEqual(["marketing:20 Marketing"]);
    const m = rid();
    await reply(sent[0]!, "ok", { services: { marketing: m } });
    const folders = await app.db.select().from(driveFolder).where(eq(driveFolder.entityId, c.id));
    expect(folders.find((x) => x.subkey === "marketing")?.folderId).toBe(m);
  });

  it("služba přibyla, zatímco se složka zakládá → po callbacku se doplní", async () => {
    const c = await mkClient({ services: ["web"] });
    await status(c, "active");
    await app.db
      .update(company)
      .set({ services: ["web", "systemy"] })
      .where(eq(company.id, c.id));
    await tx((ctx) =>
      emitDomain(
        ctx,
        "client.service_added",
        { clientId: c.id, service: "systemy" },
        { entity: { type: "company", id: c.id, isPrivate: false } },
      ),
    );
    expect(sent).toHaveLength(1); // jen create
    await reply(sent[0]!, "ok", { root: rid(), services: { web: rid() } });
    expect(sent.map((s) => s.name)).toEqual(["drive.client.create", "drive.client.add_service"]);
  });

  it("smazání záznamu v OPSYS nic na Disku nemění a pozdní odpověď nespadne (DRV-07)", async () => {
    const c = await mkClient();
    await status(c, "lead");
    await app.db.update(company).set({ deletedAt: new Date() }).where(eq(company.id, c.id));
    expect(sent).toHaveLength(1);
    await expect(reply(sent[0]!, "ok", { root: rid() })).resolves.toBeDefined();
    expect(
      await app.db.select().from(driveFolder).where(eq(driveFolder.entityId, c.id)),
    ).toHaveLength(1);
  });
});

describe("zakázky a fronta po klientovi", () => {
  it("zakázka klienta se složkou: složka zakázky `{RRRR-MM} {Název}` s podsložkami podle typu", async () => {
    const c = await mkClient({ services: ["web"] });
    await status(c, "active");
    await reply(sent[0]!, "ok", { root: rid(), services: { web: "WEBSVC" + rid() } });
    sent = [];
    const j = await mkJob(c.id, { title: "Nový web" });
    await created(j);
    expect(sent.map((s) => s.name)).toEqual(["drive.project.create"]);
    const s = sent[0]!.data.structure as {
      jobFolder: { name: string; children: { name: string }[] };
      serviceFolder: { name: string; folderId: string | null };
    };
    expect(s.jobFolder.name).toBe("2026-10 Nový web");
    expect(s.jobFolder.children.map((x) => x.name)).toEqual([
      "01 Podklady",
      "02 Návrh",
      "03 Texty a obsah",
      "04 Fotky a média",
      "05 Předání",
    ]);
    expect(s.serviceFolder).toMatchObject({ name: "10 Web" });
    expect(sent[0]!.data.project).toMatchObject({ id: j.id, code: j.number, type: "web" });
    expect((await info(j.id, "job")).state).toBe("pending");
    const pf = rid();
    await reply(sent[0]!, "ok", { project: pf });
    expect(await info(j.id, "job")).toMatchObject({ state: "ready", folderId: pf });
    expect((await app.db.select().from(job).where(eq(job.id, j.id)))[0]!.driveFolderId).toBe(pf);
  });

  it("výhra: složka klienta i zakázek najednou; zakázky čekají a odejdou po sobě už se známými ID", async () => {
    const c = await mkClient({ services: ["web", "marketing"], clientStatus: "active" });
    const j1 = await mkJob(c.id, { title: "Web" });
    const j2 = await mkJob(c.id, { title: "Reklama", type: "marketing" });
    await status(c, "active");
    await created(j1);
    await created(j2);
    expect(sent.map((s) => s.name)).toEqual(["drive.client.create"]); // ostatní čekají
    const root = rid();
    await reply(sent[0]!, "ok", { root, services: { web: rid(), marketing: rid() } });
    expect(sent.map((s) => s.name)).toEqual(["drive.client.create", "drive.project.create"]);
    expect(sent[1]!.data.client.folderId).toBe(root);
    await reply(sent[1]!, "ok", { project: rid() });
    expect(sent).toHaveLength(3);
    expect(sent[2]!.data.project?.type).toBe("marketing");
    await reply(sent[2]!, "ok", { project: rid() });
    expect((await info(j2.id, "job")).state).toBe("ready");
  });

  it("zakázka klienta bez složky nejdřív založí složku klienta", async () => {
    const c = await mkClient();
    const j = await mkJob(c.id);
    await created(j);
    expect(sent.map((s) => s.name)).toEqual(["drive.client.create"]);
    await reply(sent[0]!, "ok", { root: rid() });
    expect(sent.map((s) => s.name)).toEqual(["drive.client.create", "drive.project.create"]);
  });

  it("chyba čekajícího požadavku se projeví chybou, ne zablokovanou frontou", async () => {
    const c = await mkClient();
    const j = await mkJob(c.id);
    await created(j);
    await reply(sent[0]!, "error", undefined, "n8n padlo");
    expect(sent.map((s) => s.name)).toEqual(["drive.client.create", "drive.project.create"]);
  });
});

describe("soukromí (R-13) a firmy bez stavu klienta (R-14)", () => {
  it("soukromý klient: složka se sama nezakládá, ruční založení vyžaduje potvrzení varování", async () => {
    const c = await mkClient({ isPrivate: true });
    await status(c, "active", null as never, true);
    expect(sent).toHaveLength(0);
    const i = await info(c.id);
    expect(driveButtonModel(i, true)).toMatchObject({ kind: "create", needsPrivateWarning: true });
    expect(
      await requestFolder(f.people.owner.ctx, f.deps, { entityType: "company", id: c.id }),
    ).toEqual({ requestId: null, skipped: "private" });
    expect(sent).toHaveLength(0);
    const r = await requestFolder(f.people.owner.ctx, f.deps, {
      entityType: "company",
      id: c.id,
      force: true,
    });
    expect(r.requestId).toBeTruthy();
    expect(sent[0]).toMatchObject({ name: "drive.client.create", isPrivate: true });
  });

  it("soukromá zakázka složku sama nezakládá; zakázka soukromého klienta také ne", async () => {
    const pub = await mkClient({ clientStatus: "active" });
    const j = await mkJob(pub.id, { isPrivate: true });
    await created(j, true);
    const priv = await mkClient({ isPrivate: true });
    await created(await mkJob(priv.id));
    expect(sent).toHaveLength(0);
  });

  it("Patrik soukromé záznamy nevidí: stav složky je pro něj NotFound a ve službě chybí", async () => {
    const c = await mkClient({ isPrivate: true });
    await expect(folderInfo(f.people.partner.ctx, f.deps, "company", c.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      requestFolder(f.people.partner.ctx, f.deps, { entityType: "company", id: c.id, force: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const open = await mkClient();
    const service = f.deps.services.optional("disk") ?? server.services!.disk!(f.deps);
    const out = await service.folderState(f.people.partner.ctx, "company", [c.id, open.id]);
    expect(Object.keys(out)).toEqual([open.id]);
    expect(Object.keys(await service.folderState(f.people.owner.ctx, "company", [c.id]))).toEqual([
      c.id,
    ]);
  });

  it("firma bez stavu klienta (z Meta leadu) složku nedostane; Pozastavený nic", async () => {
    const c = await mkClient();
    await tx((ctx) =>
      emitDomain(
        ctx,
        "client.service_added",
        { clientId: c.id, service: "web" },
        { entity: { type: "company", id: c.id, isPrivate: false } },
      ),
    );
    await status(c, "paused");
    expect(sent).toHaveLength(0);
    await status(c, "lead"); // teprve stav klienta složku založí
    expect(sent).toHaveLength(1);
  });

  it("z privátního se stane sdílený klient se stavem Lead → složka vznikne", async () => {
    const c = await mkClient({ isPrivate: true, clientStatus: "lead" });
    await app.db.update(company).set({ isPrivate: false }).where(eq(company.id, c.id));
    await tx((ctx) =>
      emitDomain(
        ctx,
        "visibility.changed",
        { entityType: "company", id: c.id, isPrivate: false, cascaded: 0 },
        { entity: { type: "company", id: c.id, isPrivate: false } },
      ),
    );
    expect(sent.map((s) => s.name)).toEqual(["drive.client.create"]);
  });
});

describe("doručení do n8n a úloha disk.timeout", () => {
  async function endpoint(over: Partial<typeof schema.webhookEndpoint.$inferInsert> = {}) {
    const [e] = await app.db
      .insert(schema.webhookEndpoint)
      .values({
        name: `n8n ${rid()}`,
        url: "https://n8n.example/hook",
        secretEnc: "x",
        events: ["drive.*"],
        ...over,
      })
      .returning();
    return e!;
  }
  const clean = async () => {
    await app.db.delete(schema.webhookDelivery);
    await app.db.delete(schema.webhookEndpoint);
  };

  it("doručený webhook posune požadavek na odeslaný, bez odpovědi do 10 minut vyprší, selhané doručení je chyba", async () => {
    await clean();
    await endpoint();
    const c = await mkClient();
    await status(c, "lead");
    const [req] = await app.db.select().from(driveRequest).where(eq(driveRequest.entityId, c.id));
    expect(req!.eventId).toBe(sent[0]!.id);
    // outbox jádra vytvořil doručení pro endpoint, který odebírá drive.*
    const delivery = (
      await app.db
        .select()
        .from(schema.webhookDelivery)
        .where(eq(schema.webhookDelivery.eventId, sent[0]!.id))
    )[0]!;
    await app.db
      .update(schema.webhookDelivery)
      .set({ status: "delivered" })
      .where(eq(schema.webhookDelivery.id, delivery.id));
    await maintainRequests(sys(), f.deps);
    const state = async (id: string) =>
      (await app.db.select().from(driveRequest).where(eq(driveRequest.id, id)))[0]!.state;
    expect(await state(req!.id)).toBe("sent");
    expect((await info(c.id)).state).toBe("pending");
    await maintainRequests(sys(), f.deps, new Date(Date.now() + 11 * 60_000));
    expect(await state(req!.id)).toBe("timeout");
    expect((await info(c.id)).state).toBe("timeout");

    const c2 = await mkClient();
    await status(c2, "lead");
    await app.db
      .update(schema.webhookDelivery)
      .set({ status: "failed", lastError: "HTTP 500" })
      .where(eq(schema.webhookDelivery.eventId, sent[1]!.id));
    await maintainRequests(sys(), f.deps);
    const i = await info(c2.id);
    expect(i.state).toBe("error");
    expect(i.issue?.message).toContain("HTTP 500");
    await clean();
  });

  it("bez webhooku skončí požadavek chybou s návodem, u soukromého i bez „Doručovat i soukromé“", async () => {
    await clean();
    const c = await mkClient();
    await status(c, "lead");
    await maintainRequests(sys(), f.deps, new Date(Date.now() + 2 * 60_000));
    expect((await info(c.id)).issue?.message).toContain("Nastavení → Integrace");

    await endpoint(); // veřejný endpoint
    const p = await mkClient({ isPrivate: true });
    await requestFolder(f.people.owner.ctx, f.deps, {
      entityType: "company",
      id: p.id,
      force: true,
    });
    await maintainRequests(sys(), f.deps, new Date(Date.now() + 2 * 60_000));
    expect((await info(p.id)).issue?.message).toContain("Doručovat i soukromé");
    await clean();
  });
});

describe("callback z n8n (ingest drive)", () => {
  it("neznámý eventId i neplatné ID složky; chyba nepřepíše hotovou složku", async () => {
    await expect(
      handleDriveCallback(
        sys(),
        driveCallbackSchema.parse({ eventId: crypto.randomUUID(), status: "ok" }),
        f.deps,
      ),
    ).rejects.toThrow(/Neznámý/);
    const c = await mkClient();
    await status(c, "lead");
    await reply(sent[0]!, "ok", { root: "špatné id!" });
    expect((await info(c.id)).state).toBe("error");
    await reply(sent[0]!, "ok", { root: rid() });
    expect((await info(c.id)).state).toBe("ready");
    await reply(sent[0]!, "error", undefined, "pozdní chyba");
    expect((await info(c.id)).state).toBe("ready");
  });

  it("callback bez ID složky klienta je chyba; ingest je zaregistrovaný a idempotentní podle eventId a stavu", async () => {
    const c = await mkClient();
    await status(c, "lead");
    await reply(sent[0]!, "ok", {});
    expect((await info(c.id)).state).toBe("error");
    const ingest = server.ingests![0]!;
    expect(ingest.source).toBe("drive");
    const a = driveCallbackSchema.parse({ eventId: "x", status: "ok" });
    expect(ingest.externalId(a)).toBe("x:ok");
    expect(ingest.externalId({ ...a, status: "error" })).toBe("x:error");
  });

  it("obálka webhooku (id události) je přijata místo requestId", async () => {
    const c = await mkClient();
    await status(c, "lead");
    await handleDriveCallback(
      sys(),
      driveCallbackSchema.parse({ eventId: sent[0]!.id, status: "ok", folders: { root: rid() } }),
      f.deps,
    );
    expect((await info(c.id)).state).toBe("ready");
  });
});

describe("strom složek v Nastavení (DRV-06)", () => {
  it("změna platí jen pro nově zakládané složky; neplatný strom se odmítne", async () => {
    const owner = f.people.owner.ctx;
    const before = await mkClient();
    await status(before, "lead");
    const old = JSON.stringify(sent[0]!.data.structure);
    const s = defaultStructure();
    s.client = addNode(s.client, "client-00", "Faktury", "n-faktury");
    await structureSetCommand.handler(owner, { structure: s }, f.deps);
    const got = await structureGetCommand.handler(owner, {}, f.deps);
    expect(got.isDefault).toBe(false);
    sent = [];
    const after = await mkClient();
    await status(after, "lead");
    expect(JSON.stringify(sent[0]!.data.structure)).toContain("Faktury");
    expect(old).not.toContain("Faktury");
    const bad = defaultStructure();
    bad.client = bad.client.filter((x) => !x.service);
    await expect(structureSetCommand.handler(owner, { structure: bad }, f.deps)).rejects.toThrow();
    await structureSetCommand.handler(owner, { structure: defaultStructure() }, f.deps);
  });
});
