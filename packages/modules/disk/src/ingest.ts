/*
  Příchozí callback z n8n (`POST /api/ingest/drive`, D §2.2, DRV-03): výsledek založení, přejmenování, archivace nebo
  obnovy složek. Duplicitu (`eventId` + stav) vyřazuje už jádro (`inbound_event`); handler je i tak idempotentní.
  Pozdní odpověď po vypršení lhůty (10 min) se přijme a požadavek dokončí.
*/
import { eq, or } from "drizzle-orm";
import { UserError, inTx, type Ctx } from "@rebar/core/rbac";
import { defineIngest, type ModuleDeps } from "@rebar/core/module-server";
import { captureError } from "@rebar/core/observability";
import { DRIVE_ID_PATTERN, driveCallbackSchema, type DriveCallback } from "./contract";
import { kindOfEvent, loadFolders } from "./facts";
import {
  forgetFolder,
  reconcileServices,
  saveFolder,
  settleRequest,
  syncEntityStatus,
} from "./requests";
import { driveRequest } from "./schema";
import { DRIVE_SERVICES, type DriveEntityType, type DriveRequestKind } from "./types";

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Nalezne požadavek podle `eventId` z callbacku: `requestId` z těla události, nebo ID obálky webhooku. */
async function findRequest(ctx: Ctx, eventId: string) {
  if (!isUuid(eventId)) return null;
  const [row] = await ctx.db
    .select()
    .from(driveRequest)
    .where(or(eq(driveRequest.id, eventId), eq(driveRequest.eventId, eventId)))
    .limit(1);
  return row ?? null;
}

/** Zkontroluje, že ID složek mají tvar ID z Disku; vrátí text chyby, nebo `null`. */
function badFolderIds(folders: DriveCallback["folders"]): string | null {
  const ids = [
    folders?.root,
    folders?.project,
    folders?.archive,
    ...DRIVE_SERVICES.map((s) => folders?.services?.[s]),
  ].filter((v): v is string => !!v);
  return ids.find((v) => !DRIVE_ID_PATTERN.test(v))
    ? "Odpověď n8n obsahuje neplatné ID složky."
    : null;
}

/**
 * Uloží složky z odpovědi podle druhu požadavku. Vrací text chyby, když odpověď neobsahuje to, co daný druh
 * požadavku musí vrátit (ID složky klienta, zakázky).
 */
async function applyFolders(
  ctx: Ctx,
  req: { entityType: DriveEntityType; entityId: string; clientId: string },
  kind: DriveRequestKind,
  folders: DriveCallback["folders"],
): Promise<string | null> {
  const f = folders ?? {};
  const saveServices = async () => {
    for (const s of DRIVE_SERVICES) {
      const id = f.services?.[s];
      if (id) await saveFolder(ctx, "company", req.clientId, s, id);
    }
  };
  switch (kind) {
    case "client.create":
      if (!f.root) return "Odpověď n8n neobsahuje ID složky klienta (folders.root).";
      await saveFolder(ctx, "company", req.clientId, "", f.root);
      await saveServices();
      return null;
    case "client.add_service":
      if (f.root) await saveFolder(ctx, "company", req.clientId, "", f.root);
      await saveServices();
      return null;
    case "client.rename":
      if (f.root) await saveFolder(ctx, "company", req.clientId, "", f.root);
      return null;
    case "client.archive": {
      if (f.root) await saveFolder(ctx, "company", req.clientId, "", f.root);
      // značka „je v Archivu“ nese ID přesunuté složky (nejčastěji shodné s kořenovou); n8n ji smí vynechat
      const id =
        f.archive ?? f.root ?? (await loadFolders(ctx.db, "company", req.clientId)).get("");
      if (!id)
        return "Odpověď n8n neobsahuje ID archivované složky (folders.archive nebo folders.root).";
      await saveFolder(ctx, "company", req.clientId, "archive", id);
      return null;
    }
    case "client.restore":
      if (f.root) await saveFolder(ctx, "company", req.clientId, "", f.root);
      await forgetFolder(ctx, "company", req.clientId, "archive");
      return null;
    case "project.create":
      if (!f.project) return "Odpověď n8n neobsahuje ID složky zakázky (folders.project).";
      await saveFolder(ctx, "job", req.entityId, "", f.project);
      if (f.root) await saveFolder(ctx, "company", req.clientId, "", f.root);
      await saveServices();
      return null;
  }
}

/** Zpracování callbacku (vyděleno z `driveIngest`, aby šlo volat přímo v testech). */
export async function handleDriveCallback(
  ctx: Ctx,
  body: DriveCallback,
  deps: ModuleDeps,
): Promise<{ entity: { type: string; id: string } }> {
  return inTx(ctx, async (c) => {
    const req = await findRequest(c, body.eventId);
    if (!req) throw new UserError("Neznámý požadavek na složku (eventId).");
    const kind = kindOfEvent(req.event);
    const entity = { type: req.entityType, id: req.entityId };

    let failure: string | null = null;
    if (body.status === "ok") {
      failure = badFolderIds(body.folders);
      if (!failure)
        failure = await applyFolders(
          c,
          {
            entityType: req.entityType as DriveEntityType,
            entityId: req.entityId,
            clientId: req.clientId,
          },
          kind,
          body.folders,
        );
    }

    if (body.status === "ok" && !failure) {
      await settleRequest(c, deps, req.id, "ok");
      // složka klienta je hotová: doplň služby, které mezitím přibyly, a přepiš stav klienta i zakázky
      if (kind === "client.create") {
        try {
          await c.db.transaction((tx) => reconcileServices({ ...c, db: tx }, deps, req.clientId));
        } catch (err) {
          captureError(err, { where: "disk.reconcileServices" });
        }
      }
      if (kind === "project.create") await syncEntityStatus(c, deps, "company", req.clientId);
      return { entity };
    }

    const message =
      failure ?? body.error ?? "n8n hlásí chybu při práci se složkami (bez bližšího popisu).";
    await settleRequest(c, deps, req.id, "error", message);
    return { entity };
  });
}

/** Příchozí zdroj `drive`: výsledek práce n8n se složkami. */
export const driveIngest = defineIngest({
  source: "drive",
  schema: driveCallbackSchema,
  // stejná odpověď podruhé je duplicita; opravná odpověď (chyba → ok) má jiný klíč
  externalId: (body) => `${body.eventId}:${body.status}`,
  handle: (ctx, body, deps) => handleDriveCallback(ctx, body, deps),
});
