"use client";

import { mergeModuleUi, type ModuleUi } from "@rebar/ui";
import { areaUi } from "./ui/index";

export { CreateJobDialog, JobsFromDealDialog } from "./ui/create-job";
export type { CreateJobPreset, JobsFromDealResult } from "./ui/create-job";
export { JobsPage } from "./ui/jobs-page";
export type { JobsView } from "./ui/jobs-page";
export { TemplateEditorPage, TemplatesPage } from "./ui/templates";
export { JOB_TAB_ORDER } from "./ui/tab-order";

/**
 * UI modulu „zakazky“ (ZAK-B): hlavička detailu s pásem fází, záložky Úkoly a Historie, karty Přehledu, akce a paleta.
 * Stránky `/zakazky`, `/zakazky/faze`, `/zakazky/sablony` jsou trasy aplikace; `JobsFromDealDialog` používá modul Obchody.
 */
export const ui: ModuleUi = mergeModuleUi(areaUi);
