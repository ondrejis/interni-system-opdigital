import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { createCtx, inTx } from "../rbac/context";
import { loadActor } from "../rbac/actor";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { createFieldDef, deleteFieldDef, listFieldDefs, updateFieldDef } from "../custom-fields";
import { getEmployee, saveEmployee } from "../employees";
import { defineSeries, ensureSeries, nextNumber, updateSeriesPattern } from "../numbering";
import { brandingSetting, createSettings, resolveBranding, smtpSetting } from "../settings";
import { createCipher, parseKeyRing } from "../security";
import { connectAppDb, uniqueEmail } from "../testing";
import { addLookupItem, ensureLookup, getLookup, updateLookupItem } from "./lookups";
import {
  addStage,
  deleteStage,
  ensurePipeline,
  getPipeline,
  registerStageUsage,
  reorderStages,
  updateStage,
} from "./pipelines";
import { listVatRates, saveVatRate, vatAmountMinor } from "./vat";
import { randomBytes } from "node:crypto";

const app = connectAppDb();
afterAll(() => app.close());

async function person(perms: string[] = []) {
  const [role] = await app.db
    .insert(schema.role)
    .values({ key: `r-${newId().slice(-8)}`, name: "R" })
    .returning();
  if (perms.length)
    await app.db
      .insert(schema.rolePermission)
      .values(perms.map((permission) => ({ roleId: role!.id, permission, scope: "all" as const })));
  const [user] = await app.db
    .insert(schema.user)
    .values({ name: "T", email: uniqueEmail(), roleId: role!.id })
    .returning();
  return { id: user!.id, ctx: createCtx(app.db, (await loadActor(app.db, user!.id))!) };
}
const key = () => `k_${newId().slice(-10).replace(/-/g, "")}`;

describe("číselné řady", () => {
  it("přidělují čísla za sebou a po roce začínají od jedničky", async () => {
    const k = key();
    await ensureSeries(app.db, [defineSeries({ key: k, pattern: "FV-{YYYY}-{NNNN}" })]);
    expect(await nextNumber(app.db, k, new Date(2026, 5, 1))).toBe("FV-2026-0001");
    expect(await nextNumber(app.db, k, new Date(2026, 5, 2))).toBe("FV-2026-0002");
    expect(await nextNumber(app.db, k, new Date(2027, 0, 5))).toBe("FV-2027-0001");
  });

  it("zpětně do dřívějšího roku neočísluje (nerozbije řadu)", async () => {
    const k = key();
    await ensureSeries(app.db, [{ key: k, pattern: "{YYYY}{NNN}" }]);
    await nextNumber(app.db, k, new Date(2027, 0, 1));
    await expect(nextNumber(app.db, k, new Date(2026, 11, 31))).rejects.toThrow(UserError);
  });

  it("souběžné doklady nikdy nedostanou stejné číslo a řada nemá díry", async () => {
    const k = key();
    await ensureSeries(app.db, [{ key: k, pattern: "D{NNNN}", reset: "never" }]);
    const numbers = await Promise.all(
      Array.from({ length: 40 }, () => app.db.transaction((tx) => nextNumber(tx, k))),
    );
    const sorted = [...numbers].sort();
    expect(new Set(numbers).size).toBe(40);
    expect(sorted[0]).toBe("D0001");
    expect(sorted[39]).toBe("D0040");
  });

  it("vrácená transakce vrátí i číslo (žádná díra)", async () => {
    const k = key();
    await ensureSeries(app.db, [{ key: k, pattern: "D{NNN}", reset: "never" }]);
    await expect(
      app.db.transaction(async (tx) => {
        await nextNumber(tx, k);
        throw new Error("doklad se neuložil");
      }),
    ).rejects.toThrow();
    expect(await nextNumber(app.db, k)).toBe("D001");
  });

  it("ensureSeries existující řadu nepřepíše; změnu vzoru smí jen správce a zapíše se do auditu", async () => {
    const k = key();
    await ensureSeries(app.db, [{ key: k, pattern: "A{NNN}" }]);
    await ensureSeries(app.db, [{ key: k, pattern: "ZMĚNA{NNN}" }]);
    expect(await nextNumber(app.db, k, new Date(2026, 0, 1))).toBe("A001");

    const plain = await person();
    await expect(updateSeriesPattern(plain.ctx, k, "B{NNN}")).rejects.toThrow(PermissionError);
    const admin = await person(["settings.manage"]);
    await expect(updateSeriesPattern(admin.ctx, k, "bez čísla")).rejects.toThrow(UserError);
    await updateSeriesPattern(admin.ctx, k, "B{NNN}");
    expect(await nextNumber(app.db, k, new Date(2026, 0, 2))).toBe("B002");
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, k));
    expect(audit[0]?.changes[0]).toMatchObject({ field: "pattern", old: "A{NNN}", new: "B{NNN}" });
  });
});

describe("nastavení", () => {
  const settings = createSettings(
    createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") })),
  );

  it("výchozí hodnoty, uložení a čtení; změnit smí jen settings.manage", async () => {
    const admin = await person(["settings.manage"]);
    const plain = await person();
    expect((await settings.get(app.db, brandingSetting)).name).toBeNull();
    await expect(
      settings.set(plain.ctx, brandingSetting, { accentColor: "#112233" }),
    ).rejects.toThrow(PermissionError);
    await settings.set(admin.ctx, brandingSetting, {
      name: "Stavby Novák",
      accentColor: "#112233",
    });
    const b = await settings.get(app.db, brandingSetting);
    expect(resolveBranding({ name: "Z konfigurace", accentColor: "#000000" }, b)).toEqual({
      name: "Stavby Novák",
      accentColor: "#112233",
      logoFileId: null,
    });
    await settings.set(admin.ctx, brandingSetting, { name: null, accentColor: null });
    expect(
      resolveBranding(
        { name: "Z konfigurace", accentColor: "#000000" },
        await settings.get(app.db, brandingSetting),
      ).name,
    ).toBe("Z konfigurace");
  });

  it("neplatná hodnota a interní název se odmítnou", async () => {
    const admin = await person(["settings.manage"]);
    await expect(
      settings.set(admin.ctx, brandingSetting, { accentColor: "modrá" }),
    ).rejects.toThrow();
    await expect(
      settings.set(admin.ctx, brandingSetting, { name: "Rebar pro všechny" }),
    ).rejects.toThrow(/interní název/);
  });

  it("tajné pole je v DB zašifrované, admin ho nevidí, prázdné = ponechat, audit ho maskuje", async () => {
    const admin = await person(["settings.manage"]);
    await settings.set(admin.ctx, smtpSetting, {
      enabled: true,
      host: "smtp.example.cz",
      port: 465,
      secure: true,
      user: "system",
      from: "system@example.cz",
      password: "tajne-heslo",
    });

    const [row] = await app.db.select().from(schema.setting).where(eq(schema.setting.key, "smtp"));
    const stored = row!.value as { password: string };
    expect(stored.password).toMatch(/^v2\./);
    expect(JSON.stringify(row)).not.toContain("tajne-heslo");

    expect((await settings.get(app.db, smtpSetting)).password).toBe("tajne-heslo");
    const adminView = await settings.getForAdmin(admin.ctx, smtpSetting);
    expect(adminView.value.password).toBeNull();
    expect(adminView.secretsSet).toEqual(["password"]);

    await settings.set(admin.ctx, smtpSetting, { host: "smtp2.example.cz", password: "" });
    expect((await settings.get(app.db, smtpSetting)).password).toBe("tajne-heslo");
    expect((await settings.get(app.db, smtpSetting)).host).toBe("smtp2.example.cz");

    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, "smtp"));
    expect(JSON.stringify(audit)).not.toContain("tajne-heslo");
    expect(JSON.stringify(audit)).not.toContain("v2.");
  });
});

describe("pipeline", () => {
  it("ensurePipeline je idempotentní; stavy se přidávají, přejmenují a řadí", async () => {
    const t = key();
    const admin = await person(["settings.manage"]);
    const id = await ensurePipeline(app.db, {
      entityType: t,
      key: "default",
      name: "Zakázky",
      stages: [{ name: "Příprava" }, { name: "Realizace" }, { name: "Hotovo", kind: "done" }],
    });
    expect(
      await ensurePipeline(app.db, { entityType: t, key: "default", name: "Jiné", stages: [] }),
    ).toBe(id);
    let p = await getPipeline(app.db, t, "default");
    expect(p?.stages.map((s) => s.name)).toEqual(["Příprava", "Realizace", "Hotovo"]);

    const added = await addStage(admin.ctx, id, { name: "Reklamace", color: "red" });
    expect(added.position).toBe(3);
    await updateStage(admin.ctx, added.id, { name: "Záruční oprava", kind: "open" });
    await reorderStages(admin.ctx, id, [added.id, ...p!.stages.map((s) => s.id)]);
    p = await getPipeline(app.db, t, "default");
    expect(p?.stages.map((s) => s.name)).toEqual([
      "Záruční oprava",
      "Příprava",
      "Realizace",
      "Hotovo",
    ]);
    await expect(reorderStages(admin.ctx, id, [added.id])).rejects.toThrow(/všechny stavy/);
  });

  it("pravděpodobnost výhry a dny hnití: výchozí z definice, úprava, vymazání a kontrola rozsahu", async () => {
    const t = key();
    const admin = await person(["settings.manage"]);
    const id = await ensurePipeline(app.db, {
      entityType: t,
      key: "default",
      name: "Obchod",
      stages: [{ name: "Nová", probabilityPct: 10, rottingDays: 3 }, { name: "Bez čísel" }],
    });
    let p = await getPipeline(app.db, t, "default");
    expect(p!.stages.map((s) => [s.probabilityPct, s.rottingDays])).toEqual([
      [10, 3],
      [null, null],
    ]);
    const added = await addStage(admin.ctx, id, {
      name: "Jednání",
      probabilityPct: 80,
      rottingDays: 7,
    });
    expect(added).toMatchObject({ probabilityPct: 80, rottingDays: 7 });
    // úprava jednoho údaje nechá druhý; null ho vymaže
    await updateStage(admin.ctx, added.id, { probabilityPct: 85 });
    await updateStage(admin.ctx, p!.stages[0]!.id, { rottingDays: null });
    p = await getPipeline(app.db, t, "default");
    expect(p!.stages.map((s) => [s.probabilityPct, s.rottingDays])).toEqual([
      [10, null],
      [null, null],
      [85, 7],
    ]);
    // změna je v auditu
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, added.id));
    expect(JSON.stringify(audit.map((a) => a.changes))).toContain("probabilityPct");
    for (const bad of [101, -1, 2.5])
      await expect(updateStage(admin.ctx, added.id, { probabilityPct: bad })).rejects.toThrow(
        /od 0 do 100/,
      );
    for (const bad of [0, 366, 1.5])
      await expect(updateStage(admin.ctx, added.id, { rottingDays: bad })).rejects.toThrow(
        /od 1 do 365/,
      );
    await expect(addStage(admin.ctx, id, { name: "Špatná", probabilityPct: 120 })).rejects.toThrow(
      UserError,
    );
  });

  it("používaný stav nejde smazat, nepoužívaný ano; bez oprávnění nic", async () => {
    const t = key();
    const admin = await person(["settings.manage"]);
    const plain = await person();
    const id = await ensurePipeline(app.db, {
      entityType: t,
      key: "p",
      name: "P",
      stages: [{ name: "A" }, { name: "B" }],
    });
    const p = await getPipeline(app.db, t, "p");
    const [a, b] = p!.stages;
    registerStageUsage(t, async (_db, stageId) => (stageId === a!.id ? 3 : 0));
    await expect(deleteStage(admin.ctx, a!.id)).rejects.toThrow(/používá 3 záznamy/);
    await deleteStage(admin.ctx, b!.id);
    expect((await getPipeline(app.db, t, "p"))?.stages.map((s) => s.name)).toEqual(["A"]);
    await expect(deleteStage(plain.ctx, a!.id)).rejects.toThrow(PermissionError);
    await expect(addStage(plain.ctx, id, { name: "X" })).rejects.toThrow(PermissionError);
  });
});

describe("číselníky a DPH", () => {
  it("položky číselníku: přidání, přejmenování, deaktivace (ne mazání)", async () => {
    const k = key();
    const admin = await person(["settings.manage"]);
    await ensureLookup(app.db, {
      key: k,
      name: "Zdroje",
      items: [
        { value: "web", label: "Web" },
        { value: "doporuceni", label: "Doporučení" },
      ],
    });
    const item = await addLookupItem(admin.ctx, k, { value: "facebook", label: "Facebook" });
    await expect(addLookupItem(admin.ctx, k, { value: "facebook", label: "Dup" })).rejects.toThrow(
      /už existuje/,
    );
    await expect(
      addLookupItem(admin.ctx, k, { value: "Špatná hodnota", label: "X" }),
    ).rejects.toThrow(UserError);
    await updateLookupItem(admin.ctx, item.id, { label: "Facebook / Instagram" });
    await updateLookupItem(admin.ctx, item.id, { active: false });
    expect((await getLookup(app.db, k)).map((i) => i.value)).toEqual(["web", "doporuceni"]);
    expect((await getLookup(app.db, k, { includeInactive: true })).map((i) => i.label)).toContain(
      "Facebook / Instagram",
    );
    await expect(
      addLookupItem(admin.ctx, "neexistuje", { value: "x", label: "X" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("sazby DPH podle data platnosti; výpočet DPH v haléřích", async () => {
    const admin = await person(["settings.manage"]);
    const code = key();
    await saveVatRate(admin.ctx, {
      code,
      label: "Základní 20 %",
      rateBp: 2000,
      validFrom: "2000-01-01",
      validTo: "2023-12-31",
    });
    await saveVatRate(admin.ctx, {
      code,
      label: "Základní 21 %",
      rateBp: 2100,
      validFrom: "2024-01-01",
    });
    const at = async (d: string) =>
      (await listVatRates(app.db, d)).filter((r) => r.code === code).map((r) => r.rateBp);
    expect(await at("2023-06-01")).toEqual([2000]);
    expect(await at("2026-10-08")).toEqual([2100]);
    expect(vatAmountMinor(100_000, 2100)).toBe(21_000);
    expect(vatAmountMinor(12_345, 2100)).toBe(2_592); // 2592,45 → 2592
    expect(vatAmountMinor(12_350, 2100)).toBe(2_594); // 2593,5 → 2594
    expect(vatAmountMinor(-12_350, 2100)).toBe(-2_594); // dobropis: půl od nuly
    await expect(
      saveVatRate(admin.ctx, {
        code,
        label: "x",
        rateBp: 100,
        validFrom: "2025-01-01",
        validTo: "2024-01-01",
      }),
    ).rejects.toThrow(/Platnost do/);
  });
});

describe("vlastní pole", () => {
  it("definice: vytvoření, validace možností, duplicita klíče, úprava bez změny typu, měkké smazání", async () => {
    const t = key();
    const admin = await person(["settings.manage"]);
    const plain = await person();
    await expect(
      createFieldDef(plain.ctx, { entityType: t, key: "zdroj", label: "Zdroj", type: "text" }),
    ).rejects.toThrow(PermissionError);
    await expect(
      createFieldDef(admin.ctx, { entityType: t, key: "Špatný klíč", label: "X", type: "text" }),
    ).rejects.toThrow(/Klíč pole/);
    await expect(
      createFieldDef(admin.ctx, { entityType: t, key: "vyber", label: "Výběr", type: "select" }),
    ).rejects.toThrow(/alespoň jednu možnost/);
    await expect(
      createFieldDef(admin.ctx, { entityType: t, key: "odkaz", label: "Odkaz", type: "record" }),
    ).rejects.toThrow(/typ záznamu/);

    const f = await createFieldDef(admin.ctx, {
      entityType: t,
      key: "typ_stavby",
      label: "Typ stavby",
      type: "select",
      options: {
        choices: [
          { value: "dum", label: "Dům" },
          { value: "byt", label: "Byt" },
        ],
      },
    });
    await expect(
      createFieldDef(admin.ctx, { entityType: t, key: "typ_stavby", label: "Dup", type: "text" }),
    ).rejects.toThrow(/už existuje/);
    await updateFieldDef(admin.ctx, f.id, {
      label: "Druh stavby",
      required: true,
      options: {
        choices: [
          { value: "dum", label: "Rodinný dům" },
          { value: "byt", label: "Byt" },
          { value: "hala", label: "Hala" },
        ],
      },
    });
    const defs = await listFieldDefs(app.db, t);
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({ type: "select", label: "Druh stavby", required: true });
    expect(defs[0]!.options.choices).toHaveLength(3);

    await deleteFieldDef(admin.ctx, f.id);
    expect(await listFieldDefs(app.db, t)).toHaveLength(0);
    await expect(deleteFieldDef(admin.ctx, f.id)).rejects.toThrow(NotFoundError);
  });
});

describe("zaměstnanci", () => {
  const input = {
    employmentType: "hpp" as const,
    workload: 1,
    hourlyCostMinor: 35_000,
    jobTitle: "Montér",
  };

  it("údaje upravuje jen employees.write; hodinový náklad vidí jen employees.read, ne sám zaměstnanec", async () => {
    const worker = await person();
    const hr = await person(["employees.read", "employees.write"]);
    const other = await person();
    await expect(saveEmployee(worker.ctx, worker.id, input)).rejects.toThrow(PermissionError);
    await saveEmployee(hr.ctx, worker.id, input);

    expect((await getEmployee(hr.ctx, worker.id))?.hourlyCostMinor).toBe(35_000);
    const own = await getEmployee(worker.ctx, worker.id);
    expect(own).toMatchObject({ jobTitle: "Montér", hourlyCostMinor: null });
    await expect(getEmployee(other.ctx, worker.id)).rejects.toThrow(PermissionError);
  });

  it("změna se zapíše do auditu a neplatný úvazek se odmítne", async () => {
    const worker = await person();
    const hr = await person(["employees.write"]);
    await saveEmployee(hr.ctx, worker.id, input);
    await saveEmployee(hr.ctx, worker.id, { ...input, hourlyCostMinor: 40_000 });
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, worker.id));
    expect(
      audit
        .flatMap((a) => a.changes)
        .find((c) => c.field === "hourlyCostMinor" && c.new === 40_000),
    ).toMatchObject({ old: 35_000 });
    await expect(saveEmployee(hr.ctx, worker.id, { ...input, workload: 0 })).rejects.toThrow(
      /Úvazek/,
    );
    await expect(saveEmployee(hr.ctx, newId(), input)).rejects.toThrow(NotFoundError);
  });
});

void inTx;
