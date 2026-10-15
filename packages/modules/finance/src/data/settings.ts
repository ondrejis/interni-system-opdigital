import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { SplitRuleInput } from "@rebar/core/contracts";
import { schema, type Executor } from "@rebar/core/db";
import { defineSetting } from "@rebar/core/settings";
import { splitRuleInput } from "../contract";
import type { FinDeps } from "./deps";

/** Nastavení „z čeho se počítá saldo“ (`finance.balance_basis`): zaplacené platby (výchozí), nebo už vystavené. */
export const balanceBasisSetting = defineSetting({
  key: "finance.balance_basis",
  schema: z.object({ basis: z.enum(["paid", "issued"]) }),
  default: { basis: "paid" as "paid" | "issued" },
});

/** Výchozí rozdělení nových zakázek (`finance.default_split`); `null` = nenastaveno, odvodí se 50/50. */
export const defaultSplitSetting = defineSetting({
  key: "finance.default_split",
  schema: z.object({ rules: z.array(splitRuleInput).nullable() }),
  default: { rules: null as SplitRuleInput[] | null },
});

/** Základ salda z nastavení. */
export async function balanceBasisOf(db: Executor, deps: FinDeps): Promise<"paid" | "issued"> {
  return (await deps.settings.get(db, balanceBasisSetting)).basis;
}

/** Odvozené výchozí rozdělení: 50/50 mezi aktivním vlastníkem a aktivním partnerem (když jsou právě dva). */
export async function autoDefaultSplit(db: Executor): Promise<SplitRuleInput[]> {
  const rows = await db
    .select({ id: schema.user.id, role: schema.role.key })
    .from(schema.user)
    .innerJoin(schema.role, eq(schema.role.id, schema.user.roleId))
    .where(
      and(
        eq(schema.user.active, true),
        isNull(schema.user.deletedAt),
        inArray(schema.role.key, ["owner", "partner"]),
      ),
    )
    .orderBy(asc(schema.role.key));
  // owner < partner abecedně, takže vlastník je první
  const ids = [...new Set(rows.map((r) => r.id))];
  if (ids.length !== 2) return [];
  return ids.map((userId) => ({ userId, mode: "percent", percent: 50, appliesTo: "all" }));
}

/** Výchozí pravidla nových zakázek a zda jsou nastavená (`false` = odvozená). */
export async function defaultRules(
  db: Executor,
  deps: FinDeps,
): Promise<{ rules: SplitRuleInput[]; configured: boolean }> {
  const stored = (await deps.settings.get(db, defaultSplitSetting)).rules;
  if (stored) return { rules: stored, configured: true };
  return { rules: await autoDefaultSplit(db), configured: false };
}
