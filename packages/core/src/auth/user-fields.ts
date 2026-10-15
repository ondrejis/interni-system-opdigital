import { z } from "zod";
import "../zod-locale";

/*
  Pole uživatele, která systém používá mimo přihlášení (NAS-06): zkratka (avatary, rozpisy plateb), IČO, na které
  uživatel fakturuje (vyrovnání mezi IČO), a jeho fakturační nástroj (volný text, bez napojení).
*/

/** Barvy avataru (klíče `data-color` štítků v UI); `null` = barva podle jména. */
export const AVATAR_COLORS = [
  "blue",
  "green",
  "orange",
  "purple",
  "pink",
  "teal",
  "indigo",
  "yellow",
] as const;
/** Barva avataru z palety UI. */
export type AvatarColor = (typeof AVATAR_COLORS)[number];

/** Nejkratší a nejdelší zkratka uživatele (počet znaků). */
export const SHORT_NAME_LENGTH = { min: 2, max: 4 } as const;

/** Zkratka z jména: počáteční písmena slov, velkými písmeny, nejvýš dvě (Ondřej Dvořák → OD). */
export function deriveShortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]!, parts[parts.length - 1]!] : parts.slice(0, 1);
  const initials = letters.map((p) => [...p][0] ?? "").join("");
  const base = initials.length >= 2 ? initials : [...(parts[0] ?? "")].slice(0, 2).join("");
  return base.toLocaleUpperCase("cs-CZ");
}

/** Kontrolní součet IČO (modulo 11, vážené součty 8…2); IČO musí mít přesně osm číslic. */
export function isValidIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(ico[i]) * (8 - i);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(ico[7]);
}

/** Zkratka: 2 až 4 znaky (písmena a číslice), ukládá se velkými písmeny; prázdná = odvodí se z jména. */
export const shortNameField = z.preprocess(
  (v) => v ?? "",
  z
    .string()
    .trim()
    .transform((v) => v.toLocaleUpperCase("cs-CZ"))
    .refine(
      (v) => v === "" || (v.length >= SHORT_NAME_LENGTH.min && v.length <= SHORT_NAME_LENGTH.max),
      `Zkratka má mít ${SHORT_NAME_LENGTH.min} až ${SHORT_NAME_LENGTH.max} znaky.`,
    )
    .refine((v) => /^[\p{L}\p{N}]*$/u.test(v), "Zkratka smí obsahovat jen písmena a číslice.")
    .transform((v) => (v === "" ? null : v)),
);

/** IČO: osm číslic se správným kontrolním součtem (mezery se ignorují); prázdné = bez IČO. */
export const icoField = z.preprocess(
  (v) => v ?? "",
  z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ""))
    .refine(
      (v) => v === "" || isValidIco(v),
      "IČO není platné (osm číslic, ověřuje se kontrolní součet).",
    )
    .transform((v) => (v === "" ? null : v)),
);

/** Fakturační nástroj: volný text (Fakturoid, iDoklad, Excel…). */
export const billingToolField = z.preprocess(
  (v) => v ?? "",
  z
    .string()
    .trim()
    .max(80, "Název nástroje je příliš dlouhý.")
    .transform((v) => (v === "" ? null : v)),
);

/** Barva avataru, nebo prázdná (podle jména). */
export const avatarColorField = z.enum(AVATAR_COLORS).nullable();
