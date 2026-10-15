/*
  Služba `disk` pro ostatní moduly (`ServiceMap.disk`, D §2.3) a logika příkazů „Vytvořit složku“ a „Zkusit znovu“.
  Všechny funkce kontrolují, že aktér záznam smí vidět (soukromé záznamy, rozsah „jen moje“); složka záznamu,
  který aktér nevidí, pro něj neexistuje.
*/
import type { ServiceMap } from "@rebar/core/contracts";
import { NotFoundError, UserError, inTx, type Ctx } from "@rebar/core/rbac";
import type { ModuleServer } from "@rebar/core/module-server";
import {
  clientFolderFacts,
  effectiveState,
  folderInfoOf,
  folderInfosOf,
  jobFolderKnown,
  kindOfEvent,
  loadRequestsOfEntity,
} from "./facts";
import { readClient, readJob, readPrivacy } from "./entity-reader";
import type { DiskEnv } from "./payload";
import { visibleEntityIds } from "./privacy";
import { createRequest } from "./requests";
import { isDriveEnabled } from "./settings";
import { CREATE_KINDS, isFailedState } from "./state";
import type { DriveEntityType, DriveFolderInfo } from "./types";

type RequestResult = { requestId: string | null; skipped?: "private" | "disabled" };

async function assertVisible(
  ctx: Ctx,
  env: DiskEnv,
  type: DriveEntityType,
  id: string,
): Promise<void> {
  if (!(await visibleEntityIds(ctx, env.registry, type, [id])).has(id)) throw new NotFoundError();
}

/** Stav složky jednoho klienta nebo zakázky; `NotFoundError`, když ho aktér nesmí vidět. */
export async function folderInfo(
  ctx: Ctx,
  env: DiskEnv,
  type: DriveEntityType,
  id: string,
): Promise<DriveFolderInfo> {
  await assertVisible(ctx, env, type, id);
  const isPrivate = (await readPrivacy(ctx.db, env.registry, type, [id])).get(id) ?? false;
  return folderInfoOf(ctx.db, type, id, { isPrivate });
}

/** Stavy složek více záznamů; záznamy, které aktér nesmí vidět, ve výsledku nejsou. */
export async function folderInfos(
  ctx: Ctx,
  env: DiskEnv,
  type: DriveEntityType,
  ids: readonly string[],
): Promise<Map<string, DriveFolderInfo>> {
  const visible = [...(await visibleEntityIds(ctx, env.registry, type, ids))];
  const privacy = await readPrivacy(ctx.db, env.registry, type, visible);
  return folderInfosOf(ctx.db, type, visible, privacy);
}

/**
 * Ruční založení složky („Vytvořit složku“). Složka klienta, nebo zakázky (a před ní složka klienta, když ještě není).
 * Soukromý záznam se bez `force` odmítne (`skipped: "private"`): složka na sdíleném Disku je pro Patrika viditelná
 * a prozradí existenci i název záznamu (R-13); `force` znamená, že uživatel varování potvrdil. Existující nebo právě
 * se zakládající složka se nezakládá znovu (`requestId: null`).
 */
export async function requestFolder(
  ctx: Ctx,
  env: DiskEnv,
  input: { entityType: DriveEntityType; id: string; force?: boolean },
  attempts = 1,
): Promise<RequestResult> {
  await assertVisible(ctx, env, input.entityType, input.id);
  if (!(await isDriveEnabled(env.settings, ctx.db)))
    return { requestId: null, skipped: "disabled" };
  return inTx(ctx, async (c) => {
    if (input.entityType === "company") {
      const client = await readClient(c.db, env.registry, input.id);
      if (!client) throw new NotFoundError();
      const facts = await clientFolderFacts(c.db, client.id);
      if (facts.known) return { requestId: null };
      if (client.isPrivate && !input.force) return { requestId: null, skipped: "private" };
      const r = await createRequest(c, env, {
        kind: "client.create",
        entityType: "company",
        entityId: client.id,
        clientId: client.id,
        attempts,
      });
      return { requestId: r.requestId };
    }

    const job = await readJob(c.db, env.registry, input.id);
    if (!job) throw new NotFoundError();
    const client = await readClient(c.db, env.registry, job.companyId);
    if (!client) throw new UserError("Klient zakázky neexistuje.");
    if (await jobFolderKnown(c.db, job.id)) return { requestId: null };
    if ((job.isPrivate || client.isPrivate) && !input.force)
      return { requestId: null, skipped: "private" };
    const facts = await clientFolderFacts(c.db, client.id);
    if (facts.archived)
      throw new UserError(
        "Složka klienta je v Archivu. Nejdřív vraťte klienta ze stavu Bývalý, složka se obnoví.",
      );
    if (!facts.known)
      await createRequest(c, env, {
        kind: "client.create",
        entityType: "company",
        entityId: client.id,
        clientId: client.id,
      });
    const r = await createRequest(c, env, {
      kind: "project.create",
      entityType: "job",
      entityId: job.id,
      clientId: client.id,
      attempts,
    });
    return { requestId: r.requestId };
  });
}

/**
 * „Zkusit znovu“: zopakuje poslední neúspěšný požadavek záznamu (nový požadavek, nové `eventId`, aktuální tělo).
 * Neúspěšné založení se zopakuje jako ruční založení (potvrzení soukromí platí z původního požadavku); neúspěšná
 * úprava existující složky (přejmenování, archivace…) jako stejná úprava. Bez neúspěšného požadavku se chová jako
 * „Vytvořit složku“ bez potvrzení soukromí.
 */
export async function retryFolder(
  ctx: Ctx,
  env: DiskEnv,
  input: { entityType: DriveEntityType; id: string },
): Promise<RequestResult> {
  await assertVisible(ctx, env, input.entityType, input.id);
  const requests = await loadRequestsOfEntity(ctx.db, input.entityType, input.id, 5);
  const latest = requests[0];
  // i otevřený požadavek po lhůtě se zopakuje: tlačítko už ukazuje „Zkusit znovu“ a úloha ho jen ještě nepřevedla
  if (!latest || !isFailedState(effectiveState(latest, new Date())))
    return requestFolder(ctx, env, input);
  const kind = kindOfEvent(latest.event);
  const attempts = latest.attempts + 1;
  if ((CREATE_KINDS as readonly string[]).includes(kind))
    return requestFolder(ctx, env, { ...input, force: latest.isPrivate }, attempts);
  if (!(await isDriveEnabled(env.settings, ctx.db)))
    return { requestId: null, skipped: "disabled" };
  return inTx(ctx, async (c) => {
    const r = await createRequest(c, env, {
      kind,
      entityType: input.entityType,
      entityId: input.id,
      clientId: latest.clientId,
      attempts,
    });
    return { requestId: r.requestId };
  });
}

/** Služba `disk` (`deps.services.optional("disk")`). */
export function diskService(deps: DiskEnv): ServiceMap["disk"] {
  return {
    async requestFolder(ctx, input) {
      return requestFolder(ctx, deps, input);
    },
    async folderState(ctx, entityType, ids) {
      const infos = await folderInfos(ctx, deps, entityType, ids);
      return Object.fromEntries(
        [...infos].map(([id, i]) => [id, { state: i.state, folderId: i.folderId, url: i.url }]),
      );
    },
  };
}

/** `ModuleServer.services` modulu. */
export const services: NonNullable<ModuleServer["services"]> = {
  disk: (deps) => diskService(deps),
};
