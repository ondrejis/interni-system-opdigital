"use client";

import { formatDate } from "@rebar/core/shared";
import {
  Button,
  Chip,
  EmptyState,
  Icon,
  Input,
  Skeleton,
  useCan,
  useCommandQuery,
  useIsMobile,
  useNav,
} from "@rebar/ui";
import { useMemo, useState } from "react";
import type { ClientListResult } from "../contract";
import { CLIENT_STATUS_COLORS, CLIENT_STATUS_LABELS, SERVICE_LABELS } from "../shared";
import { ClientsPage } from "../ui/clients-page";

/**
 * Seznam klientů jako karty pro telefon (MOB-09: široké tabulky se na mobilu ukazují jako karty). Stejná data
 * (`klienti.list`) a stejné chování jako tabulka: výchozí bez bývalých, hledání, klepnutí otevře kartu klienta.
 */
export function MobileClientsPage() {
  const nav = useNav();
  const can = useCan();
  const [includeFormer, setIncludeFormer] = useState(false);
  const [search, setSearch] = useState("");
  const q = useCommandQuery<ClientListResult, { includeFormer: boolean; search?: string }>(
    "klienti.list",
    { includeFormer, ...(search.trim() ? { search: search.trim() } : {}) },
    { refetchInterval: 30_000 },
  );
  const rows = useMemo(
    () => [...(q.data?.rows ?? [])].sort((a, b) => a.name.localeCompare(b.name, "cs")),
    [q.data?.rows],
  );
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
      data-testid="clients-cards"
    >
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Hledat klienta, IČO, město…"
        aria-label="Hledat klienta"
        data-testid="clients-search"
      />
      <label className="flex min-h-11 items-center gap-3 text-base">
        <input
          type="checkbox"
          className="size-5"
          checked={includeFormer}
          onChange={(e) => setIncludeFormer(e.target.checked)}
        />
        Včetně bývalých klientů
      </label>
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : q.error ? (
        <EmptyState title="Klienty se nepodařilo načíst" description={q.error.message} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Žádní klienti"
          description="Žádný lead, aktivní ani pozastavený klient. Bývalé zobrazíte přepínačem."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => nav.push(`/kontakty/firmy/${r.id}`)}
                className="flex w-full items-start gap-3 rounded-lg border border-line bg-bg p-4 text-left active:bg-hover"
                data-testid="client-card"
                data-client-id={r.id}
              >
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-base font-medium">
                      {r.isPrivate && <Icon name="lock" className="size-3.5 shrink-0 text-faint" />}
                      <span className="truncate">{r.name}</span>
                    </span>
                    <Chip color={CLIENT_STATUS_COLORS[r.status]} dot>
                      {CLIENT_STATUS_LABELS[r.status]}
                    </Chip>
                  </span>
                  {r.services.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {r.services.map((s) => (
                        <Chip key={s} color="blue">
                          {SERVICE_LABELS[s]}
                        </Chip>
                      ))}
                    </span>
                  )}
                  <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted">
                    <span>Zakázky: {r.activeJobs}</span>
                    {r.ownerName && <span>{r.ownerName}</span>}
                    {r.lastActivityAt && (
                      <span>Aktivita {formatDate(r.lastActivityAt.slice(0, 10))}</span>
                    )}
                  </span>
                </span>
                <Icon name="chevron-right" className="mt-0.5 size-4 shrink-0 text-faint" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {can("kontakty.create") && (
        <Button onClick={() => nav.push("/kontakty/firmy/nova")} data-testid="clients-new">
          <Icon name="plus" /> Nový klient
        </Button>
      )}
    </div>
  );
}

/** `/klienti`: na telefonu karty, jinak tabulka (KLI-03). */
export function ResponsiveClientsPage() {
  const mobile = useIsMobile();
  return mobile ? <MobileClientsPage /> : <ClientsPage />;
}
