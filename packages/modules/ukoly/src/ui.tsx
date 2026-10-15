"use client";

import { mergeModuleUi, type ModuleUi } from "@rebar/ui";
import { areaUi } from "./ui/index";
import { notesUi } from "./notes/ui";

/** UI modulu „ukoly“ složené z oblastí. */
export const ui: ModuleUi = mergeModuleUi(areaUi, notesUi);

/** Komponenty úkolů pro hostitele (karty, dialogy): rychlé přidání, dialog úkolu, panel záložky a časová osa. */
export {
  MyTasksPage,
  NewTaskDialog,
  NewTaskForm,
  PlanComposer,
  LogComposer,
  QuickAdd,
  RecordTasksCard,
  RecordTasksPanel,
  TaskDialog,
  TaskTimeline,
  TaskTypesPage,
} from "./ui/index";
