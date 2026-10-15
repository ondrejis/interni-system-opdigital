import type { PreviewPart } from "./logic";

/*
  Tvary výsledků příkazů e-mailové knihovny (čisté typy, bez zod): čte je UI (`import type`) i testy. Vstupy příkazů
  jsou v `library/contract.ts`.
*/

/** Řádek seznamu knihovny (bez celého textu, jen úryvek). */
export type LibraryRow = {
  id: string;
  title: string;
  category: string | null;
  subject: string;
  /** Hodnoty štítků (`lookup tag`); popisky dodá popis entity. */
  tags: string[];
  snippet: string;
  updatedAt: string;
};

/** Výsledek `muj-prostor.library.list`: nalezené položky a počty pro filtry (kategorie, štítky) přes celou knihovnu. */
export type LibraryList = {
  rows: LibraryRow[];
  /** Počet nalezených položek (před ořezem na strop). */
  total: number;
  truncated: boolean;
  /** Kategorie s počtem položek v celé knihovně (nezávisle na hledání). */
  categories: { name: string; count: number }[];
  /** Štítky s popiskem a počtem položek v celé knihovně. */
  tags: { value: string; label: string; count: number }[];
};

/** Komu patří proměnná: kontakt, organizace, obchod, zakázka, nebo odesílatel (přihlášený uživatel). */
export type VariableSource = "person" | "company" | "deal" | "job" | "sender";

/** Proměnná textu (`{jmeno}`). `available` = některý zapnutý modul ji umí vyplnit. */
export type LibraryVariable = {
  key: string;
  label: string;
  source: VariableSource;
  available: boolean;
};

/** Výsledek `muj-prostor.library.variables`: katalog proměnných a druhy záznamů, ze kterých jde náhled vyplnit. */
export type LibraryVariables = {
  variables: LibraryVariable[];
  pickers: Exclude<VariableSource, "sender">[];
  /** Je zapnutá služba sdílených šablon (přesun mezi knihovnou a šablonami). */
  templatesAvailable: boolean;
};

/** Možnost výběru záznamu pro náhled (`muj-prostor.library.pick`). */
export type PickOption = {
  id: string;
  label: string;
  hint: string | null;
  /** U kontaktu: jeho hlavní organizace (náhled si ji doplní sám). */
  companyId?: string | null;
  companyName?: string | null;
};

/** Výsledek `muj-prostor.library.preview`: text vyplněný daty vybraného kontaktu, odkazy pro odeslání a upozornění. */
export type LibraryPreview = {
  /** Předmět a text po dosazení (to, co se kopíruje). Bez vybraného kontaktu zůstanou proměnné jako `{klic}`. */
  subject: string;
  body: string;
  subjectParts: PreviewPart[];
  bodyParts: PreviewPart[];
  /** Proměnné, které se nepodařilo vyplnit (v textu zůstane prázdné místo). */
  missing: string[];
  /** Proměnné mimo katalog (překlep v textu). */
  unknown: string[];
  /** Adresát (hlavní e-mail vybraného kontaktu, jinak e-mail organizace). */
  to: string | null;
  gmailUrl: string | null;
  mailtoUrl: string | null;
  /** Text je příliš dlouhý pro odkaz do Gmailu, jde jen zkopírovat (R-46). */
  tooLong: boolean;
  /** Čím byl náhled vyplněn (jména vybraných záznamů). */
  labels: { person?: string; company?: string; deal?: string; job?: string };
  /** Zda byl vybrán aspoň jeden záznam (jinak je to jen text se zástupnými proměnnými). */
  filled: boolean;
};

/** Směr přesunu textu mezi knihovnou a sdílenými šablonami. */
export type MoveDirection = "toTemplates" | "fromTemplate";

/** Výsledek `muj-prostor.library.move`. */
export type LibraryMoveResult = {
  direction: MoveDirection;
  /** Id nového záznamu v cíli (šablona, nebo položka knihovny). */
  id: string;
  /** Adresa nového záznamu. */
  href: string;
  /** Původní záznam zůstal (kopie). */
  kept: boolean;
};
