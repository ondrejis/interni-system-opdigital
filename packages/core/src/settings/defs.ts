import { z } from "zod";
import { INTERNAL_NAME } from "../config/schema";
import { defineSetting } from "./settings";

/** Branding upravitelný v administraci; přepisuje hodnoty z konfigurace klienta. */
export const brandingSetting = defineSetting({
  key: "branding",
  schema: z.object({
    name: z
      .string()
      .trim()
      .min(2)
      .refine(
        (v) => !v.toLowerCase().includes(INTERNAL_NAME),
        "Název nesmí obsahovat interní název jádra.",
      )
      .nullable(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Barva musí být ve tvaru #RRGGBB.")
      .nullable(),
    logoFileId: z.uuid().nullable(),
  }),
  default: { name: null, accentColor: null, logoFileId: null } as {
    name: string | null;
    accentColor: string | null;
    logoFileId: string | null;
  },
});

/** Odesílání e-mailů (SMTP). Heslo je v DB zašifrované. */
export const smtpSetting = defineSetting({
  key: "smtp",
  schema: z.object({
    enabled: z.boolean(),
    host: z.string().trim(),
    port: z.number().int().min(1).max(65535),
    secure: z.boolean(),
    user: z.string().trim(),
    password: z.string().nullable(),
    from: z.string().trim(),
  }),
  default: {
    enabled: false,
    host: "",
    port: 587,
    secure: false,
    user: "",
    password: null,
    from: "",
  } as {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string | null;
    from: string;
  },
  secret: ["password"],
});

export type Branding = { name: string; accentColor: string; logoFileId: string | null };

/** Výsledný branding: nastavení v administraci má přednost před konfigurací klienta. */
export function resolveBranding(
  config: { name: string; accentColor: string },
  override: { name: string | null; accentColor: string | null; logoFileId: string | null },
): Branding {
  return {
    name: override.name ?? config.name,
    accentColor: override.accentColor ?? config.accentColor,
    logoFileId: override.logoFileId,
  };
}

/** Údaje o firmě klienta (na dokladech, v PDF a e-mailech). */
export const companySetting = defineSetting({
  key: "company",
  schema: z.object({
    name: z.string().trim(),
    ico: z
      .string()
      .regex(/^\d{8}$/, "IČO má 8 číslic.")
      .nullable(),
    dic: z.string().trim().nullable(),
    street: z.string().trim().nullable(),
    city: z.string().trim().nullable(),
    zip: z.string().trim().nullable(),
    email: z.email("Neplatný e-mail.").nullable(),
    phone: z.string().trim().nullable(),
    web: z.string().trim().nullable(),
    bankAccount: z.string().trim().nullable(),
  }),
  default: {
    name: "",
    ico: null,
    dic: null,
    street: null,
    city: null,
    zip: null,
    email: null,
    phone: null,
    web: null,
    bankAccount: null,
  } as {
    name: string;
    ico: string | null;
    dic: string | null;
    street: string | null;
    city: string | null;
    zip: string | null;
    email: string | null;
    phone: string | null;
    web: string | null;
    bankAccount: string | null;
  },
});
