"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import {
  Button,
  Checkbox,
  Chip,
  EmptyState,
  Icon,
  Input,
  SegmentedControl,
  Skeleton,
  errorToast,
  useCan,
  useCommandQuery,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import { useMemo, useState } from "react";
import type { ClientListResult, ClientRow } from "../contract";
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_COLORS,
  CLIENT_STATUS_LABELS,
  DRIVE_STATE_LABELS,
  SERVICE_LABELS,
  groupClients,
  type ClientGroupBy,
} from "../shared";

type SortKey = "name" | "status" | "owner" | "activeJobs" | "income" | "since" | "activity";
const cmpStr = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "", "cs");
const SORTERS: Record<SortKey, (a: ClientRow, b: ClientRow) => number> = {
  name: (a, b) => cmpStr(a.name, b.name),
  status: (a, b) => CLIENT_STATUSES.indexOf(a.status) - CLIENT_STATUSES.indexOf(b.status),
  owner: (a, b) => cmpStr(a.ownerName, b.ownerName),
  activeJobs: (a, b) => a.activeJobs - b.activeJobs,
  income: (a, b) => (a.income12mMinor ?? 0) - (b.income12mMinor ?? 0),
  since: (a, b) => cmpStr(a.clientSince, b.clientSince),
  activity: (a, b) => cmpStr(a.lastActivityAt, b.lastActivityAt),
};

/** Tlačítko Disk v řádku (DRV-05): otevře složku klienta; stav bez složky nebo s chybou řeší karta klienta. */
function DiskCell({ row }: { row: ClientRow }) {
  const api = useEntityApi();
  const can = useCan();
  if (!can("disk.read") || row.driveState === "none") return <span className="text-faint">—</span>;
  if (row.driveState !== "ready")
    return (
      <Chip color={row.driveState === "pending" ? "orange" : "red"}>
        {DRIVE_STATE_LABELS[row.driveState]}
      </Chip>
    );
  return (
    <Button
      size="sm"
      variant="ghost"
      data-testid="client-disk"
      onClick={async (e) => {
        e.stopPropagation();
        // okno se otevře hned (po `await` by ho blokátor oken zavřel)
        const win = window.open("", "_blank");
        if (win) win.opener = null;
        try {
          const info = await api.command<unknown, { url: string | null }>("disk.folderState", {
            entityType: "company",
            id: row.id,
          });
          if (info.url && win) win.location.href = info.url;
          else win?.close();
        } catch (err) {
          win?.close();
          errorToast((err as Error).message);
        }
      }}
    >
      <Icon name="folder" /> Disk
    </Button>
  );
}

const HEAD: { key: SortKey; label: string; align?: "right"; hide?: "income" }[] = [
  { key: "name", label: "Název" },
  { key: "status", label: "Stav" },
  { key: "owner", label: "Vlastník" },
  { key: "activeJobs", label: "Aktivní zakázky", align: "right" },
  { key: "income", label: "Příjem za 12 měsíců", align: "right", hide: "income" },
  { key: "since", label: "Klient od" },
  { key: "activity", label: "Poslední aktivita" },
];

/**
 * Stránka `/klienti` (KLI-03): tabulka klientů se sloupci název, stav, služby, vlastník, aktivní zakázky, příjem za
 * 12 měsíců (jen s právem na finance), klient od, poslední aktivita a tlačítko Disk. Výchozí jsou lead, aktivní a
 * pozastavení, přepínač přidá bývalé; seskupení podle stavu nebo služby; klik na řádek otevře kartu klienta.
 */
export function ClientsPage() {
  const nav = useNav();
  const can = useCan();
  const [includeFormer, setIncludeFormer] = useState(false);
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<ClientGroupBy>("none");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const q = useCommandQuery<ClientListResult, { includeFormer: boolean; search?: string }>(
    "klienti.list",
    { includeFormer, ...(search.trim() ? { search: search.trim() } : {}) },
    { refetchInterval: 30_000 },
  );
  const rows = useMemo(
    () => [...(q.data?.rows ?? [])].sort((a, b) => SORTERS[sort.key](a, b) * sort.dir),
    [q.data?.rows, sort],
  );
  const groups = useMemo(() => groupClients(rows, groupBy), [rows, groupBy]);
  const showIncome = q.data?.canSeeIncome ?? false;
  const head = HEAD.filter((h) => h.hide !== "income" || showIncome);
  const open = (id: string) => nav.push(`/kontakty/firmy/${id}`);
  const cols = head.length + 2;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-5" data-testid="clients-page">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-64">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat klienta, IČO, město…"
            aria-label="Hledat klienta"
            data-testid="clients-search"
          />
        </div>
        <label className="flex items-center gap-2 text-base">
          <Checkbox
            checked={includeFormer}
            onCheckedChange={(v) => setIncludeFormer(v === true)}
            aria-label="Všichni, včetně bývalých"
            data-testid="clients-include-former"
          />
          Všichni, včetně bývalých
        </label>
        <div className="ml-auto flex items-center gap-2">
          <SegmentedControl
            label="Seskupení"
            value={groupBy}
            onChange={(v) => setGroupBy(v as ClientGroupBy)}
            options={[
              { value: "none", label: "Bez seskupení" },
              { value: "status", label: "Podle stavu" },
              { value: "service", label: "Podle služby" },
            ]}
          />
          {can("kontakty.create") && (
            <Button onClick={() => nav.push("/kontakty/firmy/nova")} data-testid="clients-new">
              <Icon name="plus" /> Nový klient
            </Button>
          )}
        </div>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : q.error ? (
        <EmptyState title="Klienty se nepodařilo načíst" description={q.error.message} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Žádní klienti"
          description={
            includeFormer
              ? "Zatím tu nikdo není."
              : "Žádný lead, aktivní ani pozastavený klient. Bývalé zobrazíte přepínačem."
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-base" data-testid="clients-table">
            <thead className="border-b border-line text-sm text-muted">
              <tr>
                {head.slice(0, 2).map((h) => (
                  <HeadCell key={h.key} h={h} sort={sort} setSort={setSort} />
                ))}
                <th className="px-3 py-2 font-medium">Služby</th>
                {head.slice(2).map((h) => (
                  <HeadCell key={h.key} h={h} sort={sort} setSort={setSort} />
                ))}
                <th className="px-3 py-2 font-medium">Disk</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key} data-testid={`clients-group-${g.key}`}>
                {groupBy !== "none" && (
                  <tr className="bg-sunken">
                    <th colSpan={cols} className="px-3 py-1.5 text-left text-sm font-semibold">
                      {g.label}{" "}
                      <span className="tabular font-normal text-muted">{g.rows.length}</span>
                    </th>
                  </tr>
                )}
                {g.rows.map((r) => (
                  <tr
                    key={`${g.key}-${r.id}`}
                    className="cursor-pointer border-t border-line-soft hover:bg-hover"
                    onClick={() => open(r.id)}
                    data-testid="client-row"
                    data-client-id={r.id}
                  >
                    <td className="max-w-72 px-3 py-2 font-medium">
                      <button
                        type="button"
                        className="flex max-w-full items-center gap-1.5 text-left hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(r.id);
                        }}
                      >
                        {r.isPrivate && (
                          <Icon
                            name="lock"
                            className="size-3.5 shrink-0 text-faint"
                            aria-label="Soukromý"
                          />
                        )}
                        <span className="truncate">{r.name}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <Chip color={CLIENT_STATUS_COLORS[r.status]} dot>
                        {CLIENT_STATUS_LABELS[r.status]}
                      </Chip>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1">
                        {r.services.length === 0 ? (
                          <span className="text-faint">—</span>
                        ) : (
                          r.services.map((s) => (
                            <Chip key={s} color="blue">
                              {SERVICE_LABELS[s]}
                            </Chip>
                          ))
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted">{r.ownerName ?? "—"}</td>
                    <td className="tabular px-3 py-2 text-right">{r.activeJobs}</td>
                    {showIncome && (
                      <td className="tabular px-3 py-2 text-right" data-testid="client-income">
                        {r.income12mMinor === null ? "—" : formatMinor(r.income12mMinor)}
                      </td>
                    )}
                    <td className="px-3 py-2 text-muted">
                      {r.clientSince ? formatDate(r.clientSince) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {r.lastActivityAt ? formatDate(r.lastActivityAt.slice(0, 10)) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <DiskCell row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}

function HeadCell({
  h,
  sort,
  setSort,
}: {
  h: (typeof HEAD)[number];
  sort: { key: SortKey; dir: 1 | -1 };
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void;
}) {
  const active = sort.key === h.key;
  return (
    <th
      className={`px-3 py-2 font-medium ${h.align === "right" ? "text-right" : ""}`}
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="hover:text-fg"
        onClick={() => setSort({ key: h.key, dir: active ? (sort.dir === 1 ? -1 : 1) : 1 })}
      >
        {h.label}
        {active ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}
