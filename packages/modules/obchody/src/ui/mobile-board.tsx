"use client";

import { formatMinor } from "@rebar/core/shared";
import {
  Avatar,
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Icon,
  IconButton,
  Skeleton,
  cn,
  errorToast,
  useCommandMutation,
  useCommandQuery,
  useNav,
} from "@rebar/ui";
import type { BoardInput, BoardResult, DealCard, DealChangeResult } from "../contract";
import { NextActivity, RottingChip } from "./deal-card";
import { pluralDeals } from "./logic";
import type { DealRef } from "./win-lose";

const SERVICE_LABEL: Record<string, string> = {
  web: "Web",
  marketing: "Marketing",
  systemy: "Systémy",
};

/**
 * Board na telefonu (MOB-08): sloupce fází vedle sebe, posouvají se do strany a zarovnávají; obchod se mezi fázemi
 * přesouvá nabídkou „Přesunout do fáze“ (tažení na dotykovém displeji není nutné). Data z `obchody.board`.
 */
export function MobileBoard({
  owner,
  canWrite,
  onWin,
  onLose,
}: {
  owner: string;
  canWrite: boolean;
  onWin: (d: DealRef) => void;
  onLose: (d: DealRef) => void;
}) {
  const nav = useNav();
  const input: BoardInput = owner === "all" ? {} : { owner: owner === "me" ? "me" : owner };
  const board = useCommandQuery<BoardResult, BoardInput>("obchody.board", input);
  const move = useCommandMutation<{ dealId: string; stageId: string }, DealChangeResult>(
    "obchody.moveStage",
  );

  if (board.isLoading)
    return (
      <div className="flex gap-3 p-3">
        <Skeleton className="h-64 w-72 shrink-0" />
        <Skeleton className="h-64 w-72 shrink-0" />
      </div>
    );
  if (board.error || !board.data)
    return (
      <EmptyState
        title="Board se nepodařilo načíst"
        description={board.error?.message ?? "Zkuste to prosím znovu."}
      />
    );
  const { columns } = board.data;
  return (
    <div
      className="scrollbar-thin flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto p-3"
      data-testid="mobile-board"
    >
      {columns.map((col) => (
        <section
          key={col.stage.id}
          aria-label={col.stage.name}
          className="flex w-[82vw] max-w-80 shrink-0 snap-center flex-col rounded-lg bg-sunken"
          data-stage={col.stage.id}
        >
          <header className="space-y-0.5 px-3 pb-2 pt-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex min-w-0 items-center gap-2 font-semibold">
                <Chip color={col.stage.color} dot>
                  {col.stage.name}
                </Chip>
              </h3>
              <span className="tabular text-sm text-muted" data-testid="mobile-column-count">
                {col.count} {pluralDeals(col.count)}
              </span>
            </div>
            <div className="tabular text-sm text-muted" data-testid="mobile-column-sums">
              {formatMinor(col.totalMinor)} · vážená {formatMinor(col.weightedMinor)}
              {col.stage.probabilityPct !== null && <> · {col.stage.probabilityPct} %</>}
            </div>
          </header>
          <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
            {col.cards.length === 0 ? (
              <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-faint">
                Žádné obchody
              </p>
            ) : (
              col.cards.map((c) => (
                <MobileCard
                  key={c.id}
                  card={c}
                  stages={columns.map((x) => x.stage)}
                  canWrite={canWrite}
                  moving={move.isPending}
                  onOpen={() => nav.push(`/obchody/${c.id}`)}
                  onMove={(stageId) =>
                    move.mutate(
                      { dealId: c.id, stageId },
                      { onError: (e) => errorToast(e.message) },
                    )
                  }
                  onWin={() => onWin({ id: c.id, title: c.title })}
                  onLose={() => onLose({ id: c.id, title: c.title })}
                />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function MobileCard({
  card,
  stages,
  canWrite,
  moving,
  onOpen,
  onMove,
  onWin,
  onLose,
}: {
  card: DealCard;
  stages: BoardResult["columns"][number]["stage"][];
  canWrite: boolean;
  moving: boolean;
  onOpen: () => void;
  onMove: (stageId: string) => void;
  onWin: () => void;
  onLose: () => void;
}) {
  const h = card.highlight;
  return (
    <article
      className={cn(
        "rounded-lg border bg-bg p-3 shadow-sm",
        h.unopenedLead ? "border-accent" : "border-line",
      )}
      data-testid="mobile-deal-card"
      data-unopened={h.unopenedLead || undefined}
    >
      <div className="flex items-start gap-2">
        <button type="button" className="min-w-0 flex-1 space-y-1 text-left" onClick={onOpen}>
          {h.unopenedLead && (
            <Chip color="blue" dot>
              Nový lead
            </Chip>
          )}
          <div className={cn("line-clamp-2 font-medium leading-snug", h.rotting && "text-danger")}>
            {card.title}
          </div>
          {card.companyName && (
            <div className="truncate text-sm text-muted">{card.companyName}</div>
          )}
          {card.services.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {card.services.map((s) => (
                <Chip key={s}>{SERVICE_LABEL[s] ?? s}</Chip>
              ))}
            </div>
          )}
        </button>
        {canWrite && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Akce obchodu" data-testid="mobile-deal-menu" className="size-11">
                <Icon name="more" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Přesunout do fáze</DropdownMenuLabel>
              {stages.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  disabled={s.id === card.stageId || moving}
                  onSelect={() => onMove(s.id)}
                  data-testid={`move-to-${s.id}`}
                >
                  <Icon name={s.id === card.stageId ? "check" : "arrow-right"} /> {s.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onWin}>
                <Icon name="trophy" /> Vyhráno
              </DropdownMenuItem>
              <DropdownMenuItem danger onSelect={onLose}>
                <Icon name="thumbs-down" /> Prohráno
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="tabular text-sm font-semibold">
          {card.valueMinor ? (
            formatMinor(card.valueMinor)
          ) : (
            <span className="font-normal text-faint">Bez ceny</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {card.ownerName && <Avatar name={card.ownerName} size={20} />}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <NextActivity nextActivityAt={card.nextActivityAt} highlight={h} />
        <RottingChip highlight={h} />
      </div>
      {canWrite && (
        <Button
          variant="secondary"
          className="mt-2 w-full sm:hidden"
          disabled={moving}
          onClick={() => {
            const i = stages.findIndex((s) => s.id === card.stageId);
            const next = stages[i + 1];
            if (next) onMove(next.id);
          }}
          hidden={stages.findIndex((s) => s.id === card.stageId) >= stages.length - 1}
        >
          <Icon name="arrow-right" /> Do další fáze
        </Button>
      )}
    </article>
  );
}
