import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  getRecord,
  registerEntityPolicies,
  resolveEntity,
  updateRecord,
  type EntityRegistry,
  type ResolvedEntity,
} from "@rebar/core/entities";
import type { EmailVarsProvider } from "@rebar/core/contracts";
import type { ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import { connectAppDb, createStubServices, makeUser } from "@rebar/core/testing";
import { companyEntity, personEntity } from "../packages/modules/kontakty/src/entities";
import { companyEmailVars, personEmailVars } from "../packages/modules/kontakty/src/contributions";
import { emailTemplateEntity } from "../packages/modules/sablony-emailu/src/entities";
import { emailTemplate } from "../packages/modules/sablony-emailu/src/schema";
import {
  emailTemplatesService,
  listTemplates,
  loadTemplate,
  logActivity,
  markUsed,
  pickRecords,
  previewDraft,
  renderTemplate,
  saveContent,
} from "../packages/modules/sablony-emailu/src/service";
import { buildCatalog } from "../packages/modules/sablony-emailu/src/context";
import { commands } from "../packages/modules/sablony-emailu/src/commands";
import { privatePaths } from "../packages/modules/sablony-emailu/src/private";
import { docToText } from "../packages/modules/sablony-emailu/src/logic";

/*
  Integrační testy modulu Šablony e-mailů (SAB): entita šablony (text, odvozené tělo), render proměnných z kontaktů
  a organizací, adresát a Gmail URL (R-46), počítadlo použití, zápis aktivity přes službu `tasks`, uložení z editoru,
  soukromí (zámek šablon i záznamů, ze kterých se píše) a služba `emailTemplates` pro knihovnu v Můj prostor.
  Obchody a zakázky se zde nezkouší (jiné moduly); jejich příspěvek je v katalogu stub `dealVars`.
*/

const app = connectAppDb();
afterAll(() => app.close());

const dealVars: EmailVarsProvider = {
  entityType: "deal",
  vars: [{ key: "obchod", label: "Název obchodu" }],
  resolve: async () => ({ obchod: "Nový web" }),
};

let registry: EntityRegistry;
let tplE: ResolvedEntity;
let companyE: ResolvedEntity;
let personE: ResolvedEntity;
const stub = (tasks: boolean) =>
  createStubServices({
    ...(tasks ? { tasks: true as const } : {}),
    contributions: { emailVars: [personEmailVars, companyEmailVars, dealVars] },
  });
const deps = (tasks = false) => {
  const s = stub(tasks);
  return { deps: { registry, services: s.services } as unknown as ModuleDeps, calls: s.calls };
};

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([emailTemplateEntity, companyEntity, personEntity]);
  registerEntityPolicies(registry);
  tplE = await resolveEntity(app.db, emailTemplateEntity);
  companyE = await resolveEntity(app.db, companyEntity);
  personE = await resolveEntity(app.db, personEntity);
});

const tag = () => randomBytes(4).toString("hex");
const boss = () =>
  makeUser(
    app.db,
    [
      ["sablony-emailu.read", "all"],
      ["sablony-emailu.create", "all"],
      ["sablony-emailu.write", "all"],
      ["sablony-emailu.delete", "all"],
      ["kontakty.read", "all"],
      ["kontakty.create", "all"],
      ["kontakty.write", "all"],
      ["private.read", "all"],
    ],
    { name: "Ondřej Dvořák" },
  );
const partner = () =>
  makeUser(app.db, [
    ["sablony-emailu.read", "all"],
    ["sablony-emailu.create", "all"],
    ["sablony-emailu.write", "all"],
    ["kontakty.read", "all"],
  ]);
const reader = () =>
  makeUser(app.db, [
    ["sablony-emailu.read", "all"],
    ["kontakty.read", "all"],
  ]);
type User = Awaited<ReturnType<typeof boss>>;

const mkTpl = (u: User, v: Record<string, unknown> = {}) =>
  createRecord(u.ctx, registry, tplE, {
    name: `Šablona ${tag()}`,
    category: "Follow-up",
    language: "cs",
    subject: "Nabídka pro {firma}",
    bodyText: "Dobrý den {jmeno},\n\nposílám nabídku.\n\n{odesilatel}",
    ...v,
  }).then((r) => r.row);
const mkCompany = (u: User, v: Record<string, unknown> = {}) =>
  createRecord(u.ctx, registry, companyE, { name: `Novák ${tag()} s.r.o.`, ...v }).then(
    (r) => r.row,
  );
const mkPerson = (u: User, v: Record<string, unknown>) =>
  createRecord(u.ctx, registry, personE, v).then((r) => r.row);
const raw = async (id: string) =>
  (await app.db.select().from(emailTemplate).where(eq(emailTemplate.id, id)))[0]!;

describe("entita šablony", () => {
  it("text se uloží, tělo jako dokument se odvodí z textu při vytvoření i úpravě", async () => {
    const u = await boss();
    const t = await mkTpl(u, { bodyText: "Řádek 1\nŘádek 2" });
    const r1 = await raw(t.id);
    expect(r1.bodyText).toBe("Řádek 1\nŘádek 2");
    expect(docToText(r1.bodyJson)).toBe("Řádek 1\nŘádek 2");
    expect(r1.usageCount).toBe(0);
    expect(r1.language).toBe("cs");

    await updateRecord(u.ctx, registry, tplE, t.id, { bodyText: "Nový text\n- odrážka" });
    expect(docToText((await raw(t.id)).bodyJson)).toBe("Nový text\n- odrážka");
  });

  it("počítadlo použití klient zadat nemůže (jen pro čtení)", async () => {
    const u = await boss();
    const t = await mkTpl(u, { usageCount: 99 });
    expect((await raw(t.id)).usageCount).toBe(0);
    await expect(updateRecord(u.ctx, registry, tplE, t.id, { usageCount: 5 })).rejects.toThrow();
  });

  it("šablony jsou sdílené: partner vidí šablonu vlastníka a může ji číst", async () => {
    const owner = await boss();
    const other = await partner();
    const t = await mkTpl(owner);
    const { row } = await getRecord(other.ctx, registry, tplE, t.id);
    expect(row.name).toBe(t.name);
  });

  it("soukromá šablona je vidět jen vlastníkovi (seznam, načtení, výběr v dialogu)", async () => {
    const owner = await boss();
    const other = await partner();
    const name = `PRIVATE-CANARY-${tag()}`;
    const t = await mkTpl(owner, { name, isPrivate: true });
    const { deps: d } = deps();
    expect((await listTemplates(owner.ctx, d, {})).some((x) => x.id === t.id)).toBe(true);
    expect(JSON.stringify(await listTemplates(other.ctx, d, {}))).not.toContain(name);
    await expect(loadTemplate(other.ctx, d, t.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(markUsed(other.ctx, d, t.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("výběr šablon (SAB-01)", () => {
  it("nejpoužívanější první, filtr jazyka a kategorie a hledání bez diakritiky v názvu", async () => {
    const u = await boss();
    const t = tag();
    const a = await mkTpl(u, { name: `Zkouška A ${t}`, category: `Kat ${t}`, language: "cs" });
    const b = await mkTpl(u, { name: `Zkouška B ${t}`, category: `Kat ${t}`, language: "sk" });
    const c = await mkTpl(u, { name: `Zkouška C ${t}`, category: `Jina ${t}`, language: "cs" });
    const { deps: d } = deps();
    await markUsed(u.ctx, d, b.id);
    await markUsed(u.ctx, d, b.id);
    await markUsed(u.ctx, d, a.id);

    const all = await listTemplates(u.ctx, d, { q: `Zkouška` });
    const mine = all.filter((x) => [a.id, b.id, c.id].includes(x.id));
    expect(mine.map((x) => x.id)).toEqual([b.id, a.id, c.id]);
    expect(mine[0]).toMatchObject({ usageCount: 2, language: "sk" });

    expect((await listTemplates(u.ctx, d, { q: t, language: "sk" })).map((x) => x.id)).toEqual([
      b.id,
    ]);
    expect(
      (await listTemplates(u.ctx, d, { q: t, category: `Kat ${t}` })).map((x) => x.id).sort(),
    ).toEqual([a.id, b.id].sort());
    expect((await listTemplates(u.ctx, d, { q: "zkouska a " + t })).map((x) => x.id)).toEqual([
      a.id,
    ]);
  });
});

describe("render e-mailu ze šablony (SAB-02, SAB-03)", () => {
  it("kontakt: křestní jméno, firma, odesílatel, adresát a Gmail URL s diakritikou", async () => {
    const u = await boss();
    const firm = await mkCompany(u, { name: "Žďárská stavební s.r.o." });
    const p = await mkPerson(u, {
      firstName: "Jana",
      lastName: "Nováková",
      email: "jana@example.cz",
      company: firm.id,
    });
    const t = await mkTpl(u, { subject: "Nabídka pro {firma}" });
    const { deps: d } = deps();
    const r = await renderTemplate(u.ctx, d, { entityType: "person", id: p.id, templateId: t.id });
    expect(r.subject).toBe("Nabídka pro Žďárská stavební s.r.o.");
    expect(r.body).toBe(
      "Dobrý den Jano,\n\nposílám nabídku.\n\nOndřej Dvořák".replace("Jano", "Jana"),
    );
    expect(r.to).toBe("jana@example.cz");
    expect(r.missing).toEqual([]);
    expect(r.filled).toBe(true);
    expect(r.labels.person).toContain("Nováková");

    const url = new URL(r.gmailUrl!);
    expect(url.hostname).toBe("mail.google.com");
    expect(url.searchParams.get("to")).toBe("jana@example.cz");
    expect(url.searchParams.get("su")).toBe("Nabídka pro Žďárská stavební s.r.o.");
    expect(url.searchParams.get("body")).toBe(r.body);
    expect(r.gmailUrl).toContain("%C5%BD%C4%8F%C3%A1rsk%C3%A1"); // „Žďárská“ jako UTF-8
  });

  it("organizace: oslovení a e-mail z hlavního kontaktu, jinak e-mail organizace", async () => {
    const u = await boss();
    const firm = await mkCompany(u, { email: "info@firma.cz" });
    const { deps: d } = deps();
    const t = await mkTpl(u, { subject: "{firma}", bodyText: "Dobrý den {jmeno}" });

    const none = await renderTemplate(u.ctx, d, {
      entityType: "company",
      id: firm.id,
      templateId: t.id,
    });
    expect(none.to).toBe("info@firma.cz"); // bez kontaktu adresa organizace
    expect(none.missing).toEqual(["jmeno"]); // chybějící proměnná, ne chyba
    expect(none.body).toBe("Dobrý den");

    await mkPerson(u, {
      firstName: "Petr",
      lastName: "Svoboda",
      email: "petr@firma.cz",
      company: firm.id,
      isDecisionMaker: true,
    });
    const withContact = await renderTemplate(u.ctx, d, {
      entityType: "company",
      id: firm.id,
      templateId: t.id,
    });
    expect(withContact.body).toBe("Dobrý den Petr");
    expect(withContact.to).toBe("petr@firma.cz");
    expect(withContact.missing).toEqual([]);
  });

  it("chybějící hodnota: prázdné místo, zvýrazněná část a upozornění; neznámá proměnná zůstane", async () => {
    const u = await boss();
    const p = await mkPerson(u, { lastName: `Bezfirmy ${tag()}` });
    const t = await mkTpl(u, { subject: "{firma} {zakazka}", bodyText: "Ahoj {jmeno}, {preklep}" });
    const { deps: d } = deps();
    const r = await renderTemplate(u.ctx, d, { entityType: "person", id: p.id, templateId: t.id });
    expect(r.subject).toBe("");
    expect(r.missing.sort()).toEqual(["firma", "zakazka"]);
    expect(r.unknown).toEqual(["preklep"]);
    expect(r.body).toContain("{preklep}");
    expect(r.to).toBeNull(); // kontakt nemá e-mail: Gmail se otevře bez adresáta
    expect(r.gmailUrl).not.toContain("to=");
    expect(r.bodyParts.some((x) => x.kind === "unknown" && x.key === "preklep")).toBe(true);
  });

  it("příliš dlouhý e-mail nemá Gmail URL, jen text ke kopírování (R-46)", async () => {
    const u = await boss();
    const p = await mkPerson(u, { lastName: `Dlouhý ${tag()}`, email: "a@b.cz" });
    const t = await mkTpl(u, { bodyText: "Žluťoučký kůň úpěl ďábelské ódy. ".repeat(300) });
    const { deps: d } = deps();
    const r = await renderTemplate(u.ctx, d, { entityType: "person", id: p.id, templateId: t.id });
    expect(r.tooLong).toBe(true);
    expect(r.gmailUrl).toBeNull();
    expect(r.mailtoUrl).toBeNull();
    expect(r.body.length).toBeGreaterThan(5000);
  });

  it("hodnoty se vkládají jako text (HTML z dat se neinterpretuje ani nevyhodnocuje)", async () => {
    const u = await boss();
    const firm = await mkCompany(u, { name: "<script>alert(1)</script> & {jmeno}" });
    const t = await mkTpl(u, { subject: "{firma}", bodyText: "{firma}" });
    const { deps: d } = deps();
    const r = await renderTemplate(u.ctx, d, {
      entityType: "company",
      id: firm.id,
      templateId: t.id,
    });
    // vložená hodnota se nevyhodnocuje podruhé: `{jmeno}` uvnitř názvu zůstane
    expect(r.body).toBe("<script>alert(1)</script> & {jmeno}");
  });

  it("náhled rozepsané šablony s vybraným záznamem a bez něj", async () => {
    const u = await boss();
    const p = await mkPerson(u, { firstName: "Eva", lastName: "Krátká", email: "eva@x.cz" });
    const { deps: d } = deps();
    const without = await previewDraft(u.ctx, d, {
      subject: "Ahoj {jmeno}",
      body: "Text {firma} {obchod}",
      context: {},
    });
    expect(without.filled).toBe(false);
    expect(without.subject).toBe("Ahoj {jmeno}");
    expect(without.missing).toEqual([]);

    const withPerson = await previewDraft(u.ctx, d, {
      subject: "Ahoj {jmeno}",
      body: "Text {firma} {obchod}",
      context: { personId: p.id },
    });
    expect(withPerson.subject).toBe("Ahoj Eva");
    expect(withPerson.missing.sort()).toEqual(["firma", "obchod"]);
    expect(withPerson.to).toBe("eva@x.cz");
  });

  it("katalog proměnných: příspěvky modulů a výchozí (nedostupné) a vždy odesílatel", async () => {
    const full = buildCatalog(deps().deps);
    expect(full.find((v) => v.key === "obchod")).toMatchObject({ source: "deal", available: true });
    expect(full.find((v) => v.key === "firma")).toMatchObject({ source: "company" });
    expect(full.find((v) => v.key === "odesilatel")).toMatchObject({ source: "sender" });
    expect(full.find((v) => v.key === "zakazka")).toMatchObject({ available: false });
    const bare = buildCatalog({ services: createStubServices().services });
    expect(bare.find((v) => v.key === "jmeno")).toMatchObject({ available: false });
    expect(bare.find((v) => v.key === "odesilatel")?.available).toBe(true);
  });

  it("obchod a zakázka bez zapnutého modulu: srozumitelné „nenalezeno“", async () => {
    const u = await boss();
    const t = await mkTpl(u);
    const { deps: d } = deps();
    await expect(
      renderTemplate(u.ctx, d, {
        entityType: "deal",
        id: "11111111-1111-4111-8111-111111111111",
        templateId: t.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("soukromí záznamů, ze kterých se píše", () => {
  it("soukromou organizaci ani osobu partner nevykreslí a v odpovědi nic nepronikne", async () => {
    const owner = await boss();
    const other = await partner();
    const canary = `PRIVATE-CANARY-${tag()}`;
    const firm = await mkCompany(owner, { name: canary, isPrivate: true });
    const p = await mkPerson(owner, {
      lastName: canary,
      email: "secret@example.cz",
      isPrivate: true,
    });
    const t = await mkTpl(owner, { subject: "{firma}", bodyText: "{jmeno}" });
    const { deps: d } = deps();

    for (const [entityType, id] of [
      ["company", firm.id],
      ["person", p.id],
    ] as const) {
      await expect(
        renderTemplate(other.ctx, d, { entityType, id, templateId: t.id }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(
        (await renderTemplate(owner.ctx, d, { entityType, id, templateId: t.id })).filled,
      ).toBe(true);
    }
    // náhled s ručně zadaným ID soukromého záznamu
    await expect(
      previewDraft(other.ctx, d, {
        subject: "{firma}",
        body: "x",
        context: { companyId: firm.id },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // výběr záznamů pro náhled
    expect(
      JSON.stringify(await pickRecords(other.ctx, d, { kind: "company", q: canary })),
    ).not.toContain(canary);
    expect((await pickRecords(owner.ctx, d, { kind: "company", q: canary })).length).toBe(1);

    // canary cesty modulu: partner nesmí v odpovědi nic soukromého vidět
    for (const path of privatePaths) {
      const out = JSON.stringify(await path.run(other.ctx, d));
      expect(out, path.name).not.toContain(canary);
      expect(out, path.name).not.toContain("secret@example.cz");
    }
    // vlastník je vidí
    const ownerOut = JSON.stringify(await privatePaths[1]!.run(owner.ctx, d));
    expect(ownerOut).toContain(canary);
  });
});

describe("použití a zápis aktivity (SAB-04)", () => {
  it("markUsed zvyšuje počítadlo atomicky (souběžná použití se neztratí)", async () => {
    const u = await boss();
    const t = await mkTpl(u);
    const { deps: d } = deps(true);
    const results = await Promise.all(Array.from({ length: 6 }, () => markUsed(u.ctx, d, t.id)));
    expect(results.every((r) => r.canLogActivity)).toBe(true);
    expect((await raw(t.id)).usageCount).toBe(6);
    expect(new Set(results.map((r) => r.usageCount)).size).toBe(6);
  });

  it("canLogActivity je false, když modul úkolů není zapnutý", async () => {
    const u = await boss();
    const t = await mkTpl(u);
    expect((await markUsed(u.ctx, deps(false).deps, t.id)).canLogActivity).toBe(false);
  });

  it("logActivity zavolá službu tasks s typem e-mail a vazbami organizace a kontaktu", async () => {
    const u = await boss();
    const firm = await mkCompany(u);
    const p = await mkPerson(u, {
      lastName: `Aktivita ${tag()}`,
      company: firm.id,
      email: "a@b.cz",
    });
    const { deps: d, calls } = deps(true);
    const r = await logActivity(u.ctx, d, { entityType: "person", id: p.id, subject: "Nabídka" });
    expect(r.activityId).toBeTruthy();
    const call = calls.find((c) => c.method === "logDoneActivity")!;
    expect(call.args[1]).toEqual({
      typeKey: "email",
      subject: "Nabídka",
      companyId: firm.id,
      personId: p.id,
    });
  });

  it("logActivity bez modulu úkolů dá větu a na cizí soukromý záznam neumožní zápis", async () => {
    const owner = await boss();
    const other = await partner();
    const firm = await mkCompany(owner, { isPrivate: true });
    await expect(
      logActivity(owner.ctx, deps(false).deps, {
        entityType: "company",
        id: firm.id,
        subject: "x",
      }),
    ).rejects.toThrow(/Úkoly/);
    const { deps: d, calls } = deps(true);
    await expect(
      logActivity(other.ctx, d, { entityType: "company", id: firm.id, subject: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(calls.filter((c) => c.method === "logDoneActivity")).toHaveLength(0);
  });
});

describe("uložení z editoru", () => {
  it("uloží předmět (jednořádkový) a text, odvodí tělo; kolize úprav se odmítne", async () => {
    const u = await boss();
    const t = await mkTpl(u);
    const { deps: d } = deps();
    const saved = await saveContent(u.ctx, d, {
      id: t.id,
      subject: "Nový\npředmět {firma}",
      bodyText: "Text 1\nText 2",
      expectedUpdatedAt: t.updatedAt,
    });
    const r = await raw(t.id);
    expect(r.subject).toBe("Nový předmět {firma}");
    expect(docToText(r.bodyJson)).toBe("Text 1\nText 2");
    expect(saved.updatedAt).toBeTruthy();
    await expect(
      saveContent(u.ctx, d, {
        id: t.id,
        subject: "Jiný",
        bodyText: "Jiný text",
        expectedUpdatedAt: t.updatedAt, // zastaralé
      }),
    ).rejects.toBeInstanceOf(UserError);
  });

  it("bez práva zápisu se text nezmění", async () => {
    const owner = await boss();
    const r = await reader();
    const t = await mkTpl(owner);
    await expect(
      saveContent(r.ctx, deps().deps, { id: t.id, subject: "x", bodyText: "y" }),
    ).rejects.toBeInstanceOf(PermissionError);
    expect((await raw(t.id)).bodyText).toBe(t.bodyText);
  });

  it("příkazy modulu mají správná oprávnění (čtení nestačí na zápis)", () => {
    const perm = Object.fromEntries(commands.map((c) => [c.name, c.permission]));
    expect(perm["sablony-emailu.saveContent"]).toBe("sablony-emailu.write");
    for (const n of [
      "render",
      "preview",
      "templates",
      "markUsed",
      "pick",
      "variables",
      "logActivity",
    ])
      expect(perm[`sablony-emailu.${n}`]).toBe("sablony-emailu.read");
  });
});

describe("služba emailTemplates pro knihovnu (MPR-2, KNI-02)", () => {
  it("import, export (text i tělo), oprávnění a odebrání (vratné smazání)", async () => {
    const owner = await boss();
    const r = await reader();
    const { deps: d } = deps();
    const svc = emailTemplatesService(d);
    const body = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Text z knihovny" }] }],
    };
    const made = await svc.importText(owner.ctx, {
      name: `Z knihovny ${tag()}`,
      category: "Follow-up",
      language: "sk",
      subject: "Dobrý deň {jmeno}",
      bodyText: "Text z knihovny",
      bodyJson: body,
      tags: ["neexistujici-stitek"],
    });
    expect(made.href).toBe(`/sablony-emailu/${made.id}`);
    const row = await raw(made.id);
    expect(row).toMatchObject({ language: "sk", subject: "Dobrý deň {jmeno}", usageCount: 0 });
    expect(row.bodyJson).toEqual(body);

    const out = await svc.exportText(owner.ctx, made.id);
    expect(out).toMatchObject({
      category: "Follow-up",
      subject: "Dobrý deň {jmeno}",
      bodyText: "Text z knihovny",
    });
    expect(await svc.exportText(owner.ctx, "11111111-1111-4111-8111-111111111111")).toBeNull();

    await expect(
      svc.importText(r.ctx, {
        name: "Nesmí vzniknout",
        category: null,
        language: "cs",
        subject: "",
        bodyText: "",
        bodyJson: body,
        tags: [],
      }),
    ).rejects.toBeInstanceOf(PermissionError);

    await expect(svc.remove(r.ctx, made.id)).rejects.toBeInstanceOf(PermissionError);
    await svc.remove(owner.ctx, made.id);
    expect((await raw(made.id)).deletedAt).not.toBeNull();
    expect(await svc.exportText(owner.ctx, made.id)).toBeNull();
  });
});
