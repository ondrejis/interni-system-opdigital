import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId, schema } from "@rebar/core/db";
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
import { createCtx, loadActor, NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import { connectAppDb, expectPgError, uniqueEmail } from "@rebar/core/testing";
import { createView, deleteView, listViews, setFavorite, updateView } from "@rebar/core/views";
import { companyEntity, personEntity } from "./server";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let companyE: ResolvedEntity;
let personE: ResolvedEntity;
beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity]);
  registerEntityPolicies(registry);
  companyE = await resolveEntity(app.db, companyEntity);
  personE = await resolveEntity(app.db, personEntity);
});

async function person(perms: [string, "all" | "own"][]) {
  const [role] = await app.db
    .insert(schema.role)
    .values({ key: `r-${newId().slice(-8)}`, name: "R" })
    .returning();
  await app.db
    .insert(schema.rolePermission)
    .values(perms.map(([permission, scope]) => ({ roleId: role!.id, permission, scope })));
  const [user] = await app.db
    .insert(schema.user)
    .values({ name: "T", email: uniqueEmail(), roleId: role!.id })
    .returning();
  return { id: user!.id, ctx: createCtx(app.db, (await loadActor(app.db, user!.id))!) };
}
const office = () =>
  person([
    ["kontakty.read", "all"],
    ["kontakty.write", "all"],
  ]);
const tag = () => randomBytes(4).toString("hex");

describe("firmy a osoby", () => {
  it("role firmy (více hodnot): filtr contains_any / contains_all; IČO je unikátní mezi živými firmami", async () => {
    const u = await office();
    const t = tag();
    const a = await createRecord(u.ctx, registry, companyE, {
      name: `Klient ${t}`,
      roles: ["client"],
      ico: String(10_000_000 + Math.floor(Math.random() * 8_999_999)),
    });
    await createRecord(u.ctx, registry, companyE, { name: `Dodavatel ${t}`, roles: ["supplier"] });
    await createRecord(u.ctx, registry, companyE, {
      name: `Obojí ${t}`,
      roles: ["client", "supplier"],
    });
    const f = async (op: string, value: string[]) =>
      (
        await queryRecords(u.ctx, registry, companyE, {
          filters: {
            op: "and",
            conditions: [
              { attr: "name", op: "contains", value: t },
              { attr: "roles", op, value },
            ],
          } as never,
        })
      ).rows
        .map((r) => String(r.name).split(" ")[0])
        .sort();
    expect(await f("contains_any", ["supplier"])).toEqual(["Dodavatel", "Obojí"]);
    expect(await f("contains_all", ["client", "supplier"])).toEqual(["Obojí"]);
    expect(await f("contains_any", ["subcontractor"])).toEqual([]);

    await expectPgError(
      app.db
        .insert((await import("./schema")).company)
        .values({ name: "Duplicita", ico: String(a.row.ico) }),
      /company_ico_uq|duplicate key/,
    );
    await expect(
      createRecord(u.ctx, registry, companyE, { name: "Zlá role", roles: ["kamarad"] }),
    ).rejects.toThrow(/nenabízenou/);
  });

  it("osoba odkazuje na firmu; popisek firmy se doplní; nelze odkázat na neexistující firmu", async () => {
    const u = await office();
    const c = await createRecord(u.ctx, registry, companyE, { name: `Firma ${tag()}` });
    const p = await createRecord(u.ctx, registry, personE, {
      name: "Jana Nováková",
      company: c.row.id,
      email: "Jana@Firma.CZ",
      phone: "+420 777 123 456",
    });
    expect(p.row).toMatchObject({ email: "jana@firma.cz", phone: "+420777123456" });
    expect(p.labels.company?.[c.row.id as string]?.label).toBe(c.row.name);
    await expect(
      updateRecord(u.ctx, registry, personE, p.row.id, { company: newId() }),
    ).rejects.toThrow(/záznam neexistuje/);
    await expect(
      createRecord(u.ctx, registry, personE, { name: "X", email: "bez-zavinace" }),
    ).rejects.toThrow(/platný e-mail/);
  });
});

describe("uložené pohledy", () => {
  const known = new Set(companyEntity.attributes.map((a) => a.key));
  const config = {
    viewType: "table" as const,
    filters: {
      op: "and" as const,
      conditions: [{ attr: "city", op: "contains" as const, value: "Plzeň" }],
    },
    sort: [{ attr: "name", dir: "asc" as const }],
    columns: ["name", "city"],
  };

  it("osobní pohled vidí jen autor, sdílený všichni s právem číst; úprava a smazání jen autor (nebo správce)", async () => {
    const a = await office();
    const b = await office();
    const admin = await person([
      ["kontakty.read", "all"],
      ["settings.manage", "all"],
    ]);
    const mine = await createView(a.ctx, companyEntity, known, { name: "Plzeňští", config });
    const shared = await createView(a.ctx, companyEntity, known, {
      name: "Sdílený",
      shared: true,
      config,
    });

    expect(
      (await listViews(a.ctx, companyEntity)).filter((v) => [mine.id, shared.id].includes(v.id)),
    ).toHaveLength(2);
    const seenByB = (await listViews(b.ctx, companyEntity)).map((v) => v.id);
    expect(seenByB).toContain(shared.id);
    expect(seenByB).not.toContain(mine.id);

    await expect(updateView(b.ctx, mine.id, known, { name: "Hack" })).rejects.toThrow(
      NotFoundError,
    );
    await expect(updateView(b.ctx, shared.id, known, { name: "Hack" })).rejects.toThrow(
      PermissionError,
    );
    await expect(deleteView(b.ctx, shared.id)).rejects.toThrow(PermissionError);
    await updateView(admin.ctx, shared.id, known, { name: "Přejmenoval správce" });
    await updateView(a.ctx, mine.id, known, { shared: true });
    expect((await listViews(b.ctx, companyEntity)).map((v) => v.id)).toContain(mine.id);
    await deleteView(a.ctx, mine.id);
    expect((await listViews(a.ctx, companyEntity)).map((v) => v.id)).not.toContain(mine.id);
  });

  it("oblíbené je věc uživatele; pohled s neznámým atributem nebo bez práva číst entitu se odmítne", async () => {
    const a = await office();
    const b = await office();
    const v = await createView(a.ctx, companyEntity, known, {
      name: "Sdílený oblíbený",
      shared: true,
      config,
    });
    await setFavorite(b.ctx, v.id, true);
    expect((await listViews(b.ctx, companyEntity)).find((x) => x.id === v.id)?.favorite).toBe(true);
    expect((await listViews(a.ctx, companyEntity)).find((x) => x.id === v.id)?.favorite).toBe(
      false,
    );
    await setFavorite(b.ctx, v.id, false);
    expect((await listViews(b.ctx, companyEntity)).find((x) => x.id === v.id)?.favorite).toBe(
      false,
    );

    await expect(
      createView(a.ctx, companyEntity, known, {
        name: "Špatný",
        config: { ...config, columns: ["name", "neexistuje"] },
      }),
    ).rejects.toThrow(UserError);
    await expect(createView(a.ctx, companyEntity, known, { name: "", config })).rejects.toThrow(
      /Vyplňte název/,
    );
    const nobody = await person([["zakazky.read", "all"]]);
    await expect(listViews(nobody.ctx, companyEntity)).rejects.toThrow(PermissionError);
  });
});
