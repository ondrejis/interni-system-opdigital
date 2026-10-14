import { afterAll, describe, expect, it } from "vitest";
import { connectAppDb } from "../testing";
import { claimReminder } from "./reminders";

const app = connectAppDb();
afterAll(() => app.close());

describe("claimReminder", () => {
  it("klíč se dá zabrat jen jednou, i při souběhu", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => claimReminder(app.db, key)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await claimReminder(app.db, key)).toBe(false);
  });

  it("jiný klíč (jiný stupeň upozornění) se zabere znovu", async () => {
    const base = `test:${crypto.randomUUID()}`;
    expect(await claimReminder(app.db, `${base}:30`)).toBe(true);
    expect(await claimReminder(app.db, `${base}:7`)).toBe(true);
  });
});
