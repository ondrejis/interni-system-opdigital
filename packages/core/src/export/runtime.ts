import { z } from "zod";
import type { ClientConfig } from "../config/schema";
import type { Db } from "../db/client";
import type { EntityRegistry } from "../entities/engine";
import type { StorageDriver } from "../files/storage";
import type { QueueClient } from "../jobs/jobs";
import type { Cipher } from "../security/crypto";
import { defineSetting, type SettingsService } from "../settings/settings";
import { companySetting } from "../settings/defs";
import type { CsvFormat } from "./csv";
import type { ExportHeader } from "./pdf-table";

/** Nastavení exportů v administraci; `null` = platí hodnota z konfigurace klienta. */
export const exportSetting = defineSetting({
  key: "exports",
  schema: z.object({ csvDelimiter: z.enum([";", ","]).nullable() }),
  default: { csvDelimiter: null } as { csvDelimiter: ";" | "," | null },
});

/**
 * Služby exportů: web a worker je skládají každý po svém (stejný kód, jiné spojení). Export se vždy provádí s právy
 * uživatele, ve jménu kterého běží (`loadActor`), nikdy s právy systému.
 */
export type ExportRuntime = {
  db: Db;
  registry: EntityRegistry;
  storage: StorageDriver;
  /** Katalog oprávnění zapnutých modulů (aktér se z něj načítá v úloze na pozadí). */
  catalog: ReadonlySet<string>;
  settings: SettingsService;
  queue: Pick<QueueClient, "send">;
  cipher: Cipher;
  baseURL: string;
  config: ClientConfig["exports"];
  brand: () => Promise<string>;
};

/** Oddělovač CSV: nastavení v administraci má přednost před konfigurací klienta. */
export async function csvFormatOf(rt: ExportRuntime): Promise<CsvFormat> {
  const s = await rt.settings.get(rt.db, exportSetting);
  return { delimiter: s.csvDelimiter ?? rt.config.csvDelimiter };
}

/** Hlavička PDF: název systému a údaje o firmě klienta. */
export async function exportHeaderOf(rt: ExportRuntime): Promise<ExportHeader> {
  const [brand, company] = await Promise.all([rt.brand(), rt.settings.get(rt.db, companySetting)]);
  const c = company as Record<string, string | null>;
  const lines = [
    [c.name, c.ico ? `IČO ${c.ico}` : null, c.dic ? `DIČ ${c.dic}` : null]
      .filter(Boolean)
      .join(" · "),
    [c.street, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  ].filter(Boolean);
  return { brand, lines };
}
