"use client";

import { Button, EmptyState, Input, errorToast, successToast } from "@rebar/ui";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Download, Link2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { historyExport, historyList } from "@/server/palette-actions";
import { unwrap } from "../nastaveni/_shared/action-query";

export type HistoryInitial = {
  q: string;
  actor: string;
  entityType: string;
  action: string;
  category: string;
  from: string;
  to: string;
};

type Item = {
  id: string;
  at: string;
  actor: string;
  actorKind: string;
  action: string;
  category: string;
  entityType: string;
  entityLabel: string;
  entityId: string;
  entityTitle: string | null;
  summary: string | null;
  changes: { field: string; old: unknown; new: unknown }[];
  href: string | null;
  state: "live" | "deleted" | "gone" | "none";
};

const ACTIONS: Record<string, string> = {
  create: "Vytvoření",
  update: "Úprava",
  delete: "Smazání",
  restore: "Obnovení",
  purge: "Trvalé smazání",
  visibility_changed: "Změna viditelnosti",
  merge: "Sloučení",
  export: "Export",
  login: "Přihlášení",
  login_failed: "Neúspěšné přihlášení",
  login_blocked: "Zablokované přihlášení",
  two_factor_failed: "Neúspěšné 2FA",
  change_password: "Změna hesla",
  password_reset: "Obnova hesla",
  revoke_session: "Odhlášení relace",
  revoke_sessions: "Odhlášení všech relací",
  attach: "Přidání souboru",
  detach: "Odebrání souboru",
  download: "Stažení souboru",
  reorder: "Změna pořadí",
};
const CATEGORIES: Record<string, string> = {
  data: "Data",
  security: "Bezpečnost",
  integration: "Integrace a nastavení",
};
const KINDS: Record<string, string> = {
  system: "Systém",
  agency: "Agentura",
  n8n: "n8n",
  google: "Google",
  meta: "Meta",
  job: "Automatická úloha",
};
const SELECT = "h-9 rounded-md border border-line bg-bg px-2 text-base";
const when = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" });

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "ano" : "ne";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/** Globální historie změn: filtry v adrese, hledání, před → po, odkaz na záznam nebo do koše, export CSV. */
export function HistoryView({
  initial,
  canExport,
}: {
  initial: HistoryInitial;
  canExport: boolean;
}) {
  const [f, setF] = useState(initial);
  const [q, setQ] = useState(initial.q);
  const [exporting, setExporting] = useState(false);
  // hledání se odesílá s krátkou prodlevou
  useEffect(() => {
    const t = setTimeout(() => setF((x) => (x.q === q.trim() ? x : { ...x, q: q.trim() })), 250);
    return () => clearTimeout(t);
  }, [q]);

  const filter = useMemo(
    () => ({
      ...(f.q ? { q: f.q } : {}),
      ...(f.actor && !(f.actor in KINDS) ? { actorId: f.actor } : {}),
      ...(f.actor in KINDS
        ? { actorKind: f.actor as "system" | "agency" | "n8n" | "google" | "meta" | "job" }
        : {}),
      ...(f.entityType ? { entityType: f.entityType } : {}),
      ...(f.action ? { action: f.action } : {}),
      ...(f.category ? { category: f.category as "data" | "security" | "integration" } : {}),
      ...(f.from ? { from: f.from } : {}),
      ...(f.to ? { to: f.to } : {}),
    }),
    [f],
  );

  // stav filtru v adrese (odkaz jde poslat)
  useEffect(() => {
    const u = new URL(window.location.href);
    const set = (k: string, v: string) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    set("q", f.q);
    set("kdo", f.actor);
    set("typ", f.entityType);
    set("akce", f.action);
    set("kategorie", f.category);
    set("od", f.from);
    set("do", f.to);
    window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}`);
  }, [f]);

  const PAGE = 50;
  const list = useInfiniteQuery({
    queryKey: ["history", filter],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => unwrap(historyList({ ...filter, limit: PAGE, offset: pageParam })),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      // stránka může po skrytí polí vrátit méně; posun se řídí počtem řádků z databáze
      return last.items.length > 0 && loaded < last.total ? all.length * PAGE : undefined;
    },
    placeholderData: (prev) => prev,
  });
  const first = list.data?.pages[0];
  const items = (list.data?.pages.flatMap((p) => p.items) ?? []) as Item[];
  const set = (patch: Partial<HistoryInitial>) => setF((x) => ({ ...x, ...patch }));

  async function exportCsv() {
    setExporting(true);
    try {
      const r = await unwrap(historyExport(filter));
      const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `historie-zmen-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      successToast(
        r.truncated
          ? `Staženo ${r.rows} řádků (export je omezený, zúžte filtr).`
          : `Staženo ${r.rows} řádků.`,
      );
    } catch (e) {
      errorToast(e instanceof Error ? e.message : "Export se nepovedl.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5" data-testid="history">
      <p className="text-sm text-muted">
        Každá změna dat, integrací a přihlášení. Historii nejde upravit ani smazat; smazané záznamy
        v ní zůstávají s odkazem do koše.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          aria-label="Hledat v historii"
          placeholder="Hledat (název, shrnutí, hodnota)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-72"
        />
        <select
          aria-label="Kdo"
          className={SELECT}
          value={f.actor}
          onChange={(e) => set({ actor: e.target.value })}
        >
          <option value="">Kdokoli</option>
          {(first?.actors ?? []).map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
          {Object.entries(KINDS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select
          aria-label="Typ záznamu"
          className={SELECT}
          value={f.entityType}
          onChange={(e) => set({ entityType: e.target.value })}
        >
          <option value="">Všechny typy</option>
          {(first?.entityTypes ?? []).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Akce"
          className={SELECT}
          value={f.action}
          onChange={(e) => set({ action: e.target.value })}
        >
          <option value="">Všechny akce</option>
          {(first?.actions ?? []).map((a) => (
            <option key={a} value={a}>
              {ACTIONS[a] ?? a}
            </option>
          ))}
        </select>
        <select
          aria-label="Kategorie"
          className={SELECT}
          value={f.category}
          onChange={(e) => set({ category: e.target.value })}
        >
          <option value="">Všechny kategorie</option>
          {Object.entries(CATEGORIES).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-muted">
          Od
          <input
            type="date"
            aria-label="Od data"
            className={SELECT}
            value={f.from}
            onChange={(e) => set({ from: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-1 text-sm text-muted">
          Do
          <input
            type="date"
            aria-label="Do data"
            className={SELECT}
            value={f.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(window.location.href)
                .then(() => successToast("Odkaz zkopírován."))
            }
          >
            <Link2 /> Odkaz
          </Button>
          {canExport && (
            <Button variant="secondary" loading={exporting} onClick={() => void exportCsv()}>
              <Download /> Export CSV
            </Button>
          )}
        </div>
      </div>

      {list.isLoading ? null : items.length === 0 ? (
        <EmptyState title="Žádné změny" description="Zkuste upravit filtry nebo hledání." />
      ) : (
        <ul
          className="divide-y divide-line rounded-lg border border-line"
          data-testid="history-list"
        >
          {items.map((i) => (
            <li key={i.id} className="space-y-1 px-3 py-2" data-testid="history-item">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="text-muted">{when.format(new Date(i.at))}</span>
                <span className="font-medium">{i.actor}</span>
                {i.actorKind !== "user" && (
                  <span className="rounded bg-hover px-1.5 text-xs text-muted">
                    {KINDS[i.actorKind] ?? i.actorKind}
                  </span>
                )}
                <span>{ACTIONS[i.action] ?? i.action}</span>
                <span className="text-muted">{i.entityLabel}</span>
                {i.href ? (
                  <Link href={i.href} className="font-medium text-accent hover:underline">
                    {i.entityTitle || i.summary || "záznam"}
                    {i.state === "deleted" ? " (v koši)" : ""}
                  </Link>
                ) : (
                  <span className="font-medium">
                    {i.entityTitle || i.summary || ""}
                    {i.state === "gone" ? " (smazáno natrvalo)" : ""}
                  </span>
                )}
                {i.category !== "data" && (
                  <span className="text-xs text-faint">{CATEGORIES[i.category]}</span>
                )}
              </div>
              {i.changes.length > 0 ? (
                <ul className="space-y-0.5 text-sm">
                  {i.changes.slice(0, 12).map((c, n) => (
                    <li key={n} className="[overflow-wrap:anywhere]">
                      <span className="text-muted">{c.field}:</span>{" "}
                      <span className="text-muted line-through">{show(c.old)}</span>
                      {" → "}
                      <span>{show(c.new)}</span>
                    </li>
                  ))}
                  {i.changes.length > 12 && (
                    <li className="text-faint">… a dalších {i.changes.length - 12} polí</li>
                  )}
                </ul>
              ) : (
                i.summary &&
                i.summary !== i.entityTitle && <div className="text-sm text-muted">{i.summary}</div>
              )}
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <div className="flex justify-center pb-4">
          <Button
            variant="secondary"
            loading={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            Načíst další
          </Button>
        </div>
      )}
    </div>
  );
}
