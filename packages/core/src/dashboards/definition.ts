import { z } from "zod";
import "../zod-locale";
import { filterGroupSchema } from "../entities/filters";
import { UserError } from "../rbac/errors";
import {
  AGG_FUNCTIONS,
  BUCKETS,
  BUILTINS,
  CHART_KINDS,
  COMPARE_MODES,
  DEFINITION_VERSION,
  MAX_DASHBOARD_WIDGETS,
  MAX_WIDGET_HEIGHT,
  PERIOD_PRESETS,
  VALUE_FORMATS,
  WIDGET_TYPES,
  type DashboardDefinition,
  type DashboardWidget,
} from "./types";

/** Nejvíc widgetů na nástěnce (každý je dotaz; nástěnka se musí načíst do pár sekund). */
export const MAX_WIDGETS = MAX_DASHBOARD_WIDGETS;
/** Nejvíc nástěnek, které si uživatel může založit. */
export const MAX_BOARDS_PER_USER = 25;

const key = z.string().min(1).max(60);
const attrKey = z.string().min(1).max(80);

const entitySource = z.strictObject({
  kind: z.literal("entity"),
  entity: key,
  filters: filterGroupSchema.optional(),
  dateAttr: attrKey.optional(),
  jobAttr: attrKey.optional(),
  personAttr: attrKey.optional(),
  agg: z.strictObject({ fn: z.enum(AGG_FUNCTIONS), attr: attrKey.optional() }),
  groupBy: z.strictObject({ attr: attrKey, bucket: z.enum(BUCKETS).optional() }).optional(),
  splitBy: attrKey.optional(),
  sort: z.strictObject({ by: z.enum(["value", "label"]), dir: z.enum(["asc", "desc"]) }).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const recordsSource = z.strictObject({
  kind: z.literal("records"),
  entity: key,
  filters: filterGroupSchema.optional(),
  dateAttr: attrKey.optional(),
  jobAttr: attrKey.optional(),
  personAttr: attrKey.optional(),
  columns: z.array(attrKey).min(1).max(8),
  sort: z
    .array(z.strictObject({ attr: attrKey, dir: z.enum(["asc", "desc"]) }))
    .max(3)
    .optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const metricSource = z.strictObject({
  kind: z.literal("metric"),
  metric: key,
  params: z
    .record(z.string().max(40), z.union([z.string().max(80), z.number(), z.boolean()]))
    .optional(),
  bucket: z.enum(BUCKETS).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const builtinSource = z.strictObject({
  kind: z.literal("builtin"),
  builtin: z.enum(BUILTINS),
  params: z
    .strictObject({
      tileIds: z.array(z.string().min(1).max(80)).max(12).optional(),
      includeDelegated: z.boolean().optional(),
      limit: z.number().int().min(1).max(30).optional(),
    })
    .optional(),
});

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/** Číslo / seznam z uloženého pohledu. */
const viewSource = z.strictObject({
  kind: z.literal("view"),
  viewId: uuid,
  agg: z.strictObject({ fn: z.enum(AGG_FUNCTIONS), attr: attrKey.optional() }).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

/** Odkaz uvnitř aplikace (`/obchody`) nebo `https://…`; nic jiného (ne `javascript:`, ne `//host`). */
export const SAFE_HREF = /^(\/(?!\/)[^\s]*|https?:\/\/[^\s]+)$/i;

const linksSource = z.strictObject({
  kind: z.literal("links"),
  links: z
    .array(
      z.strictObject({
        title: z.string().trim().min(1, "Vyplňte název odkazu.").max(60),
        href: z
          .string()
          .trim()
          .max(300)
          .regex(SAFE_HREF, "Odkaz musí začínat „/“ nebo „https://“."),
      }),
    )
    .max(12),
  viewIds: z.array(uuid).max(12),
});

const sourceSchema = z.discriminatedUnion("kind", [
  entitySource,
  recordsSource,
  metricSource,
  builtinSource,
  viewSource,
  linksSource,
]);

const optionsSchema = z.strictObject({
  chart: z.enum(CHART_KINDS).optional(),
  format: z.enum(VALUE_FORMATS).optional(),
  compare: z.enum(COMPARE_MODES).optional(),
  target: z.number().finite().min(0).max(1e15).optional(),
});

export const widgetSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{3,39}$/, "Neplatné id widgetu."),
    type: z.enum(WIDGET_TYPES),
    title: z.string().trim().min(1, "Vyplňte název widgetu.").max(80),
    w: z.number().int().min(1).max(12),
    h: z.number().int().min(1).max(MAX_WIDGET_HEIGHT),
    source: sourceSchema,
    options: optionsSchema.optional(),
  })
  .superRefine((w, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", message });
    const s = w.source;
    switch (w.type) {
      case "kpi":
        if (s.kind === "entity" && s.groupBy) bad("KPI nesmí být seskupené.");
        if (s.kind !== "entity" && s.kind !== "metric" && s.kind !== "view")
          bad("KPI čerpá z entity, metriky nebo pohledu.");
        break;
      case "gauge":
        if (s.kind === "entity" && s.groupBy) bad("Měřidlo nesmí být seskupené.");
        if (s.kind !== "entity" && s.kind !== "metric") bad("Měřidlo čerpá z entity nebo metriky.");
        if (w.options?.target === undefined) bad("Měřidlo potřebuje cíl.");
        break;
      case "chart":
        if (s.kind === "entity" && !s.groupBy) bad("Graf potřebuje seskupení.");
        if (s.kind !== "entity" && s.kind !== "metric") bad("Graf čerpá z entity nebo metriky.");
        if (s.kind === "entity" && s.splitBy && (w.options?.chart ?? "bar") !== "stacked")
          bad("Rozpad podle druhého atributu patří jen do skládaného grafu.");
        break;
      case "status":
        if (s.kind === "entity" ? !s.groupBy : s.kind !== "metric")
          bad("Souhrn podle stavu potřebuje seskupení podle stavu nebo metriku po stavech.");
        break;
      case "table":
        if (s.kind === "entity" && !s.groupBy) bad("Tabulka z agregace potřebuje seskupení.");
        if (s.kind === "builtin" || s.kind === "links")
          bad("Tabulka čerpá ze záznamů, agregace, pohledu nebo metriky.");
        break;
      case "list":
        if (
          s.kind !== "records" &&
          s.kind !== "metric" &&
          s.kind !== "links" &&
          !(s.kind === "builtin" && s.builtin === "my_tasks")
        )
          bad("Seznam čerpá ze záznamů, metriky, odkazů nebo z mých úkolů.");
        break;
      case "builtin":
        if (s.kind !== "builtin") bad("Vestavěný widget musí mít vestavěný zdroj.");
        break;
    }
  });

export const definitionSchema = z
  .strictObject({
    schemaVersion: z.literal(DEFINITION_VERSION),
    widgets: z
      .array(widgetSchema)
      .max(MAX_WIDGETS, `Nástěnka může mít nejvýš ${MAX_WIDGETS} widgetů.`),
    defaultPeriod: z.enum(PERIOD_PRESETS).optional(),
  })
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    for (const [i, w] of d.widgets.entries()) {
      if (seen.has(w.id))
        ctx.addIssue({
          code: "custom",
          message: "Duplicitní id widgetu.",
          path: ["widgets", i, "id"],
        });
      seen.add(w.id);
    }
  });

/** Oprava dřívějších verzí definice na aktuální. Každý krok převádí verzi `n` na `n + 1`. */
export type DefinitionMigrations = Record<
  number,
  (raw: Record<string, unknown>) => Record<string, unknown>
>;

/** Dnes existuje jediná verze; sem přijdou převody, až se tvar definice změní (a test, který je projde všechny). */
export const DEFINITION_MIGRATIONS: DefinitionMigrations = {};

/**
 * Přečte definici z databáze (nebo z konfigurace): doplní chybějící verzi, převede starší verze krok za krokem na
 * aktuální a ověří. Novější verzi, než umí tento systém, odmítne srozumitelnou větou (nástěnka vznikla v novější verzi).
 */
export function migrateDefinition(
  raw: unknown,
  migrations: DefinitionMigrations = DEFINITION_MIGRATIONS,
  target = DEFINITION_VERSION,
): DashboardDefinition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new UserError("Definice nástěnky je poškozená.");
  let cur = { ...(raw as Record<string, unknown>) };
  let v = typeof cur.schemaVersion === "number" ? cur.schemaVersion : 1;
  if (v > target)
    throw new UserError("Nástěnka vznikla v novější verzi systému a tato verze ji neumí otevřít.");
  while (v < target) {
    const step = migrations[v];
    if (!step) throw new UserError(`Nástěnku verze ${v} nejde převést na aktuální verzi.`);
    cur = step(cur);
    v += 1;
    cur.schemaVersion = v;
  }
  cur.schemaVersion = target;
  return parseDefinition(cur);
}

/** Zod chybu převede na větu pro uživatele. */
export function parseDefinition(raw: unknown): DashboardDefinition {
  const r = definitionSchema.safeParse(raw);
  if (r.success) return r.data as DashboardDefinition;
  const issue = r.error.issues[0]!;
  const where = issue.path.length ? ` (${issue.path.join(" › ")})` : "";
  throw new UserError(`Neplatná definice nástěnky${where}: ${issue.message}`);
}

export function parseWidget(raw: unknown): DashboardWidget {
  const r = widgetSchema.safeParse(raw);
  if (r.success) return r.data as DashboardWidget;
  const issue = r.error.issues[0]!;
  const where = issue.path.length ? ` (${issue.path.join(" › ")})` : "";
  throw new UserError(`Neplatný widget${where}: ${issue.message}`);
}

/** Prázdná nástěnka. */
export const emptyDefinition = (): DashboardDefinition => ({
  schemaVersion: DEFINITION_VERSION,
  widgets: [],
});
