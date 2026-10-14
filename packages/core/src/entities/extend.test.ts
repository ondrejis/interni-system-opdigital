import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { applyEntityExtensions, extendEntity, isEntityExtension } from "./extend";
import { defineEntity, type EntityDef } from "./types";
import type { Ctx } from "../rbac/types";

const table = pgTable("t", { id: uuid("id").primaryKey(), name: text("name") });
const ctx = {} as Ctx;
const def = (key: string, extra: Partial<EntityDef> = {}) =>
  defineEntity({
    key,
    module: "kontakty",
    label: { one: key, many: key },
    table,
    attributes: [],
    titleKey: "name",
    permissions: { read: "x.read", write: "x.write" },
    listPath: `/${key}`,
    url: (id) => `/${key}/${id}`,
    ...extra,
  });

describe("extendEntity", () => {
  it("rozpozná rozšíření od definice entity", () => {
    expect(isEntityExtension(extendEntity("company", {}))).toBe(true);
    expect(isEntityExtension(def("company"))).toBe(false);
  });

  it("háčky rozšíření běží po háčku entity a v pořadí modulů", async () => {
    const calls: string[] = [];
    const out = applyEntityExtensions([
      def("company", {
        afterUpdate: async () => {
          calls.push("entity");
        },
      }),
      def("job"),
      extendEntity("company", {
        afterUpdate: async () => {
          calls.push("klienti");
        },
      }),
      extendEntity("company", {
        afterUpdate: async () => {
          calls.push("disk");
        },
      }),
    ]);
    expect(out.map((e) => e.key)).toEqual(["company", "job"]);
    await out[0]!.afterUpdate?.(ctx, {}, {});
    expect(calls).toEqual(["entity", "klienti", "disk"]);
    expect(out[1]!.afterUpdate).toBeUndefined();
  });

  it("výjimka háčku rozšíření propadne (vrátí transakci)", async () => {
    const [company] = applyEntityExtensions([
      def("company"),
      extendEntity("company", {
        afterUpdate: async () => {
          throw new Error("disk nedostupný");
        },
      }),
    ]);
    await expect(company!.afterUpdate?.(ctx, {}, {})).rejects.toThrow("disk nedostupný");
  });

  it("beforeUpdate spojí změny entity i rozšíření, beforeCreate předá hodnoty dál", async () => {
    const [company] = applyEntityExtensions([
      def("company", {
        beforeUpdate: async () => ({ a: 1 }),
        beforeCreate: async (_c, v) => ({ ...v, x: 1 }),
      }),
      extendEntity("company", {
        beforeUpdate: async (_c, _b, changes) => ({ b: Number(changes.a) + 1 }),
        beforeCreate: async (_c, v) => ({ ...v, y: Number(v.x) + 1 }),
      }),
    ]);
    expect(await company!.beforeUpdate?.(ctx, {}, {})).toEqual({ a: 1, b: 2 });
    expect(await company!.beforeCreate?.(ctx, {})).toEqual({ x: 1, y: 2 });
  });

  it("rozšíření entity, která v sestavě není, se tiše přeskočí", () => {
    const out = applyEntityExtensions([
      def("job"),
      extendEntity("company", { afterUpdate: async () => {} }),
    ]);
    expect(out.map((e) => e.key)).toEqual(["job"]);
  });
});
