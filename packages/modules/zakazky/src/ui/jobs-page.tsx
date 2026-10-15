"use client";

import type { ServiceType } from "@rebar/core/contracts";
import { formatMinor } from "@rebar/core/shared";
import {
  Avatar,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  EntityList,
  IconButton,
  Input,
  Kbd,
  PageHeader,
  SegmentedControl,
  Skeleton,
  cn,
  errorToast,
  successToast,
  useCan,
  useCommandMutation,
  useEntityApi,
  useEntityDescriptor,
  useHotkeys,
  useNav,
} from "@rebar/ui";
import { ArrowDown, ArrowUp, Briefcase, MoveRight, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { BoardColumn } from "../contract";
import { JOB_STATUS_LABELS, JOB_TYPES, JOB_TYPE_LABELS, type JobStatusCode } from "../shared";
import { CompleteDialog, usePhaseFlow } from "./flows";
import { useBoard, useDriveStates } from "./hooks";
import {
  DEFAULT_FILTER,
  cardsOf,
  dropOutcome,
  filterCards,
  plural,
  reasonForStatus,
  sortCards,
  sumPrice,
  type ListFilter,
  type SortKey,
} from "./logic";
import { CreateJobDialog } from "./create-job";
import {
  AvatarStack,
  DriveButton,
  DueText,
  LoadError,
  PrivateBadge,
  StatusChip,
  TypeChip,
  WarningIcon,
} from "./parts";
import type { BoardCardX } from "./types";

/** Zobrazení stránky zakázek. */
export type JobsView = "seznam" | "stav" | "faze" | "tabulka";

const VIEW_LABELS: Record<JobsView, string> = {
  seznam: "Seznam",
  stav: "Board podle stavu",
  faze: "Board podle fází",
  tabulka: "Tabulka a filtry",
};

/** Adresa zobrazení (vedle sebe žijí `/zakazky` a `/zakazky/faze`). */
export function viewHref(view: JobsView, type: ServiceType): string {
  if (view === "faze") return `/zakazky/faze?typ=${type}`;
  if (view === "seznam") return "/zakazky";
  return `/zakazky?pohled=${view}`;
}

/**
 * Stránka Zakázky: Seznam (kód, název, klient, typ, stav, fáze, vlastník, členové, termín, hodnota, Disk, varování),
 * board podle stavu, board podle fází jednoho typu a plná tabulka jádra (filtry, uložené pohledy, export). Klávesa C
 * nebo tlačítko založí novou zakázku.
 */
export function JobsPage({
  view,
  type = "web",
  openCreate,
}: {
  view: JobsView;
  type?: ServiceType;
  openCreate?: boolean;
}) {
  const nav = useNav();
  const can = useCan();
  const [create, setCreate] = useState(!!openCreate && can("zakazky.create"));
  const canCreate = can("zakazky.create");
  useHotkeys({ c: () => canCreate && setCreate(true) }, canCreate && !create);
  const go = (v: JobsView, t: ServiceType = type) => nav.replace(viewHref(v, t));

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="jobs-page" data-view={view}>
      <PageHeader
        breadcrumbs={[{ label: "Zakázky" }]}
        actions={
          canCreate && (
            <Button variant="primary" onClick={() => setCreate(true)} data-testid="create-job">
              <Plus /> Nová zakázka <Kbd>C</Kbd>
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            label="Zobrazení zakázek"
            value={view}
            onChange={(v) => go(v)}
            options={(Object.keys(VIEW_LABELS) as JobsView[]).map((v) => ({
              value: v,
              label: VIEW_LABELS[v],
            }))}
          />
        </div>
        {view === "faze" && (
          <SegmentedControl
            label="Typ zakázek na boardu"
            value={type}
            onChange={(t) => go("faze", t)}
            options={JOB_TYPES.map((t) => ({ value: t, label: JOB_TYPE_LABELS[t] }))}
          />
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {view === "seznam" && <JobList />}
        {view === "stav" && <JobBoard by="status" />}
        {view === "faze" && <JobBoard by="phase" type={type} />}
        {view === "tabulka" && <FullTable />}
      </div>
      <CreateJobDialog open={create} onOpenChange={setCreate} />
    </div>
  );
}

/** Tabulka jádra (filtry, sloupce, uložené pohledy, export) pro zakázky. */
function FullTable() {
  const d = useEntityDescriptor("job");
  if (d.isLoading) return <Skeleton className="m-4 h-40" />;
  if (!d.data) return <LoadError message={d.error?.message ?? "Zakázky nejsou k dispozici."} />;
  return <EntityList entity={d.data} />;
}

/* ---------- seznam ---------- */

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "number", label: "Kód" },
  { key: "title", label: "Název" },
  { key: "company", label: "Klient" },
  { key: "type", label: "Typ" },
  { key: "status", label: "Stav" },
  { key: "phase", label: "Fáze" },
  { key: "owner", label: "Vlastník" },
  { key: "due", label: "Termín" },
  { key: "price", label: "Hodnota", className: "text-right" },
];

function JobList() {
  const api = useEntityApi();
  const { Link } = useNav();
  const board = useBoard("status", undefined, true);
  const [filter, setFilter] = useState<ListFilter>(DEFAULT_FILTER);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "number",
    dir: "desc",
  });
  const all = useMemo(() => cardsOf(board.data), [board.data]);
  const rows = useMemo(
    () => sortCards(filterCards(all, filter), sort.key, sort.dir),
    [all, filter, sort],
  );
  const drive = useDriveStates(useMemo(() => rows.map((r) => r.id), [rows]));
  const total = sumPrice(rows);
  const hasPrice = all.some((c) => c.priceMinor !== null);

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <div className="relative min-w-48 flex-1 sm:max-w-72">
          <Search
            className="pointer-events-none absolute left-2.5 top-2 size-4 text-faint"
            aria-hidden
          />
          <Input
            className="pl-8"
            placeholder="Hledat zakázku…"
            aria-label="Hledat zakázku"
            value={filter.q}
            onChange={(e) => setFilter({ ...filter, q: e.target.value })}
          />
        </div>
        <SegmentedControl
          label="Které zakázky"
          value={filter.scope}
          onChange={(scope) => setFilter({ ...filter, scope })}
          options={[
            { value: "live", label: "Živé" },
            { value: "closed", label: "Uzavřené" },
            { value: "all", label: "Vše" },
          ]}
        />
        <SegmentedControl
          label="Typ zakázky"
          value={filter.type}
          onChange={(t) => setFilter({ ...filter, type: t })}
          options={[
            { value: "all", label: "Všechny typy" },
            ...JOB_TYPES.map((t) => ({ value: t, label: JOB_TYPE_LABELS[t] })),
          ]}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={!!filter.mineUserId}
            onCheckedChange={(v) =>
              setFilter({ ...filter, mineUserId: v === true ? api.me.id : null })
            }
            aria-label="Jen moje zakázky"
          />
          Moje
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={filter.onlyWarning}
            onCheckedChange={(v) => setFilter({ ...filter, onlyWarning: v === true })}
            aria-label="Jen po termínu nebo se skluzem"
          />
          Po termínu
        </label>
      </div>

      {board.isLoading ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : board.error ? (
        <div className="p-4">
          <LoadError message={board.error.message} onRetry={() => void board.refetch()} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Briefcase />}
          title={all.length ? "Žádná zakázka neodpovídá filtru" : "Zatím žádné zakázky"}
          description={
            all.length
              ? "Zkuste změnit filtry nebo hledaný text."
              : "Zakázka vznikne z vyhraného obchodu, ze šablony nebo ručně tlačítkem Nová zakázka."
          }
        />
      ) : (
        <>
          <div className="scrollbar-thin hidden min-h-0 flex-1 overflow-auto md:block">
            <table
              className="w-full min-w-[64rem] border-collapse text-base"
              data-testid="job-table"
            >
              <thead className="sticky top-0 z-10 bg-bg text-left text-sm text-muted shadow-[0_1px_0_var(--line)]">
                <tr>
                  <th className="w-8 px-2 py-2" aria-label="Varování" />
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={
                        sort.key === c.key
                          ? sort.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className={cn("px-2 py-2 font-medium", c.className)}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-fg"
                        onClick={() => toggle(c.key)}
                      >
                        {c.label}
                        {sort.key === c.key &&
                          (sort.dir === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          ))}
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2 font-medium">
                    Tým
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Disk
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const href = api.hrefFor("job", c.id) ?? "#";
                  const live = c.status !== "done" && c.status !== "cancelled";
                  return (
                    <tr
                      key={c.id}
                      data-testid="job-row"
                      data-job={c.id}
                      className="border-b border-line-soft hover:bg-hover/50"
                    >
                      <td className="px-2 py-1.5">
                        <WarningIcon card={c} />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-sm">
                        <Link href={href} className="hover:underline">
                          {c.number}
                        </Link>
                      </td>
                      <td className="max-w-80 px-2 py-1.5">
                        <Link
                          href={href}
                          className="inline-flex items-center gap-1.5 font-medium hover:underline"
                        >
                          <span className="truncate">{c.title}</span>
                          {c.isPrivate && <PrivateBadge />}
                        </Link>
                      </td>
                      <td className="max-w-48 truncate px-2 py-1.5">{c.companyName ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        <TypeChip type={c.type} />
                      </td>
                      <td className="px-2 py-1.5">
                        <StatusChip status={c.status} />
                      </td>
                      <td className="max-w-44 truncate px-2 py-1.5">{c.currentPhaseName ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        {c.ownerName ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Avatar name={c.ownerName} size={20} />
                            <span className="truncate">{c.ownerName}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <DueText due={c.dueDate} live={live} />
                      </td>
                      <td className="tabular px-2 py-1.5 text-right">
                        {c.priceMinor === null ? (
                          <span className="text-faint">—</span>
                        ) : (
                          formatMinor(c.priceMinor)
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <AvatarStack
                          people={(c.members ?? [])
                            .filter((m) => m.userId !== c.ownerId)
                            .map((m) => ({ id: m.userId, name: m.name }))}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <DriveButton info={drive[c.id]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-bg text-sm text-muted shadow-[0_-1px_0_var(--line)]">
                <tr>
                  <td colSpan={10} className="px-2 py-2">
                    {plural(rows.length, "zakázka", "zakázky", "zakázek")}
                  </td>
                  <td className="tabular px-2 py-2 text-right" colSpan={3}>
                    {hasPrice && total !== null ? `Součet: ${formatMinor(total)}` : ""}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <ul
            className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3 md:hidden"
            data-testid="job-cards"
          >
            {rows.map((c) => (
              <li key={c.id}>
                <Link
                  href={api.hrefFor("job", c.id) ?? "#"}
                  className="block rounded-lg border border-line p-3 hover:bg-hover/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted">{c.number}</span>
                    <TypeChip type={c.type} />
                    <StatusChip status={c.status} />
                    <span className="ml-auto">
                      <WarningIcon card={c} />
                    </span>
                  </div>
                  <p className="mt-1 font-medium">{c.title}</p>
                  <p className="text-sm text-muted">
                    {c.companyName ?? "—"} · {c.currentPhaseName ?? "bez fáze"}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="text-muted">{c.ownerName ?? "—"}</span>
                    <DueText
                      due={c.dueDate}
                      live={c.status !== "done" && c.status !== "cancelled"}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ---------- board ---------- */

function JobBoard({ by, type }: { by: "status" | "phase"; type?: ServiceType }) {
  const [includeClosed, setIncludeClosed] = useState(false);
  const board = useBoard(by, by === "phase" ? type : undefined, includeClosed);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [closing, setClosing] = useState<{
    card: BoardCardX;
    reason: "finished" | "cancelled";
  } | null>(null);
  const flow = usePhaseFlow();
  const setStatus = useCommandMutation<{ jobId: string; status: JobStatusCode }>(
    "zakazky.setStatus",
  );

  const columns = board.data?.columns ?? [];
  const visibleColumns = columns.filter(
    (c) => includeClosed || !(c.status === "done" || c.status === "cancelled"),
  );
  const cards = cardsOf(board.data);
  const empty = cards.length === 0 && !board.isLoading;

  function moveTo(card: BoardCardX, column: BoardColumn) {
    const out = dropOutcome(by, column, card);
    if (out.kind === "noop") return;
    if (out.kind === "phase") return void flow.request(card.id, { phaseName: out.phaseName });
    if (out.status === "done" || out.status === "cancelled")
      return setClosing({
        card,
        reason: reasonForStatus(out.status, { type: card.type, marketingStage: null }) as
          "finished" | "cancelled",
      });
    setStatus.mutate(
      { jobId: card.id, status: out.status },
      {
        onSuccess: () => successToast(`Stav: ${JOB_STATUS_LABELS[out.status]}.`),
        onError: (e) => errorToast(e.message),
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 px-4 py-2 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={includeClosed}
            onCheckedChange={(v) => setIncludeClosed(v === true)}
            aria-label="Zobrazit dokončené a zrušené"
          />
          Zobrazit dokončené a zrušené
        </label>
        <span className="text-muted">
          Karty přetáhněte do jiného sloupce, nebo použijte nabídku „Přesunout“.
        </span>
      </div>
      {board.isLoading ? (
        <div className="flex gap-3 overflow-hidden px-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 w-72 shrink-0" />
          ))}
        </div>
      ) : board.error ? (
        <div className="p-4">
          <LoadError message={board.error.message} onRetry={() => void board.refetch()} />
        </div>
      ) : empty && visibleColumns.length === 0 ? (
        <EmptyState
          icon={<Briefcase />}
          title="Žádné zakázky k zobrazení"
          description={by === "phase" ? "Pro tento typ nejsou žádné zakázky nebo fáze." : undefined}
        />
      ) : (
        <div
          className="scrollbar-thin flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto px-4 pb-4"
          data-testid="job-board"
          data-by={by}
        >
          {visibleColumns.map((col) => (
            <section
              key={col.key}
              aria-label={col.label}
              data-testid="board-column"
              data-column={col.key}
              className={cn(
                "flex w-72 shrink-0 snap-start flex-col rounded-lg bg-sunken max-sm:w-[85vw]",
                over === col.key && "ring-2 ring-accent",
              )}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setOver(col.key);
              }}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragging;
                const card = cards.find((c) => c.id === id);
                setOver(null);
                setDragging(null);
                if (card) moveTo(card, col);
              }}
            >
              <header className="flex items-center gap-2 px-3 py-2">
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{col.label}</h3>
                <span className="tabular rounded-full bg-hover px-1.5 text-xs text-muted">
                  {col.cards.length}
                </span>
              </header>
              <ul className="scrollbar-thin flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {col.cards.map((c) => (
                  <BoardCardView
                    key={c.id}
                    card={c as BoardCardX}
                    columns={visibleColumns}
                    current={col.key}
                    onDragStart={setDragging}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onMove={(target) => moveTo(c as BoardCardX, target)}
                  />
                ))}
                {col.cards.length === 0 && (
                  <li className="px-1 py-3 text-center text-sm text-faint">Prázdné</li>
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
      {flow.dialog}
      {closing && (
        <CompleteDialog
          jobId={closing.card.id}
          reason={closing.reason}
          open
          onOpenChange={(o) => !o && setClosing(null)}
        />
      )}
    </div>
  );
}

function BoardCardView({
  card,
  columns,
  current,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  card: BoardCardX;
  columns: BoardColumn[];
  current: string;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMove: (col: BoardColumn) => void;
}) {
  const api = useEntityApi();
  const { Link } = useNav();
  const can = useCan();
  return (
    <li
      draggable={can("zakazky.write")}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(card.id);
      }}
      onDragEnd={onDragEnd}
      data-testid="board-card"
      data-job={card.id}
      className="rounded-md border border-line bg-bg p-2.5 shadow-sm"
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs text-muted">{card.number}</span>
        <TypeChip type={card.type} />
        {card.isPrivate && <PrivateBadge />}
        <span className="ml-auto flex items-center gap-1">
          <WarningIcon card={card} />
          {can("zakazky.write") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label={`Přesunout zakázku ${card.number}`} size="sm">
                  <MoveRight />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Přesunout do</DropdownMenuLabel>
                {columns.map((col) => (
                  <DropdownMenuItem
                    key={col.key}
                    disabled={col.key === current}
                    onSelect={() => onMove(col)}
                  >
                    {col.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      </div>
      <Link
        href={api.hrefFor("job", card.id) ?? "#"}
        className="mt-1 block font-medium hover:underline"
      >
        {card.title}
      </Link>
      <p className="truncate text-sm text-muted">{card.companyName ?? "—"}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
        {card.ownerName ? (
          <span className="inline-flex min-w-0 items-center gap-1.5" title={card.ownerName}>
            <Avatar name={card.ownerName} size={18} />
            <span className="truncate text-muted">{card.ownerName}</span>
          </span>
        ) : (
          <span />
        )}
        <DueText due={card.dueDate} live={card.status !== "done" && card.status !== "cancelled"} />
      </div>
      {(card.priceMinor !== null || card.currentPhaseName) && (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
          <span className="truncate">{card.currentPhaseName ?? ""}</span>
          {card.priceMinor !== null && (
            <span className="tabular">{formatMinor(card.priceMinor)}</span>
          )}
        </div>
      )}
    </li>
  );
}
