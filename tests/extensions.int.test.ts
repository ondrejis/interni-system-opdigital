import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defineExtension } from "@rebar/core";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  registerEntityPolicies,
  resolveEntity,
  type EntityRegistry,
} from "@rebar/core/entities";
import { createEventEmitter, setEventEmitter } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { jobEntity } from "@rebar/zakazky/server";
import { extensions as templateExtensions } from "../clients/_template/extensions";

/**
 * Rozšíření klienta (úroveň 3 úprav, docs/CUSTOMIZATION.md): událost jádra opravdu dorazí k háčku
 * z `clients/_template/extensions` a chyba rozšíření založení zakázky nezruší.
 */
const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, jobEntity]);
  registerEntityPolicies(registry);
  await ensureSeries(app.db, zakazkyManifest.seed.series);
});
afterEach(() => {
  setEventEmitter(undefined);
  vi.restoreAllMocks();
});

async function newJob() {
  const u = await makeUser(app.db, [
    ["zakazky.read", "all"],
    ["zakazky.write", "all"],
    ["zakazky.create", "all"],
    ["kontakty.read", "all"],
    ["kontakty.write", "all"],
    ["kontakty.create", "all"],
  ]);
  const [c] = await app.db
    .insert(company)
    .values({ name: `Rozšíření ${Date.now()} s.r.o.` })
    .returning();
  const E = await resolveEntity(app.db, jobEntity);
  return createRecord(u.ctx, registry, E, { title: "Koupelna", company: c!.id });
}

describe("rozšíření klienta: událost zakazky.created", () => {
  it("příklad ze šablony klienta se zavolá s id nové zakázky", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    setEventEmitter(createEventEmitter(templateExtensions, () => {}));
    const { row } = await newJob();
    expect(info).toHaveBeenCalledWith(`[example] vznikla zakázka ${String(row.id)}`);
  });

  it("bez zaregistrovaného oznamovače (worker, testy) se událost jen zahodí", async () => {
    const { row } = await newJob();
    expect(row.id).toBeTruthy();
  });

  it("chyba rozšíření se zachytí a zakázka vznikne; další rozšíření se zavolá", async () => {
    const seen: string[] = [];
    const errors: string[] = [];
    setEventEmitter(
      createEventEmitter(
        [
          defineExtension({
            id: "rozbite",
            on: {
              "zakazky.created": () => {
                throw new Error("boom");
              },
            },
          }),
          defineExtension({
            id: "dalsi",
            on: { "zakazky.created": ({ id }) => void seen.push(id) },
          }),
        ],
        (_err, where) => void errors.push(where),
      ),
    );
    const { row } = await newJob();
    expect(errors).toEqual(["extension:rozbite:zakazky.created"]);
    expect(seen).toEqual([row.id]);
  });
});
