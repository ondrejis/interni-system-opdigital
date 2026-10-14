import { PHASES, type PhaseKey } from "./phases";

/** Výchozí stav pipeline zakázek: název, barva, fáze a (u obchodních stavů) pravděpodobnost a dny hnití. */
export type JobStageDef = {
  name: string;
  color: string;
  phase: PhaseKey;
  kind?: "done" | "lost";
  /** Pravděpodobnost výhry ve stavu v procentech (CRM) a dny bez aktivity do hnití. */
  probabilityPct?: number;
  rottingDays?: number;
};

/**
 * Výchozí obchodní stavy zakázky (CRM, docs/CRM.md): tři ve fázi poptávka, tři ve fázi nabídka. Klient je v administraci
 * přejmenuje, přeřadí a doplní po svém; stávající instance je dostanou funkcí `ensureCrmDefaults` (modul CRM).
 */
export const CRM_DEAL_STAGES: readonly JobStageDef[] = [
  {
    name: "Nová poptávka",
    color: PHASES.inquiry.color,
    phase: "inquiry",
    probabilityPct: 10,
    rottingDays: 3,
  },
  { name: "Kontaktováno", color: "blue", phase: "inquiry", probabilityPct: 20, rottingDays: 5 },
  { name: "Obhlídka", color: "teal", phase: "inquiry", probabilityPct: 35, rottingDays: 7 },
  {
    name: "Nabídka v přípravě",
    color: PHASES.offer.color,
    phase: "offer",
    probabilityPct: 50,
    rottingDays: 5,
  },
  {
    name: "Nabídka odeslána",
    color: "indigo",
    phase: "offer",
    probabilityPct: 65,
    rottingDays: 10,
  },
  { name: "Jednání", color: "orange", phase: "offer", probabilityPct: 80, rottingDays: 7 },
];

/** Výchozí stavy pipeline zakázek: obchodní stavy CRM, pak jméno shodné s fází. Každý stav patří do jedné fáze. */
export const JOB_STAGES: readonly JobStageDef[] = [
  ...CRM_DEAL_STAGES,
  { name: "Příprava", color: PHASES.preparation.color, phase: "preparation" },
  { name: "Realizace", color: PHASES.execution.color, phase: "execution" },
  { name: "Předání", color: PHASES.handover.color, phase: "handover" },
  { name: "Záruka", color: PHASES.warranty.color, phase: "warranty" },
  { name: "Uzavřeno", color: PHASES.closed.color, phase: "closed", kind: "done" },
  { name: "Prohráno", color: PHASES.lost.color, phase: "lost", kind: "lost" },
  { name: "Pozastaveno", color: PHASES.paused.color, phase: "paused" },
];

/**
 * Fáze starých stavů před zavedením životního cyklu (stavy „Příprava, Realizace, Předání, Hotovo, Zrušeno“).
 * Stejné mapování dělá migrace `lifecycle_phases` v databázích, které už zakázky mají. Neznámý stav se podle
 * druhu přiřadí k uzavřeno / prohráno, jinak zůstane bez fáze (zakázka v něm drží dosavadní fázi).
 */
export function phaseForLegacyStage(name: string, kind: string): PhaseKey | null {
  const byName: Record<string, PhaseKey> = {
    příprava: "preparation",
    realizace: "execution",
    předání: "handover",
    hotovo: "closed",
    zrušeno: "lost",
  };
  const hit = byName[name.trim().toLowerCase()];
  if (hit) return hit;
  if (kind === "done") return "closed";
  if (kind === "lost") return "lost";
  return null;
}
