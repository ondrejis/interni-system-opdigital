import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  queryRecords,
  registerEntityPolicies,
  resolveEntity,
  updateRecord,
  type EntityRegistry,
  type ResolvedEntity,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { UserError } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { validateEventDefs } from "@rebar/core/notifications";
import { manifest } from "./index";
import { POPTAVKY_NOTIFICATIONS } from "./notifications";
import {
  inquiryEntity,
  convertCommand,
  markLostCommand,
  receiveInquiry,
  createIntakeKeyCommand,
  revokeIntakeKeyCommand,
  IntakeAuthError,
} from "./server";
import { intakeKey, intakeLog, inquiry } from "./schema";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let E: ResolvedEntity;
let stages: { id: string; name: string; kind: string }[];
const deps = () => ({ registry, baseURL: "http://localhost" }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, inquiryEntity]);
  registerEntityPolicies(registry);
  for (const p of manifest.seed.pipelines) await ensurePipeline(app.db, p);
  for (const l of manifest.seed.lookups) await ensureLookup(app.db, l);
  E = await resolveEntity(app.db, inquiryEntity);
  stages = (await getPipeline(app.db, "inquiry", "default"))!.stages;
});

const stage = (kind: string) => stages.find((s) => s.kind === kind)!;
const sales = (scope: "all" | "own" = "all") =>
  makeUser(app.db, [
    ["poptavky.read", scope],
    ["poptavky.write", scope],
    ["poptavky.convert", "all"],
    ["poptavky.intake", "all"],
  ]);
const mk = (
  u: Awaited<ReturnType<typeof sales>>,
  title: string,
  extra: Record<string, unknown> = {},
) => createRecord(u.ctx, registry, E, { title, ...extra }).then((r) => r.row);

describe("poptávky: pipeline a pravidla", () => {
  it("nová poptávka dostane první otevřený stav a obchodníka s rozsahem „jen moje“ jako vlastníka", async () => {
    const u = await sales("own");
    const row = await mk(u, `Střecha ${randomBytes(3).toString("hex")}`);
    expect(row.stage).toBe(stages.find((s) => s.kind === "open" || !s.kind)!.id);
    expect(row.owner).toBe(u.id);
  });

  it("rozsah „jen moje“: cizí poptávku obchodník nevidí", async () => {
    const a = await sales("own");
    const b = await sales("own");
    const tag = randomBytes(3).toString("hex");
    await mk(a, `A ${tag}`);
    await mk(b, `B ${tag}`);
    const seen = await queryRecords(a.ctx, registry, E, { q: tag });
    expect(seen.rows.map((r) => r.title)).toEqual([`A ${tag}`]);
  });

  it("prohra vyžaduje důvod z číselníku a nastaví stav „prohráno“", async () => {
    const u = await sales();
    const row = await mk(u, `Prohra ${randomBytes(3).toString("hex")}`);
    // bez důvodu přes obecnou úpravu stavu entita odmítne
    await expect(
      updateRecord(u.ctx, registry, E, row.id, { stage: stage("lost").id }),
    ).rejects.toThrow(/důvod prohry/i);
    await expect(
      markLostCommand.handler(u.ctx, { id: row.id, reason: "neexistuje" }, deps()),
    ).rejects.toThrow(/ze seznamu/);
    await markLostCommand.handler(u.ctx, { id: row.id, reason: "price" }, deps());
    const [after] = await app.db.select().from(inquiry).where(eq(inquiry.id, row.id));
    expect(after).toMatchObject({ stageId: stage("lost").id, lostReason: "price" });
  });

  it("zamítnutou poptávku nejde kvalifikovat (ani přímým voláním příkazu)", async () => {
    const u = await sales();
    const row = await mk(u, `Prohraná ${randomBytes(3).toString("hex")}`);
    await markLostCommand.handler(u.ctx, { id: row.id, reason: "price" }, deps());
    await expect(
      convertCommand.handler(u.ctx, { id: row.id, duplicates: "ask" }, deps()),
    ).rejects.toThrow(/Zamítnutou poptávku nejde kvalifikovat/);
  });

  it("kvalifikovanou poptávku nejde vrátit zpět a nejde ji „kvalifikovat“ bez převodu na zakázku", async () => {
    const u = await sales();
    const row = await mk(u, `Výhra ${randomBytes(3).toString("hex")}`);
    await expect(
      updateRecord(u.ctx, registry, E, row.id, { stage: stage("won").id }),
    ).rejects.toThrow(/převodem na zakázku/);
    // simulace převedené poptávky
    await app.db
      .update(inquiry)
      .set({ stageId: stage("won").id, convertedJobId: crypto.randomUUID() })
      .where(eq(inquiry.id, row.id));
    await expect(
      updateRecord(u.ctx, registry, E, row.id, { stage: stage("open").id }),
    ).rejects.toThrow(/nejde vrátit/);
  });
});

describe("příjem poptávek z webu", () => {
  async function newKey() {
    const admin = await sales();
    const { id, secret } = await createIntakeKeyCommand.handler(
      admin.ctx,
      { name: "Test web" },
      deps(),
    );
    return { admin, id, secret };
  }

  it("klíč se ukládá jen jako hash; neplatný klíč se odmítne a zapíše", async () => {
    const { id, secret } = await newKey();
    const [row] = await app.db.select().from(intakeKey).where(eq(intakeKey.id, id));
    expect(row!.keyHash).not.toContain(secret);
    expect(row!.prefix).toBe(secret.slice(0, 7));
    await expect(
      receiveInquiry(app.db, deps(), "pq_spatny", { name: "X" }, "1.2.3.4"),
    ).rejects.toThrow(IntakeAuthError);
    const bad = await app.db.select().from(intakeLog).where(eq(intakeLog.outcome, "invalid_key"));
    expect(bad.length).toBeGreaterThan(0);
  });

  it("platná poptávka vznikne s ověřeným zdrojem, zapíše se a upozorní obchodníky", async () => {
    const { secret, admin } = await newKey();
    const tag = randomBytes(3).toString("hex");
    const { id } = await receiveInquiry(
      app.db,
      deps(),
      secret,
      {
        name: `Jan ${tag}`,
        email: "jan@example.cz",
        phone: "777 123 456",
        company: `Firma ${tag}`,
        message: "Chci novou střechu",
        source: "phone",
      },
      "5.6.7.8",
    );
    const [row] = await app.db.select().from(inquiry).where(eq(inquiry.id, id));
    expect(row).toMatchObject({
      contactName: `Jan ${tag}`,
      companyName: `Firma ${tag}`,
      source: "phone",
      contactEmail: "jan@example.cz",
    });
    expect(row!.title).toContain(`Firma ${tag}`);
    // neznámý zdroj se nahradí výchozím „web“
    const second = await receiveInquiry(
      app.db,
      deps(),
      secret,
      { name: "Eva", source: "nesmysl" },
      null,
    );
    const [r2] = await app.db.select().from(inquiry).where(eq(inquiry.id, second.id));
    expect(r2!.source).toBe("web");
    const notes = await app.db
      .select()
      .from(schema.notification)
      .where(eq(schema.notification.userId, admin.id));
    expect(notes.some((n) => n.entityId === id)).toBe(true);
    const mine = notes.find((n) => n.entityId === id)!;
    expect(mine).toMatchObject({
      kind: "inquiry.new",
      title: expect.stringContaining(`Nová poptávka: Poptávka: Firma ${tag}`),
      body: `Jan ${tag} · Firma ${tag}\nChci novou střechu`,
      url: `/poptavky/${id}`,
    });
  });

  it("nová poptávka bez vlastníka nepřijde obchodníkovi s rozsahem „jen moje“ ani tomu, kdo nesmí poptávky číst", async () => {
    const { secret } = await newKey();
    const own = await sales("own");
    const blind = await makeUser(app.db, [["poptavky.write", "all"]]);
    const { id } = await receiveInquiry(
      app.db,
      deps(),
      secret,
      { name: `Eva ${randomBytes(3).toString("hex")}` },
      null,
    );
    const forUser = (userId: string) =>
      app.db
        .select()
        .from(schema.notification)
        .where(and(eq(schema.notification.userId, userId), eq(schema.notification.entityId, id)));
    expect(await forUser(own.id)).toHaveLength(0);
    expect(await forUser(blind.id)).toHaveLength(0);
  });

  it("neplatná data se odmítnou srozumitelně; zrušený klíč přestane fungovat", async () => {
    const { secret, id, admin } = await newKey();
    await expect(
      receiveInquiry(app.db, deps(), secret, { name: "", email: "x" }, null),
    ).rejects.toThrow(UserError);
    await expect(
      receiveInquiry(app.db, deps(), secret, { name: "Ok", email: "není-email" }, null),
    ).rejects.toThrow(/e-mail/i);
    await revokeIntakeKeyCommand.handler(admin.ctx, { id }, deps());
    await expect(receiveInquiry(app.db, deps(), secret, { name: "Ok" }, null)).rejects.toThrow(
      IntakeAuthError,
    );
  });
});

describe("přidělení poptávky", () => {
  const notesFor = (userId: string, id: string) =>
    app.db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.userId, userId),
          eq(schema.notification.entityId, id),
          eq(schema.notification.kind, "inquiry.assigned"),
        ),
      );

  it("přidělení jinému obchodníkovi ho upozorní, vlastní přidělení nebo změna beze změny vlastníka ne", async () => {
    const boss = await sales();
    const rep = await sales("own");
    const row = await mk(boss, `Přidělení ${randomBytes(3).toString("hex")}`, {
      contactName: "Jan Novák",
      companyName: "Stavby Novák",
      nextStep: "Zavolat do pátku",
    });
    // zakladatel je vlastník sám sobě: nic
    expect(await notesFor(boss.id, row.id)).toHaveLength(0);

    await updateRecord(boss.ctx, registry, E, row.id, { owner: rep.id });
    const [n] = await notesFor(rep.id, row.id);
    expect(n).toMatchObject({
      title: expect.stringMatching(/^Přidělena poptávka: Přidělení /),
      body: "Jan Novák · Stavby Novák\nDalší krok: Zavolat do pátku",
      url: `/poptavky/${row.id}`,
    });

    // jiná úprava vlastníka neznovu neupozorní
    await updateRecord(boss.ctx, registry, E, row.id, { nextStep: "Poslat nabídku" });
    expect(await notesFor(rep.id, row.id)).toHaveLength(1);
    // vrácení sobě: sám sebe neupozorňuje
    await updateRecord(rep.ctx, registry, E, row.id, { owner: rep.id });
    expect(await notesFor(rep.id, row.id)).toHaveLength(1);
  });

  it("poptávka založená rovnou s cizím vlastníkem ho upozorní", async () => {
    const boss = await sales();
    const rep = await sales("own");
    const row = await mk(boss, `Rovnou ${randomBytes(3).toString("hex")}`, { owner: rep.id });
    expect(await notesFor(rep.id, row.id)).toHaveLength(1);
  });
});

describe("události upozornění poptávek", () => {
  it("katalog je platný", () => {
    expect(validateEventDefs(POPTAVKY_NOTIFICATIONS)).toEqual([]);
    expect(manifest.notifications?.map((e) => e.key)).toEqual(
      expect.arrayContaining(["inquiry.new", "inquiry.assigned"]),
    );
  });
});
