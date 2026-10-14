"use client";

import type { DashboardApi } from "@rebar/ui";
import type { ActionResult } from "@rebar/core/actions";
import { ApiError } from "@rebar/ui";
import * as A from "@/server/dashboard-actions";

function unwrap<T>(r: ActionResult<T>): T {
  if (!r.ok) throw new ApiError(r.error, r.code);
  return r.data;
}

/** Stáhne odpověď jako soubor (název z hlavičky Content-Disposition). */
export async function downloadResponse(res: Response, fallback: string): Promise<void> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? "Export se nepodařil.", "export");
  }
  const cd = res.headers.get("content-disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1];
  const plain = /filename="([^"]+)"/i.exec(cd)?.[1];
  const name = star ? decodeURIComponent(star) : (plain ?? fallback);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** `DashboardApi` nad server actions (správa nástěnek) a route handlery (souběžné vyhodnocení widgetů, exporty). */
export const dashboardApi: DashboardApi = {
  list: async () => unwrap(await A.listDashboardsAction({})),
  get: async (id) => unwrap(await A.getDashboardAction({ id })),
  create: async (v) => unwrap(await A.createDashboardAction(v)),
  update: async (v) => unwrap(await A.updateDashboardAction(v)),
  remove: async (id) => void unwrap(await A.deleteDashboardAction({ id })),
  clone: async (id, name) =>
    unwrap(await A.cloneDashboardAction({ id, ...(name ? { name } : {}) })),
  share: async (id, to) => void unwrap(await A.shareDashboardAction({ id, ...to })),
  reorder: async (ids) => void unwrap(await A.reorderDashboardsAction({ ids })),
  catalog: async () => unwrap(await A.dashboardCatalogAction({})) as never,
  evaluate: async (widget, filters, opts) => {
    let res: Response;
    try {
      res = await post("/api/dashboards/evaluate", { widget, filters, fresh: !!opts?.fresh });
    } catch {
      throw new ApiError("Bez připojení k internetu.", "network");
    }
    const body = (await res.json().catch(() => null)) as {
      ok: boolean;
      error?: string;
      code?: string;
      result?: unknown;
    } | null;
    if (!body) throw new ApiError("Odpověď serveru se nepodařilo přečíst.", "internal");
    // chyba route handleru (např. nepřihlášen) má tvar { error, code }; chyba widgetu { ok: false, error, code }
    if (body.ok === undefined)
      return {
        ok: false,
        error: body.error ?? "Widget se nepodařilo načíst.",
        code: body.code ?? "internal",
      };
    return body as never;
  },
  exportWidget: async (widget, filters, format) =>
    downloadResponse(
      await post("/api/dashboards/export", { kind: "widget", widget, filters, format }),
      `widget.${format}`,
    ),
  exportBoard: async (boardId, filters) =>
    downloadResponse(
      await post("/api/dashboards/export", { kind: "board", boardId, filters, format: "pdf" }),
      "nastenka.pdf",
    ),
};
