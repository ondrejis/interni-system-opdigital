import { defineModuleUi } from "@rebar/ui";
import { MetaIntegrationPanel } from "./settings-panel";

/** UI oblast „meta“ modulu „reklama“ (REK-A): panel Meta v Nastavení → Integrace; zapojuje ji `ui.tsx` přes `mergeModuleUi`. */
export const metaUi = defineModuleUi({ slots: { "settings.integrations": MetaIntegrationPanel } });
