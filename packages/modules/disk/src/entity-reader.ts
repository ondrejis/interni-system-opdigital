/*
  Čtení údajů o klientovi a zakázce, které modul „disk“ potřebuje (název, služby, soukromí…), bez závislosti na
  modulech `kontakty` a `zakazky`: tabulku entity vezme z registru entit (`company`, `job`). Čte jako systém
  (bez rozsahu aktéra); komu smí výsledek ukázat, rozhoduje volající přes `visibleEntityIds`.
*/
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Executor } from "@rebar/core/db";
import type { EntityRegistry } from "@rebar/core/entities";
import { DRIVE_SERVICES } from "./types";
import type { ServiceType } from "@rebar/core/contracts";

/** Klient (`company`) tak, jak ho potřebuje Disk. */
export type ClientFacts = {
  id: string;
  name: string;
  ico: string | null;
  /** Stav klienta (`lead`, `active`, `paused`, `former`), nebo `null`, když firma není klient. */
  status: string | null;
  services: ServiceType[];
  isPrivate: boolean;
};

/** Zakázka (`job`) tak, jak ji potřebuje Disk. */
export type JobFacts = {
  id: string;
  number: string;
  title: string;
  type: ServiceType;
  companyId: string;
  startDate: string | null;
  isPrivate: boolean;
};

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

async function readRow(
  db: Executor,
  registry: EntityRegistry,
  entityKey: string,
  id: string,
  props: readonly string[],
): Promise<Record<string, unknown> | null> {
  const def = registry.get(entityKey);
  if (!def) return null;
  const cols = getTableColumns(def.table) as Record<string, AnyPgColumn>;
  const select: Record<string, AnyPgColumn> = {};
  for (const p of props) if (cols[p]) select[p] = cols[p]!;
  const [row] = await db
    .select(select)
    .from(def.table)
    .where(and(eq(cols.id!, id), isNull(cols.deletedAt!)))
    .limit(1);
  return (row as Record<string, unknown> | undefined) ?? null;
}

/** Klient podle ID; `null`, když neexistuje, je smazaný, nebo modul `kontakty` není zapnutý. */
export async function readClient(
  db: Executor,
  registry: EntityRegistry,
  id: string,
): Promise<ClientFacts | null> {
  const row = await readRow(db, registry, "company", id, [
    "id",
    "name",
    "ico",
    "clientStatus",
    "services",
    "isPrivate",
  ]);
  if (!row) return null;
  const services = Array.isArray(row.services)
    ? (row.services as unknown[]).filter((s): s is ServiceType =>
        (DRIVE_SERVICES as readonly unknown[]).includes(s),
      )
    : [];
  return {
    id: String(row.id),
    name: str(row.name) ?? "",
    ico: str(row.ico),
    status: str(row.clientStatus),
    services,
    isPrivate: row.isPrivate === true,
  };
}

/** Zakázka podle ID; `null`, když neexistuje, je smazaná, nebo modul `zakazky` není zapnutý. */
export async function readJob(
  db: Executor,
  registry: EntityRegistry,
  id: string,
): Promise<JobFacts | null> {
  const row = await readRow(db, registry, "job", id, [
    "id",
    "number",
    "title",
    "type",
    "companyId",
    "startDate",
    "isPrivate",
  ]);
  if (!row) return null;
  const type = str(row.type);
  if (!type || !(DRIVE_SERVICES as readonly string[]).includes(type)) return null;
  return {
    id: String(row.id),
    number: str(row.number) ?? "",
    title: str(row.title) ?? "",
    type: type as ServiceType,
    companyId: String(row.companyId),
    startDate: str(row.startDate),
    isPrivate: row.isPrivate === true,
  };
}

/** Soukromí záznamů podle ID (`true` = soukromý); chybějící záznam v mapě není. */
export async function readPrivacy(
  db: Executor,
  registry: EntityRegistry,
  entityKey: "company" | "job",
  ids: readonly string[],
): Promise<Map<string, boolean>> {
  const def = registry.get(entityKey);
  if (!def || !ids.length) return new Map();
  const cols = getTableColumns(def.table) as Record<string, AnyPgColumn>;
  const rows = await db
    .select({ id: cols.id!, isPrivate: cols.isPrivate ?? cols.id! })
    .from(def.table)
    .where(and(inArray(cols.id!, [...ids]), isNull(cols.deletedAt!)));
  return new Map(rows.map((r) => [String(r.id), cols.isPrivate ? r.isPrivate === true : false]));
}

/** Zobrazované názvy záznamů (název firmy, název zakázky) pro výpisy v Nastavení. */
export async function readTitles(
  db: Executor,
  registry: EntityRegistry,
  entityKey: "company" | "job",
  ids: readonly string[],
): Promise<Map<string, string>> {
  const def = registry.get(entityKey);
  const titleField = def?.attributes.find((a) => a.key === def.titleKey)?.field;
  if (!def || !titleField || !ids.length) return new Map();
  const cols = getTableColumns(def.table) as Record<string, AnyPgColumn>;
  const title = cols[titleField];
  if (!title) return new Map();
  const rows = await db
    .select({ id: cols.id!, title })
    .from(def.table)
    .where(inArray(cols.id!, [...ids]));
  return new Map(rows.map((r) => [String(r.id), String(r.title ?? "")]));
}
