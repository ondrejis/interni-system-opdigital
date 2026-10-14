"use client";

import { mergeModuleUi, type ModuleUi } from "@rebar/ui";
import { areaUi } from "./ui/index";

/** UI modulu „ukoly“ složené z oblastí. */
export const ui: ModuleUi = mergeModuleUi(areaUi);
