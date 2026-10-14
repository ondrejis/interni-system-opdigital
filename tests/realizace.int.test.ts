import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  queryRecords,
  updateRecord,
  registerEntityPolicies,
  resolveEntity,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { DiaryPrefillProvider, ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { configureNotifications, resetNotifications } from "@rebar/core/notifications";
import { todayIso, zonedToUtc } from "@rebar/core/time";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { getPipeline } from "@rebar/core/config-data";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job, jobMember } from "@rebar/zakazky/schema";
import { jobEntity } from "@rebar/zakazky/server";
import { manifest } from "@rebar/realizace";
import { jobPhase, siteDiary } from "@rebar/realizace/schema";
import {
  defectEntity,
  phaseHooks,
  sendDiaryReminders,
  sendMorningOverview,
  sendPhaseDeadlines,
  sendPhaseStarts,
  diaryList,
  diaryPrefill,
  diarySave,
  handoverList,
  handoverSave,
  handoverSign,
  overview,
  phasesDelete,
  phasesList,
  phasesMove,
  phasesSave,
  phasesSetBaseline,
  phasesSetProgress,
} from "@rebar/realizace/server";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const prefill: DiaryPrefillProvider[] = [];
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    costProviders: [],
    calendarLayers: [],
    diaryPrefill: prefill,
  }) as unknown as ModuleDeps;

afterAll(() => resetNotifications());

beforeAll(async () => {
  configureNotifications({ events: manifest.notifications ?? [] });
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity, defectEntity]);
  registerEntityPolicies(registry);
  for (const m of [zakazkyManifest, manifest]) {
    for (const p of m.seed.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of "lookups" in m.seed ? m.seed.lookups : []) await ensureLookup(app.db, l);
    await ensureSeries(app.db, m.seed.series ?? []);
  }
});

const notesOf = (userId: string, kind?: string) =>
  app.db
    .select()
    .from(schema.notification)
    .where(
      kind
        ? and(eq(schema.notification.userId, userId), eq(schema.notification.kind, kind))
        : eq(schema.notification.userId, userId),
    )
    .orderBy(schema.notification.createdAt);

/** Člen týmu / řešitel: vidí zakázky a realizaci jen svoje. */
const person = () =>
  makeUser(app.db, [
    ["zakazky.read", "own"],
    ["realizace.read", "own"],
  ]);

async function addPhase(
  jobId: string,
  name: string,
  startDate: string,
  endDate: string,
  extra: Partial<typeof jobPhase.$inferInsert> = {},
) {
  const [p] = await app.db
    .insert(jobPhase)
    .values({ jobId, name, startDate, endDate, ...extra })
    .returning();
  return p!;
}
const running = { status: "in_progress", progress: 30 } as const;
const prague = (date: string, time: string) => zonedToUtc(date, time);

const boss = () =>
  makeUser(app.db, [
    ["zakazky.read", "all"],
    ["zakazky.write", "all"],
    ["realizace.read", "all"],
    ["realizace.write", "all"],
    ["kontakty.read", "all"],
  ]);

async function newJob(managerId?: string) {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `R-${randomBytes(4).toString("hex")}`,
      title: "Rekonstrukce",
      companyId: c!.id,
      stageId: stage.id,
      managerId: managerId ?? null,
    })
    .returning();
  return j!;
}

const phaseInput = (
  jobId: string,
  name: string,
  startDate: string,
  endDate: string,
  extra: Record<string, unknown> = {},
) => phasesSave.input.parse({ jobId, name, startDate, endDate, ...extra });

describe("harmonogram", () => {
  it("fáze se ukládají s výchozím plánem, termín zakázky se řídí rozsahem fází, navazující se posunou o pracovní dny", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const a = await phasesSave.handler(
      u.ctx,
      phaseInput(j.id, "Bourání", "2026-11-02", "2026-11-06"),
      deps(),
    );
    const b = await phasesSave.handler(
      u.ctx,
      phaseInput(j.id, "Instalace", "2026-11-04", "2026-11-06", { dependsOnId: a.id }),
      deps(),
    );
    // b ještě nebylo posunuto (shift se aplikuje při změně předchůdce)
    const moved = await phasesSave.handler(
      u.ctx,
      phaseInput(j.id, "Bourání", "2026-11-02", "2026-11-10", { id: a.id }),
      deps(),
    );
    expect(moved.shifted).toBe(1);
    const list = await phasesList.handler(u.ctx, { jobId: j.id }, deps());
    const pb = list.phases.find((p) => p.id === b.id)!;
    expect(pb).toMatchObject({
      startDate: "2026-11-11",
      endDate: "2026-11-13",
      baselineStart: "2026-11-04",
    });
    const [after] = await app.db.select().from(job).where(eq(job.id, j.id));
    expect(after).toMatchObject({ startDate: "2026-11-02", endDate: "2026-11-13" });
  });

  it("kruh v návaznostech a návaznost na fázi jiné zakázky se odmítne", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const other = await newJob(u.id);
    const a = await phasesSave.handler(
      u.ctx,
      phaseInput(j.id, "Fáze A", "2026-11-02", "2026-11-03"),
      deps(),
    );
    const b = await phasesSave.handler(
      u.ctx,
      phaseInput(j.id, "Fáze B", "2026-11-04", "2026-11-05", { dependsOnId: a.id }),
      deps(),
    );
    await expect(
      phasesSave.handler(
        u.ctx,
        phaseInput(j.id, "Fáze A", "2026-11-02", "2026-11-03", { id: a.id, dependsOnId: b.id }),
        deps(),
      ),
    ).rejects.toThrow(/kruh/);
    const foreign = await phasesSave.handler(
      u.ctx,
      phaseInput(other.id, "Cizí", "2026-11-02", "2026-11-03"),
      deps(),
    );
    await expect(
      phasesSave.handler(
        u.ctx,
        phaseInput(j.id, "Fáze C", "2026-11-04", "2026-11-05", { dependsOnId: foreign.id }),
        deps(),
      ),
    ).rejects.toThrow(/jiné zakázce/);
    await expect(
      phasesSave.handler(u.ctx, phaseInput(j.id, "Fáze D", "2026-11-05", "2026-11-04"), deps()),
    ).rejects.toThrow(/po začátku/);
  });

  it("průběh určuje stav a skutečné termíny, přetažení a výchozí plán fungují, smazání odpojí následníky", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const a = await phasesSave.handler(
      u.ctx,
      phaseInput(j.id, "Fáze A", "2026-11-02", "2026-11-04"),
      deps(),
    );
    const b = await phasesSave.handler(
      u.ctx,
      phaseInput(j.id, "Fáze B", "2026-11-05", "2026-11-06", { dependsOnId: a.id }),
      deps(),
    );
    await phasesSetProgress.handler(u.ctx, { jobId: j.id, id: a.id, progress: 100 }, deps());
    let list = await phasesList.handler(u.ctx, { jobId: j.id }, deps());
    expect(list.phases.find((p) => p.id === a.id)).toMatchObject({
      status: "done",
      progress: 100,
      actualEnd: todayIso(),
    });
    expect(list.progress).toBe(60); // A 3 dny hotové, B 2 dny: 3/5

    await phasesMove.handler(
      u.ctx,
      { jobId: j.id, id: b.id, startDate: "2026-11-09", endDate: "2026-11-10", shift: true },
      deps(),
    );
    await phasesSetBaseline.handler(u.ctx, { jobId: j.id }, deps());
    list = await phasesList.handler(u.ctx, { jobId: j.id }, deps());
    expect(list.phases.find((p) => p.id === b.id)).toMatchObject({
      startDate: "2026-11-09",
      baselineStart: "2026-11-09",
      baselineEnd: "2026-11-10",
    });

    await phasesDelete.handler(u.ctx, { id: a.id }, deps());
    list = await phasesList.handler(u.ctx, { jobId: j.id }, deps());
    expect(list.phases).toHaveLength(1);
    expect(list.phases[0]!.dependsOnId).toBeNull();
  });

  it("plán upravuje jen ten, kdo smí zakázku měnit; montér čtení s „jen moje“ vidí jen svou zakázku", async () => {
    const owner = await boss();
    const mine = await newJob(owner.id);
    const other = await newJob(owner.id);
    await phasesSave.handler(
      owner.ctx,
      phaseInput(mine.id, "Fáze A", "2026-11-02", "2026-11-03"),
      deps(),
    );
    const worker = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["realizace.read", "own"],
    ]);
    await app.db.insert(jobMember).values({ jobId: mine.id, userId: worker.id });
    expect((await phasesList.handler(worker.ctx, { jobId: mine.id }, deps())).phases).toHaveLength(
      1,
    );
    await expect(phasesList.handler(worker.ctx, { jobId: other.id }, deps())).rejects.toThrow(
      NotFoundError,
    );
    await expect(
      phasesSave.handler(
        worker.ctx,
        phaseInput(mine.id, "Nová", "2026-11-04", "2026-11-05"),
        deps(),
      ),
    ).rejects.toThrow(PermissionError);
    const ov = await overview.handler(worker.ctx, {}, deps());
    expect(ov.map((o) => o.id)).toEqual([mine.id]);
  });
});

describe("karta Harmonogram na Přehledu zakázky", () => {
  it("čte stávající příkaz bez peněz: montér bez práv na ekonomiku dostane jen termíny, postup a zpoždění", async () => {
    const owner = await boss();
    const j = await newJob(owner.id);
    await phasesSave.handler(
      owner.ctx,
      phaseInput(j.id, "Bourání", "2026-11-02", "2026-11-06", { plannedHours: 40 }),
      deps(),
    );
    await phasesSave.handler(
      owner.ctx,
      phaseInput(j.id, "Kontrolní den", "2026-11-09", "2026-11-09", { milestone: true }),
      deps(),
    );
    const worker = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["realizace.read", "own"],
    ]);
    await app.db.insert(jobMember).values({ jobId: j.id, userId: worker.id });
    const data = await phasesList.handler(worker.ctx, { jobId: j.id }, deps());
    expect(data.phases.map((p) => p.name)).toEqual(["Bourání", "Kontrolní den"]);
    for (const p of data.phases)
      expect(Object.keys(p).filter((k) => /minor|price|cost|rate|cena|margin/i.test(k))).toEqual(
        [],
      );
    expect(data.phases[1]).toMatchObject({ milestone: true, startDate: "2026-11-09" });
  });
});

describe("stavební deník", () => {
  it("zápis smí člen týmu i bez realizace.write; jeden zápis na den se přepíše; dopředu psát nejde", async () => {
    const owner = await boss();
    const j = await newJob(owner.id);
    const member = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["realizace.read", "own"],
    ]);
    const stranger = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["realizace.read", "own"],
    ]);
    await app.db.insert(jobMember).values({ jobId: j.id, userId: member.id });
    const today = todayIso();
    await diarySave.handler(
      member.ctx,
      { jobId: j.id, date: today, work: "Obklady v koupelně", temperature: 12 },
      deps(),
    );
    await diarySave.handler(
      member.ctx,
      { jobId: j.id, date: today, work: "Obklady a spárování" },
      deps(),
    );
    const list = await diaryList.handler(member.ctx, { jobId: j.id }, deps());
    expect(list.canWrite).toBe(true);
    expect(list.entries).toHaveLength(1);
    expect(list.entries[0]!.work).toBe("Obklady a spárování");
    await expect(
      diarySave.handler(member.ctx, { jobId: j.id, date: "2999-01-01", work: "x" }, deps()),
    ).rejects.toThrow(/dopředu/);
    await expect(
      diarySave.handler(member.ctx, { jobId: j.id, date: today }, deps()),
    ).rejects.toThrow(/Vyplňte provedené práce/);
    await expect(
      diarySave.handler(stranger.ctx, { jobId: j.id, date: today, work: "x" }, deps()),
    ).rejects.toThrow(NotFoundError);
  });

  it("předvyplnění skládá data poskytovatelů ostatních modulů a chyba jednoho nic neshodí", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    prefill.push(
      async () => ({ people: "Jan (8 h)", work: "montáž" }),
      async () => {
        throw new Error("modul spadl");
      },
      async () => ({ materials: "Lepidlo 10 kg", people: "Eva (4 h)" }),
    );
    try {
      const p = await diaryPrefill.handler(u.ctx, { jobId: j.id, date: todayIso() }, deps());
      expect(p).toEqual({
        people: "Jan (8 h); Eva (4 h)",
        work: "montáž",
        machines: "",
        materials: "Lepidlo 10 kg",
        // strukturované řádky (pracovníci z docházky, stroje, materiál ze skladu) plní jen poskytovatelé, kteří je umějí
        workers: [],
        machineRows: [],
        materialRows: [],
      });
    } finally {
      prefill.length = 0;
    }
  });
});

describe("předávací protokol", () => {
  it("číslo ze série, kontrolní body, podpis jen se souborem připojeným k zakázce, podepsaný protokol je neměnný", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const member = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["realizace.read", "own"],
    ]);
    await app.db.insert(jobMember).values({ jobId: j.id, userId: member.id });
    const { id } = await handoverSave.handler(
      u.ctx,
      {
        jobId: j.id,
        date: "2026-12-01",
        acceptedBy: "Pan Novák",
        items: [
          { text: "Staveniště uklizeno", ok: true },
          { text: "Chybí madlo", ok: false, note: "dodělat" },
        ],
      },
      deps(),
    );
    const [p] = await handoverList.handler(u.ctx, { jobId: j.id }, deps());
    expect(p!.number).toMatch(/^PP-\d{4}-\d{3,}$/);
    expect(p!.items.map((i) => [i.text, i.ok])).toEqual([
      ["Staveniště uklizeno", true],
      ["Chybí madlo", false],
    ]);

    // soubor, který není připojený k této zakázce, nejde použít jako podpis
    const [file] = await app.db
      .insert(schema.file)
      .values({
        name: "podpis.png",
        mime: "image/png",
        size: 10,
        kind: "image",
        storageKey: `k-${randomBytes(4).toString("hex")}`,
        sha256: "x".repeat(64),
      } as never)
      .returning();
    await expect(
      handoverSign.handler(
        u.ctx,
        { id, signatureFileId: file!.id, acceptedBy: "Pan Novák" },
        deps(),
      ),
    ).rejects.toThrow(/Podpis se nepodařilo najít/);
    await app.db
      .insert(schema.attachment)
      .values({ fileId: file!.id, entityType: "job", entityId: j.id, kind: "signature" });
    await handoverSign.handler(
      u.ctx,
      { id, signatureFileId: file!.id, acceptedBy: "Pan Novák" },
      deps(),
    );
    const [signed] = await handoverList.handler(u.ctx, { jobId: j.id }, deps());
    expect(signed).toMatchObject({ status: "signed", acceptedBy: "Pan Novák" });
    // tým zakázky se dozví o předání; ten, kdo podepsal, ne
    const [handoverNote] = await notesOf(member.id, "job.handover");
    expect(handoverNote).toMatchObject({
      title: `${j.number}: předáno zákazníkovi`,
      body: `Protokol ${signed!.number} podepsán\nPřevzal: Pan Novák`,
      url: `/zakazky/${j.id}?tab=realizace&sub=predani`,
    });
    expect(await notesOf(u.id, "job.handover")).toEqual([]);
    await expect(
      handoverSave.handler(u.ctx, { jobId: j.id, id, date: "2026-12-02", items: [] }, deps()),
    ).rejects.toThrow(/nejde měnit/);
    await expect(
      handoverSign.handler(
        u.ctx,
        { id, signatureFileId: file!.id, acceptedBy: "Pan Novák" },
        deps(),
      ),
    ).rejects.toThrow(/už je podepsaný/);
  });
});

describe("vady", () => {
  it("vada dostane první stav a datum nálezu, upozorní tým a vidí ji řešitel, vedoucí i člen týmu", async () => {
    const owner = await boss();
    const j = await newJob(owner.id);
    const responsible = await makeUser(app.db, [
      ["realizace.read", "own"],
      ["realizace.write", "own"],
    ]);
    const stranger = await makeUser(app.db, [["realizace.read", "own"]]);
    const E = await resolveEntity(app.db, defectEntity);
    const { row } = await createRecord(owner.ctx, registry, E, {
      title: "Prasklá spára",
      job: j.id,
      responsible: responsible.id,
      severity: "major",
    });
    expect(row.foundAt).toBe(todayIso());
    expect(row.stage).toBeTruthy();
    // záznamem události je vada: řešitel dostane upozornění s odkazem na vadu, autor ne
    const [created] = await notesOf(responsible.id, "defect.new");
    expect(created).toMatchObject({
      title: `${j.number}: nová vada`,
      url: `/realizace/vady/${row.id}`,
      entityType: "defect",
      entityId: row.id,
    });
    expect(created!.body).toContain("Prasklá spára");
    expect(created!.body).toContain("Závažnost: Závažná");
    expect(await notesOf(owner.id, "defect.new")).toEqual([]);
    expect(await notesOf(stranger.id, "defect.new")).toEqual([]);
    const seenByResponsible = await queryRecords(responsible.ctx, registry, E, {});
    expect(seenByResponsible.rows.map((r) => r.id)).toContain(row.id);
    const seenByStranger = await queryRecords(stranger.ctx, registry, E, {});
    expect(seenByStranger.rows.map((r) => r.id)).not.toContain(row.id);
  });
});

describe("upozornění: změny na zakázce", () => {
  it("nová fáze, sloučené změny harmonogramu (tažení v Ganttu) a dokončení fáze jdou týmu, ne tomu, kdo změnu udělal", async () => {
    const owner = await boss();
    const member = await person();
    const outsider = await person();
    const j = await newJob(owner.id);
    await app.db.insert(jobMember).values({ jobId: j.id, userId: member.id });
    const added = await phasesSave.handler(
      owner.ctx,
      phaseInput(j.id, "Hrubá stavba", "2026-11-02", "2026-11-06", { responsibleId: member.id }),
      deps(),
    );
    const [first] = await notesOf(member.id, "realizace.phase_added");
    expect(first).toMatchObject({
      title: `${j.number}: nová fáze`,
      body: "Hrubá stavba · 2. 11. 2026 – 6. 11. 2026",
      url: `/zakazky/${j.id}?tab=realizace&sub=harmonogram`,
    });

    for (const [from, to] of [
      ["2026-11-03", "2026-11-06"],
      ["2026-11-04", "2026-11-09"],
      ["2026-11-05", "2026-11-10"],
    ] as const)
      await phasesMove.handler(
        owner.ctx,
        { jobId: j.id, id: added.id, startDate: from, endDate: to, shift: true },
        deps(),
      );
    const schedule = await notesOf(member.id, "job.schedule");
    expect(schedule).toHaveLength(1);
    expect(schedule[0]).toMatchObject({
      title: `${j.number}: změna harmonogramu (3×)`,
      body: "Hrubá stavba · 5. 11. 2026 – 10. 11. 2026",
      count: 3,
    });

    await phasesSetProgress.handler(
      owner.ctx,
      { jobId: j.id, id: added.id, progress: 100 },
      deps(),
    );
    const [done] = await notesOf(member.id, "realizace.phase_done");
    expect(done).toMatchObject({
      title: `${j.number}: Hrubá stavba hotovo`,
      body: "Fáze dokončena",
    });
    expect(await notesOf(owner.id)).toEqual([]);
    expect(await notesOf(outsider.id)).toEqual([]);
  });

  it("zahájení realizace otevře deník a upozorní tým s odkazem na záložku Deník", async () => {
    const owner = await boss();
    const member = await person();
    const j = await newJob(owner.id);
    await app.db.insert(jobMember).values({ jobId: j.id, userId: member.id });
    const hook = phaseHooks.find((h) => h.id === "realizace.open-diary")!;
    await hook.after!(
      owner.ctx,
      { id: j.id } as never,
      { from: "preparation", to: "execution" } as never,
    );
    const [n] = await notesOf(member.id, "job.diary");
    expect(n).toMatchObject({
      title: `${j.number}: zahájena realizace`,
      url: `/zakazky/${j.id}?tab=realizace&sub=denik`,
    });
    // návrat z pozastavení deník znovu neotevírá
    await hook.after!(
      owner.ctx,
      { id: j.id } as never,
      { from: "paused", to: "execution" } as never,
    );
    expect(await notesOf(member.id, "job.diary")).toHaveLength(1);
  });

  it("přidělená vada upozorní nového řešitele (ne autora změny a ne původního řešitele)", async () => {
    const owner = await boss();
    const first = await person();
    const next = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["realizace.read", "own"],
      ["realizace.write", "own"],
    ]);
    const j = await newJob(owner.id);
    const E = await resolveEntity(app.db, defectEntity);
    const { row } = await createRecord(owner.ctx, registry, E, {
      title: "Netěsné okno",
      job: j.id,
      responsible: first.id,
      dueDate: "2026-11-20",
    });
    await updateRecord(owner.ctx, registry, E, row.id, { responsible: next.id });
    const [n] = await notesOf(next.id, "defect.assigned");
    expect(n).toMatchObject({
      title: "Máte řešit vadu",
      url: `/realizace/vady/${row.id}`,
      entityId: row.id,
    });
    expect(n!.body).toBe(`Netěsné okno\nZakázka ${j.number}\nTermín opravy: 20. 11. 2026`);
    expect(await notesOf(first.id, "defect.assigned")).toEqual([]);
    expect(await notesOf(owner.id, "defect.assigned")).toEqual([]);
    // sebe sama si nepřiděluji
    await updateRecord(next.ctx, registry, E, row.id, { responsible: next.id });
    expect(await notesOf(next.id, "defect.assigned")).toHaveLength(1);
  });
});

describe("upozornění: Dnes na stavbě", () => {
  it("ranní přehled dostane vedoucí, tým i odpovědný za fázi; odpovědný mimo tým jen své fáze; jednou za den", async () => {
    const mgr = await person();
    const member = await person();
    const resp = await person();
    const outsider = await person();
    const j1 = await newJob(mgr.id);
    const j2 = await newJob(mgr.id);
    await app.db.insert(jobMember).values({ jobId: j1.id, userId: member.id });
    await addPhase(j1.id, "Hrubá stavba", "2026-11-02", "2026-11-06", {
      ...running,
      responsibleId: resp.id,
      position: 0,
    });
    await addPhase(j1.id, "Elektro", "2026-11-02", "2026-11-04", { ...running, position: 1 });
    await addPhase(j1.id, "Hotová", "2026-11-02", "2026-11-06", { status: "done", progress: 100 });
    await addPhase(j1.id, "Budoucí", "2026-11-09", "2026-11-10");
    await addPhase(j2.id, "Fasáda", "2026-11-03", "2026-11-05", running);

    await sendMorningOverview(app.db, prague("2026-11-03", "06:00"));
    const [m] = await notesOf(mgr.id, "realizace.today");
    expect(m).toMatchObject({ title: "Dnes na stavbě: 2 zakázky", url: "/realizace" });
    expect(m!.body).toContain(`${j1.number} · Hrubá stavba, Elektro`);
    expect(m!.body).toContain(`${j2.number} · Fasáda`);
    expect(m!.body).not.toContain("Budoucí");
    expect(m!.body).not.toContain("Hotová");
    const [t] = await notesOf(member.id, "realizace.today");
    expect(t).toMatchObject({ title: "Dnes na stavbě: 1 zakázka" });
    expect(t!.body).toBe(`${j1.number} · Hrubá stavba, Elektro`);
    const [r] = await notesOf(resp.id, "realizace.today");
    expect(r!.body).toBe(`${j1.number} · Hrubá stavba`);
    expect(await notesOf(outsider.id)).toEqual([]);

    // opakované spuštění téhož dne nic nezdvojí, další pracovní den přijde nový přehled
    await sendMorningOverview(app.db, prague("2026-11-03", "09:00"));
    expect(await notesOf(mgr.id, "realizace.today")).toHaveLength(1);
    await sendMorningOverview(app.db, prague("2026-11-04", "06:00"));
    expect(await notesOf(mgr.id, "realizace.today")).toHaveLength(2);
    // víkend a státní svátek se přeskočí
    await sendMorningOverview(app.db, prague("2026-11-07", "06:00"));
    expect(await notesOf(mgr.id, "realizace.today")).toHaveLength(2);
  });

  it("pozastavená a uzavřená zakázka ani zakázka bez práva čtení realizace se v přehledu neukáže", async () => {
    const mgr = await person();
    const noAccess = await makeUser(app.db, [["zakazky.read", "own"]]);
    const live = await newJob(mgr.id);
    const paused = await newJob(mgr.id);
    const hidden = await newJob(noAccess.id);
    await app.db.update(job).set({ phase: "paused" }).where(eq(job.id, paused.id));
    for (const j of [live, paused, hidden])
      await addPhase(j.id, "Práce", "2026-11-09", "2026-11-13", running);
    await sendMorningOverview(app.db, prague("2026-11-10", "06:00"));
    const [m] = await notesOf(mgr.id, "realizace.today");
    expect(m!.title).toBe("Dnes na stavbě: 1 zakázka");
    expect(m!.body).toBe(`${live.number} · Práce`);
    expect(await notesOf(noAccess.id)).toEqual([]);
  });

  it.each([
    // [název, místní den, čas před půlnocí (neděle), čas po půlnoci (pondělí)]
    ["jarní přechod na letní čas", "2026-03-30", "2026-03-29T21:30:00Z", "2026-03-29T22:30:00Z"],
    ["podzimní přechod na zimní čas", "2026-10-26", "2026-10-25T22:30:00Z", "2026-10-25T23:30:00Z"],
  ])("hranice dne drží přes %s", async (_name, monday, sundayEvening, mondayNight) => {
    const mgr = await person();
    const j = await newJob(mgr.id);
    await addPhase(j.id, "Přes změnu času", "2026-03-23", "2026-11-13", running);
    // 23:30 v neděli je ještě neděle: nic nepřijde
    await sendMorningOverview(app.db, new Date(sundayEvening));
    expect(await notesOf(mgr.id, "realizace.today")).toHaveLength(0);
    // 00:30 v pondělí je už pondělí (v UTC je to ještě neděle)
    await sendMorningOverview(app.db, new Date(mondayNight));
    expect(await notesOf(mgr.id, "realizace.today")).toHaveLength(1);
    // ranní běh téhož pondělí je tentýž den: deduplikace
    await sendMorningOverview(app.db, prague(monday, "06:00"));
    expect(await notesOf(mgr.id, "realizace.today")).toHaveLength(1);
    // následující den je nový
    const tuesday = new Date(prague(monday, "06:00").getTime() + 24 * 3600_000);
    await sendMorningOverview(app.db, tuesday);
    expect(await notesOf(mgr.id, "realizace.today")).toHaveLength(2);
  });
});

describe("upozornění: začátek a konec fáze", () => {
  it("fáze začíná: odpovědný a tým, jednou; začátek o víkendu se připomene v pondělí; rozjetá fáze ne", async () => {
    const mgr = await person();
    const member = await person();
    const resp = await person();
    const j = await newJob(mgr.id);
    await app.db.insert(jobMember).values([
      { jobId: j.id, userId: member.id },
      { jobId: j.id, userId: resp.id },
    ]);
    await addPhase(j.id, "Bourání", "2026-11-09", "2026-11-12", { responsibleId: resp.id });
    await addPhase(j.id, "Víkendový start", "2026-11-14", "2026-11-18");
    await addPhase(j.id, "Už běží", "2026-11-09", "2026-11-12", running);

    expect((await sendPhaseStarts(app.db, prague("2026-11-09", "06:10"))).created).toBeGreaterThan(
      0,
    );
    const [r] = await notesOf(resp.id, "realizace.phase_starts");
    expect(r).toMatchObject({
      title: `${j.number}: začíná Bourání`,
      body: "Termín: 9. 11. 2026 – 12. 11. 2026",
      url: `/zakazky/${j.id}?tab=realizace&sub=harmonogram`,
    });
    expect(await notesOf(member.id, "realizace.phase_starts")).toHaveLength(1);
    expect(await notesOf(mgr.id, "realizace.phase_starts")).toHaveLength(1);

    // opakování téhož dne i další den nic nezdvojí
    await sendPhaseStarts(app.db, prague("2026-11-09", "07:00"));
    await sendPhaseStarts(app.db, prague("2026-11-10", "06:10"));
    expect(await notesOf(resp.id, "realizace.phase_starts")).toHaveLength(1);

    // sobotní začátek se ohlásí první pracovní den, tedy v pondělí 16. 11., a jen jednou
    await sendPhaseStarts(app.db, prague("2026-11-13", "06:10"));
    expect(await notesOf(resp.id, "realizace.phase_starts")).toHaveLength(1);
    await sendPhaseStarts(app.db, prague("2026-11-16", "06:10"));
    const starts = await notesOf(resp.id, "realizace.phase_starts");
    expect(starts.map((n) => n.title)).toEqual([
      `${j.number}: začíná Bourání`,
      `${j.number}: začíná Víkendový start`,
    ]);
    await sendPhaseStarts(app.db, prague("2026-11-17", "06:10"));
    expect(await notesOf(resp.id, "realizace.phase_starts")).toHaveLength(2);
  });

  it("blížící se konec (zítra, dnes) a zpoždění: odpovědný a vedoucí, každý stupeň jednou, zpoždění je naléhavé", async () => {
    const mgr = await person();
    const resp = await person();
    const j = await newJob(mgr.id);
    await app.db.insert(jobMember).values({ jobId: j.id, userId: resp.id });
    await addPhase(j.id, "Omítky", "2026-11-02", "2026-11-06", {
      ...running,
      progress: 60,
      responsibleId: resp.id,
    });
    await addPhase(j.id, "Malování", "2026-11-02", "2026-11-05", running);
    await addPhase(j.id, "Jednodenní", "2026-11-06", "2026-11-06");
    await addPhase(j.id, "Hotovo", "2026-11-02", "2026-11-06", { status: "done", progress: 100 });
    await addPhase(j.id, "Zpožděná", "2026-11-02", "2026-11-04", {
      ...running,
      responsibleId: resp.id,
    });

    // čtvrtek 5. 11.: Omítky končí zítra, Malování dnes, Zpožděná měla skončit včera
    const thursday = prague("2026-11-05", "06:10");
    const res = await sendPhaseDeadlines(app.db, thursday);
    expect(res).toMatchObject({ upcoming: expect.any(Number), overdue: expect.any(Number) });
    // odpovědný dostane jen svou fázi
    const upcoming = await notesOf(resp.id, "realizace.phase_deadline");
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]).toMatchObject({
      title: `${j.number}: Omítky končí zítra`,
      body: "Termín: 2. 11. 2026 – 6. 11. 2026\nPrůběh: 60 %",
      url: `/zakazky/${j.id}?tab=realizace&sub=harmonogram`,
    });
    // Malování nemá odpovědného: vedoucí ho dostane, jednodenní fáze a hotová ne
    const mgrNotes = await notesOf(mgr.id, "realizace.phase_deadline");
    expect(mgrNotes.map((n) => n.title).sort()).toEqual(
      [`${j.number}: Malování končí dnes`, `${j.number}: Omítky končí zítra`].sort(),
    );
    const [late] = await notesOf(resp.id, "realizace.phase_overdue");
    expect(late).toMatchObject({
      title: `${j.number}: Zpožděná je po termínu`,
      body: "Termín byl 4. 11. 2026\nPrůběh: 30 %",
      severity: "urgent",
    });
    expect(await notesOf(mgr.id, "realizace.phase_overdue")).toHaveLength(1);

    // opakování téhož dne nic nezdvojí
    await sendPhaseDeadlines(app.db, prague("2026-11-05", "12:00"));
    expect(await notesOf(resp.id, "realizace.phase_deadline")).toHaveLength(upcoming.length);
    expect(await notesOf(resp.id, "realizace.phase_overdue")).toHaveLength(1);

    // pátek: Omítky končí dnes (nový stupeň), zpoždění se neopakuje; Malování je od čtvrtka po termínu
    await sendPhaseDeadlines(app.db, prague("2026-11-06", "06:10"));
    const friday = await notesOf(resp.id, "realizace.phase_deadline");
    expect(friday.map((n) => n.title)).toContain(`${j.number}: Omítky končí dnes`);
    expect((await notesOf(mgr.id, "realizace.phase_overdue")).map((n) => n.title)).toEqual([
      `${j.number}: Zpožděná je po termínu`,
      `${j.number}: Malování je po termínu`,
    ]);
    expect(await notesOf(resp.id, "realizace.phase_overdue")).toHaveLength(1);

    // posunutý termín se po novém zpoždění připomene znovu
    await app.db
      .update(jobPhase)
      .set({ endDate: "2026-11-09" })
      .where(and(eq(jobPhase.jobId, j.id), eq(jobPhase.name, "Zpožděná")));
    await sendPhaseDeadlines(app.db, prague("2026-11-10", "06:10"));
    expect((await notesOf(resp.id, "realizace.phase_overdue")).map((n) => n.title).sort()).toEqual(
      [
        `${j.number}: Zpožděná je po termínu`,
        `${j.number}: Zpožděná je po termínu`,
        `${j.number}: Omítky je po termínu`,
      ].sort(),
    );
    // o víkendu se neposílá nic
    const before = (await notesOf(resp.id)).length;
    await sendPhaseDeadlines(app.db, prague("2026-11-14", "06:10"));
    expect((await notesOf(resp.id)).length).toBe(before);
  });

  it("termíny a začátky drží hranici dne i přes přechod na letní čas", async () => {
    const mgr = await person();
    const j = await newJob(mgr.id);
    // pondělí 30. 3. 2026 je první den po jarním posunu hodin
    await addPhase(j.id, "Start po změně času", "2026-03-30", "2026-04-02");
    await addPhase(j.id, "Konec po změně času", "2026-03-25", "2026-03-31", running);
    // 00:30 v pondělí (v UTC ještě neděle) už je pondělí
    await sendPhaseStarts(app.db, new Date("2026-03-29T22:30:00Z"));
    await sendPhaseDeadlines(app.db, new Date("2026-03-29T22:30:00Z"));
    expect((await notesOf(mgr.id, "realizace.phase_starts")).map((n) => n.title)).toEqual([
      `${j.number}: začíná Start po změně času`,
    ]);
    expect((await notesOf(mgr.id, "realizace.phase_deadline")).map((n) => n.title)).toEqual([
      `${j.number}: Konec po změně času končí zítra`,
    ]);
    // ranní běh téhož dne nic nezdvojí
    await sendPhaseStarts(app.db, prague("2026-03-30", "06:10"));
    await sendPhaseDeadlines(app.db, prague("2026-03-30", "06:10"));
    expect(await notesOf(mgr.id, "realizace.phase_starts")).toHaveLength(1);
    expect(await notesOf(mgr.id, "realizace.phase_deadline")).toHaveLength(1);
  });
});

describe("upozornění: chybí zápis do deníku", () => {
  it("jednou za den připomene zápis týmu zakázky v realizaci, na které se dnes pracuje a deník je prázdný", async () => {
    const mgr = await person();
    const member = await person();
    const outsider = await person();
    const worked = await newJob(mgr.id); // fáze běží, deník chybí
    const written = await newJob(mgr.id); // deník dnes zapsaný
    const finished = await newJob(mgr.id); // všechny fáze hotové
    const noPlan = await newJob(mgr.id); // bez harmonogramu
    const preparing = await newJob(mgr.id); // ještě není v realizaci
    for (const j of [worked, written, finished, noPlan])
      await app.db.update(job).set({ phase: "execution" }).where(eq(job.id, j.id));
    await app.db.insert(jobMember).values({ jobId: worked.id, userId: member.id });
    await addPhase(worked.id, "Hrubá stavba", "2026-11-02", "2026-11-13", running);
    await addPhase(written.id, "Hrubá stavba", "2026-11-02", "2026-11-13", running);
    await addPhase(finished.id, "Hotová", "2026-11-02", "2026-11-13", {
      status: "done",
      progress: 100,
    });
    await addPhase(preparing.id, "Příprava", "2026-11-02", "2026-11-13", running);
    await app.db.insert(siteDiary).values({ jobId: written.id, date: "2026-11-04", work: "Zdění" });

    await sendDiaryReminders(app.db, prague("2026-11-04", "16:00"));
    const titles = (await notesOf(mgr.id, "realizace.diary_missing")).map((n) => n.title).sort();
    expect(titles).toEqual(
      [`${worked.number}: chybí zápis do deníku`, `${noPlan.number}: chybí zápis do deníku`].sort(),
    );
    const [m] = await notesOf(member.id, "realizace.diary_missing");
    expect(m).toMatchObject({
      title: `${worked.number}: chybí zápis do deníku`,
      body: "Dnešní zápis ve stavebním deníku zatím není.",
      url: `/zakazky/${worked.id}?tab=realizace&sub=denik`,
    });
    expect(await notesOf(outsider.id)).toEqual([]);

    // téhož dne se neopakuje, další pracovní den znovu, o víkendu ne
    await sendDiaryReminders(app.db, prague("2026-11-04", "17:30"));
    expect(await notesOf(member.id, "realizace.diary_missing")).toHaveLength(1);
    await sendDiaryReminders(app.db, prague("2026-11-05", "16:00"));
    expect(await notesOf(member.id, "realizace.diary_missing")).toHaveLength(2);
    await sendDiaryReminders(app.db, prague("2026-11-07", "16:00"));
    expect(await notesOf(member.id, "realizace.diary_missing")).toHaveLength(2);

    // zápis dne připomínku zruší
    await app.db.insert(siteDiary).values({ jobId: worked.id, date: "2026-11-09", work: "Zdění" });
    await sendDiaryReminders(app.db, prague("2026-11-09", "16:00"));
    expect(await notesOf(member.id, "realizace.diary_missing")).toHaveLength(2);
  });
});
