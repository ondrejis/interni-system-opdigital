import { defineEntity } from "@rebar/core/entities";
import { emailLibraryItem } from "../schema";

/** Adresa knihovny (stránka s hledáním a náhledem); detail položky je na `<adresa>/<id>`. */
export const LIBRARY_PATH = "/muj-prostor/knihovna";

/**
 * Soukromá e-mailová knihovna vlastníka (KNI-01): texty, které nejsou sdílenými šablonami. Stránku `/muj-prostor/knihovna`
 * (hledání, náhled s daty kontaktu, kopírování, Gmail) kreslí UI modulu; generický seznam s filtry, exportem a plným
 * detailem záznamu je na `/muj-prostor/knihovna/vse`. Text je prostý (`bodyText`) s proměnnými `{jmeno}`; `bodyJson`
 * (Tiptap) vzniká jen přesunem ze šablon a úprava textu ho vynuluje, aby se texty nerozcházely.
 */
export const emailLibraryItemEntity = defineEntity({
  key: "email_library_item",
  listPath: `${LIBRARY_PATH}/vse`,
  module: "muj-prostor",
  label: { one: "Položka knihovny", many: "E-mailová knihovna" },
  table: emailLibraryItem,
  titleKey: "title",
  permissions: {
    read: "muj-prostor.email_library",
    write: "muj-prostor.email_library",
    create: "muj-prostor.email_library",
    delete: "muj-prostor.email_library",
    export: "muj-prostor.email_library",
  },
  attributes: [
    {
      key: "title",
      label: "Název",
      type: "text",
      field: "title",
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
      key: "subject",
      label: "Předmět",
      type: "text",
      field: "subject",
      width: 280,
      defaultVisible: true,
    },
    {
      key: "body",
      label: "Text",
      type: "longtext",
      field: "bodyText",
      width: 320,
    },
    {
      key: "tags",
      label: "Štítky",
      type: "multiselect",
      field: "tags",
      lookup: "tag",
      lookupScope: "email_library_item",
      width: 200,
    },
  ],
  /** Text je v databázi povinný (prázdný = prázdný řetězec). */
  beforeCreate: async (_ctx, values) => ({ ...values, body: values.body ?? "" }),
  /** Úprava textu zruší starý dokument Tiptap (z přesunu ze šablon), aby nezůstal jiný text než ten, který se kopíruje. */
  beforeUpdate: async (_ctx, _before, changes) => {
    if (!("bodyText" in changes)) return;
    return { bodyText: changes.bodyText ?? "", bodyJson: null };
  },
  search: (r) => ({
    title: String(r.title),
    ...(r.category ? { subtitle: String(r.category) } : {}),
    extra: `${r.subject ?? ""} ${String(r.bodyText ?? "").slice(0, 2000)}`,
  }),
  url: (id) => `${LIBRARY_PATH}/${id}`,
});
