import { afterEach, describe, expect, it } from "vitest";
import { emitDomain, setDomainEvents, type DomainEventHandler } from "./index";
import type { ModuleDeps } from "../modules/server";
import type { Ctx } from "../rbac/types";

const user = { kind: "user", userId: "u1" } as Ctx["actor"];
const ctx = { actor: user } as Ctx;
const deps = { baseURL: "http://x" } as ModuleDeps;
const entity = { type: "company", id: "c1", isPrivate: false };

afterEach(() => setDomainEvents(undefined, undefined));

describe("emitDomain", () => {
  it("bez registrace obsluh jen vytvoří událost a nic se nestane", async () => {
    await expect(
      emitDomain(ctx, "client.renamed", { clientId: "c1", from: "A", to: "B" }, { entity }),
    ).resolves.toBeUndefined();
  });

  it("zavolá obsluhy v pořadí modulů a předá událost s aktérem, záznamem a daty", async () => {
    const seen: string[] = [];
    let got: Parameters<DomainEventHandler<"client.renamed">>[1] | undefined;
    setDomainEvents(
      {
        "client.renamed": [
          async (_c, e) => {
            seen.push("prvni");
            got = e as never;
          },
          async (_c, _e, d) => {
            seen.push(d === deps ? "druha-deps" : "druha");
          },
        ],
        "client.service_added": [
          async () => {
            seen.push("jina-udalost");
          },
        ],
      },
      () => deps,
    );
    await emitDomain(
      ctx,
      "client.renamed",
      { clientId: "c1", from: "A", to: "B" },
      { entity, previous: { from: "A" } },
    );
    expect(seen).toEqual(["prvni", "druha-deps"]);
    expect(got).toMatchObject({
      name: "client.renamed",
      actor: { kind: "user", id: "u1" },
      entity,
      data: { clientId: "c1", from: "A", to: "B" },
      previous: { from: "A" },
    });
    expect(got?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(got!.occurredAt).getTime()).toBeGreaterThan(0);
  });

  it("chyba obsluhy propadne k emitentovi (transakce se vrátí) a další obsluhy už neběží", async () => {
    let second = false;
    setDomainEvents(
      {
        "deal.lost": [
          async () => {
            throw new Error("složka");
          },
          async () => {
            second = true;
          },
        ],
      },
      () => deps,
    );
    await expect(
      emitDomain(
        ctx,
        "deal.lost",
        {
          deal: {
            id: "d",
            title: "t",
            companyId: null,
            personId: null,
            stageId: null,
            result: "lost",
            valueMinor: null,
            services: [],
            ownerId: null,
            source: null,
          },
          reason: null,
          note: null,
        },
        { entity: { type: "deal", id: "d", isPrivate: true } },
      ),
    ).rejects.toThrow("složka");
    expect(second).toBe(false);
  });

  it("aktér systému a přepsaný aktér (n8n, Google)", async () => {
    const actors: unknown[] = [];
    setDomainEvents(
      {
        "client.renamed": [
          async (_c, e) => {
            actors.push(e.actor);
          },
        ],
      },
      () => deps,
    );
    const system = { actor: { kind: "system", userId: null } } as Ctx;
    const data = { clientId: "c1", from: "A", to: "B" };
    await emitDomain(system, "client.renamed", data, { entity });
    await emitDomain(system, "client.renamed", data, {
      entity,
      actor: { kind: "n8n", id: null, label: "n8n" },
    });
    expect(actors).toEqual([
      { kind: "system", id: null },
      { kind: "n8n", id: null, label: "n8n" },
    ]);
  });
});
