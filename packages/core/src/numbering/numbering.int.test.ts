import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "../db/client";
import { newId } from "../db/ids";
import { connectAppDb } from "../testing";
import { defineSeries, ensureSeries, nextNumber } from "./numbering";

const app = connectAppDb();
afterAll(() => app.close());

describe("nextNumber s obsazenými čísly", () => {
  it("přeskočí čísla, která vznikla mimo řadu, a řada se posune dál", async () => {
    const key = `test.skip-${newId().slice(-8)}`;
    await ensureSeries(app.db, [defineSeries({ key, pattern: "T-{YYYY}-{NNN}" })]);
    const year = new Date().getFullYear();
    const taken = new Set([`T-${year}-001`, `T-${year}-002`, `T-${year}-004`]);
    const isTaken = async (n: string) => taken.has(n);

    expect(await nextNumber(app.db, key, new Date(), { isTaken })).toBe(`T-${year}-003`);
    expect(await nextNumber(app.db, key, new Date(), { isTaken })).toBe(`T-${year}-005`);
    const [row] = await app.db
      .select()
      .from(schema.numberSeries)
      .where(eq(schema.numberSeries.key, key));
    expect(row?.lastValue).toBe(5);
  });

  it("bez kontroly se chová jako dřív (číslo se nepřeskakuje)", async () => {
    const key = `test.plain-${newId().slice(-8)}`;
    await ensureSeries(app.db, [defineSeries({ key, pattern: "P-{NNN}" })]);
    expect(await nextNumber(app.db, key)).toBe("P-001");
    expect(await nextNumber(app.db, key)).toBe("P-002");
  });
});
