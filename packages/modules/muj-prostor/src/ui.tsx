"use client";

import { mergeModuleUi, type ModuleUi } from "@rebar/ui";
import { areaUi as hosting } from "./hosting/ui";
import { areaUi as domains } from "./domains/ui";
import { areaUi as library } from "./library/ui";
import { areaUi as invoices } from "./invoices/ui";
import { areaUi as privateOverview } from "./private/ui";

/** UI modulu „muj-prostor“ složené z oblastí. */
export const ui: ModuleUi = mergeModuleUi(hosting, domains, library, invoices, privateOverview);
