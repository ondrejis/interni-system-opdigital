import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Db } from "@rebar/core/db";
import { searchAll } from "@rebar/core/entities";
import { createModuleDeps, type ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import { connectAppDb } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { note } from "@rebar/ukoly/schema";
import {
  noteCreateCommand,
  noteDeleteCommand,
  noteGetCommand,
  noteListCommand,
  notePinCommand,
  noteSaveCommand,
  noteUpdateCommand,
} from "../packages/modules/ukoly/src/notes/commands";
import { noteClientCard } from "../packages/modules/ukoly/src/notes/providers";
import { notePrivatePaths } from "../packages/modules/ukoly/src/notes/providers";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Poznámky (UKO-N) nad skutečnou databází: sanitizace při zápisu, autosave s verzí a konfliktem, historie změn, připnutí
  a řazení, vazby a záložka u klienta, hledání v textu bez diakritiky, soukromí (partner nic soukromého nevidí) a služba
  `tasks.createPrivateNote`. Celý soubor běží v jedné transakci, která se vrátí.
*/
const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let deps: ModuleDeps;

const owner = () => f.people.owner.ctx;
const partner = () => f.people.partner.ctx;
const external = () => f.people.external.ctx;

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  deps = createModuleDeps(
    {
      registry: f.registry,
      queue: { send: async () => null },
      storage: f.deps.storage,
      settings: f.deps.settings,
      cipher: f.deps.cipher,
      baseURL: "http://localhost:3100",
      emit: async () => {},
      calendarLayers: f.collected.calendarLayers,
    },
    { services: f.collected.services, contributions: f.collected.contributions },
  );
}, 120_000);

afterAll(async () => {
  await discard();
  await app.close();
});

const run = async <S extends { input: { parse: (v: unknown) => unknown } }>(
  cmd: S & { handler: (ctx: never, i: never, d: ModuleDeps) => Promise<unknown> },
  who: ReturnType<typeof owner>,
  input: unknown,
) => cmd.handler(who as never, cmd.input.parse(input) as never, deps);
const T = (v: unknown) => v as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const p = (text: string, marks?: unknown[]) => ({
  type: "paragraph",
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});
const doc = (...content: unknown[]) => ({ type: "doc", content });

async function makeCompany(name = "Novák s.r.o.") {
  const [c] = await db.insert(company).values({ name }).returning();
  return c!.id;
}
const auditOf = (id: string) =>
  db
    .select()
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.entityType, "note"), eq(schema.auditLog.entityId, id)))
    .orderBy(schema.auditLog.occurredAt);

describe("založení a sanitizace", () => {
  it("poznámka se založí, text a název se odvodí na serveru, nebezpečný obsah se zahodí", async () => {
    const n = T(
      await run(noteCreateCommand, owner(), {
        bodyJson: doc(
          {
            type: "heading",
            attrs: { level: 2, onclick: "x" },
            content: [{ type: "text", text: "Schůzka s Novákem" }],
          },
          p("odkaz", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
          { type: "image", attrs: { src: "x", onerror: "alert(1)" } },
          {
            type: "taskList",
            content: [{ type: "taskItem", attrs: { checked: true }, content: [p("hotovo")] }],
          },
        ),
      }),
    );
    expect(n).toMatchObject({
      title: "Schůzka s Novákem",
      version: 1,
      pinned: false,
      link: null,
      canWrite: true,
    });
    expect(n.bodyText).toBe("Schůzka s Novákem\nodkaz\nhotovo");
    const json = JSON.stringify(n.bodyJson);
    expect(json).not.toContain("javascript");
    expect(json).not.toContain("onclick");
    expect(json).not.toContain("image");
    const [row] = await db.select().from(note).where(eq(note.id, n.id));
    expect(JSON.stringify(row!.bodyJson)).not.toContain("javascript");
    expect(row!.createdBy).toBe(f.people.owner.id);
  });

  it("příliš dlouhý nebo nesmyslný obsah je chyba pro uživatele", async () => {
    await expect(
      run(noteCreateCommand, owner(), { bodyJson: doc(p("x".repeat(300_000))) }),
    ).rejects.toThrow(UserError);
    await expect(run(noteCreateCommand, owner(), { bodyJson: { type: "div" } })).rejects.toThrow(
      UserError,
    );
  });

  it("vazba nejvýš na jeden záznam; neexistující záznam nejde použít", async () => {
    const a = await makeCompany();
    await expect(run(noteCreateCommand, owner(), { companyId: a, jobId: a })).rejects.toThrow();
    await expect(
      run(noteCreateCommand, owner(), { companyId: "11111111-1111-4111-8111-111111111111" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("zápis do historie při založení", async () => {
    const n = T(
      await run(noteCreateCommand, owner(), { title: "Rámec", bodyJson: doc(p("text")) }),
    );
    const [a] = await auditOf(n.id);
    expect(a).toMatchObject({ action: "create", entityTitle: "Rámec" });
    expect(a!.changes.map((c: { field: string }) => c.field)).toEqual(["Název", "Text"]);
  });
});

describe("autosave: verze, konflikt, historie", () => {
  it("uložení zvedne verzi, zapíše změnu do historie a aktualizuje automatický název", async () => {
    const n = T(await run(noteCreateCommand, owner(), { bodyJson: doc(p("První verze")) }));
    expect(n.title).toBe("První verze");
    const r = T(
      await run(noteSaveCommand, owner(), {
        id: n.id,
        baseVersion: 1,
        bodyJson: doc(p("Druhá verze\nvíc textu")),
      }),
    );
    expect(r.status).toBe("saved");
    expect(r.unchanged).toBe(false);
    expect(r.note).toMatchObject({ version: 2, title: "Druhá verze" });
    const hist = await auditOf(n.id);
    expect(hist.map((h) => h.action)).toEqual(["create", "update"]);
    expect(hist[1]!.changes.some((c: { field: string }) => c.field === "Text")).toBe(true);
    expect(hist[1]!.context).toMatchObject({ entityType: "note", entityId: n.id });
  });

  it("stejný obsah nic nezapíše (ani verzi, ani historii)", async () => {
    const n = T(await run(noteCreateCommand, owner(), { bodyJson: doc(p("beze změny")) }));
    const r = T(
      await run(noteSaveCommand, owner(), {
        id: n.id,
        baseVersion: 1,
        bodyJson: doc(p("beze změny")),
      }),
    );
    expect(r).toMatchObject({ status: "saved", unchanged: true });
    expect(r.note.version).toBe(1);
    expect(await auditOf(n.id)).toHaveLength(1);
  });

  it("zápis ze zastaralé verze se nepřepíše mlčky; `force` = poslední zápis vyhrává", async () => {
    const n = T(await run(noteCreateCommand, owner(), { bodyJson: doc(p("základ")) }));
    await run(noteSaveCommand, owner(), { id: n.id, baseVersion: 1, bodyJson: doc(p("z okna A")) });
    const stale = T(
      await run(noteSaveCommand, owner(), {
        id: n.id,
        baseVersion: 1,
        bodyJson: doc(p("z okna B")),
      }),
    );
    expect(stale.status).toBe("conflict");
    expect(stale.note).toMatchObject({ version: 2, bodyText: "z okna A" });
    expect(T(await run(noteGetCommand, owner(), { id: n.id })).bodyText).toBe("z okna A");
    const forced = T(
      await run(noteSaveCommand, owner(), {
        id: n.id,
        baseVersion: 2,
        bodyJson: doc(p("z okna B")),
        force: true,
      }),
    );
    expect(forced).toMatchObject({ status: "saved" });
    expect(forced.note).toMatchObject({ version: 3, bodyText: "z okna B" });
    // po zvednutí verze naváže další zápis bez konfliktu
    const next = T(
      await run(noteSaveCommand, owner(), { id: n.id, baseVersion: 3, bodyJson: doc(p("dál")) }),
    );
    expect(next.status).toBe("saved");
  });

  it("změna jen názvu verzi nezvedne a konflikt nevyvolá; ručně zadaný název přežije další úpravu textu", async () => {
    const n = T(await run(noteCreateCommand, owner(), { bodyJson: doc(p("text")) }));
    await run(noteSaveCommand, owner(), { id: n.id, baseVersion: 1, bodyJson: doc(p("text 2")) }); // verze 2
    const t = T(
      await run(noteSaveCommand, owner(), { id: n.id, baseVersion: 1, title: "Můj název" }),
    );
    expect(t).toMatchObject({ status: "saved" });
    expect(t.note).toMatchObject({ title: "Můj název", version: 2 });
    const after = T(
      await run(noteSaveCommand, owner(), {
        id: n.id,
        baseVersion: 2,
        bodyJson: doc(p("zcela jiný")),
      }),
    );
    expect(after.note.title).toBe("Můj název");
  });

  it("neexistující a smazaná poznámka je NotFound", async () => {
    await expect(
      run(noteSaveCommand, owner(), {
        id: "11111111-1111-4111-8111-111111111111",
        baseVersion: 1,
        title: "x",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("nebezpečný obsah v autosavu se zahodí stejně jako při založení", async () => {
    const n = T(await run(noteCreateCommand, owner(), {}));
    const r = T(
      await run(noteSaveCommand, owner(), {
        id: n.id,
        baseVersion: 1,
        bodyJson: doc(
          p("x", [{ type: "link", attrs: { href: "data:text/html,<script>1</script>" } }]),
        ),
      }),
    );
    expect(JSON.stringify(r.note.bodyJson)).not.toContain("data:");
  });
});

describe("připnutí, vazby, seznam", () => {
  it("připnuté poznámky jsou nahoře, pak nejnovější; poznámky klienta mají záložku s počtem", async () => {
    const c = await makeCompany("Seznam s.r.o.");
    const a = T(
      await run(noteCreateCommand, owner(), { companyId: c, bodyJson: doc(p("A nejstarší")) }),
    );
    const b = T(await run(noteCreateCommand, owner(), { companyId: c, bodyJson: doc(p("B")) }));
    const cc = T(
      await run(noteCreateCommand, owner(), { companyId: c, bodyJson: doc(p("C nejnovější")) }),
    );
    await run(noteCreateCommand, owner(), { bodyJson: doc(p("samostatná jinde")) });
    // časy jsou v jedné transakci stejné: pořadí „nejnovější“ nastavíme výslovně
    await db
      .update(note)
      .set({ createdAt: new Date("2026-01-01") })
      .where(eq(note.id, a.id));
    await db
      .update(note)
      .set({ createdAt: new Date("2026-02-01") })
      .where(eq(note.id, b.id));
    await db
      .update(note)
      .set({ createdAt: new Date("2026-03-01") })
      .where(eq(note.id, cc.id));
    const before = T(await run(noteListCommand, owner(), { companyId: c }));
    expect(before.rows.map((r: { id: string }) => r.id)).toEqual([cc.id, b.id, a.id]);
    expect(before.rows[0].link).toMatchObject({ type: "company", id: c, title: "Seznam s.r.o." });
    const pinned = T(await run(notePinCommand, owner(), { id: a.id, pinned: true }));
    expect(pinned.pinned).toBe(true);
    const after = T(await run(noteListCommand, owner(), { companyId: c }));
    expect(after.rows.map((r: { id: string }) => r.id)).toEqual([a.id, cc.id, b.id]);
    expect(after.total).toBe(3);
    await run(notePinCommand, owner(), { id: a.id, pinned: false });
    expect(T(await noteClientCard.tabCounts!(owner(), c))).toEqual({ poznamky: 3 });
    // historie nese připnutí
    const hist = await auditOf(a.id);
    expect(hist.some((h) => h.changes.some((x: { field: string }) => x.field === "Připnuto"))).toBe(
      true,
    );
  });

  it("samostatné poznámky se vypíšou zvlášť; přesun ke klientovi a zpět", async () => {
    const c = await makeCompany("Přesun s.r.o.");
    const n = T(await run(noteCreateCommand, owner(), { bodyJson: doc(p("Samostatná přesun")) }));
    const inList = async () =>
      T(await run(noteListCommand, owner(), { standalone: true, q: "samostatna presun" })).rows
        .length;
    expect(await inList()).toBe(1);
    const moved = T(await run(noteUpdateCommand, owner(), { id: n.id, companyId: c, tags: [] }));
    expect(moved.link).toMatchObject({ type: "company", id: c });
    expect(await inList()).toBe(0);
    const back = T(await run(noteUpdateCommand, owner(), { id: n.id, companyId: null }));
    expect(back.link).toBeNull();
    expect(await inList()).toBe(1);
  });

  it("smazání jde do koše, poznámka pak zmizí ze seznamů i z hledání", async () => {
    const n = T(await run(noteCreateCommand, owner(), { bodyJson: doc(p("Ztratitelnyxyz text")) }));
    expect((await searchAll(owner(), f.registry.all(), "ztratitelnyxyz")).length).toBe(1);
    await run(noteDeleteCommand, owner(), { id: n.id });
    await expect(run(noteGetCommand, owner(), { id: n.id })).rejects.toThrow(NotFoundError);
    expect((await searchAll(owner(), f.registry.all(), "ztratitelnyxyz")).length).toBe(0);
  });
});

describe("hledání v textu", () => {
  it("Cmd+K najde poznámku podle textu bez ohledu na diakritiku a velikost písmen", async () => {
    await run(noteCreateCommand, owner(), { bodyJson: doc(p("Úvodní schůzka — Žluťoučký kůň")) });
    for (const q of ["zlutoucky kun", "UVODNI SCHUZKA", "Žluťoučký"]) {
      const hits = await searchAll(owner(), f.registry.all(), q);
      expect(
        hits.some((h) => h.entityType === "note"),
        q,
      ).toBe(true);
    }
  });

  it("seznam hledá v názvu i textu bez diakritiky", async () => {
    await run(noteCreateCommand, owner(), { bodyJson: doc(p("Příliš žluťoučký kůň úpěl")) });
    const r = T(await run(noteListCommand, owner(), { q: "prilis zlutoucky kun" }));
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
    expect(T(await run(noteListCommand, owner(), { q: "neexistujici-xyz" })).rows).toHaveLength(0);
  });
});

describe("soukromí", () => {
  it("soukromou poznámku založí jen vlastník; partner ji nevidí v seznamu, detailu, hledání, počtu ani nemůže uložit", async () => {
    const c = await makeCompany("Soukromá firma s.r.o.");
    await expect(
      run(noteCreateCommand, partner(), { isPrivate: true, bodyJson: doc(p("nic")) }),
    ).rejects.toThrow(UserError);
    const priv = T(
      await run(noteCreateCommand, owner(), {
        isPrivate: true,
        companyId: c,
        bodyJson: doc(p("PRIVATE-CANARY-1 tajné")),
      }),
    );
    const pub = T(
      await run(noteCreateCommand, owner(), { companyId: c, bodyJson: doc(p("veřejná poznámka")) }),
    );
    expect(priv.isPrivate).toBe(true);
    expect(pub.isPrivate).toBe(false);

    const asPartner = T(await run(noteListCommand, partner(), { companyId: c }));
    expect(asPartner.rows.map((r: { id: string }) => r.id)).toEqual([pub.id]);
    expect(JSON.stringify(asPartner)).not.toContain("PRIVATE-CANARY");
    expect(T(await run(noteListCommand, owner(), { companyId: c })).rows).toHaveLength(2);
    expect(T(await run(noteListCommand, partner(), { q: "PRIVATE-CANARY" })).rows).toHaveLength(0);
    await expect(run(noteGetCommand, partner(), { id: priv.id })).rejects.toThrow(NotFoundError);
    await expect(
      run(noteSaveCommand, partner(), { id: priv.id, baseVersion: 1, bodyJson: doc(p("hack")) }),
    ).rejects.toThrow(NotFoundError);
    await expect(run(notePinCommand, partner(), { id: priv.id, pinned: true })).rejects.toThrow();
    await expect(run(noteDeleteCommand, partner(), { id: priv.id })).rejects.toThrow();
    expect(await searchAll(partner(), f.registry.all(), "PRIVATE-CANARY-1")).toHaveLength(0);
    expect((await searchAll(owner(), f.registry.all(), "PRIVATE-CANARY-1")).length).toBe(1);
    expect(T(await noteClientCard.tabCounts!(partner(), c)).poznamky).toBe(1);
    expect(T(await noteClientCard.tabCounts!(owner(), c)).poznamky).toBe(2);
    // čtecí cesty pro canary test
    for (const path of notePrivatePaths)
      expect(JSON.stringify(await path.run(partner(), deps)), path.name).not.toContain(
        "PRIVATE-CANARY",
      );
    // audit soukromé poznámky partner nevidí
    const hist = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, priv.id));
    expect(hist.every((h) => h.isPrivate)).toBe(true);
  });

  it("externista bez oprávnění nemá k poznámkám přístup", async () => {
    const c = await makeCompany("Rodič s.r.o.");
    await expect(run(noteListCommand, external(), { companyId: c })).rejects.toThrow(); // externista nemá oprávnění k poznámkám
  });
});

describe("služba tasks.createPrivateNote (Můj prostor → Soukromé)", () => {
  it("vlastník založí soukromou samostatnou poznámku (Tiptap i prostý text), partner ne", async () => {
    const svc = deps.services.get("tasks");
    const { id } = await svc.createPrivateNote(owner(), {
      title: "Nápad",
      bodyJson: doc(p("<script>alert(1)</script>")),
    });
    const n = T(await run(noteGetCommand, owner(), { id }));
    expect(n).toMatchObject({ title: "Nápad", isPrivate: true, link: null });
    expect(JSON.stringify(n.bodyJson)).toContain("script"); // jako text, ne jako uzel
    expect(n.bodyJson.content.every((x: { type: string }) => x.type === "paragraph")).toBe(true);
    const text = await svc.createPrivateNote(owner(), {
      title: "Z textu",
      bodyJson: "řádek 1\nřádek 2",
    });
    expect(T(await run(noteGetCommand, owner(), { id: text.id })).bodyText).toBe(
      "řádek 1\nřádek 2",
    );
    await expect(svc.createPrivateNote(partner(), { title: "x", bodyJson: null })).rejects.toThrow(
      PermissionError,
    );
    await expect(run(noteGetCommand, partner(), { id })).rejects.toThrow(NotFoundError);
  });
});
