"use client";

import type {
  EntityDescriptor,
  GroupSummary,
  Labels,
  QueryParams,
  RecordRow,
} from "@rebar/core/shared";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import type { QueryPage } from "@rebar/core/shared";
import { useEntityApi } from "./context";

export const PAGE_SIZE = 100;

export const keys = {
  all: (entity: string) => ["entity", entity] as const,
  list: (entity: string, params: QueryParams) => ["entity", entity, "list", params] as const,
  listAny: (entity: string) => ["entity", entity, "list"] as const,
  kanban: (entity: string, params: QueryParams) => ["entity", entity, "kanban", params] as const,
  kanbanAny: (entity: string) => ["entity", entity, "kanban"] as const,
  summary: (entity: string, params: QueryParams) => ["entity", entity, "summary", params] as const,
  groups: (entity: string, group: string, params: QueryParams) =>
    ["entity", entity, "groups", group, params] as const,
  groupsAny: (entity: string) => ["entity", entity, "groups"] as const,
  summaryAny: (entity: string) => ["entity", entity, "summary"] as const,
  record: (entity: string, id: string) => ["entity", entity, "record", id] as const,
  activity: (entity: string, id: string) => ["entity", entity, "activity", id] as const,
  views: (entity: string) => ["entity", entity, "views"] as const,
};

/** Stránkovaný seznam (nekonečný scroll): každá stránka je jeden dotaz na server. */
export function useEntityRows(entity: string, params: QueryParams, enabled = true) {
  const api = useEntityApi();
  const q = useInfiniteQuery({
    queryKey: keys.list(entity, params),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.query(entity, { ...params, limit: PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.rows.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled,
    placeholderData: (prev) => prev,
  });
  const { rows, labels, total } = useMemo(() => {
    const rows: RecordRow[] = [];
    const labels: Labels = {};
    const seen = new Set<string>();
    for (const p of q.data?.pages ?? []) {
      for (const r of p.rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        rows.push(r);
      }
      for (const [k, v] of Object.entries(p.labels)) labels[k] = { ...labels[k], ...v };
    }
    return { rows, labels, total: q.data?.pages[0]?.total ?? 0 };
  }, [q.data]);
  return { ...q, rows, labels, total };
}

/** Počet a součty za celou filtrovanou sadu (patička tabulky); nezávisí na tom, kolik řádků je načteno. */
export function useEntitySummary(entity: string, params: QueryParams) {
  const api = useEntityApi();
  return useQuery({
    queryKey: keys.summary(entity, params),
    queryFn: () => api.query(entity, { ...params, limit: 1, offset: 0 }),
    select: (p: QueryPage) => ({ total: p.total, totals: p.totals }),
    placeholderData: (prev) => prev,
  });
}

export function useEntityGroups(entity: string, group: string | null, params: QueryParams) {
  const api = useEntityApi();
  return useQuery<GroupSummary[]>({
    queryKey: keys.groups(entity, group ?? "", params),
    queryFn: () => api.groups(entity, group!, params),
    enabled: !!group,
    placeholderData: (prev) => prev,
  });
}

type Pages = InfiniteData<QueryPage, number>;

/** Přepíše řádek ve všech načtených seznamech entity (optimistická změna i potvrzení ze serveru). */
export function patchRowInCache(
  qc: QueryClient,
  entity: string,
  id: string,
  fn: (r: RecordRow) => RecordRow,
  labels?: Labels,
) {
  qc.setQueriesData<Pages>({ queryKey: keys.listAny(entity) }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((p) => ({
        ...p,
        rows: p.rows.map((r) => (r.id === id ? fn(r) : r)),
        labels: labels ? mergeLabels(p.labels, labels) : p.labels,
      })),
    };
  });
}

function mergeLabels(a: Labels, b: Labels): Labels {
  const out: Labels = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = { ...out[k], ...v };
  return out;
}

/**
 * Inline úprava jednoho atributu. Změna se hned ukáže (optimisticky); když ji server odmítne,
 * vrátí se původní stav a chyba se předá volajícímu (buňka ji ukáže).
 */
export function useUpdateAttribute(entity: string) {
  const api = useEntityApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; attr: string; value: unknown; updatedAt: string }) =>
      api.update(entity, v.id, { [v.attr]: v.value }, v.updatedAt),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.listAny(entity) });
      const snapshot = qc.getQueriesData<Pages>({ queryKey: keys.listAny(entity) });
      patchRowInCache(qc, entity, v.id, (r) => ({ ...r, [v.attr]: v.value }));
      return { snapshot };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.snapshot ?? []) qc.setQueryData(key, data);
    },
    onSuccess: (res, v) => {
      patchRowInCache(qc, entity, v.id, () => res.row, res.labels);
      qc.setQueryData(keys.record(entity, v.id), res);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.summaryAny(entity) });
      void qc.invalidateQueries({ queryKey: keys.groupsAny(entity) });
      void qc.invalidateQueries({ queryKey: keys.kanbanAny(entity) });
      // odvozené údaje modulů (souhrn zakázky v hlavičce, kontroly přechodu fáze…) závisí na hodnotě atributu;
      // bez toho zůstanou do 30 s staré a dialog fáze dál hlásí, co už je doplněné
      void qc.invalidateQueries({ queryKey: ["command"] });
    },
  });
}

/** Popis entity (atributy, stavy, oprávnění); sdílená mezipaměť s `RelatedRecords`, takže se načte jednou. */
export function useEntityDescriptor(entity: string) {
  const api = useEntityApi();
  return useQuery<EntityDescriptor>({
    queryKey: ["entity-descriptor", entity],
    queryFn: () => api.describe(entity),
    staleTime: 5 * 60_000,
  });
}

/** Jeden záznam entity s popisky vazeb (stejná mezipaměť jako detail záznamu, takže inline úpravy ji obnoví). */
export function useEntityRecord(entity: string, id: string | null | undefined) {
  const api = useEntityApi();
  return useQuery({
    queryKey: keys.record(entity, id ?? ""),
    queryFn: () => api.get(entity, id!),
    enabled: !!id,
  });
}

export function useInvalidateEntity(entity: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.all(entity) });
}

/** Dotaz na příkaz modulu (`api.command`) s cache TanStack Query; klíč tvoří jméno a vstup. */
export function useCommandQuery<O = unknown, I = unknown>(
  name: string,
  input?: I,
  opts: { enabled?: boolean; refetchInterval?: number } = {},
) {
  const api = useEntityApi();
  return useQuery<O>({
    queryKey: ["command", name, input ?? null],
    queryFn: () => api.command<I, O>(name, input),
    ...opts,
  });
}

/** Spuštění příkazu modulu; po úspěchu zneplatní uvedené klíče (nebo všechny dotazy příkazů a záznamů). */
export function useCommandMutation<I = unknown, O = unknown>(
  name: string,
  opts: {
    onSuccess?: (data: O, input: I) => void;
    invalidate?: readonly (readonly unknown[])[];
  } = {},
) {
  const api = useEntityApi();
  const qc = useQueryClient();
  return useMutation<O, Error, I>({
    mutationFn: (input) => api.command<I, O>(name, input),
    onSuccess: (data, input) => {
      for (const key of opts.invalidate ?? [["command"], ["entity"]])
        void qc.invalidateQueries({ queryKey: key });
      opts.onSuccess?.(data, input);
    },
  });
}
