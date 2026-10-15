/*
  Tvary výsledků příkazů přehledu Soukromé (čisté typy): čte je UI (`import type`) i testy.
*/

/** Soukromý záznam v přehledu. */
export type PrivateRow = {
  id: string;
  title: string;
  /** Adresa záznamu; `null`, když pro typ není stránka. */
  href: string | null;
  /** Stručný popis (stav, termín…), poskládaný z výchozích sloupců entity. */
  detail: string | null;
  updatedAt: string;
};

/** Skupina soukromých záznamů jednoho typu. */
export type PrivateGroup = {
  entityType: string;
  label: string;
  listPath: string;
  /** Počet soukromých záznamů typu. */
  total: number;
  /** Nejnověji upravené záznamy (strop `PRIVATE_GROUP_LIMIT`). */
  rows: PrivateRow[];
  truncated: boolean;
};

/** Výsledek `muj-prostor.private.overview`. */
export type PrivateOverview = {
  groups: PrivateGroup[];
  /** Soukromých záznamů celkem. */
  total: number;
  /** Je zapnutý modul poznámek (nabídne se „Nová soukromá poznámka“). */
  canCreateNote: boolean;
};

/** Výsledek `muj-prostor.private.createNote`. */
export type CreateNoteResult = { id: string; href: string | null };
