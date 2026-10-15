"use client";

import {
  Button,
  Combobox,
  Skeleton,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
} from "@rebar/ui";
import { useState } from "react";
import type { MergePreview, MergeResult, SearchResult } from "../contract";

type Hit = { id: string; label: string; hint?: string };

function toHits(entity: "company" | "person", r: SearchResult, selfId: string): Hit[] {
  const hits: Hit[] =
    entity === "company"
      ? r.companies.map((c) => ({
          id: c.id,
          label: c.name,
          hint: [c.ico, c.city].filter(Boolean).join(" · "),
        }))
      : r.persons.map((p) => ({
          id: p.id,
          label: p.name,
          hint: [p.companyName, p.phone ?? p.email].filter(Boolean).join(" · "),
        }));
  return hits.filter((h) => h.id !== selfId);
}

/**
 * Sloučení duplicity (ORG-07, KON-03; jen vlastník s `kontakty.merge`): vybere se druhý záznam a který z nich
 * zůstane jako hlavní. Náhled ukáže, co se přepojí (kontakty, obchody, zakázky, úkoly, poznámky…) a doplní;
 * sloučení se provede až po výslovném potvrzení, protože ho nejde vrátit. Zapíše se do historie obou záznamů.
 */
export function MergeForm({
  entity,
  id,
  name,
  close,
  push,
}: {
  entity: "company" | "person";
  id: string;
  name: string;
  close: () => void;
  push: (href: string) => void;
}) {
  const api = useEntityApi();
  const [picked, setPicked] = useState<Hit | null>(null);
  const [keepCurrent, setKeepCurrent] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const similar = useCommandQuery<SearchResult>("kontakty.search", {
    q: name.split(/\s+/)[0] ?? name,
    kinds: [entity],
    limit: 10,
  });
  const suggestions = similar.data ? toHits(entity, similar.data, id) : [];
  const sourceId = picked ? (keepCurrent ? picked.id : id) : null;
  const targetId = picked ? (keepCurrent ? id : picked.id) : null;
  const preview = useCommandQuery<MergePreview>(
    "kontakty.merge.preview",
    picked ? { entity, sourceId, targetId } : undefined,
    { enabled: !!picked },
  );
  const run = useCommandMutation<
    { entity: string; sourceId: string; targetId: string; confirm: true },
    MergeResult
  >("kontakty.merge.apply", {
    onSuccess: (r) => {
      successToast("Záznamy jsou sloučené.");
      close();
      const href = api.hrefFor(entity, r.targetId);
      if (href) push(href);
    },
  });
  const load = async (q: string) =>
    toHits(
      entity,
      await api.command<unknown, SearchResult>("kontakty.search", {
        q,
        kinds: [entity],
        limit: 10,
      }),
      id,
    ).map((h) => ({ value: h.id, label: h.label, ...(h.hint ? { hint: h.hint } : {}) }));

  const p = preview.data;
  const total = p?.moves.reduce((n, m) => n + m.count, 0) ?? 0;
  return (
    <div className="space-y-3 px-5 py-4" data-testid="merge-dialog">
      <p className="text-muted">
        Vyberte druhý záznam. Ze dvou záznamů se stane jeden a všechno, co se na zanikající záznam
        odkazovalo (kontakty, obchody, zakázky, úkoly, poznámky, platby, soubory…), se přepojí.
      </p>
      <Combobox
        aria-label="Sloučit s"
        load={load}
        value={picked?.id ?? null}
        selectedLabels={picked ? { [picked.id]: picked.label } : {}}
        onChange={(v) => {
          const hit = suggestions.find((s) => s.id === v);
          setPicked(v ? (hit ?? { id: v as string, label: "Vybraný záznam" }) : null);
          setConfirmed(false);
        }}
        placeholder="Vybrat záznam ke sloučení…"
        searchPlaceholder="Jméno, IČO, telefon nebo e-mail…"
        clearable
      />
      {!picked && suggestions.length > 0 && (
        <div>
          <div className="mb-1.5 text-sm text-muted">Podobné záznamy</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 5).map((s) => (
              <Button key={s.id} size="sm" onClick={() => setPicked(s)}>
                {s.label}
                {s.hint ? <span className="text-muted">· {s.hint}</span> : null}
              </Button>
            ))}
          </div>
        </div>
      )}
      {picked && (
        <>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium text-muted">Hlavní záznam (zůstane)</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="keep"
                checked={keepCurrent}
                onChange={() => setKeepCurrent(true)}
                className="accent-[var(--accent)]"
              />
              <span>
                Tento: <strong>{name}</strong> (vybraný záznam zanikne)
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="keep"
                checked={!keepCurrent}
                onChange={() => setKeepCurrent(false)}
                className="accent-[var(--accent)]"
              />
              <span>
                Vybraný: <strong>{picked.label}</strong> (tento záznam zanikne)
              </span>
            </label>
          </fieldset>
          {preview.isLoading ? (
            <Skeleton className="h-20" />
          ) : preview.error ? (
            <p role="alert" className="text-sm text-danger">
              {preview.error.message}
            </p>
          ) : (
            p && (
              <div
                className="rounded-lg border border-line p-3 text-sm"
                data-testid="merge-preview"
              >
                <p className="mb-1.5">
                  Zanikne <strong>{p.source.name}</strong>, zůstane <strong>{p.target.name}</strong>
                  .
                </p>
                {p.moves.length > 0 ? (
                  <p>
                    Přepojí se: {p.moves.map((m) => `${m.count} ${m.label}`).join(", ")} (celkem{" "}
                    {total}).
                  </p>
                ) : (
                  <p>Na zanikající záznam nic neodkazuje.</p>
                )}
                {p.fills.length > 0 && (
                  <p className="mt-1">
                    Doplní se do hlavního záznamu: {p.fills.map((f) => f.label).join(", ")}.
                  </p>
                )}
                {p.adds.map((a) => (
                  <p key={a} className="mt-1">
                    {a}
                  </p>
                ))}
                {p.warnings.map((w) => (
                  <p key={w} className="mt-1 text-warning">
                    {w}
                  </p>
                ))}
              </div>
            )
          )}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 accent-[var(--accent)]"
              data-testid="merge-confirm"
            />
            <span>Rozumím, že sloučení nejde vrátit zpět.</span>
          </label>
        </>
      )}
      {run.error && (
        <p role="alert" className="text-sm text-danger">
          {run.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="ghost" onClick={close}>
          Zrušit
        </Button>
        <Button
          variant="danger"
          disabled={!picked || !confirmed || !sourceId || !targetId || !p}
          loading={run.isPending}
          onClick={() =>
            sourceId && targetId && run.mutate({ entity, sourceId, targetId, confirm: true })
          }
        >
          Sloučit
        </Button>
      </div>
    </div>
  );
}
