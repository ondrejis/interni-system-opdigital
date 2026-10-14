"use client";

import {
  Avatar,
  Button,
  Combobox,
  Icon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  errorToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
} from "@rebar/ui";
import type { FollowerList } from "./logic";

/**
 * Sledující zakázky: tlačítko s počtem a popover se seznamem, „Sledovat / Přestat sledovat“ a přidáním dalšího
 * uživatele. Sledující dostávají upozornění na změnu stavu, výhru a prohru.
 */
export function FollowersButton({ jobId }: { jobId: string }) {
  const api = useEntityApi();
  const can = useCan();
  const q = useCommandQuery<FollowerList, { jobId: string }>("crm.follower.list", { jobId });
  const fail = (e: Error) => errorToast(e.message);
  const follow = useCommandMutation<{ jobId: string; userId?: string }, FollowerList>(
    "crm.follower.follow",
  );
  const unfollow = useCommandMutation<{ jobId: string; userId?: string }, FollowerList>(
    "crm.follower.unfollow",
  );
  const data = q.data;
  const count = data?.count ?? 0;
  const following = !!data?.following;
  const canManage = can("zakazky.write");
  const pending = follow.isPending || unfollow.isPending;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="md"
          aria-label={`Sledující: ${count}`}
          data-testid="followers-button"
          className={following ? "text-accent" : undefined}
        >
          <Icon name="eye" />
          <span className="tabular">{count}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3" data-testid="followers-popover">
        <p className="mb-2 text-sm font-semibold">Sledující</p>
        <p className="mb-3 text-sm text-muted">
          Sledující dostanou upozornění, když se zakázka posune do jiného stavu, je vyhraná nebo
          prohraná.
        </p>
        {data && data.followers.length > 0 ? (
          <ul className="mb-3 space-y-1">
            {data.followers.map((f) => (
              <li key={f.userId} className="flex items-center gap-2 text-base">
                <Avatar name={f.name} size={20} />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {canManage && f.userId !== api.me.id && (
                  <button
                    type="button"
                    aria-label={`Odebrat ${f.name}`}
                    className="rounded p-1 text-faint hover:bg-hover hover:text-fg"
                    onClick={() => unfollow.mutate({ jobId, userId: f.userId }, { onError: fail })}
                  >
                    <Icon name="x" className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-faint">Zatím nikdo.</p>
        )}
        <div className="flex flex-col gap-2">
          {/* Bez `loading`: tlačítko by se při odesílání zakázalo, zaostřený prvek by zmizel z fokusu, past fokusu pop-upu
              zaostří pop-up zakázky a Radix by pop-up sledujících zavřel (zvlášť při pomalé odpovědi serveru). */}
          <Button
            variant={following ? "secondary" : "primary"}
            aria-busy={pending || undefined}
            className={pending ? "opacity-70" : undefined}
            data-testid="follow-toggle"
            onClick={() => {
              if (pending) return;
              (following ? unfollow : follow).mutate({ jobId }, { onError: fail });
            }}
          >
            {following ? "Přestat sledovat" : "Sledovat zakázku"}
          </Button>
          {canManage && (
            <Combobox
              aria-label="Přidat sledujícího"
              load={api.lookups.users}
              value={null}
              onChange={(v) =>
                typeof v === "string" && follow.mutate({ jobId, userId: v }, { onError: fail })
              }
              searchPlaceholder="Najít uživatele…"
              trigger={
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  <Icon name="user-plus" /> Přidat sledujícího
                </Button>
              }
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
