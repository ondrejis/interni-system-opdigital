import { defineEntity } from "@rebar/core/entities";
import { note } from "../schema/notes";
import { deriveNoteTitle } from "./doc";

/** Kolik znaků textu poznámky se indexuje pro hledání (Cmd+K). */
export const NOTE_SEARCH_CHARS = 50_000;

/**
 * Poznámka s formátovaným textem. Bez položky v navigaci (R-23): otevírá se z karty, paletou a z Můj prostor → Soukromé.
 * Rozsah „jen moje“: vlastní poznámky. Obsah (`bodyJson`, `bodyText`, `version`) se nezapisuje přes atributy, ale příkazy
 * `ukoly.note.*` (sanitizace a verze pro autosave); atributy jsou název, připnutí, vazby a štítky.
 */
export const noteEntity = defineEntity({
  key: "note",
  listPath: "/poznamky",
  module: "ukoly",
  label: { one: "Poznámka", many: "Poznámky" },
  table: note,
  titleKey: "title",
  permissions: {
    read: "ukoly.read",
    write: "ukoly.write",
    create: "ukoly.create",
    delete: "ukoly.delete",
  },
  ownerColumns: [note.createdBy],
  visibility: {
    parents: [
      { entityType: "deal", column: "dealId" },
      { entityType: "job", column: "jobId" },
    ],
    ownLock: true,
  },
  quickFilters: [
    {
      key: "pinned",
      label: "Připnuté",
      filter: { op: "and", conditions: [{ attr: "pinned", op: "is_true" }] },
    },
  ],
  attributes: [
    {
      key: "title",
      label: "Název",
      type: "text",
      field: "title",
      width: 280,
      defaultVisible: true,
    },
    {
      key: "pinned",
      label: "Připnuto",
      type: "checkbox",
      field: "pinned",
      width: 100,
      defaultVisible: true,
    },
    {
      key: "deal",
      label: "Obchod",
      type: "record",
      field: "dealId",
      record: { entityType: "deal" },
      width: 200,
      defaultVisible: true,
    },
    {
      key: "company",
      label: "Organizace",
      type: "record",
      field: "companyId",
      record: { entityType: "company" },
      width: 200,
      defaultVisible: true,
    },
    {
      key: "person",
      label: "Kontakt",
      type: "record",
      field: "personId",
      record: { entityType: "person" },
      width: 200,
    },
    {
      key: "job",
      label: "Zakázka",
      type: "record",
      field: "jobId",
      record: { entityType: "job" },
      width: 200,
    },
    {
      key: "tags",
      label: "Štítky",
      type: "multiselect",
      field: "tags",
      lookup: "tag",
      lookupScope: "note",
      width: 200,
    },
  ],
  search: (r) => ({
    title: String(r.title || deriveNoteTitle(String(r.bodyText ?? "")) || "Poznámka"),
    // celý text poznámky (hledání bez diakritiky obstará `indexRecord`)
    extra: String(r.bodyText ?? "").slice(0, NOTE_SEARCH_CHARS),
  }),
  url: (id) => `/poznamky/${id}`,
});
