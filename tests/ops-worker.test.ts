import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coreJobs } from "@rebar/core/jobs";
import { ALL_MODULES } from "../apps/web/src/modules";
import { collectServers } from "../apps/web/src/server/modules-server";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

/*
  Worker (OPS): všechny úlohy jádra i modulů se zakládají jako fronty (`db-migrate.ts` → `installQueues`) a zpracovává je
  `scripts/worker.ts`; webhooky do n8n se doručují hned po NOTIFY a minutově jako záloha.
*/
describe("worker: fronty a úlohy", () => {
  const core = coreJobs.map((j) => j.name);
  const modules = collectServers(ALL_MODULES).jobs.map((j) => j.name);

  it("jádro obsahuje doručování a úklid webhooků (C2) bez duplicit", () => {
    expect(core).toEqual(
      expect.arrayContaining(["core.webhooks.deliver", "core.webhooks.cleanup"]),
    );
    expect(new Set([...core, ...modules]).size).toBe(core.length + modules.length);
  });

  it("úlohy modulů finance, disk, reklama, muj-prostor a kalendar jsou zaregistrované", () => {
    for (const prefix of ["finance.", "disk.", "reklama.", "muj-prostor.", "kalendar."])
      expect(
        modules.some((n) => n.startsWith(prefix)),
        prefix,
      ).toBe(true);
  });

  it("migrace zakládá fronty ze všech úloh jádra i modulů a worker je všechny zpracovává", () => {
    expect(read("scripts/db-migrate.ts")).toMatch(
      /queues: \[\.\.\.coreJobs, \.\.\.collectServers\(modules\)\.jobs\]/,
    );
    const worker = read("scripts/worker.ts");
    expect(worker).toMatch(/registerWorkers\(queue, coreJobs, deps\)/);
    expect(worker).toMatch(/registerWorkers\(queue, collected\.jobs, moduleDeps\)/);
  });

  it("worker poslouchá NOTIFY webhooků a po sloučení zařadí doručení", () => {
    const worker = read("scripts/worker.ts");
    expect(worker).toMatch(/pg\.listen\(WEBHOOK_NOTIFY_CHANNEL/);
    expect(worker).toMatch(/queue\s*\.send\(webhookDeliverJob/);
    expect(worker).toMatch(/webhookListener\.unlisten/);
  });
});
