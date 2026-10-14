import { describe, expect, it } from "vitest";
import { z } from "zod";
import "./zod-locale";

const msg = (schema: z.ZodType, value: unknown) => {
  const r = schema.safeParse(value);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("české hlášky Zodu", () => {
  it("meze čísel mluví česky a bez technických názvů typů", () => {
    expect(msg(z.number().max(24), 25)).toBe("Hodnota může být nejvýše 24.");
    expect(msg(z.number().min(1), 0)).toBe("Hodnota musí být alespoň 1.");
    expect(msg(z.number().min(0.5), 0.1)).toBe("Hodnota musí být alespoň 0,5.");
    expect(msg(z.number().lt(10), 10)).toBe("Hodnota musí být menší než 10.");
  });
  it("chybějící hodnota je „povinné pole“, ne „obdrženo undefined“", () => {
    expect(msg(z.object({ a: z.string() }).shape.a, undefined)).toBe("Toto pole je povinné.");
    expect(msg(z.string(), 5)).toMatch(/očekáváno řetězec/);
  });
  it("ostatní hlášky zůstávají z české sady", () => {
    expect(msg(z.string().min(3), "a")).toMatch(/příliš malá/);
  });
});
