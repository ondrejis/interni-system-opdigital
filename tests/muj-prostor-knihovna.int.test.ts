import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PermissionError, UserError, type Ctx } from "@rebar/core/rbac";
import { schema, type Db } from "@rebar/core/db";
import { ensureLookup } from "@rebar/core/config-data";
import type { EmailVarsProvider } from "@rebar/core/contracts";
import {
  createRecord,
  getRecord,
  queryRecords,
  resolveEntity,
  updateRecord,
  type ResolvedEntity,
} from "@rebar/core/entities";
import { createModuleDeps, type ModuleDeps } from "@rebar/core/module-server";
import { connectAppDb } from "@rebar/core/testing";
import { person } from "@rebar/kontakty/schema";
import { emailLibraryItem } from "@rebar/muj-prostor/schema";
import { assertCommandPermission } from "../apps/web/src/server/command-gate";
import { normalizeSearch } from "../packages/modules/muj-prostor/src/library/logic";
import { loadPrivateOverview } from "../packages/modules/muj-prostor/src/private/data";
import type {
  LibraryList,
  LibraryMoveResult,
  LibraryPreview,
  LibraryVariables,
  PickOption,
} from "../packages/modules/muj-prostor/src/library/types";
import type {
  CreateNoteResult,
  PrivateOverview,
} from "../packages/modules/muj-prostor/src/private/types";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  MPR-2: e-mailová knihovna (KNI-01, KNI-02) a přehled Soukromé (SOUK-01). Čisté funkce (proměnné, náhled, Gmail URL,
  převod textu) jsou v unit testech `library/logic.test.ts`; tady se hlídá databáze: hledání bez diakritiky, náhled s daty
  kontaktu, přesun mezi knihovnou a šablonami (přes službu `emailTemplates`, zatím falešnou), přehled soukromých záznamů
  a to, že z toho Patrik nevidí a nespočítá nic.
*/

const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let deps: ModuleDeps;
let owner: Ctx;
let partner: Ctx;
const tag = Math.random().toString(36).slice(2, 8);

const R = (key: string): Promise<ResolvedEntity> =>
  resolveEntity(db, f.registry.get(key) ?? (undefined as never));

/** Zavolá příkaz stejně jako server action: brána oprávnění, validace vstupu, handler. */
async function run<T>(ctx: Ctx, name: string, input: unknown): Promise<T> {
  const cmd = f.collected.commands.get(name);
  if (!cmd) throw new Error(`Neznámý příkaz ${name}`);
  assertCommandPermission(ctx, cmd);
  return (await cmd.handler(ctx, cmd.input.parse(input), deps)) as T;
}

/** Falešná služba sdílených šablon: zapisuje volání a drží „šablony“ v paměti. */
const templates = new Map<string, Record<string, unknown>>();
const removed: string[] = [];
const fakeTemplates = {
  async importText(_ctx: Ctx, input: Record<string, unknown>) {
    const id = crypto.randomUUID();
    templates.set(id, { ...input });
    return { id, href: `/sablony-emailu/${id}` };
  },
  async exportText(_ctx: Ctx, id: string) {
    const t = templates.get(id);
    if (!t) return null;
    return {
      name: String(t.name),
      category: (t.category as string | null) ?? null,
      subject: String(t.subject),
      bodyText: String(t.bodyText ?? ""),
      bodyJson: (t.bodyJson as Record<string, unknown> | null) ?? null,
      tags: (t.tags as string[]) ?? [],
    };
  },
  async remove(_ctx: Ctx, id: string) {
    removed.push(id);
    templates.delete(id);
  },
};

let personId: string;
let companyId: string;
const provider: EmailVarsProvider = {
  entityType: "person",
  vars: [{ key: "jmeno", label: "Křestní jméno" }],
  resolve: async (ctx, id) => {
    const [p] = await ctx.db.select({ n: person.firstName }).from(person).where(eq(person.id, id));
    return { jmeno: p?.n ?? "" };
  },
};
const companyProvider: EmailVarsProvider = {
  entityType: "company",
  vars: [{ key: "firma", label: "Organizace" }],
  resolve: async (ctx, id) => {
    const t = await (
      await import("@rebar/core/entities")
    ).recordTitles(ctx, f.registry, "company", [id]);
    return { firma: t[id] ?? "" };
  },
};

const newItem = async (v: Record<string, unknown>) =>
  (await createRecord(owner, f.registry, await R("email_library_item"), v)).row;

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  deps = createModuleDeps(
    {
      registry: f.deps.registry,
      queue: f.deps.queue,
      storage: f.deps.storage,
      settings: f.deps.settings,
      cipher: f.deps.cipher,
      baseURL: f.deps.baseURL,
      emit: f.deps.emit,
      calendarLayers: f.deps.calendarLayers,
    },
    {
      services: {
        ...f.collected.services,
        emailTemplates: () => fakeTemplates,
      } as never,
      contributions: { ...f.collected.contributions, emailVars: [provider, companyProvider] },
    },
  );
  owner = f.people.owner.ctx;
  partner = f.people.partner.ctx;
  const listId = await ensureLookup(db, { key: "tag", name: "Štítky", items: [] });
  await db.insert(schema.lookupItem).values([
    { listId, value: "nabidky", label: "Nabídky", position: 0 },
    { listId, value: "platby", label: "Připomínky plateb", position: 1 },
  ]);
  const co = await createRecord(owner, f.registry, await R("company"), {
    name: `Klient ${tag} s.r.o.`,
  });
  companyId = co.row.id;
  const pe = await createRecord(owner, f.registry, await R("person"), {
    firstName: "Jana",
    lastName: `Novotná${tag}`,
    company: companyId,
  });
  personId = pe.row.id;
  await db
    .update(person)
    .set({ primaryEmail: `jana-${tag}@example.cz` })
    .where(eq(person.id, personId));
}, 120_000);
afterAll(async () => {
  await discard();
  await app.close();
});

describe("evidence položek (KNI-01)", () => {
  it("text je prostý, prázdný text se uloží jako prázdný řetězec a úprava vynuluje dokument Tiptap", async () => {
    const created = await newItem({ title: `Prázdná ${tag}` });
    expect(created.body).toBe("");
    const [raw] = await db
      .select()
      .from(emailLibraryItem)
      .where(eq(emailLibraryItem.id, created.id));
    expect(raw!.bodyText).toBe("");
    await db
      .update(emailLibraryItem)
      .set({ bodyJson: { type: "doc", content: [] } })
      .where(eq(emailLibraryItem.id, created.id));
    await updateRecord(owner, f.registry, await R("email_library_item"), created.id, {
      body: "Nový text",
    });
    const [after] = await db
      .select()
      .from(emailLibraryItem)
      .where(eq(emailLibraryItem.id, created.id));
    expect(after!.bodyText).toBe("Nový text");
    expect(after!.bodyJson).toBeNull();
    await updateRecord(owner, f.registry, await R("email_library_item"), created.id, {
      body: null,
    });
    const [cleared] = await db
      .select()
      .from(emailLibraryItem)
      .where(eq(emailLibraryItem.id, created.id));
    expect(cleared!.bodyText).toBe("");
  });
});

describe("hledání (bez diakritiky, filtry, štítky)", () => {
  let a: string;
  let b: string;
  beforeAll(async () => {
    a = (
      await newItem({
        title: `Žádost o podklady ${tag}`,
        category: "Onboarding",
        subject: "Potřebujeme podklady",
        body: "Dobrý den {jmeno}, pošlete prosím loga.",
        tags: ["nabidky"],
      })
    ).id;
    b = (
      await newItem({
        title: `Připomínka faktury ${tag}`,
        category: "Platby",
        subject: "Faktura po splatnosti",
        body: "Šťastný den, faktura je po splatnosti.",
        tags: ["platby"],
      })
    ).id;
  });
  const ids = (r: LibraryList) => r.rows.map((x) => x.id);

  it("najde bez ohledu na diakritiku a velikost písmen v názvu, textu, kategorii, předmětu i popisku štítku", async () => {
    const list = (q: string) => run<LibraryList>(owner, "muj-prostor.library.list", { q });
    expect(ids(await list(`ZADOST ${tag}`))).toEqual([a]);
    expect(ids(await list("loga"))).toEqual([a]);
    expect(ids(await list("stastny"))).toEqual([b]);
    expect(ids(await list("platby"))).toContain(b); // kategorie i štítek
    expect(ids(await list("pripominky plateb"))).toEqual([b]); // popisek štítku
    expect(ids(await list("onboarding podklady"))).toEqual([a]); // všechna slova
    expect(ids(await list(`žádost faktura ${tag}`))).toEqual([]);
    expect(ids(await list("100%_"))).toEqual([]);
  });

  it("filtr kategorie a štítku se přidá k hledání; počty jsou přes celou knihovnu", async () => {
    const byCat = await run<LibraryList>(owner, "muj-prostor.library.list", { category: "platby" });
    expect(ids(byCat)).toEqual([b]);
    const byTag = await run<LibraryList>(owner, "muj-prostor.library.list", {
      tag: "nabidky",
      q: tag,
    });
    expect(ids(byTag)).toEqual([a]);
    expect(byTag.categories.map((c) => c.name)).toEqual(
      expect.arrayContaining(["Onboarding", "Platby"]),
    );
    const t = byTag.tags.find((x) => x.value === "platby");
    expect(t).toMatchObject({ label: "Připomínky plateb", count: 1 });
    expect(byTag.total).toBe(1);
  });

  it("řadí podle názvu bez diakritiky, nebo podle poslední úpravy", async () => {
    const byName = await run<LibraryList>(owner, "muj-prostor.library.list", {
      q: tag,
      sort: "title",
    });
    const names = byName.rows.map((r) => normalizeSearch(r.title));
    expect(names).toEqual([...names].sort());
    expect(byName.rows.at(-1)!.id).toBe(a); // „Žádost…“ je až za „Připomínka…“
    await new Promise((r) => setTimeout(r, 30));
    await updateRecord(owner, f.registry, await R("email_library_item"), a, {
      subject: "Nový předmět",
    });
    const byTime = await run<LibraryList>(owner, "muj-prostor.library.list", {
      q: tag,
      sort: "updated",
    });
    expect(byTime.rows[0]!.id).toBe(a);
  });
});

describe("náhled s daty kontaktu (KNI-01)", () => {
  let item: string;
  beforeAll(async () => {
    item = (
      await newItem({
        title: `Nabídka ${tag}`,
        subject: "Nabídka pro {firma}",
        body: "Dobrý den {jmeno},\nposílá {odesilatel}.\nObchod: {obchod}",
      })
    ).id;
  });

  it("katalog obsahuje příspěvky modulů, výchozí proměnné a odesílatele", async () => {
    const c = await run<LibraryVariables>(owner, "muj-prostor.library.variables", {});
    const byKey = Object.fromEntries(c.variables.map((v) => [v.key, v]));
    expect(byKey.jmeno).toMatchObject({ source: "person", available: true });
    expect(byKey.firma).toMatchObject({ source: "company", available: true });
    expect(byKey.obchod).toMatchObject({ available: false });
    expect(byKey.odesilatel).toMatchObject({ source: "sender", available: true });
    expect(c.pickers).toEqual(["person", "company"]);
    expect(c.templatesAvailable).toBe(true);
  });

  it("bez výběru zůstanou proměnné jako zástupné symboly", async () => {
    const p = await run<LibraryPreview>(owner, "muj-prostor.library.preview", { id: item });
    expect(p.filled).toBe(false);
    expect(p.subject).toBe("Nabídka pro {firma}");
    expect(p.body).toContain("{jmeno}");
    expect(p.to).toBeNull();
    expect(p.missing).toEqual([]);
  });

  it("s kontaktem doplní jméno, firmu z jeho organizace, odesílatele, adresáta a odkaz do Gmailu; chybějící označí", async () => {
    const p = await run<LibraryPreview>(owner, "muj-prostor.library.preview", {
      id: item,
      context: { personId },
    });
    expect(p.filled).toBe(true);
    expect(p.labels.person).toContain("Jana");
    expect(p.labels.company).toBe(`Klient ${tag} s.r.o.`);
    expect(p.subject).toBe(`Nabídka pro Klient ${tag} s.r.o.`);
    expect(p.body).toContain("Dobrý den Jana,");
    expect(p.body).toContain(`posílá ${f.people.owner.name}.`);
    expect(p.missing).toEqual(["obchod"]);
    expect(p.to).toBe(`jana-${tag}@example.cz`);
    const q = new URL(p.gmailUrl!).searchParams;
    expect(q.get("to")).toBe(p.to);
    expect(q.get("su")).toBe(p.subject);
    expect(q.get("body")).toBe(p.body);
    expect(p.mailtoUrl).toMatch(/^mailto:jana-/);
  });

  it("příliš dlouhý text nemá odkaz do Gmailu (R-46)", async () => {
    const long = await newItem({ title: `Dlouhý ${tag}`, body: "ž".repeat(2500) });
    const p = await run<LibraryPreview>(owner, "muj-prostor.library.preview", { id: long.id });
    expect(p.tooLong).toBe(true);
    expect(p.gmailUrl).toBeNull();
    expect(p.body).toHaveLength(2500);
  });

  it("neexistující položka a neviditelný kontakt jsou „nenalezeno“", async () => {
    await expect(
      run(owner, "muj-prostor.library.preview", { id: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toThrow(/nenalezena/);
    await expect(
      run(owner, "muj-prostor.library.preview", {
        id: item,
        context: { personId: "00000000-0000-4000-8000-000000000000" },
      }),
    ).rejects.toThrow(/nenalezen/);
  });

  it("výběr kontaktů a organizací pro náhled", async () => {
    const people = await run<PickOption[]>(owner, "muj-prostor.library.pick", {
      kind: "person",
      q: `novotna${tag}`,
    });
    expect(people.map((p) => p.id)).toEqual([personId]);
    expect(people[0]!.companyId).toBe(companyId);
    const cos = await run<PickOption[]>(owner, "muj-prostor.library.pick", {
      kind: "company",
      q: tag,
    });
    expect(cos.map((c) => c.id)).toContain(companyId);
    expect(await run(owner, "muj-prostor.library.pick", { kind: "deal", q: "x" })).toBeInstanceOf(
      Array,
    );
  });
});

describe("přesun mezi knihovnou a sdílenými šablonami (KNI-02)", () => {
  it("do šablon: šablona vznikne s textem i dokumentem Tiptap, původní položka jde do koše", async () => {
    const it1 = await newItem({
      title: `Přesun ${tag}`,
      category: "X",
      subject: "S",
      body: "řádek 1\nřádek 2",
    });
    const r = await run<LibraryMoveResult>(owner, "muj-prostor.library.move", {
      direction: "toTemplates",
      id: it1.id,
      language: "sk",
    });
    expect(r.kept).toBe(false);
    const created = templates.get(r.id)!;
    expect(created).toMatchObject({
      name: `Přesun ${tag}`,
      category: "X",
      language: "sk",
      subject: "S",
      bodyText: "řádek 1\nřádek 2",
    });
    expect((created.bodyJson as { content: unknown[] }).content).toHaveLength(2);
    const [raw] = await db.select().from(emailLibraryItem).where(eq(emailLibraryItem.id, it1.id));
    expect(raw!.deletedAt).not.toBeNull();
  });

  it("kopie ponechá původní položku", async () => {
    const it1 = await newItem({ title: `Kopie ${tag}`, body: "t" });
    const r = await run<LibraryMoveResult>(owner, "muj-prostor.library.move", {
      direction: "toTemplates",
      id: it1.id,
      keepSource: true,
    });
    expect(r.kept).toBe(true);
    const [raw] = await db.select().from(emailLibraryItem).where(eq(emailLibraryItem.id, it1.id));
    expect(raw!.deletedAt).toBeNull();
  });

  it("ze šablony: položka vznikne z prostého textu (jinak z dokumentu), šablona se odebere", async () => {
    const tid = crypto.randomUUID();
    templates.set(tid, {
      name: `Šablona ${tag}`,
      category: "Follow-up",
      subject: "Předmět",
      bodyText: "",
      bodyJson: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Z dokumentu" }] }],
      },
      tags: ["nabidky"],
    });
    const r = await run<LibraryMoveResult>(owner, "muj-prostor.library.move", {
      direction: "fromTemplate",
      id: tid,
    });
    expect(removed).toContain(tid);
    const rec = await getRecord(owner, f.registry, await R("email_library_item"), r.id);
    expect(rec.row).toMatchObject({
      title: `Šablona ${tag}`,
      category: "Follow-up",
      body: "Z dokumentu",
      tags: ["nabidky"],
    });
    await expect(
      run(owner, "muj-prostor.library.move", {
        direction: "fromTemplate",
        id: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/nenalezena/);
  });

  it("bez služby šablon se nic nepřesune a položka zůstane", async () => {
    const bare = createModuleDeps({ ...deps, services: undefined as never } as never, {
      services: {} as never,
      contributions: {},
    });
    const it1 = await newItem({ title: `Bez služby ${tag}` });
    const cmd = f.collected.commands.get("muj-prostor.library.move")!;
    await expect(
      cmd.handler(owner, cmd.input.parse({ direction: "toTemplates", id: it1.id }), bare),
    ).rejects.toBeInstanceOf(UserError);
    const [raw] = await db.select().from(emailLibraryItem).where(eq(emailLibraryItem.id, it1.id));
    expect(raw!.deletedAt).toBeNull();
  });
});

describe("Soukromé (SOUK-01)", () => {
  const CANARY = `PRIVATE-CANARY-${tag}`;
  it("přehled seskupí soukromé záznamy podle typu; sdílené tam nejsou", async () => {
    const note = await R("note");
    await createRecord(owner, f.registry, note, { title: `${CANARY} poznámka`, isPrivate: true });
    await createRecord(owner, f.registry, note, { title: `Sdílená ${tag}` });
    const o = await run<PrivateOverview>(owner, "muj-prostor.private.overview", {});
    const g = o.groups.find((x) => x.entityType === "note")!;
    expect(g.rows.map((r) => r.title)).toContain(`${CANARY} poznámka`);
    expect(g.rows.map((r) => r.title)).not.toContain(`Sdílená ${tag}`);
    expect(g.total).toBe(g.rows.length);
    expect(o.total).toBe(o.groups.reduce((n, x) => n + x.total, 0));
    expect(o.groups.every((x) => x.total > 0)).toBe(true);
    expect(g.rows[0]!.href).toMatch(/^\/poznamky\//);
  });

  it("zakázky, úkoly a poznámky jsou před ostatními typy", async () => {
    const o = await loadPrivateOverview(owner, deps);
    const order = o.groups.map((x) => x.entityType);
    const rank = (k: string) => ["job", "task", "note"].indexOf(k);
    const known = order.filter((k) => rank(k) >= 0);
    expect(known).toEqual([...known].sort((a, b) => rank(a) - rank(b)));
    expect(order.slice(0, known.length)).toEqual(known);
  });

  it("Patrik nemá k přehledu ani k zakládání poznámek přístup; čtecí cesta mu vrátí prázdno bez canary", async () => {
    await expect(run(partner, "muj-prostor.private.overview", {})).rejects.toBeInstanceOf(
      PermissionError,
    );
    await expect(
      run(partner, "muj-prostor.private.createNote", { text: "x" }),
    ).rejects.toBeInstanceOf(PermissionError);
    const empty = await loadPrivateOverview(partner, deps);
    expect(empty).toEqual({ groups: [], total: 0, canCreateNote: false });
    expect(JSON.stringify(empty)).not.toContain("CANARY");
    const page = await queryRecords(partner, f.registry, await R("note"), { q: CANARY });
    expect(page.total).toBe(0);
  });

  it("nová soukromá poznámka vznikne přes službu úkolů jako soukromá bez vazby a Patrik ji nenajde", async () => {
    const r = await run<CreateNoteResult>(owner, "muj-prostor.private.createNote", {
      title: `${CANARY} nová`,
      text: "Řádek 1\nŘádek 2",
    });
    const rec = await getRecord(owner, f.registry, await R("note"), r.id);
    expect(rec.row).toMatchObject({ title: `${CANARY} nová`, isPrivate: true });
    expect(rec.row.deal ?? null).toBeNull();
    expect(rec.row.job ?? null).toBeNull();
    const seen = await queryRecords(partner, f.registry, await R("note"), { q: "nová" });
    expect(JSON.stringify(seen)).not.toContain(CANARY);
    const o = await run<PrivateOverview>(owner, "muj-prostor.private.overview", {});
    expect(o.canCreateNote).toBe(true);
    expect(o.groups.find((x) => x.entityType === "note")!.rows.map((x) => x.id)).toContain(r.id);
  });

  it("prázdný text se odmítne", async () => {
    await expect(run(owner, "muj-prostor.private.createNote", { text: "   " })).rejects.toThrow();
  });
});

describe("oprávnění knihovny", () => {
  it("Patrik nesmí volat žádný příkaz knihovny", () => {
    for (const name of ["list", "variables", "preview", "pick", "move"]) {
      const cmd = f.collected.commands.get(`muj-prostor.library.${name}`)!;
      expect(() => assertCommandPermission(partner, cmd), name).toThrow(PermissionError);
    }
  });
});
