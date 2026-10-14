"use client";

import type { AttributeDescriptor, Labels, RecordRow } from "@rebar/core/shared";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Skeleton } from "../components/badges";
import { CellValue } from "./cell";

/** Nejvýše tolik dalších atributů se na kartě ukáže pod názvem (zbytek je v detailu). */
const MAX_FIELDS = 4;

/**
 * Seznam záznamů jako karty pro telefon: tabulka s mnoha sloupci se na úzké obrazovce nedá číst.
 * Karta ukáže název, stav a pár dalších hodnot; klepnutím se otevře celý záznam.
 */
export function CardList({
  attributes,
  columns,
  rows,
  labels,
  loading,
  hasMore,
  fetchingMore,
  onEndReached,
  onOpen,
  emptyState,
  total,
}: {
  attributes: AttributeDescriptor[];
  columns: string[];
  rows: RecordRow[];
  labels: Labels;
  loading: boolean;
  hasMore: boolean;
  fetchingMore: boolean;
  onEndReached: () => void;
  onOpen: (id: string) => void;
  emptyState: ReactNode;
  total: number;
}) {
  const byKey = new Map(attributes.map((a) => [a.key, a]));
  const visible = columns.map((k) => byKey.get(k)).filter((a): a is AttributeDescriptor => !!a);
  const [title, ...rest] = visible;
  const status = rest.find((a) => a.type === "status");
  const fields = rest.filter((a) => a !== status).slice(0, MAX_FIELDS);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (e) => e[0]?.isIntersecting && !fetchingMore && onEndReached(),
      {
        rootMargin: "300px",
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, fetchingMore, onEndReached, rows.length]);

  if (loading)
    return (
      <div className="space-y-3 p-4" role="status" aria-busy="true" aria-label="Načítám">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  if (!title || rows.length === 0)
    return <div className="min-h-0 flex-1 overflow-auto">{emptyState}</div>;

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto" data-testid="card-list">
      <ul className="space-y-3 p-4">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onOpen(row.id)}
              className="flex w-full items-start gap-3 rounded-lg border border-line bg-bg p-4 text-left transition-colors hover:bg-subtle active:bg-hover"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-base font-medium">
                    <CellValue attr={title} value={row[title.key]} labels={labels} />
                  </span>
                  {status && (
                    <span className="shrink-0">
                      <CellValue attr={status} value={row[status.key]} labels={labels} />
                    </span>
                  )}
                </span>
                {fields.length > 0 && (
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                    {fields.map((a) => (
                      <div key={a.key} className="min-w-0">
                        <dt className="truncate text-xs text-faint">{a.label}</dt>
                        <dd className="min-h-5 truncate text-muted">
                          <CellValue attr={a} value={row[a.key]} labels={labels} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </span>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div ref={sentinel} className="px-4 pb-4 text-center text-sm text-muted">
        {fetchingMore ? "Načítám další…" : hasMore ? "" : `${total} záznamů celkem`}
      </div>
    </div>
  );
}
