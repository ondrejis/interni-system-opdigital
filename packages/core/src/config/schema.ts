import { z } from "zod";
import { definitionSchema } from "../dashboards/definition";
import type { DashboardDefinition } from "../dashboards/types";
import { MODULE_IDS } from "../modules/ids";
import { notificationsConfigSchema } from "../notifications/config";
import { terminalConfigSchema } from "../terminal/config";

/** Interní pracovní název jádra. Nesmí se dostat do nic, co vidí klient. */
export const INTERNAL_NAME = "rebar";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Barva musí být ve tvaru #RRGGBB.");

/** Výchozí nástěnka v konfiguraci klienta (typ ze `seedDashboard`; obsah se ověří stejným schématem jako uložená nástěnka). */
const dashboardSeedSchema = z.strictObject({
  key: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "Klíč nástěnky: malá písmena, číslice, pomlčky."),
  name: z.string().trim().min(1).max(60),
  role: z.string().min(1).max(60),
  home: z.boolean().optional(),
  definition: z.custom<DashboardDefinition>((v) => definitionSchema.safeParse(v).success, {
    message: "Definice nástěnky je neplatná (viz seedDashboard).",
  }),
});

export const clientConfigSchema = z.strictObject({
  /** Složka v `clients/` — kebab-case, bez diakritiky. */
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug smí mít jen malá písmena, číslice a pomlčky."),

  branding: z.strictObject({
    /** Název systému, jak ho vidí uživatelé klienta (UI, e-maily, PDF, manifest PWA). */
    name: z
      .string()
      .min(2)
      .refine(
        (v) => !v.toLowerCase().includes(INTERNAL_NAME),
        "Název nesmí obsahovat interní název jádra.",
      ),
    shortName: z.string().min(2).max(20),
    accentColor: hexColor,
    /** Cesta k logu relativně ke složce `branding/` klienta. */
    logo: z.string().optional(),
    supportEmail: z.email().optional(),
  }),

  locale: z
    .strictObject({
      locale: z.string().default("cs-CZ"),
      timezone: z.string().default("Europe/Prague"),
      currency: z.string().length(3).default("CZK"),
    })
    .prefault({}),

  /** Zapnuté moduly. Závislosti kontroluje `resolveModules`. */
  modules: z.array(z.enum(MODULE_IDS)).min(1, "Zapněte alespoň jeden modul."),

  security: z
    .strictObject({
      /** Odhlášení po neaktivitě (minuty). */
      idleTimeoutMinutes: z.number().int().min(5).max(1440).default(480),
      /** Klíče rolí, pro které je 2FA povinné. */
      require2faRoles: z.array(z.string()).default(["owner", "admin"]),
    })
    .prefault({}),

  /** Mobilní terminál řemeslníka: role, výchozí dlaždice a volby (správce je v Nastavení může přepsat). */
  terminal: terminalConfigSchema.prefault({}),

  /**
   * Pravidla upozornění klienta: výchozí kanály, příjemci a texty událostí, tiché hodiny, časy shrnutí.
   * Správce je dál upravuje v Nastavení; klíče událostí jsou v katalogu (`docs/NOTIFICATIONS.md`).
   */
  notifications: notificationsConfigSchema.prefault({}),

  /** Vlastní nástěnky: zapnutí a výchozí sady pro role (zakládají se při instalaci a aktualizaci, jen když chybí). */
  dashboards: z
    .strictObject({
      enabled: z.boolean().default(true),
      defaults: z.array(dashboardSeedSchema).max(40).default([]),
    })
    .prefault({}),

  /** Exporty: zapnutí, formát CSV, plánované exporty a doba uchování souborů. */
  exports: z
    .strictObject({
      enabled: z.boolean().default(true),
      /** Oddělovač CSV: `;` pro českou verzi Excelu (výchozí), `,` pro anglickou / import do jiných systémů. */
      csvDelimiter: z.enum([";", ","]).default(";"),
      /** Plánované exporty (denně / týdně / měsíčně e-mailem nebo do „Moje exporty“). */
      scheduled: z.boolean().default(true),
      /** Nejvíc řádků, které se exportují hned při stažení; větší exporty se zpracují na pozadí. */
      syncMaxRows: z.number().int().min(100).max(20_000).default(5_000),
      /** Jak dlouho zůstává hotový export ke stažení v „Moje exporty“ (dny). */
      retentionDays: z.number().int().min(1).max(90).default(7),
    })
    .prefault({}),

  agency: z
    .strictObject({
      /** Servisní přístup agentury: výchozí vypnuto, zapíná klient na omezenou dobu. */
      serviceAccess: z.enum(["off", "on_request"]).default("off"),
      /** Max. délka jednoho povolení servisního přístupu (hodiny). */
      serviceAccessMaxHours: z.number().int().min(1).max(168).default(24),
    })
    .prefault({}),
});

export type ClientConfig = z.output<typeof clientConfigSchema>;
export type ClientConfigInput = z.input<typeof clientConfigSchema>;
