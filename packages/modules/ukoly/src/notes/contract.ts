/*
  Kontrakt příkazů poznámek (`ukoly.note.*`, UKO-11): zod vstupy a tvary výstupů. Klientsky bezpečný soubor (žádné
  importy serveru a databáze), čte ho server, editor i testy. Úkoly mají kontrakt v `../contract.ts` (UKO-A).
*/
import { z } from "zod";
import { NOTE_LIMITS, type NoteDoc } from "./doc";

/** Dokument poznámky z klienta: tvar se kontroluje a čistí až `sanitizeNoteDoc` na serveru (zod tu jen hlídá, že jde o objekt). */
const docInput = z.record(z.string(), z.unknown());

/** Vazba poznámky: nejvýš jedna (obchod, organizace, kontakt nebo zakázka), jinak je samostatná. */
export const noteLinksShape = {
  dealId: z.uuid().nullish(),
  companyId: z.uuid().nullish(),
  personId: z.uuid().nullish(),
  jobId: z.uuid().nullish(),
};

const oneLink = (v: {
  dealId?: unknown;
  companyId?: unknown;
  personId?: unknown;
  jobId?: unknown;
}) => [v.dealId, v.companyId, v.personId, v.jobId].filter(Boolean).length <= 1;
const ONE_LINK_MSG =
  "Poznámka může patřit nejvýš k jednomu záznamu (obchod, organizace, kontakt, zakázka).";

const title = z.string().trim().max(NOTE_LIMITS.maxTitle).nullish();
const tags = z.array(z.string().trim().min(1).max(60)).max(30);

/** `ukoly.note.create`: nová poznámka (text je nepovinný, doplní se autosavem). Soukromá jen s právem na soukromé záznamy. */
export const createNoteInput = z
  .object({
    title,
    bodyJson: docInput.nullish(),
    ...noteLinksShape,
    pinned: z.boolean().optional(),
    tags: tags.optional(),
    isPrivate: z.boolean().optional(),
  })
  .refine(oneLink, ONE_LINK_MSG);
/** Vstup `ukoly.note.create`. */
export type CreateNoteInput = z.input<typeof createNoteInput>;

/** `ukoly.note.get`: jedna poznámka s obsahem. */
export const getNoteInput = z.object({ id: z.uuid() });

/**
 * `ukoly.note.save`: autosave obsahu (název a text). `baseVersion` je verze, ze které editor vychází; při neshodě server
 * zápis nepřijme a vrátí konflikt. `force` = poslední zápis vyhrává (po rozhodnutí uživatele).
 */
export const saveNoteInput = z.object({
  id: z.uuid(),
  baseVersion: z.number().int().min(1),
  title: title,
  bodyJson: docInput.optional(),
  force: z.boolean().optional(),
});
/** Vstup `ukoly.note.save`. */
export type SaveNoteInput = z.input<typeof saveNoteInput>;

/** `ukoly.note.update`: změna vazby (přesun poznámky ke klientovi, obchodu…) a štítků; obsah se mění přes `save`. */
export const updateNoteInput = z
  .object({ id: z.uuid(), ...noteLinksShape, tags: tags.optional() })
  .refine(oneLink, ONE_LINK_MSG);
/** Vstup `ukoly.note.update`. */
export type UpdateNoteInput = z.input<typeof updateNoteInput>;

/** `ukoly.note.pin`: připnutí nebo odepnutí (připnuté jsou v seznamech nahoře). */
export const pinNoteInput = z.object({ id: z.uuid(), pinned: z.boolean() });

/** `ukoly.note.delete`: smazání do koše. */
export const deleteNoteInput = z.object({ id: z.uuid() });

/**
 * `ukoly.note.list`: poznámky k záznamu (záložka „Poznámky“) nebo samostatné (`standalone`), připnuté nahoře, pak
 * nejnovější. `q` hledá v názvu a textu bez ohledu na diakritiku a velikost písmen.
 */
export const listNotesInput = z
  .object({
    ...noteLinksShape,
    /** Jen samostatné poznámky (bez vazby). */
    standalone: z.boolean().optional(),
    q: z.string().trim().max(200).optional(),
    /** Jen soukromé / jen sdílené (soukromé vidí jen vlastník). */
    visibility: z.enum(["all", "private", "shared"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).max(100_000).optional(),
  })
  .refine(oneLink, ONE_LINK_MSG);
/** Vstup `ukoly.note.list`. */
export type ListNotesInput = z.input<typeof listNotesInput>;

/** Odkaz poznámky na záznam s názvem (`title: null` = záznam aktér nesmí vidět). */
export type NoteLinkDto = {
  type: "deal" | "company" | "person" | "job";
  id: string;
  title: string | null;
};

/** Poznámka tak, jak ji dostane UI. */
export type NoteDto = {
  id: string;
  /** Název (ručně zadaný, nebo první řádek textu). */
  title: string | null;
  /** Obsah (Tiptap JSON, vždy sanitizovaný); `null` u poznámky bez textu. */
  bodyJson: NoteDoc | null;
  /** Prostý text (náhled a hledání). */
  bodyText: string;
  pinned: boolean;
  /** Verze textu pro autosave (`baseVersion`). */
  version: number;
  link: NoteLinkDto | null;
  tags: string[];
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  /** Smí aktér poznámku upravovat a mazat (rozsah „jen moje“: jen vlastní). */
  canWrite: boolean;
};

/** Odpověď `ukoly.note.list`. */
export type ListNotesResult = { rows: NoteDto[]; total: number };

/** Odpověď `ukoly.note.save`: uloženo (nová verze), nebo konflikt (aktuální poznámka na serveru). */
export type SaveNoteResult =
  { status: "saved"; note: NoteDto; unchanged: boolean } | { status: "conflict"; note: NoteDto };
