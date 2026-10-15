import { z } from "zod";
import type { AresCompany } from "./types";

/** Kód právní formy z ARES (`pravniForma`) → název. Neznámý kód se do organizace nepíše (lepší prázdné než hádat). */
export const LEGAL_FORMS: Record<string, string> = {
  "101": "Fyzická osoba podnikající (živnostník)",
  "102": "Fyzická osoba podnikající zapsaná v obchodním rejstříku",
  "111": "Veřejná obchodní společnost",
  "112": "Společnost s ručením omezeným",
  "113": "Společnost komanditní",
  "117": "Nadace",
  "118": "Nadační fond",
  "121": "Akciová společnost",
  "141": "Obecně prospěšná společnost",
  "145": "Společenství vlastníků jednotek",
  "205": "Družstvo",
  "301": "Státní podnik",
  "325": "Organizační složka státu",
  "331": "Příspěvková organizace",
  "421": "Odštěpný závod zahraniční právnické osoby",
  "706": "Spolek",
  "801": "Obec",
  "804": "Kraj",
};

const sidloSchema = z
  .object({
    nazevObce: z.string().optional(),
    nazevCastiObce: z.string().optional(),
    nazevUlice: z.string().optional(),
    cisloDomovni: z.number().optional(),
    cisloOrientacni: z.number().optional(),
    cisloOrientacniPismeno: z.string().optional(),
    psc: z.number().optional(),
  })
  .partial();

const responseSchema = z.object({
  ico: z.string(),
  obchodniJmeno: z.string().min(1),
  dic: z.string().optional(),
  pravniForma: z.union([z.string(), z.number()]).optional(),
  sidlo: sidloSchema.optional(),
});

/** Převede odpověď ARES na pole organizace (ulice s číslem popisným a orientačním, město, PSČ s mezerou). */
export function mapAres(raw: unknown): AresCompany | null {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  const s = r.sidlo ?? {};
  const number = s.cisloDomovni
    ? `${s.cisloDomovni}${s.cisloOrientacni ? `/${s.cisloOrientacni}${s.cisloOrientacniPismeno ?? ""}` : ""}`
    : null;
  // obec bez ulic: adresa je „část obce + číslo popisné“
  const streetName = s.nazevUlice ?? (number ? s.nazevCastiObce : undefined);
  const street = [streetName, number].filter(Boolean).join(" ") || null;
  const zip = s.psc
    ? String(s.psc)
        .padStart(5, "0")
        .replace(/^(\d{3})(\d{2})$/, "$1 $2")
    : null;
  return {
    ico: r.ico.padStart(8, "0"),
    name: r.obchodniJmeno.trim(),
    dic: r.dic?.trim() || null,
    legalForm: r.pravniForma !== undefined ? (LEGAL_FORMS[String(r.pravniForma)] ?? null) : null,
    street,
    city: s.nazevObce?.trim() || null,
    zip,
  };
}
