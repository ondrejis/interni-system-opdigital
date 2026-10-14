import { daysSince } from "../logic";

// Tvary dat stránky „Moje dnešní práce“ (příkaz `crm.today`); klientsky bezpečné.

/** Obchod bez další aktivity v seznamu dnešní práce. */
export type TodayDeal = {
  id: string;
  number: string;
  title: string;
  companyName: string | null;
  stageName: string | null;
  stageColor: string | null;
  phase: string;
  /** Cena nabídky v haléřích; `null` bez oprávnění `zakazky.economics`. */
  valueMinor: number | null;
  rotting: boolean;
  /** Dny v aktuálním stavu. */
  daysInStage: number;
  expectedCloseDate: string | null;
};

/** Nová poptávka ve schránce. */
export type TodayInquiry = {
  id: string;
  title: string;
  contactName: string | null;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  valueMinor: number;
  /** Začátek původní zprávy (zkrácený). */
  message: string | null;
  ownerName: string | null;
  /** Kdy poptávka přišla (ISO okamžik). */
  createdAt: string;
  nextStep: string | null;
  nextStepAt: string | null;
};

/** Výsledek příkazu `crm.today`. Sekce, na kterou aktér nemá oprávnění, je `null`. */
export type TodayData = {
  /** Moje otevřené obchody bez další (nedokončené) aktivity. */
  noActivity: { total: number; rows: TodayDeal[] } | null;
  /** Nové poptávky ve schránce (všechny, které aktér vidí). */
  inbox: {
    total: number;
    rows: TodayInquiry[];
    lostReasons: { value: string; label: string }[];
    canConvert: boolean;
    canWrite: boolean;
  } | null;
};

/** „před 3 dny“ / „včera“ / „dnes“ z okamžiku příchodu. */
export function waitingLabel(createdAt: string, now: Date = new Date()): string {
  const d = daysSince(createdAt, now);
  return d === 0 ? "dnes" : d === 1 ? "včera" : `před ${d} dny`;
}
