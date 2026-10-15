/*
  Kontrakt modulu „disk“ (M1): zod vstupy příkazů, tvar callbacku z n8n (`/api/ingest/drive`) a tvary výstupů.
  Server only (zod); UI používá typy z `types.ts`.
*/
import { z } from "zod";
import { DRIVE_REQUEST_KINDS, DRIVE_SERVICES } from "./types";
import { structureSchema } from "./settings";

export { structureSchema } from "./settings";

/** Typ záznamu se složkou. */
export const entityTypeSchema = z.enum(["company", "job"]);

/** Vstup příkazů nad jednou složkou (`disk.folderState`, `disk.retry`). */
export const folderRefInput = z.object({ entityType: entityTypeSchema, id: z.uuid() });

/**
 * `disk.requestFolder`: ruční „Vytvořit složku“. `force` potvrzuje varování u soukromého záznamu (složka na sdíleném
 * Disku bude pro Patrika viditelná); bez něj se soukromý záznam odmítne (`skipped: "private"`).
 */
export const requestFolderInput = folderRefInput.extend({ force: z.boolean().optional() });

/** `disk.structure.set`: celá nová struktura (platí jen pro nově zakládané složky). */
export const structureSetInput = z.object({ structure: structureSchema });

/** `disk.enabled.set`: zapnutí a vypnutí zakládání složek. */
export const enabledSetInput = z.object({ enabled: z.boolean() });

/** Prázdný vstup (`disk.structure.get`, `disk.status`, `disk.test`). */
export const emptyInput = z.object({});

/**
 * Tělo callbacku z n8n, `POST /api/ingest/drive` (D §2.2, DRV-03). `eventId` je `requestId` z těla události
 * (`data.requestId`); n8n smí poslat i ID obálky webhooku (`id`), obě se přijímají. `folders` jsou ID složek na Disku
 * (ne cesty): `root` složka klienta, `services` složky služeb, `project` složka zakázky, `archive` složka v Archivu.
 */
export const driveCallbackSchema = z.object({
  eventId: z.string().trim().min(1).max(64),
  status: z.enum(["ok", "error"]),
  folders: z
    .object({
      root: z.string().trim().min(1).max(256).optional(),
      services: z
        .object({
          web: z.string().trim().min(1).max(256).optional(),
          marketing: z.string().trim().min(1).max(256).optional(),
          systemy: z.string().trim().min(1).max(256).optional(),
        })
        .optional(),
      project: z.string().trim().min(1).max(256).optional(),
      archive: z.string().trim().min(1).max(256).optional(),
    })
    .optional(),
  error: z.string().trim().max(2000).optional(),
});
/** Tělo callbacku z n8n po zparsování. */
export type DriveCallback = z.output<typeof driveCallbackSchema>;

/** ID složky z Disku smí obsahovat jen písmena, číslice, `_` a `-` (jinak by šlo podstrčit cokoli do odkazu). */
export const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{5,256}$/;

/** Druhy požadavků pro výpis v Nastavení. */
export const requestKindSchema = z.enum(DRIVE_REQUEST_KINDS);
/** Služby, které mají složku. */
export const serviceSchema = z.enum(DRIVE_SERVICES);
