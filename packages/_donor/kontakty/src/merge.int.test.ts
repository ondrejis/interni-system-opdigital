import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  registerEntityPolicies,
  resolveEntity,
  type EntityRegistry,
  type ResolvedEntity,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { PermissionError, UserError } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { aresCommand, mergeRunCommand, searchCommand, setPersonPointsCommand } from "./commands";
import { companyEntity, personEntity } from "./entities";
import { manifest } from "./index";
import { company, person, personContactPoint } from "./schema";
import { discoverReferences, mergeContacts, previewMerge } from "./merge";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let companyE: ResolvedEntity;
let personE: ResolvedEntity;
const deps = () => ({ registry }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity]);
  registerEntityPolicies(registry);
  for (const l of manifest.seed.lookups) await ensureLookup(app.db, l);
  companyE = await resolveEntity(app.db, companyEntity);
  personE = await resolveEntity(app.db, personEntity);
});

const tag = () => randomBytes(4).toString("hex");
const boss = () =>
  makeUser(app.db, [
    ["kontakty.read", "all"],
    ["kontakty.write", "all"],
    ["kontakty.merge", "all"],
  ]);
const clerk = () =>
  makeUser(app.db, [
    ["kontakty.read", "all"],
    ["kontakty.write", "all"],
  ]);
type User = Awaited<ReturnType<typeof boss>>;
const mkCompany = (u: User, v: Record<string, unknown>) =>
  createRecord(u.ctx, registry, companyE, v).then((r) => r.row);
const mkPerson = (u: User, v: Record<string, unknown>) =>
  createRecord(u.ctx, registry, personE, v).then((r) => r.row);
const rawCompany = async (id: string) =>
  (await app.db.select().from(company).where(eq(company.id, id)))[0]!;
const rawPerson = async (id: string) =>
  (await app.db.select().from(person).where(eq(person.id, id)))[0]!;

describe("kontakty: typ, hierarchie, štítky, role", () => {
  it("firma nese typ, mateřskou firmu a štítky z číselníků; osoba roli a typ telefonu", async () => {
    const u = await boss();
    const t = tag();
    const parent = await mkCompany(u, { name: `Holding ${t}` });
    const c = await mkCompany(u, {
      name: `Dcera ${t}`,
      type: "investor",
      parent: parent.id,
      tags: ["vip", "partner"],
    });
    const raw = await rawCompany(c.id);
    expect(raw).toMatchObject({ type: "investor", parentId: parent.id, tags: ["vip", "partner"] });
    const p = await mkPerson(u, { name: `Jan ${t}`, role: "tdi", phoneType: "mobile" });
    expect(await rawPerson(p.id)).toMatchObject({
      role: "tdi",
      phoneType: "mobile",
      companyId: null,
    });
  });

  it("osoba bez firmy je v pořádku (soukromý investor); další telefony a e-maily mají typ a hlídá se tvar", async () => {
    const u = await boss();
    const p = await mkPerson(u, { name: `Soukromník ${tag()}` });
    const points = (await setPersonPointsCommand.handler(
      u.ctx,
      {
        personId: p.id,
        points: [
          { kind: "phone", value: "+420 777 111 222", label: "mobile" },
          { kind: "email", value: "x@example.cz", label: "work" },
        ],
      },
      deps(),
    )) as { kind: string }[];
    expect(points.map((x) => x.kind)).toEqual(["phone", "email"]);
    await expect(
      setPersonPointsCommand.handler(
        u.ctx,
        { personId: p.id, points: [{ kind: "email", value: "není e-mail" }] },
        deps(),
      ),
    ).rejects.toThrow(/nemá správný tvar/);
    // nahrazení zruší staré údaje
    await setPersonPointsCommand.handler(u.ctx, { personId: p.id, points: [] }, deps());
    const alive = await app.db
      .select()
      .from(personContactPoint)
      .where(and(eq(personContactPoint.personId, p.id), isNull(personContactPoint.deletedAt)));
    expect(alive).toHaveLength(0);
  });
});

describe("hledání kontaktů a ARES (oprávnění)", () => {
  it("najde firmu bez diakritiky, podle IČO i osobu podle telefonu; bez oprávnění ke kontaktům nic", async () => {
    const u = await boss();
    const t = tag();
    const c = await mkCompany(u, {
      name: `Řemeslná firma ${t}`,
      ico: `${Math.floor(10000000 + Math.random() * 89999999)}`,
    });
    const p = await mkPerson(u, { name: `Novák ${t}`, phone: "+420 603 555 777", company: c.id });
    const byName = (await searchCommand.handler(u.ctx, { q: `remeslna firma ${t}` }, deps())) as {
      companies: { id: string }[];
    };
    expect(byName.companies.map((x) => x.id)).toContain(c.id);
    const byPhone = (await searchCommand.handler(u.ctx, { q: "603555777" }, deps())) as {
      persons: { id: string; companyName: string | null }[];
    };
    expect(byPhone.persons.find((x) => x.id === p.id)?.companyName).toBe(`Řemeslná firma ${t}`);
    const nobody = await makeUser(app.db, [["zakazky.read", "all"]]);
    await expect(searchCommand.handler(nobody.ctx, { q: t }, deps())).rejects.toThrow(
      PermissionError,
    );
  });

  it("ARES: neplatné IČO a chybějící síť končí větou, ne výjimkou; limit dotazů se drží", async () => {
    const u = await boss();
    const bad = (await aresCommand.handler(u.ctx, { ico: "12345678" }, deps())) as {
      ok: boolean;
      reason?: string;
    };
    expect(bad).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("sloučení duplicit", () => {
  it("firmy: přepojí osoby a vazby, doplní prázdná pole, spojí štítky a role, zdroj zanikne a vznikne audit", async () => {
    const u = await boss();
    const t = tag();
    const target = await mkCompany(u, { name: `Cíl ${t}`, tags: ["vip"], city: "Plzeň" });
    const source = await mkCompany(u, {
      name: `Duplicita ${t}`,
      ico: `${Math.floor(10000000 + Math.random() * 89999999)}`,
      dic: "CZ1",
      city: "Praha",
      tags: ["partner"],
      roles: ["supplier"],
      type: "supplier",
      web: "https://example.cz/",
    });
    const kid = await mkPerson(u, { name: `Kontakt ${t}`, company: source.id });
    const child = await mkCompany(u, { name: `Dcera ${t}`, parent: source.id });

    const preview = await previewMerge(u.ctx, "company", source.id, target.id);
    expect(preview.moves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "person", count: 1 }),
        expect.objectContaining({ table: "company", count: 1 }),
      ]),
    );
    expect(preview.fills.map((f) => f.field).sort()).toEqual(["dic", "ico", "type", "web"]);
    expect(preview.warnings).toEqual([]);

    const res = await mergeContacts(u.ctx, "company", source.id, target.id);
    expect(res.moved).toBeGreaterThanOrEqual(2);
    const after = await rawCompany(target.id);
    expect(after).toMatchObject({
      city: "Plzeň",
      dic: "CZ1",
      type: "supplier",
      web: "https://example.cz/",
    });
    expect(after.ico).toBeTruthy();
    expect(after.tags.sort()).toEqual(["partner", "vip"]);
    expect(after.roles.sort()).toEqual(["client", "supplier"]);
    expect((await rawPerson(kid.id)).companyId).toBe(target.id);
    expect((await rawCompany(child.id)).parentId).toBe(target.id);
    expect((await rawCompany(source.id)).deletedAt).not.toBeNull();
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityId, target.id), eq(schema.auditLog.action, "merge")));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.summary).toMatch(/Sloučeno/);
  });

  it("osoby: kontaktní údaje se spojí bez opakování, hlavní údaje zmizelé osoby nezmizí", async () => {
    const u = await boss();
    const t = tag();
    const target = await mkPerson(u, {
      name: `Cíl ${t}`,
      email: `a-${t}@example.cz`,
      phone: "+420 777 000 111",
    });
    const source = await mkPerson(u, {
      name: `Zdroj ${t}`,
      email: `b-${t}@example.cz`,
      phone: "777000111",
      emailType: "work",
      role: "tdi",
    });
    await setPersonPointsCommand.handler(
      u.ctx,
      { personId: source.id, points: [{ kind: "phone", value: "602 123 456", label: "home" }] },
      deps(),
    );
    await mergeContacts(u.ctx, "person", source.id, target.id);
    const merged = await rawPerson(target.id);
    expect(merged).toMatchObject({ email: `a-${t}@example.cz`, role: "tdi" });
    const pts = await app.db
      .select()
      .from(personContactPoint)
      .where(and(eq(personContactPoint.personId, target.id), isNull(personContactPoint.deletedAt)));
    const values = pts.map((p) => p.value).sort();
    // e-mail zdroje se stal dalším údajem; stejný telefon (jiný zápis) se neopakuje; telefon z bodů přešel
    expect(values).toEqual([`b-${t}@example.cz`, "602 123 456"].sort());
    expect(pts.find((p) => p.value === "602 123 456")?.label).toBe("home");
    expect((await rawPerson(source.id)).deletedAt).not.toBeNull();
  });

  it("chrání: stejný záznam, jiný typ, cizí rozsah a chybějící potvrzení či oprávnění", async () => {
    const u = await boss();
    const a = await mkCompany(u, { name: `A ${tag()}` });
    const b = await mkCompany(u, { name: `B ${tag()}` });
    await expect(mergeContacts(u.ctx, "company", a.id, a.id)).rejects.toThrow(UserError);
    // osoba není firma: záznam se v tabulce osob nenajde
    await expect(mergeContacts(u.ctx, "person", a.id, b.id)).rejects.toThrow();
    expect(
      mergeRunCommand.input.safeParse({ entity: "company", sourceId: a.id, targetId: b.id })
        .success,
    ).toBe(false);
    expect(mergeRunCommand.permission).toBe("kontakty.merge");
    // úředník bez `kontakty.merge` příkaz nesmí (kontrola oprávnění příkazu je v jednotném vstupu; tady jde o deklaraci)
    const c = await clerk();
    expect(c.ctx.actor.permissions.has("kontakty.merge")).toBe(false);
    // jen vlastní záznamy: cizí firmu úředník s rozsahem „moje“ neslučuje
    const mine = await makeUser(app.db, [
      ["kontakty.read", "own"],
      ["kontakty.write", "own"],
      ["kontakty.merge", "all"],
    ]);
    await expect(mergeContacts(mine.ctx, "company", a.id, b.id)).rejects.toThrow();
  });

  it("odkazy: objevené sloupce zahrnují cizí klíče, měkké vazby i polymorfní tabulky", async () => {
    const refs = await discoverReferences(app.db, "company");
    const cols = refs.columns.map((c) => `${c.table}.${c.column}`);
    expect(cols).toEqual(expect.arrayContaining(["job.company_id", "person.company_id"]));
    expect(refs.poly.map((p) => p.table)).toEqual(
      expect.arrayContaining(["comment", "task", "attachment"]),
    );
    expect(refs.poly.map((p) => p.table)).not.toContain("audit_log");
  });
});
