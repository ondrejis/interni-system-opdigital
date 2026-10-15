/*
  Nastavení modulu „disk“ (D §1.2): `drive.structure` (strom složek klienta a typů zakázek, výchozí ze specifikace)
  a `drive.enabled` (vypnuté Disk nezakládá složky ani neposílá události). Server only (zod).
*/
import { z } from "zod";
import { defineSetting, type SettingsService } from "@rebar/core/settings";
import type { Executor } from "@rebar/core/db";
import { DRIVE_SERVICES, type DriveStructure, type FolderNode } from "./types";
import { defaultStructure, ensureValidStructure, validateStructure } from "./tree";

const nodeSchema: z.ZodType<FolderNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(64),
    name: z.string().max(200),
    service: z.enum(DRIVE_SERVICES).optional(),
    children: z.array(nodeSchema).max(150),
  }),
) as unknown as z.ZodType<FolderNode>;

/** Zod schéma struktury složek (tvar; obsahovou kontrolu dělá `validateStructure`). */
export const structureSchema: z.ZodType<DriveStructure> = z.object({
  version: z.literal(1),
  clientsRoot: z.string().max(200),
  archiveRoot: z.string().max(200),
  jobFolderName: z.string().max(200),
  client: z.array(nodeSchema).max(150),
  job: z.object({
    web: z.array(nodeSchema).max(150),
    marketing: z.array(nodeSchema).max(150),
    systemy: z.array(nodeSchema).max(150),
  }),
}) as unknown as z.ZodType<DriveStructure>;

/** `drive.structure`: strom složek z Nastavení → Google Disk. */
export const driveStructureSetting = defineSetting({
  key: "drive.structure",
  schema: z.object({ structure: structureSchema.refine((s) => validateStructure(s).length === 0) }),
  default: { structure: defaultStructure() } as { structure: DriveStructure },
});

/** `drive.enabled`: zapnuté zakládání složek (výchozí ano). */
export const driveEnabledSetting = defineSetting({
  key: "drive.enabled",
  schema: z.object({ enabled: z.boolean() }),
  default: { enabled: true } as { enabled: boolean },
});

/** Platná struktura složek (poškozené nebo chybějící nastavení nahradí výchozím, zakládání se nikdy nezastaví). */
export async function loadStructure(
  settings: SettingsService,
  db: Executor,
): Promise<{ structure: DriveStructure; isDefault: boolean }> {
  const stored = await settings.get(db, driveStructureSetting);
  const structure = ensureValidStructure(stored.structure);
  const fallback = defaultStructure();
  return { structure, isDefault: JSON.stringify(structure) === JSON.stringify(fallback) };
}

/** Je zakládání složek zapnuté? */
export async function isDriveEnabled(settings: SettingsService, db: Executor): Promise<boolean> {
  return (await settings.get(db, driveEnabledSetting)).enabled;
}
