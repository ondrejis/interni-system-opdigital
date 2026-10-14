import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getPipeline } from "@rebar/core/config-data";
import { schema, type Executor } from "@rebar/core/db";
import type { AttributeDef, StageChange } from "@rebar/core/entities";
import { listFieldDefs } from "@rebar/core/custom-fields";
import { defineSetting } from "@rebar/core/settings";
import { jobEntity } from "@rebar/zakazky/server";

/**
 * Pravidla kvality polí: pole zakázky, které musí být vyplněné od určitého stavu. Konfigurace je jedno nastavení klienta
 * `crm.fieldRules` (Nastavení → uloženo v tabulce `setting`, změny jdou do auditu) se seznamem pravidel:
 *
 *  - `attr`: klíč atributu entity zakázky (`address`, `endDate`…), u vlastního pole `custom.<klíč>`
 *  - `fromStageId`: stav pipeline `job/default`; přechod do stavu s pořadím ≥ tomuto stavu bez vyplněného pole selže
 *  - `level`: `required` = blokuje přechod českou větou, `important` = jen zvýraznění v UI (přechod nebrzdí)
 *
 * Pravidla se kontrolují při změně stavu (hook `checkStage` v `hooks.ts`), ne při každé úpravě zakázky; prohra
 * a pozastavení se nikdy neblokují.
 */
export const FIELD_RULES_KEY = "crm.fieldRules";

export const fieldRuleSchema = z.object({
  attr: z.string().trim().min(1).max(80),
  fromStageId: z.uuid(),
  level: z.enum(["required", "important"]).default("required"),
});
/** Jedno pravidlo kvality polí: pole, stav, od kterého platí, a úroveň (povinné, nebo důležité). */
export type FieldRule = z.output<typeof fieldRuleSchema>;

export const fieldRulesSetting = defineSetting({
  key: FIELD_RULES_KEY,
  schema: z.object({ rules: z.array(fieldRuleSchema).max(100) }),
  default: { rules: [] } as { rules: FieldRule[] },
});

/** Pravidla z databáze (bez šifrování a služby nastavení: jde o prostý JSON). Neplatná položka se přeskočí. */
export async function readFieldRules(db: Executor): Promise<FieldRule[]> {
  const [row] = await db
    .select()
    .from(schema.setting)
    .where(eq(schema.setting.key, FIELD_RULES_KEY));
  const raw = (row?.value as { rules?: unknown } | undefined)?.rules;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const parsed = fieldRuleSchema.safeParse(r);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Prázdná hodnota: nic, prázdný řetězec nebo pole, u částky nula. */
export function isBlankValue(value: unknown, type?: AttributeDef["type"]): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (type === "currency" && Number(value) === 0) return true;
  return false;
}

const CUSTOM_PREFIX = "custom.";

/** Hodnota atributu z řádku tabulky `job` (nativní atribut ze sloupce, vlastní pole z `custom`). */
function valueOf(row: Record<string, unknown>, attr: string, def: AttributeDef | undefined) {
  if (attr.startsWith(CUSTOM_PREFIX))
    return ((row.custom ?? {}) as Record<string, unknown>)[attr.slice(CUSTOM_PREFIX.length)];
  return def?.field ? row[def.field] : undefined;
}

/** Atributy zakázky, na které jde pravidlo navázat: nativní upravitelné a vlastní pole (s popiskem). */
export async function ruleableAttributes(db: Executor): Promise<{ key: string; label: string }[]> {
  const native = jobEntity.attributes
    .filter((a) => !a.readonly && !a.custom && a.key !== "stage")
    .map((a) => ({ key: a.key, label: a.label }));
  const custom = (await listFieldDefs(db, "job"))
    .filter((f) => !f.options.hidden)
    .map((f) => ({ key: `${CUSTOM_PREFIX}${f.key}`, label: f.label }));
  return [...native, ...custom];
}

/** Fáze, do kterých se pravidla nikdy neuplatňují (prohra i pozastavení musí jít vždy). */
const EXEMPT_PHASES: readonly (string | null)[] = ["lost", "paused"];

const quote = (s: string) => `„${s}“`;

/** Povinné pole, které brání přechodu do stavu: klíč atributu zakázky a popisek. */
export type MissingField = { attr: string; label: string };

/**
 * Povinná pole („povinné od stavu“), která v řádku chybí, než zakázka přejde do cílového stavu; `target` je cílový stav
 * (`null`, když pravidla neplatí: prohra, pozastavení, neznámý stav). `row` je řádek tabulky `job` sloučený s probíhající změnou.
 */
export async function missingRequiredFields(
  db: Executor,
  row: Record<string, unknown>,
  change: StageChange,
): Promise<{ target: { id: string; name: string } | null; missing: MissingField[] }> {
  if (EXEMPT_PHASES.includes(change.toPhase)) return { target: null, missing: [] };
  const rules = (await readFieldRules(db)).filter((r) => r.level === "required");
  if (!rules.length) return { target: null, missing: [] };

  const stages = await getPipeline(db, "job", "default");
  const byId = new Map((stages?.stages ?? []).map((s) => [s.id, s] as const));
  const target = byId.get(change.toStageId);
  if (!target) return { target: null, missing: [] };

  const defs = new Map<string, AttributeDef>(jobEntity.attributes.map((a) => [a.key, a]));
  const customLabels = new Map<string, string>(
    (await listFieldDefs(db, "job")).map((f) => [`${CUSTOM_PREFIX}${f.key}`, f.label]),
  );
  const missing: MissingField[] = [];
  for (const r of rules) {
    const from = byId.get(r.fromStageId);
    if (!from || target.position < from.position) continue;
    const def = defs.get(r.attr);
    if (!def && !customLabels.has(r.attr)) continue; // pravidlo na smazané pole se přeskočí
    if (!isBlankValue(valueOf(row, r.attr, def), def?.type)) continue;
    const label = def?.label ?? customLabels.get(r.attr) ?? r.attr;
    if (!missing.some((m) => m.label === label)) missing.push({ attr: r.attr, label });
  }
  return { target: { id: target.id, name: target.name }, missing };
}

/**
 * Hook přechodu: vrátí českou větu, která pole chybí vyplnit, než zakázka přejde do cílového stavu; jinak `null`.
 * `row` je řádek tabulky `job` sloučený s probíhající změnou.
 */
export async function checkFieldRules(
  db: Executor,
  row: Record<string, unknown>,
  change: StageChange,
): Promise<string | null> {
  const { target, missing } = await missingRequiredFields(db, row, change);
  if (!target || !missing.length) return null;
  return `Před přesunem do stavu ${quote(target.name)} vyplňte pole: ${missing.map((m) => quote(m.label)).join(", ")}.`;
}

/** Ověří pravidla před uložením do nastavení: existující atribut, existující stav pipeline zakázek, bez duplicit. */
export async function validateFieldRules(db: Executor, rules: readonly FieldRule[]) {
  const attrs = new Set((await ruleableAttributes(db)).map((a) => a.key));
  const pipeline = await getPipeline(db, "job", "default");
  const stageIds = new Set((pipeline?.stages ?? []).map((s) => s.id));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const r of rules) {
    if (!attrs.has(r.attr))
      problems.push(`Pole „${r.attr}“ u zakázky neexistuje nebo nejde povinně vyžadovat.`);
    if (!stageIds.has(r.fromStageId)) problems.push("Zvolený stav neexistuje v pipeline zakázek.");
    if (seen.has(r.attr)) problems.push(`Pole „${r.attr}“ má pravidlo dvakrát.`);
    seen.add(r.attr);
  }
  return problems;
}

/** Stavy, ze kterých pravidla vycházejí, se zrušeným stavem se pravidlo přestane uplatňovat; pomocný seznam jmen pro UI. */
export async function stageNames(db: Executor, ids: readonly string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db
    .select({ id: schema.pipelineStage.id, name: schema.pipelineStage.name })
    .from(schema.pipelineStage)
    .where(inArray(schema.pipelineStage.id, [...ids]));
  return new Map(rows.map((r) => [r.id, r.name] as const));
}
