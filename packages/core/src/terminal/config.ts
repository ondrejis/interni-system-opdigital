import { z } from "zod";
import "../zod-locale";

/** Klíč dlaždice: `<modul>.<název>` (např. `dochazka.clock`, `core.tasks`). */
export const TERMINAL_WIDGET_KEY = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

/** Jedna dlaždice v seznamu klienta: pořadí je pořadí v poli, `enabled: false` ji vypne, `label` přejmenuje. */
export const terminalTileSchema = z.strictObject({
  widget: z.string().regex(TERMINAL_WIDGET_KEY, "Klíč dlaždice má tvar „modul.název“."),
  enabled: z.boolean().default(true),
  label: z.string().trim().min(1, "Název nesmí být prázdný.").max(40).optional(),
});
export type TerminalTile = z.output<typeof terminalTileSchema>;

const uniqueWidgets = (tiles: readonly { widget: string }[]) =>
  new Set(tiles.map((t) => t.widget)).size === tiles.length;
const UNIQUE = "Dlaždice se v seznamu opakuje.";

const attendanceSchema = z.strictObject({
  /** Příchod nejde zapsat bez zakázky. */
  requireJob: z.boolean().default(false),
  /** Řemeslník si při příchodu smí vybrat zakázku. Jinak se použije jeho jediná aktivní zakázka (je-li jich víc, výběr se nabídne). */
  allowJobChange: z.boolean().default(true),
  /** Dlaždice docházky ukazuje odpracované hodiny za dnešek a týden (částky a sazby nikdy). */
  showHours: z.boolean().default(true),
});
const diarySchema = z.strictObject({
  /** Zápis do deníku z terminálu vyžaduje aspoň jednu fotku. */
  requirePhoto: z.boolean().default(false),
});

/**
 * Konfigurace mobilního terminálu řemeslníka v `clients/<slug>/config.ts`. Jsou to výchozí hodnoty; správce je v Nastavení
 * → Terminál řemeslníka může přepsat (uloženo v databázi, viz `TerminalSettings`).
 */
export const terminalConfigSchema = z.strictObject({
  /** Vypnutý terminál nemá trasy ani přesměrování; všichni používají běžné rozhraní. */
  enabled: z.boolean().default(true),
  /**
   * Role, které používají jen terminál: po přihlášení jdou na `/t` a do kancelářského rozhraní se nedostanou.
   * Ostatní role mohou terminál otevřít také (náhled „jako řemeslník“, mistr v terénu).
   */
  roles: z
    .array(z.string().min(1))
    .refine((r) => !r.includes("owner"), "Majitel nesmí používat jen terminál.")
    .default(["worker"]),
  /** Dlaždice v pořadí. Dlaždice zapnutých modulů, které tu nejsou, se přidají na konec (podle `defaultEnabled`). */
  tiles: z
    .array(terminalTileSchema)
    .refine(uniqueWidgets, UNIQUE)
    .default([
      { widget: "dochazka.clock", enabled: true },
      { widget: "zakazky.today", enabled: true },
      { widget: "core.tasks", enabled: true },
      { widget: "realizace.diary", enabled: true },
      { widget: "sklad.issue", enabled: true },
      { widget: "realizace.report", enabled: true },
      { widget: "stroje.fleet", enabled: true },
    ]),
  attendance: attendanceSchema.prefault({}),
  diary: diarySchema.prefault({}),
});
export type TerminalConfig = z.output<typeof terminalConfigSchema>;
export type TerminalConfigInput = z.input<typeof terminalConfigSchema>;

/**
 * Nastavení uložené v databázi (Nastavení → Terminál řemeslníka). `null` u položky znamená „použij výchozí z konfigurace
 * klienta“, takže změna `config.ts` se projeví všude, kde správce nic nepřepsal.
 */
export const TERMINAL_SETTING_VERSION = 1;
export const terminalSettingsSchema = z.strictObject({
  version: z.literal(TERMINAL_SETTING_VERSION),
  roles: z.array(z.string().min(1)).nullable(),
  tiles: z.array(terminalTileSchema).refine(uniqueWidgets, UNIQUE).nullable(),
  attendance: attendanceSchema.nullable(),
  diary: diarySchema.nullable(),
});
export type TerminalSettings = z.output<typeof terminalSettingsSchema>;

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  version: TERMINAL_SETTING_VERSION,
  roles: null,
  tiles: null,
  attendance: null,
  diary: null,
};

/** Výsledná konfigurace: nastavení správce má přednost před konfigurací klienta, `null` znamená výchozí. */
export function mergeTerminalConfig(
  base: TerminalConfig,
  stored: TerminalSettings,
): TerminalConfig {
  return {
    enabled: base.enabled,
    roles: stored.roles ?? base.roles,
    tiles: stored.tiles ?? base.tiles,
    attendance: stored.attendance ?? base.attendance,
    diary: stored.diary ?? base.diary,
  };
}

/**
 * Převede uložené nastavení na aktuální verzi. Neznámé nebo poškozené hodnoty nesmí terminál shodit: vrátí se výchozí
 * (`null` u všeho) a `problems` řekne, co se zahodilo. Starší tvary:
 * - bez `version` (ručně vložené nebo před verzováním): `hidden: string[]` (skryté dlaždice) a `order: string[]` (pořadí)
 *   se převedou na `tiles`; `tiles` jako pole řetězců také.
 */
export function migrateTerminalSettings(raw: unknown): {
  value: TerminalSettings;
  problems: string[];
} {
  const problems: string[] = [];
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw))
    return { value: DEFAULT_TERMINAL_SETTINGS, problems };
  let obj = { ...(raw as Record<string, unknown>) };
  const version = obj.version;
  if (version !== undefined && version !== TERMINAL_SETTING_VERSION) {
    if (typeof version === "number" && version > TERMINAL_SETTING_VERSION)
      problems.push(
        `Nastavení terminálu je z novější verze (${version}), použity výchozí hodnoty.`,
      );
    else problems.push("Neznámá verze nastavení terminálu, použity výchozí hodnoty.");
    return { value: DEFAULT_TERMINAL_SETTINGS, problems };
  }
  if (version === undefined) {
    // verze 0: seznam klíčů a skryté dlaždice
    const order = Array.isArray(obj.order)
      ? obj.order
      : Array.isArray(obj.tiles)
        ? obj.tiles
        : null;
    const hidden = new Set(Array.isArray(obj.hidden) ? obj.hidden : []);
    const tiles =
      order && order.every((x) => typeof x === "string" || (x && typeof x === "object"))
        ? order.map((x) =>
            typeof x === "string" ? { widget: x, enabled: !hidden.has(x) } : (x as object),
          )
        : null;
    obj = { ...obj, version: TERMINAL_SETTING_VERSION, tiles, order: undefined, hidden: undefined };
  }
  // neznámé klíče (zbytky starších tvarů) se zahodí
  obj = Object.fromEntries(Object.entries(obj).filter(([k]) => k in DEFAULT_TERMINAL_SETTINGS));
  const parsed = terminalSettingsSchema.safeParse({
    ...DEFAULT_TERMINAL_SETTINGS,
    ...obj,
  });
  if (parsed.success) return { value: parsed.data, problems };
  // zahodí se jen to, co je špatně; zbytek zůstane
  const bad = new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")));
  const cleaned: Record<string, unknown> = { ...DEFAULT_TERMINAL_SETTINGS, ...obj };
  for (const k of bad) {
    if (k && k !== "version") {
      problems.push(`Položka „${k}“ v nastavení terminálu je neplatná, použita výchozí hodnota.`);
      cleaned[k] = null;
    }
  }
  const again = terminalSettingsSchema.safeParse(cleaned);
  return again.success
    ? { value: again.data, problems }
    : {
        value: DEFAULT_TERMINAL_SETTINGS,
        problems: [...problems, "Nastavení terminálu je poškozené."],
      };
}
