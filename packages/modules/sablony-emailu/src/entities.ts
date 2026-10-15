import { eq } from "drizzle-orm";
import { defineEntity } from "@rebar/core/entities";
import { textToDoc } from "./logic";
import { EMAIL_LANGUAGES, emailTemplate } from "./schema";

/** Popisky jazyků šablon. */
export const EMAIL_LANGUAGE_LABELS: Record<(typeof EMAIL_LANGUAGES)[number], string> = {
  cs: "Česky",
  sk: "Slovensky",
  en: "Anglicky",
};

/**
 * Šablona e-mailu s proměnnými z příspěvků modulů (`emailVars`). Šablony jsou sdílené (vidí je každý s oprávněním
 * `sablony-emailu.read`); autor je může zamknout jako soukromé (vidí je jen vlastník). Soukromá knihovna textů vlastníka
 * je v Můj prostor. Text e-mailu je atribut `bodyText` (prostý text, ve kterém se hledá a který jde do Gmailu); tělo jako
 * dokument Tiptap (`body_json`) se z něj odvozuje v háčcích níže, aby se nerozešly.
 */
export const emailTemplateEntity = defineEntity({
  key: "email_template",
  listPath: "/sablony-emailu",
  module: "sablony-emailu",
  label: { one: "Šablona e-mailu", many: "Šablony e-mailů" },
  table: emailTemplate,
  titleKey: "name",
  permissions: {
    read: "sablony-emailu.read",
    write: "sablony-emailu.write",
    create: "sablony-emailu.create",
    delete: "sablony-emailu.delete",
  },
  ownerColumns: [emailTemplate.createdBy],
  visibility: { ownLock: true },
  beforeUpdate: async (_ctx, _before, changes) => {
    if (typeof changes.bodyText === "string") return { bodyJson: textToDoc(changes.bodyText) };
  },
  afterCreate: async (ctx, created) => {
    await ctx.db
      .update(emailTemplate)
      .set({ bodyJson: textToDoc(String(created.bodyText ?? "")) })
      .where(eq(emailTemplate.id, String(created.id)));
  },
  attributes: [
    {
      key: "name",
      label: "Název",
      type: "text",
      field: "name",
      required: true,
      width: 260,
      defaultVisible: true,
    },
    {
      key: "category",
      label: "Kategorie",
      type: "text",
      field: "category",
      width: 160,
      defaultVisible: true,
    },
    {
      key: "language",
      label: "Jazyk",
      type: "select",
      field: "language",
      choices: EMAIL_LANGUAGES.map((v) => ({ value: v, label: EMAIL_LANGUAGE_LABELS[v] })),
      default: "cs",
      width: 110,
      defaultVisible: true,
    },
    {
      key: "subject",
      label: "Předmět",
      type: "text",
      field: "subject",
      width: 280,
      defaultVisible: true,
    },
    {
      key: "bodyText",
      label: "Text e-mailu",
      type: "longtext",
      field: "bodyText",
      default: "",
    },
    {
      key: "usageCount",
      label: "Použito",
      type: "number",
      field: "usageCount",
      readonly: true,
      width: 100,
      defaultVisible: true,
    },
    {
      key: "tags",
      label: "Štítky",
      type: "multiselect",
      field: "tags",
      lookup: "tag",
      lookupScope: "email_template",
      width: 200,
    },
  ],
  search: (r) => ({
    title: String(r.name),
    ...(r.category ? { subtitle: String(r.category) } : {}),
    extra: `${r.subject ?? ""} ${String(r.bodyText ?? "").slice(0, 2000)}`,
  }),
  url: (id) => `/sablony-emailu/${id}`,
});

export const entities = [emailTemplateEntity];
export { emailTemplate };
