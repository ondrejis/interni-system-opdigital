"use client";

import { mergeModuleUi, type ModuleUi } from "@rebar/ui";
import { metaUi } from "./meta/ui";
import { areaUi } from "./ui/index";

/** UI modulu „reklama“ složené z oblastí. */
export const ui: ModuleUi = mergeModuleUi(areaUi, metaUi);
