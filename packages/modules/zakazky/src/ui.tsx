"use client";

import {
  defineModuleUi,
  type RecordOverviewCard,
  type RecordTab,
  type RecordTabGroup,
  RelatedRecords,
} from "@rebar/ui";
import * as approvals from "./approvals/ui";
import * as budget from "./budget/ui";
import * as changes from "./changes/ui";
import * as costs from "./costs/ui";
import * as lifecycle from "./lifecycle/ui";
import * as orders from "./orders/ui";
import * as share from "./share/ui";
import * as statements from "./statements/ui";
import * as templates from "./templates/ui";
import { JobHeader } from "./detail/header";
import { OVERVIEW_CARDS } from "./detail/overview";
import { GROUP_VISIBLE } from "./detail/visibility";
import { TodayTerminalWidget } from "./terminal-ui";

const relatedJobs = (parentAttribute: "company" | "person"): RecordTab => ({
  id: "zakazky",
  label: "Zakázky",
  permission: "zakazky.read",
  render: ({ id }) => (
    <RelatedRecords entity="job" parentAttribute={parentAttribute} parentId={id} />
  ),
});

/** Skupiny záložek detailu zakázky: v liště nejvýš osm záložek, uvnitř skupiny přepínač (ADR 015). */
const JOB_TAB_GROUPS: RecordTabGroup[] = [
  {
    id: "rozpocet",
    label: "Rozpočet",
    icon: "banknote",
    order: 10,
    permission: "zakazky.economics",
  },
  { id: "zmeny", label: "Změny", icon: "file-stack", order: 20, permission: "zakazky.economics" },
  {
    id: "naklady",
    label: "Náklady",
    icon: "dashboard",
    order: 30,
    permission: "zakazky.economics",
  },
  { id: "fakturace", label: "Fakturace", icon: "receipt", order: 40 },
  { id: "realizace", label: "Realizace", icon: "hard-hat", order: 50 },
];

const areas = [lifecycle, budget, templates, costs, orders, changes, statements, approvals, share];

/** Karty Přehledu zakázky z oblastí (oblast je může exportovat jako `overviewCards`) a vlastní karty detailu. */
const areaCards = (areas as unknown as { overviewCards?: RecordOverviewCard[] }[]).flatMap(
  (a) => a.overviewCards ?? [],
);

/**
 * Viditelnost záložek podle fáze zakázky (pravidla ve `detail/visibility.ts`): pravidlo skupiny se přidá k vlastní
 * podmínce `visible` záložky. Záložka tak zmizí, když nedává smysl (Změny před realizací, Fakturace u poptávky…).
 */
const withPhaseRules = (t: RecordTab): RecordTab => {
  const rule = t.group ? GROUP_VISIBLE[t.group] : undefined;
  if (!rule) return t;
  const own = t.visible;
  return { ...t, visible: (row) => rule(row) && (!own || own(row)) };
};

export const ui = defineModuleUi({
  recordTabs: {
    company: [relatedJobs("company")],
    person: [relatedJobs("person")],
    job: areas.flatMap((a) => a.tabs).map(withPhaseRules),
    // detail objednávky (`/zakazky/objednavky/<id>`) dodává oblast orders
    job_order: orders.recordTabs.job_order ?? [],
  },
  recordActions: {
    job: areas.flatMap((a) => a.actions),
    job_order: orders.recordActions.job_order ?? [],
  },
  recordTabGroups: {
    job: JOB_TAB_GROUPS.map((g) => ({
      ...g,
      ...(GROUP_VISIBLE[g.id] ? { visible: GROUP_VISIBLE[g.id]! } : {}),
    })),
  },
  recordHeader: { job: JobHeader },
  recordOverview: { job: [...OVERVIEW_CARDS, ...areaCards] },
  hiddenCoreTabs: { job: ["activity"] },
  terminalWidgets: { "zakazky.today": { Widget: TodayTerminalWidget } },
  pages: areas.flatMap((a) => a.pages),
});
