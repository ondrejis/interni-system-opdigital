import { z } from "zod";
import { defineSetting } from "@rebar/core/settings";

/** Šablona PDF nabídky: úvod, podmínky, patička a platnost. Mění ji správce v Nastavení → Fakturace a dokumenty. */
export const offerTemplateSetting = defineSetting({
  key: "nabidka",
  schema: z.object({
    /** Text pod hlavičkou nabídky (např. poděkování za poptávku). */
    introText: z.string().trim().max(1000),
    /** Obchodní a platební podmínky pod součty. */
    termsText: z.string().trim().max(2000),
    footerText: z.string().trim().max(300),
    footerContact: z.boolean(),
    /** Platnost nabídky ve dnech od data vystavení; 0 = netiskne se. */
    validityDays: z.number().int().min(0).max(365),
  }),
  default: {
    introText: "",
    termsText: "",
    footerText: "",
    footerContact: false,
    validityDays: 30,
  },
});

export type OfferTemplate = typeof offerTemplateSetting.default;
