"use client";

import { ApiError, type EntityApi } from "@rebar/ui";
import type { ActionResult } from "@rebar/core/actions";
import * as A from "@/server/entity-actions";
import { runCommand } from "@/server/module-actions";
import * as X from "@/server/export-actions";

function unwrap<T>(r: ActionResult<T>): T {
  if (!r.ok) throw new ApiError(r.error, r.code);
  return r.data;
}

/**
 * `EntityApi` nad server actions. Oprávnění se kontrolují na serveru při každém volání;
 * `paths` (typ záznamu → adresa seznamu) slouží jen k sestavení odkazů.
 */
export function makeEntityApi(
  me: { id: string; name: string },
  paths: Record<string, string>,
): EntityApi {
  return {
    me,
    command: async (name, input) => unwrap(await runCommand({ name, input })) as never,
    hrefFor: (entity, id) => (paths[entity] ? `${paths[entity]}/${id}` : null),
    describe: async (entity) => unwrap(await A.describeEntityAction({ entity })) as never,
    query: async (entity, query) => unwrap(await A.queryEntity({ entity, query })),
    groups: async (entity, group, query) =>
      unwrap(await A.queryEntityGroups({ entity, group, query })),
    get: async (entity, id) => unwrap(await A.getEntityRecord({ entity, id })),
    create: async (entity, values) => unwrap(await A.createEntityRecord({ entity, values })),
    update: async (entity, id, patch, expectedUpdatedAt) =>
      unwrap(
        await A.updateEntityRecord({
          entity,
          id,
          patch,
          ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
        }),
      ),
    remove: async (entity, ids) => void unwrap(await A.deleteEntityRecords({ entity, ids })),
    restore: async (entity, ids) => void unwrap(await A.restoreEntityRecords({ entity, ids })),
    setVisibility: async (entity, ids, isPrivate) =>
      unwrap(await A.setEntityVisibility({ entity, ids, isPrivate })),
    lookups: {
      records: async (entity, q) => unwrap(await A.lookupRecords({ entity, q })),
      users: async (q) => unwrap(await A.lookupUsersAction({ q })),
    },
    activity: async (entity, id) => unwrap(await A.getActivity({ entity, id })) as never,
    addComment: async (entity, id, body) =>
      void unwrap(await A.addCommentAction({ entity, id, body })),
    deleteComment: async (id) => void unwrap(await A.deleteCommentAction({ id })),
    uploadFile: async (entity, id, file, opts) => {
      const form = new FormData();
      form.set("file", file);
      form.set("entityType", entity);
      form.set("entityId", id);
      if (opts?.kind) form.set("kind", opts.kind);
      if (opts?.takenAt) form.set("takenAt", opts.takenAt);
      let res: Response;
      try {
        res = await fetch("/api/files", { method: "POST", body: form });
      } catch {
        // bez signálu: fronta nahrávání to zkusí znovu
        throw new ApiError("Bez připojení k internetu.", "upload_retry");
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        const transient = res.status >= 500 || res.status === 429 || res.status === 408;
        throw new ApiError(
          body?.error ?? "Soubor se nepodařilo nahrát.",
          transient ? "upload_retry" : "upload",
        );
      }
      return { id: ((await res.json()) as { id: string }).id };
    },
    detachFile: async (id) => void unwrap(await A.detachAttachmentAction({ id })),
    exports: {
      templates: async (entity) => unwrap(await X.listExportTemplatesAction({ entity })) as never,
      saveTemplate: async (t) =>
        unwrap(await X.saveExportTemplateAction({ name: t.name, shared: t.shared, spec: t.spec })),
      deleteTemplate: async (id) => void unwrap(await X.deleteExportTemplateAction({ id })),
    },
    views: {
      list: async (entity) => unwrap(await A.listEntityViews({ entity })) as never,
      save: async (entity, v) => unwrap(await A.saveEntityView({ entity, ...v })),
      update: async (entity, id, v) => void unwrap(await A.updateEntityView({ entity, id, ...v })),
      remove: async (id) => void unwrap(await A.deleteEntityView({ id })),
      favorite: async (id, favorite) => void unwrap(await A.toggleViewFavorite({ id, favorite })),
    },
  };
}
