import { describe, expect, it } from "vitest";
import type { ClientTabProvider } from "../contracts/client-card";
import { createStubServices } from "../testing/stub-services";
import type { Ctx } from "../rbac/types";
import { createModuleDeps, defineModuleServer, mergeServers, type ModuleDeps } from "./server";

const base = { baseURL: "http://x" } as Omit<ModuleDeps, "services">;
const ctx = {} as Ctx;

describe("createModuleDeps", () => {
  it("služba se vyrobí líně, jednou, a dostane hotové deps", () => {
    let made = 0;
    let received: ModuleDeps | undefined;
    const deps = createModuleDeps(base, {
      services: {
        finance: (d) => {
          made++;
          received = d;
          return createStubServices({ finance: true }).services.get("finance");
        },
      },
      contributions: {},
    });
    expect(made).toBe(0);
    const a = deps.services.get("finance");
    const b = deps.services.optional("finance");
    expect(a).toBe(b);
    expect(made).toBe(1);
    expect(received).toBe(deps);
  });

  it("get vyhodí, když modul službu nenabízí; optional vrátí undefined", () => {
    const deps = createModuleDeps(base, { services: {}, contributions: {} });
    expect(deps.services.optional("tasks")).toBeUndefined();
    expect(() => deps.services.get("tasks")).toThrow(/není k dispozici/);
  });

  it("příspěvky zůstávají v pořadí modulů; bez příspěvků je výsledek prázdný", () => {
    const a: ClientTabProvider = { tabCounts: async () => ({ ukoly: 1 }) };
    const b: ClientTabProvider = { tabCounts: async () => ({ finance: 2 }) };
    const deps = createModuleDeps(base, { services: {}, contributions: { clientCard: [a, b] } });
    expect(deps.services.all("clientCard")).toEqual([a, b]);
    expect(deps.services.all("emailVars")).toEqual([]);
  });
});

describe("createStubServices", () => {
  it("zapnuté jsou jen uvedené služby, volání se zaznamenávají", async () => {
    const { services, calls } = createStubServices({ tasks: true, disk: true });
    expect(services.optional("clients")).toBeUndefined();
    expect(() => services.get("finance")).toThrow(/není v testu zapnutá/);
    const tasks = services.get("tasks");
    expect(await tasks.openCounts(ctx, { jobId: "j" })).toEqual({ open: 0, overdue: 0 });
    const created = await tasks.createFromTemplate(ctx, {
      jobId: "j",
      ownerId: "u",
      startDate: "2026-10-14",
      phaseIds: [],
      items: [{ title: "a" }, { title: "b" }],
    });
    expect(created.taskIds).toHaveLength(2);
    expect(
      await services.get("disk").requestFolder(ctx, { entityType: "company", id: "c" }),
    ).toEqual({ requestId: null, skipped: "disabled" });
    expect(calls.map((c) => `${c.service}.${c.method}`)).toEqual([
      "tasks.openCounts",
      "tasks.createFromTemplate",
      "disk.requestFolder",
    ]);
  });

  it("výchozí chování jde přepsat", async () => {
    const { services } = createStubServices({
      clients: { setStatus: async () => ({ changed: false, clientSince: "2026-01-01" }) },
    });
    expect(
      await services
        .get("clients")
        .setStatus(ctx, { companyId: "c", status: "active", source: "manual" }),
    ).toEqual({ changed: false, clientSince: "2026-01-01" });
  });
});

describe("mergeServers", () => {
  const handler = (tag: string, log: string[]) => async () => {
    log.push(tag);
  };

  it("zřetězí obsluhy téže události, spojí příspěvky a seznamy", async () => {
    const log: string[] = [];
    const c1: ClientTabProvider = {};
    const c2: ClientTabProvider = {};
    const merged = mergeServers(
      defineModuleServer({
        eventHandlers: { "task.created": handler("a", log) },
        contributions: { clientCard: [c1] },
        navBadges: [{ href: "/x", tone: "danger", count: async () => 1 }],
      }),
      defineModuleServer({
        eventHandlers: { "task.created": handler("b", log), "task.completed": handler("c", log) },
        contributions: { clientCard: [c2] },
      }),
    );
    expect(merged.contributions?.clientCard).toEqual([c1, c2]);
    expect(merged.navBadges).toHaveLength(1);
    const run = merged.eventHandlers?.["task.created"] as unknown as (
      ...a: unknown[]
    ) => Promise<void>;
    await run(ctx, {}, base);
    expect(log).toEqual(["a", "b"]);
    expect(Object.keys(merged.eventHandlers ?? {}).sort()).toEqual([
      "task.completed",
      "task.created",
    ]);
  });

  it("stejná služba ve dvou oblastech je chyba", () => {
    const service = () => createStubServices({ tasks: true }).services.get("tasks");
    expect(() =>
      mergeServers(
        defineModuleServer({ services: { tasks: service } }),
        defineModuleServer({ services: { tasks: service } }),
      ),
    ).toThrow(/dvou oblastech/);
  });
});
