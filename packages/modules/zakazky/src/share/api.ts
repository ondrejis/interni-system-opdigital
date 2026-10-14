/**
 * Veřejné rozhraní oblasti „share“ (odkaz pro investora). Serverový kód; veřejná stránka investora a jeho
 * stahování souborů ho volají bez přihlášení, proto každá funkce vrací jen explicitně vybrané sloupce
 * (nikdy ceny, náklady ani marže) a rozsah odkazu vynucuje tady, ne v prohlížeči.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { schema, type Executor } from "@rebar/core/db";
import { PHASES, isPhaseKey } from "../lifecycle/phases";
import { job, jobShare } from "../schema";
import { normalizeScope, shareStatus, type ShareScope } from "./model";
import { SHARE_TOKEN_RE, hashShareToken } from "./token";

export { hashShareToken, newShareToken, SHARE_TOKEN_RE } from "./token";
export * from "./model";

export type ResolvedShare = {
  id: string;
  jobId: string;
  label: string | null;
  scope: ShareScope;
};

/** Platný odkaz podle tokenu z adresy; neplatný, zrušený a prošlý je stejně „nenalezeno“ (`null`). */
export async function resolveShare(db: Executor, token: string): Promise<ResolvedShare | null> {
  if (!SHARE_TOKEN_RE.test(token)) return null;
  const [row] = await db
    .select()
    .from(jobShare)
    .where(and(eq(jobShare.tokenHash, hashShareToken(token)), isNull(jobShare.deletedAt)));
  if (!row || shareStatus(row) !== "active") return null;
  return { id: row.id, jobId: row.jobId, label: row.label, scope: normalizeScope(row.scope) };
}

/** Odkaz podle id pro náhled „pohled investora“ (volající už ověřil oprávnění). */
export async function loadShareById(db: Executor, id: string): Promise<ResolvedShare | null> {
  const [row] = await db
    .select()
    .from(jobShare)
    .where(and(eq(jobShare.id, id), isNull(jobShare.deletedAt)));
  return row
    ? { id: row.id, jobId: row.jobId, label: row.label, scope: normalizeScope(row.scope) }
    : null;
}

export type InvestorFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  hasThumb: boolean;
};

export type InvestorBase = {
  job: {
    title: string;
    address: string | null;
    phase: string | null;
    phaseLabel: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  label: string | null;
  photos: InvestorFile[];
  documents: InvestorFile[];
};

const fileCols = {
  id: schema.file.id,
  name: schema.file.name,
  mime: schema.file.mime,
  size: schema.file.size,
  kind: schema.file.kind,
  thumbKey: schema.file.thumbKey,
};

/** Základ stránky investora: název a fáze zakázky, fotky a dokumenty podle rozsahu. Bez čísla zakázky a bez peněz. */
export async function investorBase(db: Executor, s: ResolvedShare): Promise<InvestorBase | null> {
  const [j] = await db
    .select({
      title: job.title,
      address: job.address,
      phase: job.phase,
      startDate: job.startDate,
      endDate: job.endDate,
    })
    .from(job)
    .where(and(eq(job.id, s.jobId), isNull(job.deletedAt)));
  if (!j) return null;
  const attachments = (kind?: "photo") =>
    db
      .select(fileCols)
      .from(schema.attachment)
      .innerJoin(schema.file, eq(schema.file.id, schema.attachment.fileId))
      .where(
        and(
          eq(schema.attachment.entityType, "job"),
          eq(schema.attachment.entityId, s.jobId),
          isNull(schema.attachment.deletedAt),
          isNull(schema.file.deletedAt),
          kind
            ? and(eq(schema.attachment.kind, "photo"), eq(schema.file.kind, "image"))
            : s.scope.documentIds.length
              ? inArray(schema.file.id, s.scope.documentIds)
              : undefined,
        ),
      );
  const toFile = (r: {
    id: string;
    name: string;
    mime: string;
    size: number;
    thumbKey: string | null;
  }): InvestorFile => ({
    id: r.id,
    name: r.name,
    mime: r.mime,
    size: r.size,
    hasThumb: !!r.thumbKey,
  });
  const photos = s.scope.photos
    ? (await attachments("photo").orderBy(desc(schema.attachment.createdAt)).limit(200)).map(toFile)
    : [];
  const documents = s.scope.documentIds.length
    ? (await attachments().orderBy(asc(schema.file.name)).limit(100))
        .filter((f) => f.kind !== "image" || !photos.some((p) => p.id === f.id))
        .map(toFile)
    : [];
  return {
    job: {
      title: j.title,
      address: j.address,
      phase: isPhaseKey(j.phase) ? j.phase : null,
      phaseLabel: isPhaseKey(j.phase) ? PHASES[j.phase].label : null,
      startDate: j.startDate,
      endDate: j.endDate,
    },
    label: s.label,
    photos,
    documents,
  };
}

/**
 * Smí investor stáhnout tento soubor? Jen fotky a dokumenty v rozsahu odkazu a fotky ze zápisů deníku, které vidí
 * (`diaryPhotoIds` dodá modul Realizace). Soubor musí být připojený k zakázce odkazu.
 */
export async function canServeFile(
  db: Executor,
  s: ResolvedShare,
  fileId: string,
  diaryPhotoIds: readonly string[] = [],
): Promise<{
  id: string;
  storageKey: string;
  thumbKey: string | null;
  name: string;
  mime: string;
} | null> {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const [f] = await db
    .select({
      id: schema.file.id,
      storageKey: schema.file.storageKey,
      thumbKey: schema.file.thumbKey,
      name: schema.file.name,
      mime: schema.file.mime,
      kind: schema.file.kind,
      attKind: schema.attachment.kind,
    })
    .from(schema.attachment)
    .innerJoin(schema.file, eq(schema.file.id, schema.attachment.fileId))
    .where(
      and(
        eq(schema.file.id, fileId),
        eq(schema.attachment.entityType, "job"),
        eq(schema.attachment.entityId, s.jobId),
        isNull(schema.attachment.deletedAt),
        isNull(schema.file.deletedAt),
      ),
    );
  if (!f) return null;
  const isPhoto = f.kind === "image" && f.attKind === "photo";
  const ok =
    (s.scope.photos && isPhoto) ||
    s.scope.documentIds.includes(f.id) ||
    (s.scope.diary !== "none" && diaryPhotoIds.includes(f.id));
  return ok
    ? { id: f.id, storageKey: f.storageKey, thumbKey: f.thumbKey, name: f.name, mime: f.mime }
    : null;
}
