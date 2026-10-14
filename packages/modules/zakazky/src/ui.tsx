"use client";

import { mergeModuleUi, type ModuleUi } from "@rebar/ui";
import { areaUi } from "./ui/index";

/** UI modulu „zakazky“ složené z oblastí (ZAK-B: hlavička, pás fází, `/zakazky/faze`, `JobsFromDealDialog`). */
export const ui: ModuleUi = mergeModuleUi(areaUi);
