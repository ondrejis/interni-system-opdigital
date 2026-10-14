// Fáze životního cyklu zakázky (ADR 015). Klientsky bezpečné: žádné serverové importy, používá je i prohlížeč.

export const PHASE_KEYS = [
  "inquiry",
  "offer",
  "preparation",
  "execution",
  "handover",
  "warranty",
  "closed",
  "lost",
  "paused",
] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];

export type PhaseAction = { label: string; to: PhaseKey };

export type PhaseDef = {
  key: PhaseKey;
  label: string;
  /** Barva štítku (`Chip color`). */
  color: string;
  /** Pořadí v životním cyklu; vedlejší fáze (prohráno, pozastaveno) jsou až za hlavní řadou. */
  order: number;
  /** Hlavní akce zakázky v této fázi: další fáze, nebo `null`, když žádná není (u `paused` viz `primaryActionFor`). */
  primaryAction: PhaseAction | null;
  /** Jednou větou, co fáze znamená (nápověda v dialogu přechodu). */
  hint: string;
};

export const PHASES: Record<PhaseKey, PhaseDef> = {
  inquiry: {
    key: "inquiry",
    label: "Poptávka",
    color: "gray",
    order: 10,
    primaryAction: { label: "Vytvořit nabídku", to: "offer" },
    hint: "Zájem zákazníka, zatím bez nabídky.",
  },
  offer: {
    key: "offer",
    label: "Nabídka",
    color: "purple",
    order: 20,
    primaryAction: { label: "Zakázka vyhrána", to: "preparation" },
    hint: "Nabídka je odeslaná a čeká na odpověď zákazníka.",
  },
  preparation: {
    key: "preparation",
    label: "Příprava",
    color: "blue",
    order: 30,
    primaryAction: { label: "Zahájit realizaci", to: "execution" },
    hint: "Vyhráno; domlouvá se termín, tým a materiál.",
  },
  execution: {
    key: "execution",
    label: "Realizace",
    color: "orange",
    order: 40,
    primaryAction: { label: "Předat zakázku", to: "handover" },
    hint: "Stavba běží: deník, náklady, změny a fakturace.",
  },
  handover: {
    key: "handover",
    label: "Předání",
    color: "teal",
    order: 50,
    primaryAction: { label: "Zahájit záruku", to: "warranty" },
    hint: "Předávací protokol a vady z předání.",
  },
  warranty: {
    key: "warranty",
    label: "Záruka",
    color: "indigo",
    order: 60,
    primaryAction: { label: "Uzavřít zakázku", to: "closed" },
    hint: "Běží záruční lhůta; reklamace jdou jako vady.",
  },
  closed: {
    key: "closed",
    label: "Uzavřeno",
    color: "green",
    order: 70,
    primaryAction: null,
    hint: "Hotovo, vyúčtováno a zamčeno.",
  },
  lost: {
    key: "lost",
    label: "Prohráno",
    color: "red",
    order: 80,
    primaryAction: { label: "Obnovit poptávku", to: "inquiry" },
    hint: "Zakázka nevznikla (nebo byla zrušena).",
  },
  paused: {
    key: "paused",
    label: "Pozastaveno",
    color: "yellow",
    order: 90,
    primaryAction: null,
    hint: "Dočasně zastaveno; návrat do původní fáze.",
  },
};

export const isPhaseKey = (v: unknown): v is PhaseKey =>
  typeof v === "string" && (PHASE_KEYS as readonly string[]).includes(v);

/** Hlavní řada fází v pořadí cyklu (bez prohráno a pozastaveno). */
export const MAIN_PHASES: readonly PhaseKey[] = [
  "inquiry",
  "offer",
  "preparation",
  "execution",
  "handover",
  "warranty",
  "closed",
];

/** Fáze seřazené podle `order` (pro nabídky a pohledy). */
export const PHASE_LIST: readonly PhaseDef[] = PHASE_KEYS.map((k) => PHASES[k]).sort(
  (a, b) => a.order - b.order,
);

/** Možnosti pro atribut typu výběr (`phase`). */
export const PHASE_CHOICES = PHASE_LIST.map((p) => ({
  value: p.key,
  label: p.label,
  color: p.color,
}));

/** Od zahájení realizace se původní smluvní cena nemění; roste jen schválenými změnami. */
export const PRICE_LOCKED_PHASES: readonly PhaseKey[] = [
  "execution",
  "handover",
  "warranty",
  "closed",
];

/** Fáze před výhrou: smluvní cena ještě není, rozpočet nese jen cenu nabídky. */
export const PRE_CONTRACT_PHASES: readonly PhaseKey[] = ["inquiry", "offer"];
export const isPreContract = (phase: unknown): boolean =>
  PRE_CONTRACT_PHASES.includes(phase as PhaseKey);

/**
 * Cena zakázky pro seznam (`job.sum_contract_minor`) a hlavičku: smluvní cena; v poptávce a nabídce bez zadané ceny
 * cena nabídky z rozpočtu (prodej bez DPH), aby seznam neukazoval 0 Kč u nabídky za miliony. Hlavička říká „Cena nabídky“.
 */
export const listPriceMinor = (phase: unknown, contractMinor: number, budgetSellMinor: number) =>
  isPreContract(phase) && contractMinor === 0 && budgetSellMinor > 0
    ? budgetSellMinor
    : contractMinor;

/** Fáze, ve kterých zakázka běží (do rozsahu „aktivní“, kalendáře, docházky…). */
export const ACTIVE_PHASES: readonly PhaseKey[] = ["preparation", "execution", "handover"];

/**
 * Povolené přechody mezi fázemi. Dopředu o jednu fázi (poptávka smí rovnou do přípravy), zpět o jednu jako oprava,
 * prohra z kterékoli obchodní nebo stavební fáze před předáním, pozastavení během přípravy až záruky.
 * Z pozastavení se jde jen zpět do původní fáze (`pausedFrom`) nebo do prohráno. Uzavřenou zakázku jde znovu otevřít do záruky.
 */
const NEXT: Record<PhaseKey, readonly PhaseKey[]> = {
  inquiry: ["offer", "preparation", "lost"],
  offer: ["inquiry", "preparation", "lost"],
  preparation: ["offer", "execution", "lost", "paused"],
  execution: ["preparation", "handover", "lost", "paused"],
  handover: ["execution", "warranty", "closed", "paused"],
  warranty: ["handover", "closed", "paused"],
  closed: ["warranty"],
  lost: ["inquiry", "offer"],
  paused: ["lost"],
};

/** Fáze, do kterých se z `from` smí přejít (u pozastavení včetně návratu do `pausedFrom`). */
export function allowedNext(from: PhaseKey, pausedFrom?: string | null): PhaseKey[] {
  const out = [...NEXT[from]];
  if (from === "paused" && isPhaseKey(pausedFrom) && pausedFrom !== "paused")
    out.unshift(pausedFrom);
  return out;
}

export function canTransition(from: PhaseKey, to: PhaseKey, pausedFrom?: string | null): boolean {
  return from === to || allowedNext(from, pausedFrom).includes(to);
}

/** Česká věta, proč přechod nejde (prázdné = jde). */
export function transitionProblem(
  from: PhaseKey,
  to: PhaseKey,
  pausedFrom?: string | null,
): string | null {
  if (canTransition(from, to, pausedFrom)) return null;
  const options = allowedNext(from, pausedFrom)
    .map((k) => `„${PHASES[k].label}“`)
    .join(", ");
  return `Z fáze „${PHASES[from].label}“ nejde přejít do fáze „${PHASES[to].label}“.${
    options ? ` Možné další fáze: ${options}.` : ""
  }`;
}

/** Hlavní akce zakázky ve fázi; u pozastavené zakázky je to návrat do původní fáze. */
export function primaryActionFor(phase: PhaseKey, pausedFrom?: string | null): PhaseAction | null {
  if (phase === "paused")
    return isPhaseKey(pausedFrom) && pausedFrom !== "paused"
      ? { label: "Obnovit zakázku", to: pausedFrom }
      : null;
  return PHASES[phase].primaryAction;
}

/** Stav záznamu v seznamu: kdy je smluvní cena zamčená. */
export function isPriceLocked(phase: PhaseKey, pausedFrom?: string | null): boolean {
  const effective = phase === "paused" && isPhaseKey(pausedFrom) ? pausedFrom : phase;
  return PRICE_LOCKED_PHASES.includes(effective);
}

/** Semafor zakázky. Pravidlo počítá `computeHealth` v `costs/summary.ts` (oblast costs), tady jsou jen štítky. */
export const HEALTH = {
  ok: { label: "OK", color: "green" },
  warning: { label: "Pozor", color: "orange" },
  danger: { label: "Problém", color: "red" },
} as const;
export type HealthKey = keyof typeof HEALTH;

export const HEALTH_CHOICES = (Object.keys(HEALTH) as HealthKey[]).map((k) => ({
  value: k,
  label: HEALTH[k].label,
  color: HEALTH[k].color,
}));
