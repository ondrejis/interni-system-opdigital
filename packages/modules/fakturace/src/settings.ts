import { z } from "zod";
import { defineSetting } from "@rebar/core/settings";
import { DEFAULT_MAIL_TEMPLATES, unknownVariables } from "./dispatch/templates";

/** Seznam e-mailů oddělených čárkou nebo středníkem (kopie e-mailů s doklady). */
export const emailList = (v: string): string[] =>
  v
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Text šablony: neznámá proměnná (překlep) by se do e-mailu dostala doslova, proto se odmítne už při uložení. */
const templateText = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Text šablony nesmí být prázdný.")
    .max(max)
    .superRefine((v, ctx) => {
      const unknown = unknownVariables(v);
      if (unknown.length)
        ctx.addIssue({
          code: "custom",
          message: `Neznámá proměnná {${unknown[0]}} v šabloně e-mailu.`,
        });
    });

const emailsText = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) => emailList(v).every((e) => z.email().safeParse(e).success),
    "Kopie: zadejte platné e-mailové adresy oddělené čárkou.",
  )
  .refine((v) => emailList(v).length <= 5, "Kopie: nejvýš 5 adres.");

/**
 * Nastavení fakturace a šablony dokladů (texty na PDF, QR platba, e-maily s fakturou a upomínkou).
 * Mění ho správce v Nastavení, platí pro nově vystavené i tištěné doklady.
 */
export const fakturaceSetting = defineSetting({
  key: "fakturace",
  schema: z.object({
    dueDays: z.number().int().min(0).max(365),
    introText: z.string().trim().max(1000),
    footerText: z.string().trim().max(300),
    showQr: z.boolean(),
    /** `null` = podle toho, zda má firma DIČ. */
    vatPayer: z.boolean().nullable(),
    /** Kód klasifikace produkce CZ-CPA, který se tiskne na dokladu v režimu přenesené daňové povinnosti (např. „43“). */
    reverseChargeCpa: z.string().trim().max(20),
    /** Platební podmínky pod součty dokladu (např. penále, způsob úhrady). */
    termsText: z.string().trim().max(1000),
    /** Poznámka pod položkami, kterou nese každý doklad, když nemá vlastní poznámku. */
    notesText: z.string().trim().max(1000),
    /** Do patičky se přidá kontakt firmy (e-mail, telefon, web) z údajů o firmě. */
    footerContact: z.boolean(),
    /** Výchozí kopie e-mailů s doklady (oddělené čárkou). */
    mailCc: emailsText,
    mailInvoiceSubject: templateText(200),
    mailInvoiceBody: templateText(5000),
    mailReminderSubject: templateText(200),
    mailReminderBody: templateText(5000),
  }),
  default: {
    dueDays: 14,
    introText: "",
    footerText: "",
    showQr: true,
    vatPayer: null as boolean | null,
    reverseChargeCpa: "",
    termsText: "",
    notesText: "",
    footerContact: false,
    mailCc: "",
    mailInvoiceSubject: DEFAULT_MAIL_TEMPLATES.invoiceSubject,
    mailInvoiceBody: DEFAULT_MAIL_TEMPLATES.invoiceBody,
    mailReminderSubject: DEFAULT_MAIL_TEMPLATES.reminderSubject,
    mailReminderBody: DEFAULT_MAIL_TEMPLATES.reminderBody,
  },
});

export type FakturaceSettings = typeof fakturaceSetting.default;
