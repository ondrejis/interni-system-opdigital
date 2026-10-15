import { defineCommand } from "@rebar/core/module-server";
import {
  libraryListInput,
  libraryMoveInput,
  libraryPickInput,
  libraryPreviewInput,
  libraryVariablesInput,
} from "./contract";
import { listLibrary } from "./data";
import { moveFromTemplate, moveToTemplates } from "./move";
import { buildCatalog, pickRecords, previewLibraryItem } from "./preview";
import type {
  LibraryList,
  LibraryMoveResult,
  LibraryPreview,
  LibraryVariables,
  PickOption,
} from "./types";

const PERMISSION = "muj-prostor.email_library";

/** Hledání a seznam e-mailové knihovny s počty kategorií a štítků. */
export const libraryList = defineCommand({
  name: "muj-prostor.library.list",
  permission: PERMISSION,
  input: libraryListInput,
  handler: async (ctx, input): Promise<LibraryList> => listLibrary(ctx, input),
});

/** Katalog proměnných textu (stejný jako u šablon e-mailů). */
export const libraryVariables = defineCommand({
  name: "muj-prostor.library.variables",
  permission: PERMISSION,
  input: libraryVariablesInput,
  handler: async (_ctx, _input, deps): Promise<LibraryVariables> => buildCatalog(deps),
});

/** Text položky vyplněný daty vybraného kontaktu, organizace, obchodu a zakázky, s odkazy do Gmailu. */
export const libraryPreview = defineCommand({
  name: "muj-prostor.library.preview",
  permission: PERMISSION,
  input: libraryPreviewInput,
  handler: async (ctx, input, deps): Promise<LibraryPreview> =>
    previewLibraryItem(ctx, deps, input),
});

/** Hledání záznamů pro výběr v náhledu. */
export const libraryPick = defineCommand({
  name: "muj-prostor.library.pick",
  permission: PERMISSION,
  input: libraryPickInput,
  handler: async (ctx, input, deps): Promise<PickOption[]> => pickRecords(ctx, deps, input),
});

/** Přesun nebo kopie textu mezi knihovnou a sdílenými šablonami. */
export const libraryMove = defineCommand({
  name: "muj-prostor.library.move",
  permission: PERMISSION,
  input: libraryMoveInput,
  handler: async (ctx, input, deps): Promise<LibraryMoveResult> =>
    input.direction === "toTemplates"
      ? moveToTemplates(ctx, deps, input)
      : moveFromTemplate(ctx, deps, input),
});

/** Příkazy oblasti „library“. */
export const libraryCommands = [
  libraryList,
  libraryVariables,
  libraryPreview,
  libraryPick,
  libraryMove,
];
