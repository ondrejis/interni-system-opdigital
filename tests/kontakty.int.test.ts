import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  getRecord,
  queryRecords,
  registerEntityPolicies,
  resolveEntity,
  searchAll,
  updateRecord,
  type EntityRegistry,
  type ResolvedEntity,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { PermissionError, UserError } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import {
  createCompanyQuick,
  createPersonQuick,
  findCompanyByIco,
  findContactDuplicates,
  getPrimaryContact,
  matchContactDuplicates,
  upsertContactFromLead,
} from "@rebar/kontakty/api";
import { createFakeAres, setAresClient, type FakeAres } from "@rebar/kontakty/ares";
import { company, person, personCompany, personContactPoint } from "@rebar/kontakty/schema";
import {
  aresCommand,
  aresTestCommand,
  companyCheckCommand,
  companyContactsCommand,
  mergeApplyCommand,
  mergePreviewCommand,
  personCheckCommand,
  personQuickCreateCommand,
  searchCommand,
  setPersonCompaniesCommand,
  setPersonPointsCommand,
} from "../packages/modules/kontakty/src/commands";
import { companyEntity, personEntity } from "../packages/modules/kontakty/src/entities";
import {
  clientCardProvider,
  companyEmailVars,
  personEmailVars,
} from "../packages/modules/kontakty/src/contributions";
import { mergeContacts, previewMerge } from "../packages/modules/kontakty/src/merge";
import { listPoints } from "../packages/modules/kontakty/src/points";

/*
  Integrační testy modulu Organizace a kontakty (KON): entity s hlídáním IČO, ARES přes fake adaptér, duplicity
  (IČO, název, doména, e-mail, telefon E.164), kontaktní údaje, rychlé založení, API pro jiné moduly, příspěvky
  a sloučení nad skutečnou databází. Probes příkazů jsou v tests/support/probes/kontakty.ts.
*/

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let companyE: ResolvedEntity;
let personE: ResolvedEntity;
let ares: FakeAres;
const deps = () => ({ registry }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity]);
  registerEntityPolicies(registry);
  companyE = await resolveEntity(app.db, companyEntity);
  personE = await resolveEntity(app.db, personEntity);
});
afterAll(() => setAresClient(null));
beforeEach(() => {
  ares = createFakeAres();
  setAresClient(ares);
});

const tag = () => randomBytes(4).toString("hex");
const ico = () => {
  // platné IČO: sedm náhodných číslic a kontrolní číslice podle mod 11
  const d = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10));
  const sum = d.reduce((a, x, i) => a + x * (8 - i), 0);
  return [...d, (11 - (sum % 11)) % 10].join("");
};
/** Firma, kterou fake ARES zná pod novým (platným) IČO, aby se testy nepletly přes sdílenou databázi souboru. */
const aresFirm = (name = "Fake firma s.r.o.") => {
  const number = ico();
  ares.add({
    ico: number,
    name,
    dic: `CZ${number}`,
    legalForm: "Společnost s ručením omezeným",
    street: "Hlavní 1",
    city: "Plzeň",
    zip: "301 00",
  });
  return number;
};
const boss = () =>
  makeUser(app.db, [
    ["kontakty.read", "all"],
    ["kontakty.create", "all"],
    ["kontakty.write", "all"],
    ["kontakty.delete", "all"],
    ["kontakty.merge", "all"],
    ["kontakty.ares", "all"],
    ["settings.integrations", "all"],
    ["private.read", "all"],
  ]);
const partner = () =>
  makeUser(app.db, [
    ["kontakty.read", "all"],
    ["kontakty.create", "all"],
    ["kontakty.write", "all"],
    ["kontakty.ares", "all"],
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
const livePoints = (personId: string) =>
  app.db
    .select()
    .from(personContactPoint)
    .where(and(eq(personContactPoint.personId, personId), isNull(personContactPoint.deletedAt)));

describe("organizace: IČO a doména webu (ORG-01, 02, 05)", () => {
  it("jde založit jen s názvem; IČO se normalizuje, doména webu odvodí, klient nevzniká", async () => {
    const u = await boss();
    const t = tag();
    const bare = await mkCompany(u, { name: `Bez IČO ${t}` });
    expect(await rawCompany(bare.id)).toMatchObject({
      ico: null,
      clientStatus: null,
      webDomain: null,
    });
    const full = await mkCompany(u, {
      name: `S IČO ${t}`,
      ico: "6947",
      web: "https://www.Example-Firma.cz/kontakt",
    });
    expect(await rawCompany(full.id)).toMatchObject({
      ico: "00006947",
      webDomain: "example-firma.cz",
    });
  });

  it("stejné IČO nedovolí (i v jiném zápisu) a odkáže na existující organizaci", async () => {
    const u = await boss();
    const t = tag();
    const number = ico();
    const first = await mkCompany(u, { name: `Původní ${t}`, ico: number });
    await expect(
      mkCompany(u, { name: `Další ${t}`, ico: ` ${number.slice(0, 4)} ${number.slice(4)} ` }),
    ).rejects.toThrow(new RegExp(`${number}.*Původní ${t}.*${first.id}`));
    const other = await mkCompany(u, { name: `Jiná ${t}` });
    await expect(
      updateRecord(u.ctx, registry, companyE, other.id, { ico: number }),
    ).rejects.toThrow(/už existuje/);
    // vlastní IČO se při úpravě neblokuje sama
    await updateRecord(u.ctx, registry, companyE, first.id, { ico: number, city: "Plzeň" });
    // nesmysl není IČO
    await expect(mkCompany(u, { name: `Zlé ${t}`, ico: "ABC" })).rejects.toThrow(/IČO/);
  });

  it("zrušená organizace IČO uvolní", async () => {
    const u = await boss();
    const number = ico();
    const a = await mkCompany(u, { name: `Stará ${tag()}`, ico: number });
    await app.db.update(company).set({ deletedAt: new Date() }).where(eq(company.id, a.id));
    const b = await mkCompany(u, { name: `Nová ${tag()}`, ico: number });
    expect((await findCompanyByIco(u.ctx, number))?.id).toBe(b.id);
  });

  it("soukromá organizace s IČO: kdo ji nevidí, uloží se mu věta bez názvu", async () => {
    const owner = await boss();
    const other = await partner();
    const number = ico();
    const [row] = await app.db
      .insert(company)
      .values({ name: `PRIVATE-CANARY-${tag()}`, ico: number, isPrivate: true })
      .returning();
    const err = await mkCompany(other, { name: `X ${tag()}`, ico: number }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(UserError);
    expect((err as Error).message).not.toContain("CANARY");
    expect((err as Error).message).toMatch(/nemáte k ní přístup/);
    const ownerErr = await mkCompany(owner, { name: `Y ${tag()}`, ico: number }).catch(
      (e: Error) => e,
    );
    expect((ownerErr as Error).message).toContain("CANARY");
    expect(await findCompanyByIco(other.ctx, number)).toBeNull();
    expect((await findCompanyByIco(owner.ctx, number))?.id).toBe(row!.id);
  });
});

describe("duplicity organizací (ORG-06)", () => {
  it("podobný název (i s právní příponou a bez diakritiky) a stejná doména jsou „možná duplicita“", async () => {
    const u = await boss();
    const t = tag();
    const base = await mkCompany(u, {
      name: `Novák Stavby ${t}, spol. s r.o.`,
      web: `https://novak-${t}.cz`,
    });
    const byName = (await companyCheckCommand.handler(
      u.ctx,
      { name: `NOVAK STAVBY ${t}` },
      deps(),
    )) as {
      icoMatch: unknown;
      similar: { id: string; reason: string; similarity?: number }[];
    };
    expect(byName.icoMatch).toBeNull();
    expect(byName.similar).toEqual([expect.objectContaining({ id: base.id, reason: "name" })]);
    expect(byName.similar[0]!.similarity).toBeGreaterThan(0.6);

    const byDomain = (await companyCheckCommand.handler(
      u.ctx,
      { name: `Úplně jiný název ${tag()}`, web: `http://www.novak-${t}.cz/o-nas` },
      deps(),
    )) as { similar: { id: string; reason: string }[] };
    expect(byDomain.similar).toEqual([expect.objectContaining({ id: base.id, reason: "domain" })]);

    // sama sebe nehlásí a odlišný název ani doména nic nevrátí
    const self = (await companyCheckCommand.handler(
      u.ctx,
      { name: `Novák Stavby ${t}`, excludeId: base.id },
      deps(),
    )) as { similar: unknown[] };
    expect(self.similar).toEqual([]);
    const none = (await companyCheckCommand.handler(
      u.ctx,
      { name: `Zelenina ${tag()}` },
      deps(),
    )) as {
      similar: unknown[];
    };
    expect(none.similar).toEqual([]);
  });

  it("sdílený profil (Facebook) není důkaz duplicity", async () => {
    const u = await boss();
    const t = tag();
    await mkCompany(u, { name: `FB ${t}`, web: `https://www.facebook.com/firma-${t}` });
    const r = (await companyCheckCommand.handler(
      u.ctx,
      { name: `Nesouvisející ${tag()}`, web: "https://facebook.com/jina" },
      deps(),
    )) as { similar: unknown[] };
    expect(r.similar).toEqual([]);
  });

  it("stejné IČO vrací icoMatch s odkazem; soukromé se skrytému aktérovi neprozradí", async () => {
    const owner = await boss();
    const other = await partner();
    const number = ico();
    const made = await mkCompany(owner, { name: `Existující ${tag()}`, ico: number });
    const seen = (await companyCheckCommand.handler(owner.ctx, { ico: number }, deps())) as {
      icoMatch: { id: string; visible: boolean };
    };
    expect(seen.icoMatch).toMatchObject({ id: made.id, visible: true });
    await app.db.update(company).set({ isPrivate: true }).where(eq(company.id, made.id));
    const hidden = (await companyCheckCommand.handler(other.ctx, { ico: number }, deps())) as {
      icoMatch: { id: string; name: string; visible: boolean };
    };
    expect(hidden.icoMatch).toMatchObject({ id: "", name: "", visible: false });
  });
});

describe("ARES (ORG-03, ORG-04, NFR-04)", () => {
  it("náhled doplní název, sídlo, DIČ a právní formu; po potvrzení se zapíše a uloží čas synchronizace", async () => {
    const u = await boss();
    const c = await mkCompany(u, { name: `Alza ${tag()}`, ico: "27082440" });
    // IČO už je obsazené jinou organizací v jiných testech? Soubor má vlastní DB, takže je volné.
    const preview = (await aresCommand.handler(u.ctx, { companyId: c.id }, deps())) as Extract<
      Awaited<ReturnType<(typeof aresCommand)["handler"]>>,
      { ok: true }
    >;
    expect(preview.ok).toBe(true);
    expect(preview.company.name).toBe("Alza.cz a.s.");
    expect(preview.changes.map((x) => x.field).sort()).toEqual(
      ["city", "dic", "legalForm", "name", "officialName", "street", "zip"].sort(),
    );
    // vlastní zkrácený název se nepřepisuje, dokud ho uživatel výslovně nezaškrtne
    expect(preview.changes.find((x) => x.field === "name")?.selected).toBe(false);
    expect(await rawCompany(c.id)).toMatchObject({ aresSyncedAt: null, dic: null });

    const applied = (await aresCommand.handler(
      u.ctx,
      {
        companyId: c.id,
        apply: true,
        fields: ["officialName", "dic", "legalForm", "street", "city", "zip"],
      },
      deps(),
    )) as { ok: true; applied: string[]; syncedAt: string };
    expect(applied.applied).toHaveLength(6);
    const after = await rawCompany(c.id);
    expect(after).toMatchObject({
      name: expect.stringMatching(/^Alza /),
      officialName: "Alza.cz a.s.",
      dic: "CZ27082440",
      legalForm: "Akciová společnost",
      street: "Jankovcova 1522/53",
      city: "Praha",
      zip: "170 00",
    });
    expect(after.aresSyncedAt).toBeInstanceOf(Date);
    // změna je v historii záznamu
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityId, c.id), eq(schema.auditLog.action, "update")));
    expect(JSON.stringify(audit.map((a) => a.changes))).toContain("CZ27082440");
  });

  it("nová organizace podle IČO: náhled doplní vše, bez zápisu; neplatné IČO se do sítě nepošle", async () => {
    const u = await boss();
    const r = (await aresCommand.handler(u.ctx, { ico: aresFirm() }, deps())) as {
      ok: true;
      changes: { kind: string; selected: boolean }[];
      duplicate: unknown;
    };
    expect(r.changes.every((c) => c.kind === "fill" && c.selected)).toBe(true);
    expect(r.duplicate).toBeNull();
    const calls = ares.calls.length;
    const bad = await aresCommand.handler(u.ctx, { ico: "27082441" }, deps());
    expect(bad).toMatchObject({ ok: false, reason: "invalid" });
    expect(ares.calls).toHaveLength(calls);
  });

  it("výpadek ARES: náhled vrátí větu, ale organizaci jde založit i uložit (ORG-04)", async () => {
    const u = await boss();
    ares.setDown(true);
    const r = await aresCommand.handler(u.ctx, { ico: aresFirm() }, deps());
    expect(r).toMatchObject({ ok: false, reason: "unavailable" });
    const t = tag();
    const own = ico();
    const made = await mkCompany(u, { name: `Ručně ${t}`, ico: own });
    expect(await rawCompany(made.id)).toMatchObject({ ico: own });
    await updateRecord(u.ctx, registry, companyE, made.id, {
      city: "Praha",
      street: "Letenská 15",
    });
    // zápis z ARES se při výpadku neprovede a nic nezmění
    const applied = await aresCommand.handler(u.ctx, { companyId: made.id, apply: true }, deps());
    expect(applied).toMatchObject({ ok: false, reason: "unavailable" });
    expect(await rawCompany(made.id)).toMatchObject({ city: "Praha", aresSyncedAt: null });
  });

  it("cache 24 h v databázi: druhý dotaz na nové IČO neleze do sítě; výpadek po cache vrátí starší údaje", async () => {
    const u = await boss();
    const number = aresFirm();
    await aresCommand.handler(u.ctx, { ico: number }, deps());
    const before = ares.calls.length;
    const again = (await aresCommand.handler(u.ctx, { ico: number }, deps())) as {
      ok: true;
      cached: boolean;
    };
    expect(again.cached).toBe(true);
    expect(ares.calls).toHaveLength(before);
    // „Aktualizovat z ARES“ (companyId) cache obejde, výpadek pak vrátí uloženou odpověď s příznakem
    const c = await mkCompany(u, { name: `Cache ${tag()}`, ico: number });
    ares.setDown(true);
    const stale = (await aresCommand.handler(u.ctx, { companyId: c.id }, deps())) as {
      ok: true;
      stale: boolean;
    };
    expect(stale.ok).toBe(true);
  });

  it("zápis z ARES na organizaci, jejíž IČO patří jiné, odmítne (ORG-05)", async () => {
    const u = await boss();
    const number = aresFirm();
    const a = await mkCompany(u, { name: `A ${tag()}`, ico: number });
    const b = await mkCompany(u, { name: `B ${tag()}` });
    const preview = (await aresCommand.handler(
      u.ctx,
      { ico: number, companyId: b.id },
      deps(),
    )) as {
      duplicate: { id: string } | null;
    };
    expect(preview.duplicate?.id).toBe(a.id);
    await expect(
      aresCommand.handler(u.ctx, { ico: number, companyId: b.id, apply: true }, deps()),
    ).rejects.toThrow(/už existuje/);
  });

  it("test v Nastavení → Integrace měří dobu odpovědi; vyžaduje oprávnění k integracím", async () => {
    const u = await boss();
    const r = (await aresTestCommand.handler(u.ctx, {}, deps())) as {
      ok: boolean;
      withinBudget: boolean;
      sample: string;
    };
    expect(r).toMatchObject({ ok: true, withinBudget: true, sample: "Ministerstvo financí" });
    ares.setDown(true);
    // po výpadku zůstává uložená odpověď: test ji označí jako starou a mimo rozpočet
    expect(await aresTestCommand.handler(u.ctx, {}, deps())).toMatchObject({
      ok: true,
      withinBudget: false,
    });
    expect(aresTestCommand.permission).toBe("kontakty.ares");
  });

  it("příkaz nechce oprávnění bez ARES ani zápisu; zápis vyžaduje právo na úpravu organizace", async () => {
    const reader = await makeUser(app.db, [
      ["kontakty.read", "all"],
      ["kontakty.ares", "all"],
    ]);
    const c = await mkCompany(await boss(), { name: `Jen čtení ${tag()}` });
    await expect(
      aresCommand.handler(reader.ctx, { ico: "27082440", companyId: c.id, apply: true }, deps()),
    ).rejects.toThrow(PermissionError);
  });
});

describe("kontaktní údaje a duplicity osob (KON-01, KON-03)", () => {
  it("telefon a e-mail z formuláře osoby se uloží jako hlavní údaje v E.164 a malými písmeny", async () => {
    const u = await boss();
    const t = tag();
    const p = await mkPerson(u, {
      lastName: `Novák ${t}`,
      firstName: "Jan",
      phone: "777 123 456",
      email: `Jan.Novak.${t}@Example.CZ`,
    });
    const raw = await rawPerson(p.id);
    expect(raw).toMatchObject({ primaryPhone: "777123456", fullName: `Jan Novák ${t}` });
    const pts = await livePoints(p.id);
    expect(pts.map((x) => [x.kind, x.valueNorm, x.isPrimary]).sort()).toEqual(
      [
        ["email", `jan.novak.${t}@example.cz`, true],
        ["phone", "+420777123456", true],
      ].sort(),
    );
  });

  it("neplatný tvar telefonu nebo e-mailu se odmítne větou", async () => {
    const u = await boss();
    await expect(mkPerson(u, { lastName: `A ${tag()}`, phone: "12" })).rejects.toThrow(/Telefon/);
    await expect(mkPerson(u, { lastName: `B ${tag()}`, email: "není e-mail" })).rejects.toThrow();
  });

  it("víc údajů se štítkem a jeden hlavní od každého druhu; opakování se spojí; změna je v historii", async () => {
    const u = await boss();
    const t = tag();
    const p = await mkPerson(u, { lastName: `Údaje ${t}` });
    const set = await setPersonPointsCommand.handler(
      u.ctx,
      {
        personId: p.id,
        points: [
          { kind: "phone", value: "602 111 222", label: "mobile" },
          { kind: "phone", value: "+420 602 111 222" }, // opakování téhož čísla
          { kind: "phone", value: "+421 905 000 111", label: "work", isPrimary: true },
          { kind: "email", value: `a-${t}@example.cz`, label: "work" },
          { kind: "email", value: `B-${t}@example.cz`, label: "private" },
        ],
      },
      deps(),
    );
    const rows = set as {
      kind: string;
      valueNorm: string;
      isPrimary: boolean;
      label: string | null;
    }[];
    expect(rows.filter((r) => r.kind === "phone")).toHaveLength(2);
    expect(rows.filter((r) => r.kind === "phone" && r.isPrimary).map((r) => r.valueNorm)).toEqual([
      "+421905000111",
    ]);
    expect(rows.filter((r) => r.kind === "email" && r.isPrimary).map((r) => r.valueNorm)).toEqual([
      `a-${t}@example.cz`,
    ]);
    expect(rows.find((r) => r.valueNorm === "+420602111222")?.label).toBe("mobile");
    // hlavní údaje jsou i na osobě (seznam, hledání)
    expect(await rawPerson(p.id)).toMatchObject({
      primaryPhone: "+421 905 000 111",
      primaryEmail: `a-${t}@example.cz`,
    });
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.entityId, p.id),
          eq(schema.auditLog.summary, "Změněny kontaktní údaje"),
        ),
      );
    expect(audit).toHaveLength(1);
    // odebrání: údaje, které chybí v seznamu, se smažou, a hlavní nastoupí další
    const second = (await setPersonPointsCommand.handler(
      u.ctx,
      {
        personId: p.id,
        points: [
          {
            id: rows.find((r) => r.valueNorm === "+420602111222")!.valueNorm && undefined,
            kind: "phone",
            value: "602111222",
          },
        ],
      },
      deps(),
    )) as { kind: string; isPrimary: boolean }[];
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ kind: "phone", isPrimary: true });
    expect(await rawPerson(p.id)).toMatchObject({ primaryEmail: null, primaryPhone: "602111222" });
  });

  it("úprava hlavního telefonu a e-mailu v seznamu (inline) přepíše hlavní údaj, ne přidá druhý", async () => {
    const u = await boss();
    const t = tag();
    const p = await mkPerson(u, {
      lastName: `Inline ${t}`,
      phone: "777 000 111",
      email: `x-${t}@example.cz`,
    });
    await updateRecord(u.ctx, registry, personE, p.id, { phone: "777 000 222" });
    let pts = await livePoints(p.id);
    expect(pts.filter((x) => x.kind === "phone").map((x) => x.valueNorm)).toEqual([
      "+420777000222",
    ]);
    // vymazání hlavního e-mailu ho smaže
    await updateRecord(u.ctx, registry, personE, p.id, { email: null });
    pts = await livePoints(p.id);
    expect(pts.filter((x) => x.kind === "email")).toHaveLength(0);
    expect(await rawPerson(p.id)).toMatchObject({ primaryEmail: null });
  });

  it("duplicity podle telefonu nezávisle na mezerách a předvolbě i podle e-mailu velkými písmeny", async () => {
    const u = await boss();
    const t = tag();
    const base = await mkPerson(u, {
      lastName: `Dup ${t}`,
      phone: "+420 603 700 700",
      email: `dup-${t}@example.cz`,
    });
    for (const variant of [
      "603700700",
      "603 700 700",
      "00420603700700",
      "+420-603-700-700",
      "(+420) 603 700 700",
    ]) {
      const found = (await personCheckCommand.handler(u.ctx, { phones: [variant] }, deps())) as {
        personId: string;
        match: string;
      }[];
      expect(
        found.map((f) => f.personId),
        variant,
      ).toContain(base.id);
      expect(found[0]!.match).toBe("phone");
    }
    const byMail = await findContactDuplicates(u.ctx, { emails: [`DUP-${t}@Example.cz`] });
    expect(byMail).toEqual([{ personId: base.id, name: `Dup ${t}`, match: "email" }]);
    // excludeId: osoba sama sebe nehlásí
    expect(
      await findContactDuplicates(u.ctx, { emails: [`dup-${t}@example.cz`], excludeId: base.id }),
    ).toEqual([]);
    // shoda i podle jiného než hlavního údaje
    await setPersonPointsCommand.handler(
      u.ctx,
      {
        personId: base.id,
        points: [
          { kind: "phone", value: "603 700 700" },
          { kind: "phone", value: "731 222 333", isPrimary: true },
        ],
      },
      deps(),
    );
    expect(
      (await findContactDuplicates(u.ctx, { phones: ["731222333"] })).map((x) => x.personId),
    ).toEqual([base.id]);
    expect(
      (await findContactDuplicates(u.ctx, { phones: ["603700700"] })).map((x) => x.personId),
    ).toEqual([base.id]);
    // jiné číslo nic nehlásí
    expect(await findContactDuplicates(u.ctx, { phones: ["605 111 999"] })).toEqual([]);
  });

  it("matchContactDuplicates: organizace podle IČO a e-mailu, osoby podle telefonu (E.164)", async () => {
    const u = await boss();
    const t = tag();
    const number = ico();
    const c = await mkCompany(u, {
      name: `Shoda ${t}`,
      ico: number,
      email: `info-${t}@example.cz`,
      phone: "+420 222 333 444",
    });
    const p = await mkPerson(u, { lastName: `Shoda ${t}`, phone: "+420 604 555 666" });
    const r = await matchContactDuplicates(u.ctx, {
      ico: ` ${number} `,
      email: `INFO-${t}@example.cz`,
      phone: "604555666",
    });
    expect(r.companies).toEqual([
      expect.objectContaining({ id: c.id, matchedBy: ["ico", "email"] }),
    ]);
    expect(r.persons).toEqual([expect.objectContaining({ id: p.id, matchedBy: ["phone"] })]);
    const phoneOfCompany = await matchContactDuplicates(u.ctx, { phone: "222333444" });
    expect(phoneOfCompany.companies.map((x) => x.id)).toEqual([c.id]);
    expect(await matchContactDuplicates(u.ctx, {})).toEqual({ companies: [], persons: [] });
  });

  it("soukromá osoba se kontrole duplicit nevidí tomu, kdo nemá private.read", async () => {
    const owner = await boss();
    const other = await partner();
    const t = tag();
    const [secret] = await app.db
      .insert(person)
      .values({ lastName: `PRIVATE-CANARY-${t}`, isPrivate: true })
      .returning();
    await app.db.insert(personContactPoint).values({
      personId: secret!.id,
      kind: "phone",
      value: "608 123 123",
      valueNorm: "+420608123123",
      isPrimary: true,
    });
    expect(await findContactDuplicates(other.ctx, { phones: ["608123123"] })).toEqual([]);
    expect(
      (await findContactDuplicates(owner.ctx, { phones: ["608123123"] })).map((x) => x.personId),
    ).toEqual([secret!.id]);
  });
});

describe("rychlé založení kontaktu (KON-05)", () => {
  it("založí osobu s organizací, pozicí a údaji; při shodě telefonu nic nezaloží, dokud není force", async () => {
    const u = await boss();
    const t = tag();
    const firm = await mkCompany(u, { name: `Firma ${t}` });
    const made = (await personQuickCreateCommand.handler(
      u.ctx,
      {
        firstName: "Petr",
        lastName: `Svoboda ${t}`,
        companyId: firm.id,
        position: "Jednatel",
        isDecisionMaker: true,
        points: [
          { kind: "phone", value: "731 100 200", label: "mobile" },
          { kind: "email", value: `petr-${t}@example.cz`, label: "work" },
        ],
      },
      deps(),
    )) as { created: true; personId: string };
    expect(made.created).toBe(true);
    expect(await rawPerson(made.personId)).toMatchObject({
      primaryCompanyId: firm.id,
      position: "Jednatel",
      isDecisionMaker: true,
      primaryPhone: "731 100 200",
      ownerId: u.id,
    });

    const again = (await personQuickCreateCommand.handler(
      u.ctx,
      { lastName: `Jiný ${t}`, points: [{ kind: "phone", value: "+420731100200" }] },
      deps(),
    )) as { created: false; duplicates: { personId: string }[] };
    expect(again.created).toBe(false);
    expect(again.duplicates.map((d) => d.personId)).toEqual([made.personId]);
    const forced = (await personQuickCreateCommand.handler(
      u.ctx,
      { lastName: `Jiný ${t}`, points: [{ kind: "phone", value: "+420731100200" }], force: true },
      deps(),
    )) as { created: boolean };
    expect(forced.created).toBe(true);
  });

  it("neexistující organizace se odmítne a nezaloží se osoba", async () => {
    const u = await boss();
    await expect(
      personQuickCreateCommand.handler(
        u.ctx,
        { lastName: `X ${tag()}`, companyId: "11111111-1111-4111-8111-111111111111" },
        deps(),
      ),
    ).rejects.toThrow(/neexistuje/);
  });
});

describe("organizace osoby a kontakty organizace (KON-01, KON-04)", () => {
  it("hlavní a další organizace s rolí; kontakty organizace ukáže obojí, rozhodující první", async () => {
    const u = await boss();
    const t = tag();
    const main = await mkCompany(u, { name: `Hlavní ${t}` });
    const side = await mkCompany(u, { name: `Vedlejší ${t}` });
    const a = await mkPerson(u, { lastName: `Adam ${t}`, company: main.id, position: "Účetní" });
    const b = await mkPerson(u, {
      lastName: `Beneš ${t}`,
      company: main.id,
      isDecisionMaker: true,
      phone: "777 888 999",
    });
    const c = await mkPerson(u, { lastName: `Cyril ${t}`, position: "Ředitel" });
    await setPersonCompaniesCommand.handler(
      u.ctx,
      {
        personId: c.id,
        primaryCompanyId: side.id,
        others: [
          { companyId: main.id, role: "Poradce", position: "Externí poradce" },
          { companyId: main.id, role: "duplicitní řádek se spojí" },
          { companyId: side.id, role: "hlavní se mezi dalšími neopakuje" },
        ],
      },
      deps(),
    );
    const list = (await companyContactsCommand.handler(u.ctx, { companyId: main.id }, deps())) as {
      id: string;
      role: string | null;
      isPrimaryCompany: boolean;
      isDecisionMaker: boolean;
      position: string | null;
    }[];
    expect(list.map((x) => x.id)).toEqual([b.id, a.id, c.id]); // rozhoduje, hlavní organizace, další organizace
    expect(list.find((x) => x.id === c.id)).toMatchObject({
      role: "Poradce",
      isPrimaryCompany: false,
      position: "Externí poradce",
    });
    expect(
      await app.db
        .select()
        .from(personCompany)
        .where(and(eq(personCompany.personId, c.id), isNull(personCompany.deletedAt))),
    ).toHaveLength(1);
    const primary = await getPrimaryContact(u.ctx, main.id);
    expect(primary).toMatchObject({ personId: b.id, phone: "777888999" });
    expect(await getPrimaryContact(u.ctx, side.id)).toMatchObject({ personId: c.id });
    // karta klienta: počet kontaktů a souhrn
    expect(await clientCardProvider.tabCounts!(u.ctx, main.id)).toEqual({ kontakty: 3 });
    expect(await clientCardProvider.summary!(u.ctx, main.id)).toMatchObject({
      contacts: { count: 3, primary: { personId: b.id } },
    });
  });

  it("soukromá osoba se nepočítá a nevrací tomu, kdo nesmí soukromé vidět", async () => {
    const owner = await boss();
    const other = await partner();
    const firm = await mkCompany(owner, { name: `Soukromí ${tag()}` });
    await mkPerson(owner, { lastName: `Veřejná ${tag()}`, company: firm.id });
    await app.db.insert(person).values({
      lastName: `PRIVATE-CANARY-${tag()}`,
      primaryCompanyId: firm.id,
      isPrivate: true,
      isDecisionMaker: true,
    });
    expect(await clientCardProvider.tabCounts!(other.ctx, firm.id)).toEqual({ kontakty: 1 });
    expect(await clientCardProvider.tabCounts!(owner.ctx, firm.id)).toEqual({ kontakty: 2 });
    const contacts = JSON.stringify(await getPrimaryContact(other.ctx, firm.id));
    expect(contacts).not.toContain("CANARY");
  });

  it("proměnné e-mailu: oslovení, příjmení, firma, telefon", async () => {
    const u = await boss();
    const t = tag();
    const firm = await mkCompany(u, { name: `Mailová ${t}` });
    const p = await mkPerson(u, {
      firstName: "Eva",
      lastName: `Nová ${t}`,
      company: firm.id,
      isDecisionMaker: true,
      phone: "777123456",
      email: `eva-${t}@example.cz`,
    });
    expect(await personEmailVars.resolve(u.ctx, p.id)).toEqual({
      jmeno: "Eva",
      prijmeni: `Nová ${t}`,
      firma: `Mailová ${t}`,
      email: `eva-${t}@example.cz`,
      telefon: "+420 777 123 456",
    });
    expect(await companyEmailVars.resolve(u.ctx, firm.id)).toMatchObject({
      jmeno: "Eva",
      firma: `Mailová ${t}`,
    });
    expect(await personEmailVars.resolve(u.ctx, "11111111-1111-4111-8111-111111111111")).toEqual(
      {},
    );
  });
});

describe("API pro jiné moduly (D §2.4)", () => {
  it("createCompanyQuick a findCompanyByIco; stejné IČO podruhé vyhodí větu", async () => {
    const u = await boss();
    const number = ico();
    const { id } = await createCompanyQuick(u.ctx, { name: `Rychlá ${tag()}`, ico: number });
    expect(await rawCompany(id)).toMatchObject({ ico: number, clientStatus: null, ownerId: u.id });
    expect(await findCompanyByIco(u.ctx, ` ${number} `)).toMatchObject({ id });
    await expect(
      createCompanyQuick(u.ctx, { name: `Druhá ${tag()}`, ico: number }),
    ).rejects.toThrow(/už existuje/);
  });

  it("createPersonQuick založí osobu s údaji a getPrimaryContact ji vrátí", async () => {
    const u = await boss();
    const t = tag();
    const firm = await createCompanyQuick(u.ctx, { name: `API firma ${t}` });
    const person1 = await createPersonQuick(u.ctx, {
      firstName: "Karel",
      lastName: `API ${t}`,
      companyId: firm.id,
      email: `karel-${t}@example.cz`,
      phone: "606 100 100",
    });
    expect(await getPrimaryContact(u.ctx, firm.id)).toEqual({
      personId: person1.id,
      name: `Karel API ${t}`,
      phone: "606 100 100",
      email: `karel-${t}@example.cz`,
    });
  });

  it("upsertContactFromLead: nový lead založí osobu a firmu bez stavu klienta, opakovaný lead nic nezdvojí", async () => {
    const u = await boss();
    const t = tag();
    const first = await upsertContactFromLead(u.ctx, {
      name: `Jan Lead${t}`,
      email: `Lead-${t}@Example.cz`,
      phone: "731 555 000",
      companyName: `Lead firma ${t}`,
    });
    expect(first.created).toEqual({ person: true, company: true });
    expect(await rawCompany(first.companyId!)).toMatchObject({ clientStatus: null });
    expect(await rawPerson(first.personId)).toMatchObject({
      firstName: "Jan",
      lastName: `Lead${t}`,
    });
    // stejný člověk, jiný zápis telefonu, nový e-mail, stejná firma jinými písmeny
    const second = await upsertContactFromLead(u.ctx, {
      name: `Jan Lead${t}`,
      phone: "+420731555000",
      email: `jiny-${t}@example.cz`,
      companyName: `LEAD FIRMA ${t}`,
    });
    expect(second).toMatchObject({
      personId: first.personId,
      companyId: first.companyId,
      created: { person: false, company: false },
    });
    const pts = await listPoints(app.db, first.personId);
    expect(pts.filter((p) => p.kind === "email")).toHaveLength(2);
    expect(pts.filter((p) => p.kind === "phone")).toHaveLength(1);
    // firma podle IČO
    const number = ico();
    const withIco = await upsertContactFromLead(u.ctx, {
      name: `Anna Test${t}`,
      companyName: `Podle IČO ${t}`,
      ico: number,
    });
    const again = await upsertContactFromLead(u.ctx, {
      name: `Boris Test${t}`,
      ico: ` ${number} `,
    });
    expect(again.companyId).toBe(withIco.companyId);
    // lead bez firmy
    const solo = await upsertContactFromLead(u.ctx, { name: `Solo${t}`, phone: "606 000 999" });
    expect(solo).toMatchObject({ companyId: null, created: { person: true, company: false } });
  });
});

describe("hledání (SPOL-hledání, KON-06)", () => {
  it("kontakty.search najde podle jména bez diakritiky, IČO, části telefonu bez předvolby i dalšího telefonu", async () => {
    const u = await boss();
    const t = tag();
    const c = await mkCompany(u, { name: `Řemeslná firma ${t}`, ico: ico() });
    const p = await mkPerson(u, {
      lastName: `Štěpánek ${t}`,
      company: c.id,
      phone: "+420 777 123 456",
    });
    await setPersonPointsCommand.handler(
      u.ctx,
      {
        personId: p.id,
        points: [
          { kind: "phone", value: "+420 777 123 456", isPrimary: true },
          { kind: "phone", value: "+420 605 909 808" },
        ],
      },
      deps(),
    );
    const byName = (await searchCommand.handler(u.ctx, { q: `remeslna firma ${t}` }, deps())) as {
      companies: { id: string }[];
    };
    expect(byName.companies.map((x) => x.id)).toContain(c.id);
    const byPartial = (await searchCommand.handler(u.ctx, { q: "777 123" }, deps())) as {
      persons: { id: string; companyName: string | null }[];
    };
    expect(byPartial.persons.find((x) => x.id === p.id)?.companyName).toBe(`Řemeslná firma ${t}`);
    const bySecond = (await searchCommand.handler(u.ctx, { q: "605909808" }, deps())) as {
      persons: { id: string }[];
    };
    expect(bySecond.persons.map((x) => x.id)).toContain(p.id);
    const nobody = await makeUser(app.db, [["zakazky.read", "all"]]);
    await expect(searchCommand.handler(nobody.ctx, { q: t }, deps())).rejects.toThrow(
      PermissionError,
    );
  });

  it("globální hledání najde osobu podle telefonu zapsaného v hlavním údaji", async () => {
    const u = await boss();
    const t = tag();
    await mkPerson(u, { lastName: `Hledaný ${t}`, phone: "+420 733 444 555" });
    const hits = await searchAll(u.ctx, [companyEntity, personEntity], `Hledaný ${t}`);
    expect(hits.map((h) => h.title)).toContain(`Hledaný ${t}`);
    const byPhone = await searchAll(u.ctx, [companyEntity, personEntity], "733444555");
    expect(byPhone.map((h) => h.title)).toContain(`Hledaný ${t}`);
  });

  it("seznam osob nabízí primární telefon a e-mail (KON-06) a seznam organizací vlastníka a stav klienta (ORG-09)", async () => {
    const u = await boss();
    const t = tag();
    await mkPerson(u, { lastName: `Seznam ${t}`, phone: "777111000", email: `s-${t}@example.cz` });
    const page = await queryRecords(u.ctx, registry, personE, { q: `Seznam ${t}` });
    expect(page.rows[0]).toMatchObject({ phone: "777111000", email: `s-${t}@example.cz` });
    const keys = personE.attributes.map((a) => a.key);
    for (const k of [
      "fullName",
      "company",
      "position",
      "phone",
      "email",
      "owner",
      "lastActivityAt",
    ])
      expect(keys).toContain(k);
    const ckeys = companyE.attributes.map((a) => a.key);
    for (const k of [
      "name",
      "ico",
      "city",
      "clientStatus",
      "services",
      "owner",
      "lastActivityAt",
      "tags",
    ])
      expect(ckeys).toContain(k);
    expect(await getRecord(u.ctx, registry, personE, page.rows[0]!.id as string)).toBeTruthy();
  });
});

describe("sloučení duplicit (ORG-07, KON-03)", () => {
  const poly = async (type: string, id: string, extra: Record<string, unknown> = {}) => {
    const u = await boss();
    await app.db.execute(
      sql`insert into comment (id, entity_type, entity_id, author_id, body) values (gen_random_uuid(), ${type}, ${id}::uuid, ${u.id}::uuid, ${`Komentář ${tag()}`})`,
    );
    return extra;
  };

  it("organizace: přepojí osoby, zakázky, úkoly, poznámky, domény a komentáře, doplní pole, spojí štítky a služby, zapíše historii", async () => {
    const u = await boss();
    const t = tag();
    const target = await mkCompany(u, {
      name: `Hlavní ${t}`,
      city: "Plzeň",
      tags: [],
      services: ["web"],
    });
    const source = await mkCompany(u, {
      name: `Duplicita ${t}`,
      ico: ico(),
      dic: "CZ1",
      city: "Praha",
      web: `https://dup-${t}.cz`,
      services: ["marketing"],
    });
    await app.db
      .update(company)
      .set({ clientStatus: "active", clientSince: "2025-03-01" })
      .where(eq(company.id, source.id));
    await app.db
      .update(company)
      .set({
        clientStatus: "lead",
        clientSince: "2026-01-01",
        clientContext: { decisionMaker: "Jana" },
      })
      .where(eq(company.id, target.id));
    const kid = await mkPerson(u, { lastName: `Kontakt ${t}`, company: source.id });
    const [job] = await app.db.execute(
      sql`insert into job (id, number, title, company_id, type) values (gen_random_uuid(), ${`Z-2026-${t}`}, ${`Zakázka ${t}`}, ${source.id}::uuid, 'web') returning id`,
    );
    await app.db.execute(
      sql`insert into task (id, title, company_id) values (gen_random_uuid(), ${`Úkol ${t}`}, ${source.id}::uuid)`,
    );
    await app.db.execute(
      sql`insert into note (id, company_id) values (gen_random_uuid(), ${source.id}::uuid)`,
    );
    await app.db.execute(
      sql`insert into web_domain (id, domain, company_id) values (gen_random_uuid(), ${`dup-${t}.cz`}, ${source.id}::uuid)`,
    );
    await poly("company", source.id);

    const preview = (await mergePreviewCommand.handler(
      u.ctx,
      { entity: "company", sourceId: source.id, targetId: target.id },
      deps(),
    )) as Awaited<ReturnType<typeof previewMerge>>;
    const moved = Object.fromEntries(preview.moves.map((m) => [m.table, m.count]));
    expect(moved).toMatchObject({ person: 1, job: 1, task: 1, note: 1, web_domain: 1, comment: 1 });
    expect(preview.fills.map((f) => f.field).sort()).toEqual(
      ["clientSince", "clientStatus", "dic", "ico", "web"].sort(),
    );
    expect(preview.warnings.join(" ")).toMatch(/Stav klienta se liší/);
    expect(preview.adds.join(" ")).toMatch(/Služby/);

    const res = await mergeApplyCommand.handler(
      u.ctx,
      { entity: "company", sourceId: source.id, targetId: target.id, confirm: true },
      deps(),
    );
    expect((res as { moved: number }).moved).toBeGreaterThanOrEqual(6);
    const after = await rawCompany(target.id);
    expect(after).toMatchObject({
      city: "Plzeň",
      dic: "CZ1",
      webDomain: `dup-${t}.cz`,
      clientStatus: "active",
      clientSince: "2025-03-01",
      clientContext: { decisionMaker: "Jana" },
    });
    expect([...after.services].sort()).toEqual(["marketing", "web"]);
    expect(after.ico).toBeTruthy();
    expect((await rawPerson(kid.id)).primaryCompanyId).toBe(target.id);
    expect(
      (
        await app.db.execute(
          sql`select company_id from job where id = ${(job as { id: string }).id}::uuid`,
        )
      )[0],
    ).toMatchObject({ company_id: target.id });
    const left = await app.db.execute(
      sql`select (select count(*) from task where company_id = ${source.id}::uuid)::int as t, (select count(*) from note where company_id = ${source.id}::uuid)::int as n, (select count(*) from comment where entity_id = ${source.id}::uuid)::int as c`,
    );
    expect(left[0]).toMatchObject({ t: 0, n: 0, c: 0 });
    expect((await rawCompany(source.id)).deletedAt).not.toBeNull();
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityId, target.id), eq(schema.auditLog.action, "merge")));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.summary).toMatch(/Sloučeno/);
  });

  it("osoby: kontaktní údaje se spojí bez opakování (telefon v jiném zápisu), hlavní zůstane, vazby se přepojí", async () => {
    const u = await boss();
    const t = tag();
    const firmA = await mkCompany(u, { name: `A ${t}` });
    const firmB = await mkCompany(u, { name: `B ${t}` });
    const target = await mkPerson(u, {
      lastName: `Cíl ${t}`,
      email: `a-${t}@example.cz`,
      phone: "+420 777 000 111",
      company: firmA.id,
    });
    const source = await mkPerson(u, {
      lastName: `Zdroj ${t}`,
      email: `b-${t}@example.cz`,
      phone: "777000111",
      position: "Ředitel",
      company: firmB.id,
      isDecisionMaker: true,
    });
    await setPersonPointsCommand.handler(
      u.ctx,
      {
        personId: source.id,
        points: [
          { kind: "email", value: `b-${t}@example.cz`, isPrimary: true },
          { kind: "phone", value: "777000111", isPrimary: true },
          { kind: "phone", value: "602 123 456", label: "work" },
        ],
      },
      deps(),
    );
    await app.db.execute(
      sql`insert into note (id, person_id) values (gen_random_uuid(), ${source.id}::uuid)`,
    );

    const preview = await previewMerge(u.ctx, "person", source.id, target.id);
    expect(preview.adds.join(" ")).toMatch(/E-maily a telefony/);
    expect(preview.adds.join(" ")).toMatch(/další organizace/);
    await mergeContacts(u.ctx, "person", source.id, target.id);

    const merged = await rawPerson(target.id);
    expect(merged).toMatchObject({
      position: "Ředitel",
      isDecisionMaker: true,
      primaryEmail: `a-${t}@example.cz`,
      primaryCompanyId: firmA.id,
    });
    const pts = await livePoints(target.id);
    const norms = pts.map((p) => `${p.kind}:${p.valueNorm}:${p.isPrimary}`).sort();
    expect(norms).toEqual(
      [
        `email:a-${t}@example.cz:true`,
        `email:b-${t}@example.cz:false`,
        "phone:+420777000111:true",
        "phone:+420602123456:false",
      ].sort(),
    );
    expect(pts.find((p) => p.valueNorm === "+420602123456")?.label).toBe("work");
    // hlavní organizace zdroje zůstala jako další organizace cíle
    const others = await app.db
      .select()
      .from(personCompany)
      .where(and(eq(personCompany.personId, target.id), isNull(personCompany.deletedAt)));
    expect(others.map((o) => o.companyId)).toEqual([firmB.id]);
    expect(
      (
        await app.db.execute(
          sql`select count(*)::int as n from note where person_id = ${target.id}::uuid`,
        )
      )[0],
    ).toMatchObject({ n: 1 });
    expect((await rawPerson(source.id)).deletedAt).not.toBeNull();
    // po sloučení je duplicita pryč
    expect(
      (await findContactDuplicates(u.ctx, { phones: ["602123456"] })).map((d) => d.personId),
    ).toEqual([target.id]);
  });

  it("chrání: stejný záznam, cizí rozsah, chybějící potvrzení a oprávnění; zámek se nepřenáší", async () => {
    const u = await boss();
    const a = await mkCompany(u, { name: `A ${tag()}` });
    const b = await mkCompany(u, { name: `B ${tag()}` });
    await expect(mergeContacts(u.ctx, "company", a.id, a.id)).rejects.toThrow(UserError);
    expect(
      mergeApplyCommand.input.safeParse({ entity: "company", sourceId: a.id, targetId: b.id })
        .success,
    ).toBe(false);
    expect(mergeApplyCommand.permission).toBe("kontakty.merge");
    expect(mergePreviewCommand.permission).toBe("kontakty.merge");
    // partner nemá kontakty.merge
    const p = await partner();
    expect(p.ctx.actor.permissions.has("kontakty.merge")).toBe(false);
    // jen vlastní záznamy: cizí organizaci uživatel s rozsahem „moje“ neslučuje
    const mine = await makeUser(app.db, [
      ["kontakty.read", "own"],
      ["kontakty.write", "own"],
      ["kontakty.merge", "all"],
    ]);
    await expect(mergeContacts(mine.ctx, "company", a.id, b.id)).rejects.toThrow();
    // zámek zdroje se nepřenáší na hlavní záznam
    await app.db.execute(
      sql`insert into private_record (entity_type, entity_id) values ('company', ${a.id}::uuid)`,
    );
    await mergeContacts(u.ctx, "company", a.id, b.id);
    const lock = await app.db.execute(
      sql`select count(*)::int as n from private_record where entity_id = ${b.id}::uuid`,
    );
    expect(lock[0]).toMatchObject({ n: 0 });
  });

  it("odkazy: objevené sloupce zahrnují cizí klíče, měkké vazby i polymorfní tabulky modulů OPSYS", async () => {
    const { discoverReferences } = await import("../packages/modules/kontakty/src/merge");
    const refs = await discoverReferences(app.db, "company");
    const cols = refs.columns.map((c) => `${c.table}.${c.column}`);
    expect(cols).toEqual(
      expect.arrayContaining([
        "job.company_id",
        "person.primary_company_id",
        "person_company.company_id",
        "deal.company_id",
        "task.company_id",
        "note.company_id",
        "payment.company_id",
        "ad_account.company_id",
        "web_domain.company_id",
        "recurring_service.company_id",
        "calendar_event.company_id",
      ]),
    );
    expect(refs.poly.map((p) => p.table)).toEqual(
      expect.arrayContaining(["comment", "attachment"]),
    );
    for (const skip of ["audit_log", "search_document", "private_record", "recent_record"])
      expect(refs.poly.map((p) => p.table)).not.toContain(skip);
    const personRefs = await discoverReferences(app.db, "person");
    expect(personRefs.columns.map((c) => `${c.table}.${c.column}`)).toEqual(
      expect.arrayContaining([
        "deal.person_id",
        "task.person_id",
        "note.person_id",
        "job_participant.person_id",
        "deal_participant.person_id",
      ]),
    );
  });
});
