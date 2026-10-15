"use client";

import { defineModuleUi, type RecordTab } from "@rebar/ui";
import { CompleteForm, completeTitle } from "./flows";
import { JobHeader } from "./header";
import { JobHistoryTab } from "./history-tab";
import { OVERVIEW_CARDS } from "./overview";
import { JobTasksTab } from "./tasks-tab";
import { SaveAsTemplateForm } from "./templates";
import { JOB_TAB_ORDER } from "./tab-order";

const jobTabs: RecordTab[] = [
  {
    id: "ukoly",
    label: "Úkoly",
    icon: "check-square",
    order: JOB_TAB_ORDER.ukoly,
    render: ({ id, entity }) => <JobTasksTab jobId={id} canWrite={entity.can.write} />,
  },
  {
    id: "historie",
    label: "Historie",
    icon: "history",
    order: JOB_TAB_ORDER.historie,
    render: ({ id, entity }) => <JobHistoryTab jobId={id} canWrite={entity.can.write} />,
  },
];

const isLive = (row: Record<string, unknown>) =>
  row.status === "planned" || row.status === "active" || row.status === "paused";

/**
 * UI oblast modulu „zakazky“ (ZAK-B): hlavička detailu s pásem fází, záložky Úkoly a Historie, karty Přehledu, akce
 * (Dokončit, Zrušit, Uložit jako šablonu) a palety příkazů. Stránky `/zakazky`, `/zakazky/faze` a `/zakazky/sablony` jsou
 * trasy aplikace (`apps/web/src/app/(app)/zakazky`). Záložky Finance, Hodiny, Poznámky, Obchod a Reklama přidávají vlastní
 * moduly přes `recordTabs.job` (pořadí `JOB_TAB_ORDER`); bez zapnutého modulu prostě chybí.
 */
export const areaUi = defineModuleUi({
  recordHeader: { job: JobHeader },
  recordTabs: { job: jobTabs },
  recordOverview: { job: OVERVIEW_CARDS },
  // Úkoly a Historie nahrazují základní záložky jádra; Aktivita zůstává jako karta na Přehledu
  hiddenCoreTabs: { job: ["tasks", "activity"] },
  recordActions: {
    job: [
      {
        id: "complete-job",
        label: "Dokončit zakázku",
        permission: "zakazky.write",
        visible: isLive,
        dialog: {
          title: completeTitle("finished"),
          render: ({ id, close }) => (
            <CompleteForm jobId={id} reason="finished" onCancel={close} onDone={close} />
          ),
        },
      },
      {
        id: "cancel-job",
        label: "Zrušit zakázku",
        permission: "zakazky.write",
        visible: isLive,
        dialog: {
          title: completeTitle("cancelled"),
          render: ({ id, close }) => (
            <CompleteForm jobId={id} reason="cancelled" onCancel={close} onDone={close} />
          ),
        },
      },
      {
        id: "save-as-template",
        label: "Uložit jako šablonu",
        permission: "zakazky.templates",
        dialog: {
          title: "Uložit jako šablonu",
          render: ({ id, row, close }) => (
            <SaveAsTemplateForm jobId={id} title={String(row.title ?? "")} close={close} />
          ),
        },
      },
    ],
  },
  paletteActions: [
    {
      id: "zakazky.new",
      label: "Nová zakázka",
      keywords: "zakázka vytvořit založit projekt",
      icon: "briefcase",
      permission: "zakazky.create",
      href: "/zakazky?novy=1",
    },
    {
      id: "zakazky.board",
      label: "Board zakázek podle stavu",
      keywords: "kanban zakázky",
      icon: "briefcase",
      permission: "zakazky.read",
      href: "/zakazky?pohled=stav",
    },
    {
      id: "zakazky.phases",
      label: "Board zakázek podle fází",
      keywords: "kanban fáze zakázky",
      icon: "briefcase",
      permission: "zakazky.read",
      href: "/zakazky/faze",
    },
    {
      id: "zakazky.templates",
      label: "Šablony zakázek",
      keywords: "šablona nastavení",
      icon: "briefcase",
      permission: "zakazky.read",
      href: "/zakazky/sablony",
    },
  ],
});
