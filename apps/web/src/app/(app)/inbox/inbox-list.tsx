"use client";

import { formatInstant } from "@rebar/core/time";
import { Button, EmptyState, Skeleton, errorToast, useNav } from "@rebar/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { closePushNotifications, syncAppBadge } from "@/lib/push-client";
import { getInbox, markNotificationsRead } from "@/server/entity-actions";

/** Upozornění přihlášeného uživatele (zmínky, přidělené úkoly…). Kliknutí otevře záznam a označí jako přečtené. */
export function InboxList() {
  const nav = useNav();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["inbox"],
    queryFn: async () => {
      const r = await getInbox({});
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
  const read = useMutation({
    mutationFn: async (ids?: string[]) => {
      const r = await markNotificationsRead(ids ? { ids } : {});
      if (!r.ok) throw new Error(r.error);
      // přečtené upozornění zmizí i z lišty zařízení (a odznak na ikoně se přepočítá)
      const unread = (q.data ?? []).filter((n) => !n.read && (!ids || !ids.includes(n.id)));
      if (!ids) void closePushNotifications();
      else
        void closePushNotifications(
          (q.data ?? []).filter((n) => ids.includes(n.id)).map((n) => n.tag),
        ).then(() => syncAppBadge(unread.length));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inbox"] });
      nav.refresh();
    },
    onError: (e: Error) => errorToast(e.message),
  });

  if (q.isLoading)
    return (
      <div className="space-y-2 p-6">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  if (!q.data?.length)
    return (
      <EmptyState
        icon={<Inbox />}
        title="Inbox je prázdný"
        description="Tady uvidíte zmínky v komentářích, přidělené úkoly a další upozornění."
      />
    );

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mb-3 flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => read.mutate(undefined)}
          disabled={q.data.every((n) => n.read)}
        >
          Označit vše jako přečtené
        </Button>
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {q.data.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => {
                if (!n.read) read.mutate([n.id]);
                if (n.url) nav.push(n.url);
              }}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-subtle"
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-accent"}`}
                aria-label={n.read ? "Přečteno" : "Nepřečteno"}
              />
              <span className="min-w-0 flex-1">
                <span className={n.read ? "" : "font-medium"}>{n.title}</span>
                {n.body && <span className="block truncate text-sm text-muted">{n.body}</span>}
              </span>
              <span className="shrink-0 text-sm text-faint tabular">
                {formatInstant(n.createdAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
