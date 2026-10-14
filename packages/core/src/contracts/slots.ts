import type { RecordRow } from "../entities/types";
import type { SplitRuleInput, ServiceType } from "./types";

/**
 * Sloty, do kterých moduly přispívají komponentami (`ModuleUi.slots`) a které hostitel vykreslí přes `<Slot name="…" />`
 * z `@rebar/ui`. Hostitel o přispěvatelích neví. Klíč je název slotu, hodnota props komponenty.
 */
export type SlotMap = {
  /** Hlavička zakázky: akce navíc (např. „Pokračovat na retainer“). Přispívá finance. */
  "job.header.extra": { jobId: string; row: RecordRow };
  /** Dialog založení zakázky: sekce navíc (editor rozdělení plateb). Přispívá finance. */
  "job.create.extras": {
    value: SplitRuleInput[] | null;
    onChange: (value: SplitRuleInput[] | null) => void;
    type: ServiceType;
    ownerId: string;
  };
  /** Dialog úkolu: akce navíc (např. „Zapsat čas“). Přispívá hodiny. */
  "task.dialog.extras": { taskId: string };
  /** Nastavení → Integrace: panely integrací (ARES, Meta, Fakturoid). */
  "settings.integrations": object;
};

/** Název slotu. */
export type SlotName = keyof SlotMap;
