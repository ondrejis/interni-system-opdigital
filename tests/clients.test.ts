import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_MODULES } from "../apps/web/src/modules";
import { checkClients } from "../scripts/lib/check-clients";

describe("konfigurace klientů", () => {
  it("každý klient v clients/ (včetně šablony) má platnou konfiguraci a sestavu modulů", async () => {
    const results = await checkClients(path.resolve(import.meta.dirname, ".."), ALL_MODULES);
    expect(results.length).toBeGreaterThanOrEqual(2);
    const failed = results.filter((r) => !r.ok);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  });
});
