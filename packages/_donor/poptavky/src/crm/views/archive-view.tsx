"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import { formatInstant } from "@rebar/core/time";
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  Icon,
  Input,
  RecordDialog,
  SegmentedControl,
  Skeleton,
  errorToast,
  successToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
  useEntityDescriptor,
  useRecordParam,
} from "@rebar/ui";
import { useEffect, useRef, useState } from "react";
import {
  ARCHIVE_SCOPE_LABELS,
  type ArchivePage,
  type ArchiveRow,
  type ArchiveScope,
  type OwnerFilter,
} from "./logic";

const SCOPES: ArchiveScope[] = ["closed", "archived", "lost", "won", "all"];
const STEP = 50;

/** Fáze, ze kterých jde obchod znovu otevřít (server si pravidla hlídá sám, tady se jen nenabízí zbytečně). */
const REOPENABLE = ["lost", "preparation"];

type Labelled = { color: string; label: string };
function outcome(r: ArchiveRow): Labelled {
  if (r.phase === "lost") return { color: "red", label: "Prohráno" };
  if (r.phase === "inquiry" || r.phase === "offer") return { color: "gray", label: "Archivováno" };
  return { color: "green", label: "Vyhráno" };
}

/**
 * Pohled „Archiv“: archivované a uzavřené obchody (prohrané s důvodem ztráty, vyhrané) oddělené od běžné práce.
 * Rozsah se přepíná nad seznamem, hledá se v názvu a čísle. U každého obchodu jsou akce „Znovu otevřít“
 * (`crm.deal.reopen`, prohraný a čerstvě vyhraný obchod) a „Vrátit z archivu“ (`crm.deal.unarchive`); zbytek v detailu
 * v pop-upu (`?record=`), který si pohled sám obsluhuje.
 */
export function ArchiveView({ owner }: { owner: OwnerFilter }) {
  const [scope, setScope] = useState<ArchiveScope>("closed");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(STEP);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setLimit(STEP);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const query = useCommandQuery<ArchivePage>("crm.archive.list", {
    owner,
    scope,
    limit,
    ...(q ? { q } : {}),
  });
  const last = useRef<ArchivePage | null>(null);
  useEffect(() => {
    if (query.data) last.current = query.data;
  }, [query.data]);
  const data = query.data ?? last.current;

  const descriptor = useEntityDescriptor("job");
  const record = useRecordParam(true);
  const can = useCan();
  const canWrite = can("zakazky.write");

  const reopen = useCommandMutation<{ jobId: string }>("crm.deal.reopen");
  const unarchive = useCommandMutation<{ jobId: string }>("crm.deal.unarchive");
  const [busy, setBusy] = useState<string | null>(null);
  const run = (kind: "reopen" | "unarchive", r: ArchiveRow) => {
    setBusy(`${kind}:${r.id}`);
    const done = {
      onSuccess: () =>
        successToast(
          kind === "reopen" ? "Obchod je znovu otevřený." : "Obchod je vrácený z archivu.",
        ),
      onError: (e: Error) => errorToast(e.message),
      onSettled: () => setBusy(null),
    };
    (kind === "reopen" ? reopen : unarchive).mutate({ jobId: r.id }, done);
  };

  const rows = data?.rows ?? [];
  const money = data?.money ?? false;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="archive-view">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <div className="scrollbar-none max-w-full overflow-x-auto">
          <SegmentedControl
            label="Rozsah archivu"
            value={scope}
            onChange={(v) => {
              setScope(v);
              setLimit(STEP);
            }}
            options={SCOPES.map((s) => ({
              value: s,
              label: ARCHIVE_SCOPE_LABELS[s],
              tone: "neutral" as const,
            }))}
          />
        </div>
        <div className="relative w-48 xl:w-56">
          <Icon
            name="search"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
          />
          <Input
            aria-label="Hledat v archivu"
            placeholder="Hledat…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        {data && (
          <p className="tabular ml-auto text-sm text-muted" data-testid="archive-total">
            {data.total}{" "}
            {data.total === 1
              ? "obchod"
              : data.total >= 2 && data.total <= 4
                ? "obchody"
                : "obchodů"}
          </p>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {query.isError && !data ? (
          <EmptyState
            title="Archiv se nepodařilo načíst"
            description={query.error.message || "Zkontrolujte připojení a zkuste to znovu."}
            action={
              <Button variant="primary" onClick={() => void query.refetch()}>
                Zkusit znovu
              </Button>
            }
          />
        ) : !data ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="archive" />}
            title={q ? "Nic nenalezeno" : "V archivu zatím nic není"}
            description={
              q
                ? "Zkuste upravit hledání nebo rozsah archivu."
                : "Sem se dostanou prohrané, vyhrané a archivované obchody. Z archivu je půjde kdykoli vrátit."
            }
          />
        ) : (
          <>
            <ul className="space-y-2" data-testid="archive-list">
              {rows.map((r) => (
                <ArchiveItem
                  key={r.id}
                  row={r}
                  money={money}
                  canWrite={canWrite}
                  busy={busy}
                  onOpen={() => record.open(r.id)}
                  onAction={run}
                />
              ))}
            </ul>
            {data.total > rows.length && (
              <div className="flex justify-center pt-3">
                <Button
                  loading={query.isFetching}
                  onClick={() => setLimit((l) => Math.min(200, l + STEP))}
                >
                  Zobrazit další ({data.total - rows.length})
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {descriptor.data && (
        <RecordDialog entity={descriptor.data} id={record.id} onClose={record.close} />
      )}
    </div>
  );
}

function ArchiveItem({
  row: r,
  money,
  canWrite,
  busy,
  onOpen,
  onAction,
}: {
  row: ArchiveRow;
  money: boolean;
  canWrite: boolean;
  busy: string | null;
  onOpen: () => void;
  onAction: (kind: "reopen" | "unarchive", r: ArchiveRow) => void;
}) {
  const o = outcome(r);
  const closed = r.closedAt
    ? r.closedAt.length === 10
      ? formatDate(r.closedAt)
      : formatInstant(r.closedAt, { year: true, time: false })
    : null;
  return (
    <li
      className="rounded-lg border border-line bg-bg p-3 hover:border-line-strong"
      data-testid="archive-row"
      data-deal={r.id}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 basis-60 text-left focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="block font-medium [overflow-wrap:anywhere]">
            <span className="mr-1.5 text-faint">{r.number}</span>
            {r.title}
          </span>
          {r.companyName && (
            <span className="block truncate text-sm text-muted">{r.companyName}</span>
          )}
        </button>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip color={o.color} dot>
            {o.label}
          </Chip>
          {r.archivedAt && r.phase !== "inquiry" && r.phase !== "offer" && (
            <Chip color="gray">Archivováno</Chip>
          )}
          {r.stageName && r.phase !== "lost" && (
            <Chip color={r.stageColor ?? "gray"}>{r.stageName}</Chip>
          )}
        </div>
        <div className="tabular flex items-center gap-3 text-sm">
          {money && r.valueMinor !== null && (
            <span className="font-medium">{formatMinor(r.valueMinor)}</span>
          )}
          {closed && <span className="text-muted">{closed}</span>}
          {r.managerName && <Avatar name={r.managerName} size={20} />}
        </div>
      </div>
      {(r.lostReason || r.lostNote) && (
        <p className="mt-1.5 text-sm text-muted" data-testid="archive-lost-reason">
          <span className="text-faint">Důvod ztráty:</span> {r.lostReason ?? "neuveden"}
          {r.lostNote && <> · {r.lostNote}</>}
        </p>
      )}
      {canWrite && (
        <div className="mt-2 flex flex-wrap gap-2">
          {REOPENABLE.includes(r.phase) && (
            <Button
              size="sm"
              loading={busy === `reopen:${r.id}`}
              onClick={() => onAction("reopen", r)}
            >
              <Icon name="rotate-ccw" /> Znovu otevřít
            </Button>
          )}
          {r.archivedAt && (
            <Button
              size="sm"
              loading={busy === `unarchive:${r.id}`}
              onClick={() => onAction("unarchive", r)}
            >
              <Icon name="archive" /> Vrátit z archivu
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
