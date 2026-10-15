import { z } from "zod";

/*
  Vstupy příkazů přehledu Soukromé (MPR-2): `muj-prostor.private.*`. Výsledky jsou v `private/types.ts`. Soubor se
  zpřístupňuje přes `../contract.ts`.
*/

/** `muj-prostor.private.overview`: všechny soukromé záznamy seskupené podle typu. */
export const privateOverviewInput = z.object({});

/** `muj-prostor.private.createNote`: nová samostatná soukromá poznámka (bez vazby na obchod, zakázku ani kontakt). */
export const privateCreateNoteInput = z.object({
  title: z.string().trim().max(200).default(""),
  text: z.string().trim().min(1, "Napište text poznámky.").max(50_000),
});
