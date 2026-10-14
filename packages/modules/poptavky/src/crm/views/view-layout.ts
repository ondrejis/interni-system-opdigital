import type { FilterAttributeGroup, SavedViewInfo, ViewLayout, ViewMeta } from "@rebar/ui";

/** Skupiny pohledů v nabídce Pohledy seznamu obchodů (pořadí = pořadí v nabídce). */
const GROUPS: ViewLayout["groups"] = [
  { id: "mine", label: "Moje" },
  { id: "deal", label: "Stav obchodu" },
  {
    id: "cleanup",
    label: "Čištění dat",
    hint: "Kontroly, které hledají obchody k opravě, doplnění nebo uzavření.",
  },
  { id: "jobs", label: "Zakázky", hint: "Pohledy ze seznamu zakázek, tedy po výhře obchodu." },
];

/** Zařazení výchozích (seedových) pohledů podle názvu; přejmenovaný nebo vlastní pohled spadne do Moje / Sdílené pohledy. */
const BY_NAME: Record<string, ViewMeta> = {
  "Moje otevřené": { group: "mine", pinned: true },
  "Bez další aktivity": { group: "deal", pinned: true },
  Zhnilé: { group: "deal", pinned: true },
  "Uzavření tento měsíc": { group: "deal" },
  "Prohrané za čtvrtletí": { group: "deal" },
  "Čištění: bez úpravy 90 dní": {
    group: "cleanup",
    label: "Bez úpravy 90 dní",
    description: "Otevřené obchody, na kterých se 90 dní nic nezměnilo.",
  },
  "Čištění: otevřené bez aktivit": {
    group: "cleanup",
    label: "Otevřené bez aktivit",
    description: "Otevřené obchody, které nemají žádnou otevřenou ani dokončenou aktivitu.",
  },
  "Čištění: v první fázi déle než 30 dní": {
    group: "cleanup",
    label: "V první fázi déle než 30 dní",
    description: "Poptávky, které leží ve fázi Poptávka déle než 30 dní.",
  },
  "Moje zakázky": { group: "jobs" },
  "Nabídky čekající na odpověď": { group: "jobs" },
  "V realizaci": { group: "jobs" },
  "Po termínu": { group: "jobs" },
  "V záruce": { group: "jobs" },
  "Kanban podle stavu": { group: "jobs" },
};

/**
 * Uspořádání uložených pohledů seznamu obchodů: tři nejčastější jsou záložky vedle výchozího „Otevřené obchody“,
 * ostatní jedna nabídka po skupinách (Moje, Stav obchodu, Čištění dat, Zakázky). Vlastní pohledy uživatele a ty, které
 * klient přejmenoval, jsou v nabídce ve skupinách „Moje pohledy“ a „Sdílené pohledy“.
 */
export const DEAL_VIEW_LAYOUT: ViewLayout = {
  groups: GROUPS,
  maxPinned: 3,
  meta: (v: SavedViewInfo) => (v.shared ? BY_NAME[v.name] : undefined),
};

/**
 * Skupiny atributů v nabídce Filtr seznamu obchodů. Atribut, který tu chybí (nové pole, vlastní pole), se zařadí do
 * „Ostatní“ a „Vlastní pole“; atribut skrytý oprávněním se prostě nenabídne.
 */
export const DEAL_FILTER_GROUPS: readonly FilterAttributeGroup[] = [
  {
    id: "deal",
    label: "Obchod",
    attrs: [
      "title",
      "number",
      "phase",
      "stage",
      "manager",
      "sumContract",
      "crmWeighted",
      "crmProbabilityPct",
      "lostReason",
      "crmLostNote",
    ],
  },
  {
    id: "dates",
    label: "Termíny",
    attrs: [
      "expectedCloseDate",
      "crmNextActivityAt",
      "crmLastActivityAt",
      "crmStageEnteredAt",
      "phaseChangedAt",
      "createdAt",
      "updatedAt",
      "wonAt",
      "startDate",
      "endDate",
      "handoverAt",
      "closedAt",
      "warrantyUntil",
      "crmArchivedAt",
    ],
  },
  {
    id: "activity",
    label: "Aktivity",
    attrs: ["crmOpenActivities", "crmOverdueActivities", "crmRotting"],
  },
  { id: "contact", label: "Kontakt", attrs: ["company", "person"] },
  {
    id: "source",
    label: "Zdroj",
    attrs: ["crmSource", "crmSourceChannel", "crmCampaign", "sourceInquiry"],
  },
  { id: "site", label: "Stavba", attrs: ["address", "siteCity", "siteLat", "siteLng"] },
  {
    id: "money",
    label: "Rozpočet a peníze",
    attrs: [
      "value",
      "sumCost",
      "sumInvoiced",
      "sumPaid",
      "sumMarginPct",
      "sumDrawdownPct",
      "sumHealth",
      "vatMode",
      "retentionBp",
      "warrantyMonths",
    ],
  },
];
