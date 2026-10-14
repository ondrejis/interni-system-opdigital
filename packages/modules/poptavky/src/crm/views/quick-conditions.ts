import type { QuickCondition } from "@rebar/ui";
import { OPEN_DEAL_PHASES } from "../logic";

/**
 * Navržené („rychlé“) podmínky filtru seznamu obchodů: jedním klikem přidají hotový chip (hodnota chybí jen u „Hodnota…“,
 * tam se rovnou otevře editor). Nabídne se jen podmínka, jejíž atribut aktér vidí (peníze jen s `zakazky.economics`).
 */
export const DEAL_QUICK_CONDITIONS: readonly QuickCondition[] = [
  {
    id: "open",
    label: "Stav je otevřený",
    condition: { attr: "phase", op: "is_any_of", value: [...OPEN_DEAL_PHASES] },
  },
  { id: "mine", label: "Moje obchody", condition: { attr: "manager", op: "is_me" } },
  {
    id: "created-week",
    label: "Vytvořeno tento týden",
    condition: { attr: "createdAt", op: "in_this_week" },
  },
  {
    id: "last-activity-week",
    label: "Poslední aktivita před týdnem",
    condition: { attr: "crmLastActivityAt", op: "older_than_days", value: 7 },
  },
  {
    id: "no-next-activity",
    label: "Bez další aktivity",
    condition: { attr: "crmOpenActivities", op: "eq", value: 0 },
  },
  { id: "rotting", label: "Hnije", condition: { attr: "crmRotting", op: "is_true" } },
  {
    id: "close-month",
    label: "Uzavření tento měsíc",
    condition: { attr: "expectedCloseDate", op: "in_this_month" },
  },
  {
    id: "value",
    label: "Hodnota je alespoň…",
    condition: { attr: "sumContract", op: "gte" },
  },
];
