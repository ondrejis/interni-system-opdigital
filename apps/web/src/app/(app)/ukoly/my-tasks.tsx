"use client";

import { Checkbox, EmptyState, Skeleton, errorToast, useEntityApi, useNav } from "@rebar/ui";
import { formatDate } from "@rebar/core/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare } from "lucide-react";
import { completeTaskAction, getMyTasks } from "@/server/entity-actions";

/** Otevřené úkoly přihlášeného uživatele; zaškrtnutím se označí jako hotové. */
export function MyTasks() {
  const nav = useNav();
  const api = useEntityApi();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["my-tasks"],
    queryFn: async () => {
      const r = await getMyTasks({});
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
  const done = useMutation({
    mutationFn: async (id: string) => {
      const r = await completeTaskAction({ id, done: true });
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-tasks"] });
      nav.refresh();
    },
    onError: (e: Error) => errorToast(e.message),
  });

  if (q.isLoading)
    return (
      <div className="space-y-2 p-6">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  if (!q.data?.length)
    return (
      <EmptyState
        icon={<CheckSquare />}
        title="Žádné otevřené úkoly"
        description="Úkoly přidáte na kartě Úkoly u libovolného záznamu."
      />
    );

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {q.data.map((t) => {
          const href = t.entityType && t.entityId ? api.hrefFor(t.entityType, t.entityId) : null;
          return (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <Checkbox
                aria-label={`Hotovo: ${t.title}`}
                checked={false}
                onCheckedChange={() => done.mutate(t.id)}
              />
              <span className="flex-1">{t.title}</span>
              {t.dueDate && (
                <span className="text-sm text-muted tabular">{formatDate(t.dueDate)}</span>
              )}
              {href && (
                <button
                  type="button"
                  className="text-sm text-accent hover:underline"
                  onClick={() => nav.push(href)}
                >
                  Otevřít záznam
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
