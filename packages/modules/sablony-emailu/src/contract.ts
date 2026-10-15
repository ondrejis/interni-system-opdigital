import { z } from "zod";
import { EMAIL_LANGUAGES } from "./schema";
import type { PreviewPart } from "./logic";

/*
  Kontrakt příkazů modulu „sablony-emailu“ (SAB): zod vstupy a výstupy. Příkazy jen připravují e-mail (náhled, adresa
  do Gmailu) a zapisují počítadlo použití a aktivitu; z OPSYS se nic neodesílá (SAB-05).
*/

/** Záznamy, ze kterých jde napsat e-mail ze šablony (D §2.5: `emailVars.entityType`). */
export const EMAIL_ENTITY_TYPES = ["company", "person", "deal", "job"] as const;
/** Druh záznamu, ze kterého se e-mail píše. */
export type EmailEntityType = (typeof EMAIL_ENTITY_TYPES)[number];

const id = z.string().uuid();
export const entityTypeSchema = z.enum(EMAIL_ENTITY_TYPES);

/** Vybrané záznamy, kterými se náhled vyplní (každý nepovinný). */
export const contextSchema = z.object({
  personId: id.nullish(),
  companyId: id.nullish(),
  dealId: id.nullish(),
  jobId: id.nullish(),
});
/** Vybrané záznamy, kterými se náhled vyplní. */
export type EmailContext = z.infer<typeof contextSchema>;

/** `sablony-emailu.render`: e-mail ze šablony pro záznam (kontakt, organizaci, obchod, zakázku). */
export const renderInput = z.object({ entityType: entityTypeSchema, id, templateId: id });

/** `sablony-emailu.preview`: náhled rozepsané (neuložené) šablony s daty vybraných záznamů (editor). */
export const previewInput = z.object({
  subject: z.string().max(500),
  body: z.string().max(50_000),
  context: contextSchema.default({}),
});

/** `sablony-emailu.templates`: šablony pro výběr v dialogu (nejpoužívanější první). */
export const templatesInput = z.object({
  q: z.string().trim().max(100).optional(),
  language: z.enum(EMAIL_LANGUAGES).optional(),
  category: z.string().trim().max(100).optional(),
});

/** `sablony-emailu.pick`: hledání záznamů, kterými se náhled vyplní. */
export const pickInput = z.object({
  kind: entityTypeSchema,
  q: z.string().trim().max(100).optional(),
});

/** `sablony-emailu.markUsed`: použití šablony (počítadlo; po otevření Gmailu nebo kopii). */
export const markUsedInput = z.object({ templateId: id });

/** `sablony-emailu.logActivity`: zápis odeslaného e-mailu jako hotové aktivity (SAB-04). */
export const logActivityInput = z.object({
  entityType: entityTypeSchema,
  id,
  subject: z.string().trim().min(1).max(500),
});

/** `sablony-emailu.saveContent`: uložení předmětu a textu šablony z editoru. */
export const saveContentInput = z.object({
  id,
  subject: z.string().max(500),
  bodyText: z.string().max(50_000),
  /** `updatedAt` záznamu, nad kterým se upravovalo (ochrana před přepsáním cizí změny). */
  expectedUpdatedAt: z.string().optional(),
});

/** Proměnná šablony v katalogu (příspěvky `emailVars` zapnutých modulů + výchozí). */
export type TemplateVariable = {
  key: string;
  label: string;
  /** Odkud se hodnota bere. */
  source: "person" | "company" | "deal" | "job" | "sender";
  /** Příspěvek zapnutého modulu je k dispozici; nedostupná proměnná jde do šablony napsat, ale nevyplní se. */
  available: boolean;
};

/** Výsledek `sablony-emailu.variables`. */
export type VariablesResult = { variables: TemplateVariable[] };

/** Jména vybraných záznamů pro popisek náhledu. */
export type PreviewLabels = Partial<Record<"person" | "company" | "deal" | "job", string>>;

/** Výsledek `sablony-emailu.preview`: vyplněný předmět a text, zvýrazňovací části a odkazy. */
export type PreviewResult = {
  subject: string;
  body: string;
  subjectParts: PreviewPart[];
  bodyParts: PreviewPart[];
  missing: string[];
  unknown: string[];
  /** Adresát (e-mail kontaktu), nebo `null`. */
  to: string | null;
  gmailUrl: string | null;
  mailtoUrl: string | null;
  /** Text je příliš dlouhý pro odkaz do Gmailu (R-46): nabídne se jen Kopírovat. */
  tooLong: boolean;
  labels: PreviewLabels;
  /** Je vybraný aspoň jeden záznam (jinak zůstávají proměnné jako zástupné symboly). */
  filled: boolean;
};

/** Výsledek `sablony-emailu.render`: náhled + údaje o šabloně. */
export type RenderResult = PreviewResult & {
  template: { id: string; name: string; category: string | null; language: string };
};

/** Šablona v seznamu pro výběr. */
export type TemplateOption = {
  id: string;
  name: string;
  category: string | null;
  language: (typeof EMAIL_LANGUAGES)[number];
  subject: string;
  snippet: string;
  usageCount: number;
};

/** Možnost výběru záznamu pro náhled. */
export type PickOption = { id: string; label: string; hint: string | null };

/** Výsledek `sablony-emailu.markUsed`. */
export type MarkUsedResult = {
  usageCount: number;
  /** Je zapnutý modul úkolů, takže jde nabídnout zápis aktivity (SAB-04). */
  canLogActivity: boolean;
};

/** Výsledek `sablony-emailu.logActivity`. */
export type LogActivityResult = { activityId: string };
