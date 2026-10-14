"use client";

import {
  Button,
  Combobox,
  Input,
  RelatedRecords,
  Skeleton,
  defineModuleUi,
  successToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  type RecordAction,
} from "@rebar/ui";
import { useState } from "react";

/* ---------- sloučení duplicit ---------- */

type Hit = { id: string; label: string; hint?: string };
type Preview = {
  entity: "company" | "person";
  source: { id: string; name: string };
  target: { id: string; name: string };
  moves: { table: string; label: string; count: number }[];
  fills: { field: string; label: string; value: string }[];
  adds: string[];
  warnings: string[];
};

type SearchResult = {
  companies: { id: string; name: string; ico: string | null; city: string | null }[];
  persons: {
    id: string;
    name: string;
    companyName: string | null;
    phone: string | null;
    email: string | null;
  }[];
};

/** Záznamy z hledání jako výběr (bez toho, který se slučuje). */
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
 * Sloučení duplicity: aktuální záznam se spojí s vybraným. Po výběru ukáže náhled dopadu (co se přepojí a doplní),
 * sloučení se provede až po výslovném potvrzení, protože ho nejde vrátit.
 */
function MergeForm({
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
  const [keepCurrent, setKeepCurrent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const similar = useCommandQuery<SearchResult>("kontakty.search", {
    q: name.split(/\s+/)[0] ?? name,
    kinds: [entity],
    limit: 10,
  });
  const suggestions = { data: similar.data ? toHits(entity, similar.data, id) : undefined };
  const sourceId = picked ? (keepCurrent ? picked.id : id) : null;
  const targetId = picked ? (keepCurrent ? id : picked.id) : null;
  const preview = useCommandQuery<Preview>(
    "kontakty.merge.preview",
    picked ? { entity, sourceId, targetId } : undefined,
    { enabled: !!picked },
  );
  const run = useCommandMutation<
    { entity: string; sourceId: string; targetId: string; confirm: true },
    { moved: number; targetId: string }
  >("kontakty.merge.run", {
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
        odkazovalo (zakázky, poptávky, faktury, aktivity, poznámky, soubory…), se přepojí.
      </p>
      <Combobox
        aria-label="Sloučit s"
        load={load}
        value={picked?.id ?? null}
        selectedLabels={picked ? { [picked.id]: picked.label } : {}}
        onChange={(v) => {
          const hit = suggestions.data?.find((s) => s.id === v);
          setPicked(v ? (hit ?? { id: v as string, label: "Vybraný záznam" }) : null);
          setConfirmed(false);
        }}
        placeholder="Vybrat záznam ke sloučení…"
        searchPlaceholder="Jméno, IČO, telefon nebo e-mail…"
        clearable
      />
      {!picked && (suggestions.data?.length ?? 0) > 0 && (
        <div>
          <div className="mb-1.5 text-sm text-muted">Podobné záznamy</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.data!.slice(0, 5).map((s) => (
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
            <legend className="mb-1 text-sm font-medium text-muted">Který záznam zůstane</legend>
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
                    Doplní se do zůstávajícího záznamu: {p.fills.map((f) => f.label).join(", ")}.
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

const mergeAction = (entity: "company" | "person"): RecordAction => ({
  id: "merge",
  label: "Sloučit duplicitu",
  permission: "kontakty.merge",
  dialog: {
    title: entity === "company" ? "Sloučit firmy" : "Sloučit osoby",
    render: ({ id, row, close, push }) => (
      <MergeForm entity={entity} id={id} name={String(row.name ?? "")} close={close} push={push} />
    ),
  },
});

/* ---------- další telefony a e-maily osoby ---------- */

type Point = { kind: "email" | "phone"; value: string; label: string | null };

function PointsCard({ id }: { id: string }) {
  const can = useCan();
  const points = useCommandQuery<{
    points: (Point & { id: string })[];
    types: { value: string; label: string }[];
  }>("kontakty.person.points", { personId: id });
  const choices = points.data?.types ?? [];
  const [draft, setDraft] = useState<Point[] | null>(null);
  const save = useCommandMutation<{ personId: string; points: Point[] }>(
    "kontakty.person.setPoints",
    {
      onSuccess: () => {
        setDraft(null);
        successToast("Kontaktní údaje jsou uložené.");
      },
    },
  );
  const labelOf = (v: string | null) => choices.find((c) => c.value === v)?.label ?? v ?? "";
  const list = points.data?.points ?? [];
  if (!can("kontakty.read")) return null;
  return (
    <section
      aria-label="Další kontaktní údaje"
      data-testid="person-points"
      className="rounded-lg border border-line p-4"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Další telefony a e-maily</h3>
        {can("kontakty.write") && !draft && (
          <Button
            size="sm"
            onClick={() =>
              setDraft(list.map((p) => ({ kind: p.kind, value: p.value, label: p.label })))
            }
          >
            Upravit
          </Button>
        )}
      </div>
      {points.isLoading ? (
        <Skeleton className="h-8" />
      ) : draft ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ personId: id, points: draft.filter((p) => p.value.trim()) });
          }}
        >
          {draft.map((p, i) => (
            <div
              key={i}
              className="grid grid-cols-[6rem_minmax(0,1fr)_7rem_auto] items-center gap-2"
            >
              <span className="text-sm text-muted">
                {p.kind === "email" ? "E-mail" : "Telefon"}
              </span>
              <Input
                aria-label={p.kind === "email" ? "E-mail" : "Telefon"}
                value={p.value}
                onChange={(e) =>
                  setDraft(draft.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                }
                maxLength={200}
              />
              <Combobox
                aria-label="Typ"
                options={choices.map((c) => ({ value: c.value, label: c.label }))}
                value={p.label}
                onChange={(v) =>
                  setDraft(draft.map((x, j) => (j === i ? { ...x, label: v as string | null } : x)))
                }
                placeholder="Typ"
                clearable
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft(draft.filter((_, j) => j !== i))}
              >
                Odebrat
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setDraft([...draft, { kind: "phone", value: "", label: null }])}
            >
              Přidat telefon
            </Button>
            <Button
              size="sm"
              onClick={() => setDraft([...draft, { kind: "email", value: "", label: null }])}
            >
              Přidat e-mail
            </Button>
          </div>
          {save.error && (
            <p role="alert" className="text-sm text-danger">
              {save.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              Uložit
            </Button>
          </div>
        </form>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">
          Žádné další údaje. Hlavní telefon a e-mail jsou v poli Údaje.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
              <a
                className="min-w-0 truncate hover:underline"
                href={
                  p.kind === "email" ? `mailto:${p.value}` : `tel:${p.value.replace(/\s/g, "")}`
                }
              >
                {p.value}
              </a>
              {p.label && (
                <span className="chip" data-color="gray">
                  {labelOf(p.label)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Firma ukáže své kontaktní osoby (stejný seznam jako jinde, nová osoba se rovnou přiřadí k firmě). */
export const ui = defineModuleUi({
  recordTabs: {
    company: [
      {
        id: "osoby",
        label: "Osoby",
        permission: "kontakty.read",
        render: ({ id }: { id: string }) => (
          <RelatedRecords entity="person" parentAttribute="company" parentId={id} />
        ),
      },
    ],
  },
  recordActions: { company: [mergeAction("company")], person: [mergeAction("person")] },
  recordOverview: {
    person: [
      {
        id: "contact-points",
        column: "side",
        order: 5,
        permission: "kontakty.read",
        render: ({ id }) => <PointsCard id={id} />,
      },
    ],
  },
});
