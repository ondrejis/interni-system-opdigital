import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline } from "@rebar/core/config-data";
import { createFieldDef } from "@rebar/core/custom-fields";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  resolveEntity,
  type EntityRegistry,
} from "@rebar/core/entities";
import { EXPORT_MAX_ROWS, prepareEntityExport } from "@rebar/core/export";
import type { ModuleSeed } from "@rebar/core";
import { ensureSeries } from "@rebar/core/numbering";
import { PermissionError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { jobEntity } from "@rebar/zakazky/server";
import { collect, unzip } from "./support/unzip";

/** Exporty: XLSX/CSV seznamů entit (celá filtrovaná sada, typy buněk, oprávnění). */
const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const m of [zakazkyManifest]) {
    const seed = m.seed as ModuleSeed;
    for (const p of seed.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of seed.lookups ?? []) await ensureLookup(app.db, l);
    await ensureSeries(app.db, seed.series ?? []);
  }
});

/** Řádky listu z XML: pole buněk `{ref, t, s, v}` podle `<c>`. */
function cells(sheetXml: string) {
  return [...sheetXml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)].map((m) => ({
    row: Number(m[1]),
    cells: [
      ...m[2]!.matchAll(
        /<c r="([A-Z]+)\d+"([^>]*)>(?:<is><t[^>]*>(.*?)<\/t><\/is>|<v>(.*?)<\/v>)?<\/c>/g,
      ),
    ].map((c) => ({
      col: c[1]!,
      attrs: c[2]!,
      text: c[3] ?? null,
      value: c[4] ?? null,
    })),
  }));
}

describe("export seznamu entity (XLSX a CSV)", () => {
  const tag = `ExpTest${randomBytes(3).toString("hex")}`;
  let admin: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => {
    admin = await makeUser(app.db, [
      ["settings.manage", "all"],
      ["kontakty.read", "all"],
      ["kontakty.write", "all"],
    ]);
    await createFieldDef(admin.ctx, {
      entityType: "company",
      key: "obrat",
      label: "Roční obrat",
      type: "currency",
    });
    await createFieldDef(admin.ctx, {
      entityType: "company",
      key: "zamestnancu",
      label: "Zaměstnanců",
      type: "number",
    });
    await createFieldDef(admin.ctx, {
      entityType: "company",
      key: "klientem_od",
      label: "Klientem od",
      type: "date",
    });
    await createFieldDef(admin.ctx, {
      entityType: "company",
      key: "vip",
      label: "VIP",
      type: "checkbox",
    });
    await app.db.insert(company).values(
      Array.from({ length: 450 }, (_, i) => ({
        name: `${tag} ${String(i).padStart(3, "0")}`,
        ico: String(10_000_000 + i),
        custom: {
          obrat: 123_456_78 + i, // v haléřích
          zamestnancu: i,
          klientem_od: "2026-03-05",
          vip: i % 2 === 0,
        },
      })),
    );
    // jiné firmy, které filtr nesmí vzít
    await app.db.insert(company).values({ name: "Cizí firma bez značky", ico: "99999999" });
  }, 60_000);

  const prep = async (
    ctx: Ctx,
    extra: Record<string, unknown> = {},
    format: "xlsx" | "csv" = "xlsx",
  ) =>
    prepareEntityExport(ctx, registry, await resolveEntity(app.db, companyEntity), {
      format,
      query: { q: `${tag} `, sort: [{ attr: "name", dir: "asc" }] },
      columns: [
        "name",
        "ico",
        "custom.obrat",
        "custom.zamestnancu",
        "custom.klientem_od",
        "custom.vip",
      ],
      ...extra,
    } as never);

  it("exportuje celou filtrovanou sadu (450 řádků přes stránky po 200), ne jen zobrazené", async () => {
    const out = await prep(admin.ctx);
    expect(out.count).toBe(450);
    expect(out.filename).toMatch(/^firmy-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const files = unzip(await collect(out.chunks));
    const rows = cells(files.get("xl/worksheets/sheet1.xml")!.toString());
    // 1 titulek + 1 hlavička + 450 dat
    expect(rows).toHaveLength(452);
    const names = rows.slice(2).map((r) => r.cells[0]!.text);
    expect(names[0]).toBe(`${tag} 000`);
    expect(names[449]).toBe(`${tag} 449`);
    expect(new Set(names).size).toBe(450); // žádná stránka se neopakuje ani nechybí
    expect(names.some((n) => n?.startsWith("Cizí"))).toBe(false);
  });

  it("vlastní pole a peníze mají správný typ: číslo, peníze v korunách, datum, ano/ne", async () => {
    const out = await prep(admin.ctx, {
      query: { q: `${tag} 001`, sort: [{ attr: "name", dir: "asc" }] },
    });
    expect(out.count).toBe(1);
    const sheet = unzip(await collect(out.chunks))
      .get("xl/worksheets/sheet1.xml")!
      .toString();
    const header = cells(sheet)[1]!.cells.map((c) => c.text);
    expect(header).toEqual(["Název", "IČO", "Roční obrat", "Zaměstnanců", "Klientem od", "VIP"]);
    const r = cells(sheet)[2]!.cells;
    expect(r[0]!.text).toBe(`${tag} 001`);
    expect(r[1]!.text).toBe("10000001"); // IČO zůstane textem (nuly na začátku)
    // obrat 12345678 + 1 haléřů = 123 456,79 Kč → číslo s formátem měny (styl 2)
    expect(r[2]).toMatchObject({ value: "123456.79" });
    expect(r[2]!.attrs).toContain('s="2"');
    expect(r[3]).toMatchObject({ value: "1" }); // počet jako číslo
    expect(r[3]!.attrs).not.toContain("inlineStr");
    // datum jako datum (serial 2026-03-05 = 46086) s datovým formátem (styl 3)
    expect(r[4]).toMatchObject({ value: "46086" });
    expect(r[4]!.attrs).toContain('s="3"');
    expect(r[5]!.text).toBe("ne");
  });

  it("CSV: čárka jako desetinný oddělovač, data česky, texty zabezpečené proti vzorcům", async () => {
    await app.db.insert(company).values({ name: `=1+1 ${tag} vzorec`, ico: "11111111" });
    const out = await prep(admin.ctx, { query: { q: `${tag} vzorec` } }, "csv");
    expect(out.filename).toMatch(/\.csv$/);
    const text = (await collect(out.chunks)).toString("utf8");
    expect(text.startsWith("﻿Název;IČO;Roční obrat;Zaměstnanců;Klientem od;VIP\r\n")).toBe(true);
    expect(text).toContain(`'=1+1 ${tag} vzorec;11111111`);
    const full = await prep(admin.ctx, { query: { q: `${tag} 002` } }, "csv");
    const row = (await collect(full.chunks)).toString("utf8").split("\r\n")[1]!;
    expect(row).toBe(`${tag} 002;10000002;123456,80;2;5. 3. 2026;ano`);
  });

  it("bez oprávnění ke čtení export nevydá nic; neznámý nebo nedostupný sloupec se odmítne", async () => {
    const nobody = await makeUser(app.db, [["zakazky.read", "all"]]);
    await expect(prep(nobody.ctx)).rejects.toThrow(PermissionError);
    await expect(prep(admin.ctx, { columns: ["name", "neexistuje"] })).rejects.toThrow(
      /neznámý nebo nedostupný sloupec/,
    );
  });

  it("limit řádků: příliš velký výsledek se odmítne srozumitelnou hláškou (nenačte se do paměti)", async () => {
    await expect(prep(admin.ctx, { maxRows: 100 })).rejects.toThrow(/Zúžte filtr/);
    expect(EXPORT_MAX_ROWS).toBe(50_000);
  });
});
