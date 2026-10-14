import { z } from "zod";
import { defineSetting } from "@rebar/core/settings";

/** Pravidla docházky: pracovní doba, schvalování, výchozí náklad hodiny, připomínka. */
export const dochazkaSetting = defineSetting({
  key: "dochazka",
  schema: z.object({
    hoursPerDay: z.number().min(1).max(24),
    /** ISO dny v týdnu (1 = pondělí … 7 = neděle), které jsou pracovní. */
    workDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    /** Zápis musí schválit vedoucí; vypnuto = zápisy se schvalují samy. */
    requireApproval: z.boolean(),
    /** Náklad hodiny v haléřích, když zaměstnanec nemá vlastní (pro ekonomiku zakázek). */
    defaultHourlyCostMinor: z.number().int().min(0).max(100_000_00),
    /** Večerní připomínka lidem, kteří dnes nezapsali docházku. */
    reminder: z.boolean(),
  }),
  default: {
    hoursPerDay: 8,
    workDays: [1, 2, 3, 4, 5] as number[],
    requireApproval: true,
    defaultHourlyCostMinor: 250_00,
    reminder: true,
  },
});

export type DochazkaSettings = typeof dochazkaSetting.default;
