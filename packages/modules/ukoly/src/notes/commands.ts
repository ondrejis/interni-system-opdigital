import { defineCommand } from "@rebar/core/module-server";
import {
  createNoteInput,
  deleteNoteInput,
  getNoteInput,
  listNotesInput,
  pinNoteInput,
  saveNoteInput,
  updateNoteInput,
} from "./contract";
import { getNote, listNotes } from "./queries";
import { createNote, deleteNote, pinNote, saveNote, updateNote } from "./write";

/*
  Příkazy poznámek (`ukoly.note.*`, UKO-11). Čtení vyžaduje `ukoly.read`, zápis `ukoly.write`/`create`/`delete`; rozsah
  „jen moje“, soukromé záznamy a zámek hlídá datová vrstva (`visibleNotes`, engine entit).
*/

/** `ukoly.note.get`: poznámka s obsahem. */
export const noteGetCommand = defineCommand({
  name: "ukoly.note.get",
  permission: "ukoly.read",
  input: getNoteInput,
  handler: (ctx, i, deps) => getNote(ctx, deps, i.id),
});

/** `ukoly.note.list`: poznámky k záznamu nebo samostatné (připnuté nahoře, pak nejnovější; hledání v textu). */
export const noteListCommand = defineCommand({
  name: "ukoly.note.list",
  permission: "ukoly.read",
  input: listNotesInput,
  handler: (ctx, i, deps) => listNotes(ctx, deps, i),
});

/** `ukoly.note.create`: nová poznámka. */
export const noteCreateCommand = defineCommand({
  name: "ukoly.note.create",
  permission: "ukoly.create",
  input: createNoteInput,
  handler: (ctx, i, deps) => createNote(ctx, deps, i),
});

/** `ukoly.note.save`: autosave obsahu s ochranou verzí (konflikt se vrací jako výsledek, ne výjimka). */
export const noteSaveCommand = defineCommand({
  name: "ukoly.note.save",
  permission: "ukoly.write",
  input: saveNoteInput,
  handler: (ctx, i, deps) => saveNote(ctx, deps, i),
});

/** `ukoly.note.update`: přesun k jinému záznamu a štítky. */
export const noteUpdateCommand = defineCommand({
  name: "ukoly.note.update",
  permission: "ukoly.write",
  input: updateNoteInput,
  handler: (ctx, i, deps) => updateNote(ctx, deps, i),
});

/** `ukoly.note.pin`: připnutí a odepnutí. */
export const notePinCommand = defineCommand({
  name: "ukoly.note.pin",
  permission: "ukoly.write",
  input: pinNoteInput,
  handler: (ctx, i, deps) => pinNote(ctx, deps, i),
});

/** `ukoly.note.delete`: smazání do koše. */
export const noteDeleteCommand = defineCommand({
  name: "ukoly.note.delete",
  permission: "ukoly.delete",
  input: deleteNoteInput,
  handler: async (ctx, i, deps) => {
    await deleteNote(ctx, deps, i.id);
    return { id: i.id };
  },
});

/** Všechny příkazy poznámek. */
export const noteCommands = [
  noteGetCommand,
  noteListCommand,
  noteCreateCommand,
  noteSaveCommand,
  noteUpdateCommand,
  notePinCommand,
  noteDeleteCommand,
];
