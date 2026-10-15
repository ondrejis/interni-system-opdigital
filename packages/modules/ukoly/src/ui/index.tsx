import {
  defineModuleUi,
  type ModuleUi,
  type RecordAction,
  type RecordOverviewCard,
  type RecordTab,
} from "@rebar/ui";
import { CLIENT_TABS } from "@rebar/core/contracts";
import { MyTasksPage } from "./my-tasks";
import { RecordTasksCard, RecordTasksPanel } from "./record-tab";
import { NewTaskForm } from "./task-dialog";
import { linksFor } from "./record-tab";
import { TaskTypesPage } from "./types-page";

/** Entity, na jejichž kartě je záložka „Úkoly a aktivity“. */
const TARGETS = ["company", "person", "deal", "job"] as const;

const tab = (): RecordTab => ({
  id: "ukoly",
  label: "Úkoly a aktivity",
  icon: "check-square",
  permission: "ukoly.read",
  order: CLIENT_TABS.ukoly,
  render: ({ entity, id }) => <RecordTasksPanel target={{ entity: entity.key, id }} />,
});

const card = (): RecordOverviewCard => ({
  id: "ukoly",
  column: "main",
  order: 40,
  permission: "ukoly.read",
  render: ({ entity, id, openTab }) => (
    <RecordTasksCard target={{ entity: entity.key, id }} openTab={(t) => openTab(t)} />
  ),
});

const action = (): RecordAction => ({
  id: "ukoly-new",
  label: "Nový úkol",
  permission: "ukoly.create",
  dialog: {
    title: "Nový úkol",
    render: ({ entity, id, close, refresh }) => (
      <NewTaskForm
        links={linksFor({ entity: entity.key, id })}
        onClose={close}
        onCreated={refresh}
      />
    ),
  },
});

const each = <T,>(make: () => T): Record<string, readonly T[]> =>
  Object.fromEntries(TARGETS.map((k) => [k, [make()]]));

/** UI oblast „ui“ modulu „ukoly“ (UKO-B): Moje úkoly, Typy aktivit, záložka a akce na kartách záznamů. */
export const areaUi: ModuleUi = defineModuleUi({
  pages: [
    { path: "/ukoly", render: ({ query }) => <MyTasksPage query={query} /> },
    { path: "/ukoly/typy", render: () => <TaskTypesPage /> },
  ],
  recordTabs: each(tab),
  recordOverview: each(card),
  recordActions: each(action),
  // staré záložky „Úkoly“ jádra (tabulka `core_task`) nahrazuje tato oblast
  hiddenCoreTabs: Object.fromEntries(TARGETS.map((k) => [k, ["tasks"] as const])),
  paletteActions: [
    {
      id: "ukoly.new",
      label: "Nový úkol",
      keywords: "přidat úkol hovor schůzka termín",
      icon: "check-square",
      permission: "ukoly.create",
      href: "/ukoly?novy=1",
    },
  ],
});

export { MyTasksPage, TaskTypesPage, RecordTasksPanel, RecordTasksCard };
export { NewTaskDialog, NewTaskForm, TaskDialog } from "./task-dialog";
export { PlanComposer, LogComposer, TaskTimeline } from "./record-tab";
export { QuickAdd } from "./quick-add";
