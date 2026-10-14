import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { DiaryPrefillProvider, ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError, systemCtx } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { todayIso } from "@rebar/core/time";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as realizaceManifest } from "@rebar/realizace";
import {
  defect,
  defectEntity,
  defectsOpen,
  diaryDelete,
  diaryList,
  diaryPrefill,
  diaryPrint,
  diarySave,
  diarySign,
  diaryUnsign,
  handoverProtocol,
  investorView,
  phaseHooks,
  siteDiary,
} from "@rebar/realizace/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job, jobCost, jobMember, jobShare } from "@rebar/zakazky/schema";
import { jobEntity, server as zakazkyServer, shareApi } from "@rebar/zakazky/server";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const prefill: DiaryPrefillProvider[] = [];
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost:3100",
    costProviders: [],
    calendarLayers: [],
    diaryPrefill: prefill,
  }) as unknown as ModuleDeps;

const cmd = (name: string) => {
  const c = zakazkyServer.commands!.find((x) => x.name === name);
  if (!c) throw new Error(`Chybí příkaz ${name}`);
  return c;
};
const run = (name: string, ctx: Parameters<typeof diaryList.handler>[0], input: unknown) => {
  const c = cmd(name);
  return c.handler(ctx, c.input.parse(input), deps());
};

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity, defectEntity]);
  registerEntityPolicies(registry);
  for (const m of [zakazkyManifest, realizaceManifest]) {
    for (const p of m.seed.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of "lookups" in m.seed ? m.seed.lookups : []) await ensureLookup(app.db, l);
    await ensureSeries(app.db, m.seed.series ?? []);
  }
});
afterEach(() => vi.unstubAllGlobals());

/** Majitel: vidí ekonomiku a smí rozpočet, náklady i sdílení. */
const boss = () =>
  makeUser(app.db, [
    ["zakazky.read", "all"],
    ["zakazky.write", "all"],
    ["zakazky.economics", "all"],
    ["zakazky.budget", "all"],
    ["zakazky.share", "all"],
    ["realizace.read", "all"],
    ["realizace.write", "all"],
    ["kontakty.read", "all"],
  ]);

/** Montér: jen svoje zakázky a deník, bez ekonomiky. */
const worker = () =>
  makeUser(app.db, [
    ["zakazky.read", "own"],
    ["realizace.read", "own"],
    ["realizace.write", "own"],
  ]);

async function newJob(managerId?: string, extra: Record<string, unknown> = {}) {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `D-${randomBytes(4).toString("hex")}`,
      title: "Rodinný dům",
      companyId: c!.id,
      stageId: stage.id,
      managerId: managerId ?? null,
      ...extra,
    })
    .returning();
  return j!;
}

const mat = (p: Record<string, unknown> = {}) => ({
  id: `row-${randomBytes(4).toString("hex")}`,
  name: "Beton C20/25",
  qty: "2",
  unit: "m3",
  supplier: "Betonárna",
  unitPriceMinor: 250_000,
  ...p,
});

const weatherResponse = (code = 61) =>
  new Response(
    JSON.stringify({
      daily: {
        weather_code: [code],
        temperature_2m_max: [10],
        temperature_2m_min: [4],
        precipitation_sum: [3.2],
        wind_speed_10m_max: [20],
      },
    }),
    { status: 200 },
  );

async function attachFile(jobId: string, kind: string, extra: Record<string, unknown> = {}) {
  const [file] = await app.db
    .insert(schema.file)
    .values({
      name: `${kind}.${kind === "document" ? "pdf" : "png"}`,
      mime: kind === "document" ? "application/pdf" : "image/png",
      size: 100,
      kind: kind === "document" ? "document" : "image",
      storageKey: `k-${randomBytes(4).toString("hex")}`,
      sha256: "x".repeat(64),
      ...extra,
    } as never)
    .returning();
  await app.db
    .insert(schema.attachment)
    .values({ fileId: file!.id, entityType: "job", entityId: jobId, kind });
  return file!;
}

describe("stavební deník: materiál a náklady", () => {
  it("materiál s cenou vytvoří náklad zakázky, úprava ho přepíše, smazání zápisu ho zruší", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const date = todayIso();
    const row = mat();
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({
        jobId: j.id,
        date,
        work: "Betonáž",
        materialRows: [row],
        autoWeather: false,
      }),
      deps(),
    );
    const costs = () =>
      app.db
        .select()
        .from(jobCost)
        .where(
          and(eq(jobCost.jobId, j.id), eq(jobCost.source, "diary"), isNull(jobCost.deletedAt)),
        );
    let [c] = await costs();
    expect(c).toMatchObject({
      amountMinor: 500_000,
      category: "material",
      supplierName: "Betonárna",
      date,
    });
    expect(c!.sourceRef).toMatch(new RegExp(`:${row.id}$`));

    // stejné číslo = stejný náklad (nevznikne druhý)
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({ jobId: j.id, date, materialRows: [row] }),
      deps(),
    );
    expect(await costs()).toHaveLength(1);

    // změna množství náklad přepíše
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({ jobId: j.id, date, materialRows: [{ ...row, qty: "3" }] }),
      deps(),
    );
    [c] = await costs();
    expect(await costs()).toHaveLength(1);
    expect(c!.amountMinor).toBe(750_000);

    const list = await diaryList.handler(u.ctx, { jobId: j.id }, deps());
    expect(list.entries[0]!.materialRows[0]).toMatchObject({ unitPriceMinor: 250_000 });
    expect(list.entries[0]!.materialRows[0]!.costRef).toBe(c!.id);

    await diaryDelete.handler(u.ctx, { id: list.entries[0]!.id }, deps());
    expect(await costs()).toHaveLength(0);
  });

  it("řádek bez ceny náklad nevytváří; odebraný řádek náklad zruší", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const date = todayIso();
    const priced = mat();
    const free = mat({ unitPriceMinor: null, name: "Voda" });
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({
        jobId: j.id,
        date,
        materialRows: [priced, free],
        autoWeather: false,
      }),
      deps(),
    );
    const count = async () =>
      (
        await app.db
          .select()
          .from(jobCost)
          .where(
            and(eq(jobCost.jobId, j.id), eq(jobCost.source, "diary"), isNull(jobCost.deletedAt)),
          )
      ).length;
    expect(await count()).toBe(1);
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({ jobId: j.id, date, materialRows: [free] }),
      deps(),
    );
    expect(await count()).toBe(0);
  });
});

describe("montér nevidí ceny", () => {
  it("souhrn zakázky vyžaduje ekonomiku, deník ceny nevrací a cizí úprava ceny nepřepíše", async () => {
    const owner = await boss();
    const w = await worker();
    const j = await newJob(owner.id);
    await app.db.insert(jobMember).values({ jobId: j.id, userId: w.id });
    const date = todayIso();
    await diarySave.handler(
      owner.ctx,
      diarySave.input.parse({
        jobId: j.id,
        date,
        work: "Betonáž",
        materialRows: [mat({ id: "row-price01" })],
        autoWeather: false,
      }),
      deps(),
    );

    // souhrn: příkaz pro držitele ekonomiky; bez ní ho nepustí vstupní bod (oprávnění příkazu)
    expect(cmd("zakazky.summary").permission).toBe("zakazky.economics");
    await expect(run("zakazky.summary", w.ctx, { jobId: j.id })).rejects.toThrow(PermissionError);
    await expect(run("zakazky.summary", owner.ctx, { jobId: j.id })).resolves.toMatchObject({
      contractMinor: expect.any(Number),
    });

    // deník: montér vidí materiál, ne ceny
    const list = await diaryList.handler(w.ctx, { jobId: j.id }, deps());
    expect(list.canPrice).toBe(false);
    expect(JSON.stringify(list)).not.toMatch(/250000|costRef":"[0-9a-f-]{36}/);
    expect(list.entries[0]!.materialRows[0]).toMatchObject({
      name: "Beton C20/25",
      unitPriceMinor: null,
      costRef: null,
    });

    // montér řádek upraví (množství) a doplní nový; cena a náklad zůstanou, nový řádek je bez ceny
    await diarySave.handler(
      w.ctx,
      diarySave.input.parse({
        jobId: j.id,
        date,
        materialRows: [
          { ...mat({ id: "row-price01" }), qty: "2", unitPriceMinor: null },
          { ...mat({ id: "row-new0001", name: "Písek", unitPriceMinor: 99_999 }) },
        ],
      }),
      deps(),
    );
    const ownerView = await diaryList.handler(owner.ctx, { jobId: j.id }, deps());
    const rows = ownerView.entries[0]!.materialRows;
    expect(rows.find((r) => r.id === "row-price01")).toMatchObject({ unitPriceMinor: 250_000 });
    expect(rows.find((r) => r.id === "row-new0001")).toMatchObject({ unitPriceMinor: null });
    const costs = await app.db
      .select()
      .from(jobCost)
      .where(and(eq(jobCost.jobId, j.id), eq(jobCost.source, "diary"), isNull(jobCost.deletedAt)));
    expect(costs).toHaveLength(1);

    // tisk deníku je bez cen i pro majitele
    const print = await diaryPrint.handler(owner.ctx, { jobId: j.id }, deps());
    expect(JSON.stringify(print)).not.toMatch(/250000|"unitPriceMinor":\d/);
  });

  it("cizí zakázka je nenalezená (montér mimo tým)", async () => {
    const owner = await boss();
    const w = await worker();
    const j = await newJob(owner.id);
    await expect(diaryList.handler(w.ctx, { jobId: j.id }, deps())).rejects.toThrow(NotFoundError);
  });

  it("odkazy pro investora se spravují jen s oprávněním zakazky.share", () => {
    for (const n of ["list", "create", "update", "revoke"])
      expect(cmd(`zakazky.share.${n}`).permission).toBe("zakazky.share");
  });
});

describe("počasí do deníku", () => {
  it("nový zápis si vezme počasí z veřejné služby podle souřadnic zakázky, další úprava už ne", async () => {
    const u = await boss();
    const j = await newJob(u.id, { siteLat: "49.738400", siteLng: "13.373600" });
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(String(url));
      return weatherResponse();
    });
    const date = todayIso();
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({ jobId: j.id, date, work: "Zdivo" }),
      deps(),
    );
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!).hostname).toBe("api.open-meteo.com");
    let [e] = (await diaryList.handler(u.ctx, { jobId: j.id }, deps())).entries;
    expect(e).toMatchObject({
      weather: "Déšť",
      weatherData: { code: 61, source: "open-meteo", precipMm: 3.2 },
    });
    expect(e!.temperature).toBe(7);

    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({ jobId: j.id, date, work: "Zdivo 2" }),
      deps(),
    );
    expect(calls).toHaveLength(1);
    [e] = (await diaryList.handler(u.ctx, { jobId: j.id }, deps())).entries;
    expect(e!.weatherData?.label).toBe("Déšť");
  });

  it("výpadek služby deník neshodí: uloží se bez počasí a doplní se ručně", async () => {
    const u = await boss();
    const j = await newJob(u.id, { siteLat: "49.7", siteLng: "13.4" });
    vi.stubGlobal("fetch", async () => {
      throw new Error("síť");
    });
    const date = todayIso();
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({ jobId: j.id, date, work: "Omítky" }),
      deps(),
    );
    const [e] = (await diaryList.handler(u.ctx, { jobId: j.id }, deps())).entries;
    expect(e!.weatherData).toBeNull();
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({
        jobId: j.id,
        date,
        weatherData: { label: "Zataženo", tempMax: 8, tempMin: 8 },
      }),
      deps(),
    );
    const [after] = (await diaryList.handler(u.ctx, { jobId: j.id }, deps())).entries;
    expect(after).toMatchObject({
      weather: "Zataženo",
      weatherData: { source: "manual", label: "Zataženo" },
    });
  });

  it("zakázka bez adresy a souřadnic nevolá službu vůbec", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({ jobId: j.id, date: todayIso(), work: "Úklid" }),
      deps(),
    );
    expect(f).not.toHaveBeenCalled();
  });
});

describe("stavební deník: vady, podpis, předvyplnění", () => {
  it("vada z deníku založí vadu zakázky jen jednou", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const date = todayIso();
    const inc = { id: "inc-0000001", kind: "defect" as const, text: "Prasklý překlad nad oknem" };
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({ jobId: j.id, date, incidents: [inc], autoWeather: false }),
      deps(),
    );
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({
        jobId: j.id,
        date,
        incidents: [{ ...inc, defectId: null }],
        work: "Pokračování",
      }),
      deps(),
    );
    const defects = await app.db.select().from(defect).where(eq(defect.jobId, j.id));
    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ title: "Prasklý překlad nad oknem", foundAt: date });
    const [e] = (await diaryList.handler(u.ctx, { jobId: j.id }, deps())).entries;
    expect(e!.incidents[0]).toMatchObject({ kind: "defect", defectId: defects[0]!.id });
    const open = await defectsOpen.handler(u.ctx, { jobId: j.id }, deps());
    expect(open.count).toBe(1);
  });

  it("podepsaný zápis nejde měnit ani smazat, podpis musí být soubor zakázky; zrušit ho smí správce", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const date = todayIso();
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({ jobId: j.id, date, work: "Fasáda", autoWeather: false }),
      deps(),
    );
    const [e] = (await diaryList.handler(u.ctx, { jobId: j.id }, deps())).entries;
    const [stray] = await app.db
      .insert(schema.file)
      .values({
        name: "x.png",
        mime: "image/png",
        size: 1,
        kind: "image",
        storageKey: `k-${randomBytes(4).toString("hex")}`,
        sha256: "y".repeat(64),
      } as never)
      .returning();
    await expect(
      diarySign.handler(
        u.ctx,
        { id: e!.id, signatureFileId: stray!.id, name: "Ing. Novák" },
        deps(),
      ),
    ).rejects.toThrow(/Podpis se nepodařilo najít/);
    const sig = await attachFile(j.id, "signature");
    await diarySign.handler(
      u.ctx,
      { id: e!.id, signatureFileId: sig.id, name: "Ing. Novák" },
      deps(),
    );
    await expect(
      diarySave.handler(u.ctx, diarySave.input.parse({ jobId: j.id, date, work: "Jiné" }), deps()),
    ).rejects.toThrow(/podepsaný/);
    await expect(diaryDelete.handler(u.ctx, { id: e!.id }, deps())).rejects.toThrow(/odepsaný/);
    await diaryUnsign.handler(u.ctx, { id: e!.id }, deps());
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({ jobId: j.id, date, work: "Jiné" }),
      deps(),
    );
    const [after] = await app.db.select().from(siteDiary).where(eq(siteDiary.id, e!.id));
    expect(after).toMatchObject({ work: "Jiné", signedAt: null });
  });

  it("fotky zápisu musí patřit k téže zakázce", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const other = await newJob(u.id);
    const mine = await attachFile(j.id, "photo");
    const foreign = await attachFile(other.id, "photo");
    const date = todayIso();
    await expect(
      diarySave.handler(
        u.ctx,
        diarySave.input.parse({ jobId: j.id, date, work: "x", photoIds: [foreign.id] }),
        deps(),
      ),
    ).rejects.toThrow(/nepatří k této zakázce/);
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({
        jobId: j.id,
        date,
        work: "x",
        photoIds: [mine.id],
        autoWeather: false,
      }),
      deps(),
    );
    const [e] = (await diaryList.handler(u.ctx, { jobId: j.id }, deps())).entries;
    expect(e!.photoIds).toEqual([mine.id]);
  });

  it("předvyplnění vrací strukturované pracovníky, stroje a materiál a chyba jednoho poskytovatele nic neshodí", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    prefill.push(
      async () => ({ people: "Jan (8 h)", workers: [{ userId: null, name: "Jan", hours: 8 }] }),
      async () => {
        throw new Error("modul spadl");
      },
      async () => ({
        materials: "Lepidlo",
        materialRows: [{ name: "Lepidlo", qty: "10", unit: "kg" }],
        machineRows: [{ name: "Bagr", hours: 4, note: "výkop" }],
      }),
    );
    try {
      const p = await diaryPrefill.handler(u.ctx, { jobId: j.id, date: todayIso() }, deps());
      expect(p.workers).toEqual([{ userId: null, name: "Jan", hours: 8, source: "attendance" }]);
      expect(p.machineRows).toEqual([{ name: "Bagr", hours: 4, note: "výkop", source: "stroje" }]);
      expect(p.materialRows[0]).toMatchObject({
        name: "Lepidlo",
        qty: "10",
        unit: "kg",
        source: "sklad",
        unitPriceMinor: null,
      });
      expect(p.people).toBe("Jan (8 h)");
    } finally {
      prefill.length = 0;
    }
  });

  it("do uzavřené zakázky se nezapisuje", async () => {
    const u = await boss();
    const j = await newJob(u.id, { phase: "closed" });
    await expect(
      diarySave.handler(
        u.ctx,
        diarySave.input.parse({ jobId: j.id, date: todayIso(), work: "x" }),
        deps(),
      ),
    ).rejects.toThrow(/uzavřená/);
  });
});

const hook = (id: string) => phaseHooks.find((h) => h.id === id)!;

describe("hooky přechodů fáze v Realizaci", () => {
  it("vstup do realizace: deník musí mít kdo zapisovat", async () => {
    const u = await boss();
    const lonely = await newJob();
    const t = { from: "preparation", to: "execution" };
    const open = hook("realizace.open-diary");
    expect(await open.check!(u.ctx, lonely as never, t)).toMatch(/kdo zapisovat/);
    const w = await worker();
    await app.db.insert(jobMember).values({ jobId: lonely.id, userId: w.id });
    expect(await open.check!(u.ctx, lonely as never, t)).toBeNull();
    expect(await open.check!(u.ctx, { ...lonely, managerId: u.id } as never, t)).toBeNull();
  });

  it("předání: založí protokol s kontrolními body i otevřenými vadami, nic nezdvojí", async () => {
    const u = await boss();
    const j = await newJob(u.id, { phase: "handover" });
    const date = todayIso();
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({
        jobId: j.id,
        date,
        incidents: [{ id: "inc-0000002", kind: "defect", text: "Netěsné okno" }],
        autoWeather: false,
      }),
      deps(),
    );
    const t = { from: "execution", to: "handover" };
    await hook("realizace.handover-protocol").after!(u.ctx, j as never, t);
    await hook("realizace.handover-protocol").after!(u.ctx, j as never, t);
    const protocols = await app.db
      .select()
      .from(handoverProtocol)
      .where(eq(handoverProtocol.jobId, j.id));
    expect(protocols).toHaveLength(1);
    expect(protocols[0]).toMatchObject({ status: "draft", number: expect.stringMatching(/^PP-/) });
    const [d] = await app.db.select().from(defect).where(eq(defect.jobId, j.id));
    expect(d!.handoverId).toBe(protocols[0]!.id);
  });

  it("do záruky jen s podepsaným protokolem, uzavřít jde jen bez otevřených vad", async () => {
    const u = await boss();
    const j = await newJob(u.id, { phase: "handover" });
    const warranty = hook("realizace.signed-protocol");
    expect(await warranty.check!(u.ctx, j as never, { from: "handover", to: "warranty" })).toMatch(
      /podepsaný předávací protokol/,
    );
    await app.db.insert(handoverProtocol).values({
      jobId: j.id,
      number: `PP-T-${randomBytes(3).toString("hex")}`,
      date: todayIso(),
      status: "signed",
    });
    expect(
      await warranty.check!(u.ctx, j as never, { from: "handover", to: "warranty" }),
    ).toBeNull();
    // ze záruky do uzavřeno protokol znovu nevyžaduje
    expect(await warranty.check!(u.ctx, j as never, { from: "warranty", to: "closed" })).toBeNull();

    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({
        jobId: j.id,
        date: todayIso(),
        incidents: [{ id: "inc-0000003", kind: "defect", text: "Skřípe dveře" }],
        autoWeather: false,
      }),
      deps(),
    );
    const closed = hook("realizace.no-open-defects");
    expect(await closed.check!(u.ctx, j as never, { from: "warranty", to: "closed" })).toMatch(
      /1 otevřená vada: Skřípe dveře/,
    );
    await app.db.update(defect).set({ deletedAt: new Date() }).where(eq(defect.jobId, j.id));
    expect(await closed.check!(u.ctx, j as never, { from: "warranty", to: "closed" })).toBeNull();
  });
});

describe("odkaz pro investora", () => {
  const createShare = async (
    u: Awaited<ReturnType<typeof boss>>,
    jobId: string,
    scope: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) =>
    (await run("zakazky.share.create", u.ctx, { jobId, label: "Investor", scope, ...extra })) as {
      id: string;
      token: string;
      path: string;
      url: string;
    };

  it("token se ukáže jednou, v databázi je jen otisk; odkaz jde zrušit a vyprší", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const s = await createShare(u, j.id, { schedule: true });
    expect(s.url).toBe(`http://localhost:3100/investor/${s.token}`);
    const list = (await run("zakazky.share.list", u.ctx, { jobId: j.id })) as {
      id: string;
      status: string;
    }[];
    expect(JSON.stringify(list)).not.toContain(s.token);
    expect(list[0]).toMatchObject({ id: s.id, status: "active" });
    const [db] = await app.db.select().from(jobShare).where(eq(jobShare.id, s.id));
    expect(db!.tokenHash).toBe(shareApi.hashShareToken(s.token));
    expect(JSON.stringify(db)).not.toContain(s.token);

    expect(await shareApi.resolveShare(app.db, s.token)).toMatchObject({ jobId: j.id });
    expect(await shareApi.resolveShare(app.db, s.token.slice(0, -1) + "x")).toBeNull();
    expect(await shareApi.resolveShare(app.db, "krátký")).toBeNull();

    await run("zakazky.share.revoke", u.ctx, { id: s.id });
    expect(await shareApi.resolveShare(app.db, s.token)).toBeNull();
    const after = (await run("zakazky.share.list", u.ctx, { jobId: j.id })) as { status: string }[];
    expect(after[0]!.status).toBe("revoked");

    const exp = await createShare(u, j.id, { schedule: true }, { expiresInDays: 1 });
    await app.db
      .update(jobShare)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(jobShare.id, exp.id));
    expect(await shareApi.resolveShare(app.db, exp.token)).toBeNull();
  });

  it("rozsah: fotky a dokumenty jen podle odkazu, bez cen, ostatní soubory se nepodávají", async () => {
    const u = await boss();
    const j = await newJob(u.id, { valueMinor: 1_234_500_00 });
    const photo = await attachFile(j.id, "photo");
    const doc = await attachFile(j.id, "document");
    const secret = await attachFile(j.id, "document");
    const sig = await attachFile(j.id, "signature");

    const minimal = await shareApi.resolveShare(
      app.db,
      (await createShare(u, j.id, { schedule: false, diary: "none" })).token,
    );
    const base0 = await shareApi.investorBase(app.db, minimal!);
    expect(base0!.photos).toHaveLength(0);
    expect(base0!.documents).toHaveLength(0);
    expect(await shareApi.canServeFile(app.db, minimal!, photo.id)).toBeNull();

    const full = await shareApi.resolveShare(
      app.db,
      (await createShare(u, j.id, { photos: true, documentIds: [doc.id], schedule: true })).token,
    );
    const base = await shareApi.investorBase(app.db, full!);
    expect(base!.photos.map((f) => f.id)).toEqual([photo.id]);
    expect(base!.documents.map((f) => f.id)).toEqual([doc.id]);
    expect(base!.job).toMatchObject({ title: "Rodinný dům" });
    // žádné peníze ani číslo zakázky
    expect(JSON.stringify(base)).not.toMatch(/Minor|1234500|D-[0-9a-f]{8}/);
    expect(await shareApi.canServeFile(app.db, full!, photo.id)).not.toBeNull();
    expect(await shareApi.canServeFile(app.db, full!, doc.id)).not.toBeNull();
    expect(await shareApi.canServeFile(app.db, full!, secret.id)).toBeNull();
    expect(await shareApi.canServeFile(app.db, full!, sig.id)).toBeNull();
    expect(await shareApi.canServeFile(app.db, full!, "../../etc/passwd")).toBeNull();
    // soubor cizí zakázky se nepodá ani se známým id
    const other = await newJob(u.id);
    const foreign = await attachFile(other.id, "photo");
    expect(await shareApi.canServeFile(app.db, full!, foreign.id)).toBeNull();
  });

  it("deník pro investora: jen označené zápisy, bez cen, hodin a dodavatelů; příkaz smí jen systémový kontext", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const pic = await attachFile(j.id, "photo");
    const d1 = "2026-10-01";
    const d2 = "2026-10-02";
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({
        jobId: j.id,
        date: d1,
        work: "Veřejný zápis",
        events: "Interní spor s dodavatelem",
        forInvestor: true,
        workers: [{ name: "Jan Novák", hours: 8 }],
        materialRows: [mat({ id: "row-inv0001" })],
        photoIds: [pic.id],
        autoWeather: false,
      }),
      deps(),
    );
    await diarySave.handler(
      u.ctx,
      diarySave.input.parse({
        jobId: j.id,
        date: d2,
        work: "Interní zápis",
        events: "Reklamace",
        autoWeather: false,
      }),
      deps(),
    );

    // přihlášený uživatel příkaz nesmí (mohl by si vyžádat cizí zakázku)
    await expect(
      investorView.handler(
        u.ctx,
        investorView.input.parse({ jobId: j.id, scope: { schedule: true, diary: "all" } }),
        deps(),
      ),
    ).rejects.toThrow(PermissionError);

    const sys = systemCtx(app.db);
    const flagged = await investorView.handler(
      sys,
      investorView.input.parse({ jobId: j.id, scope: { schedule: true, diary: "flagged" } }),
      deps(),
    );
    expect(flagged.diary.map((d) => d.date)).toEqual([d1]);
    expect(flagged.diary[0]).toMatchObject({
      work: "Veřejný zápis",
      workers: ["Jan Novák"],
      events: "Interní spor s dodavatelem",
    });
    expect(flagged.diaryPhotoIds).toEqual([pic.id]);
    expect(JSON.stringify(flagged)).not.toMatch(/unitPrice|250000|Betonárna|hours|supplier/);

    const all = await investorView.handler(
      sys,
      investorView.input.parse({ jobId: j.id, scope: { schedule: false, diary: "all" } }),
      deps(),
    );
    expect(all.diary.map((d) => d.date)).toEqual([d2, d1]);
    // neoznačený zápis neprozradí interní události
    expect(all.diary.find((d) => d.date === d2)!.events).toBeNull();

    // fotka ze zápisu se podá, i když odkaz nesdílí fotky zakázky
    const share = await shareApi.resolveShare(
      app.db,
      (await createShare(u, j.id, { diary: "flagged", photos: false })).token,
    );
    expect(await shareApi.canServeFile(app.db, share!, pic.id)).toBeNull();
    expect(
      await shareApi.canServeFile(app.db, share!, pic.id, flagged.diaryPhotoIds),
    ).not.toBeNull();

    const none = await investorView.handler(
      sys,
      investorView.input.parse({ jobId: j.id, scope: { schedule: false, diary: "none" } }),
      deps(),
    );
    expect(none.diary).toEqual([]);
  });
});
