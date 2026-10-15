"use client";

import {
  Button,
  Chip,
  Combobox,
  ConfirmDialog,
  EmptyState,
  Icon,
  Input,
  SegmentedControl,
  Skeleton,
  Textarea,
  cn,
  errorToast,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useEntityDescriptor,
  useNav,
  type ComboOption,
} from "@rebar/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PreviewPart } from "./logic";
import type {
  LibraryList,
  LibraryMoveResult,
  LibraryPreview,
  LibraryRow,
  LibraryVariables,
  VariableSource,
} from "./types";

const ENTITY = "email_library_item";
const BASE = "/muj-prostor/knihovna";

/** Zkopíruje text do schránky (s náhradou pro prohlížeče bez Clipboard API) a ohlásí to. */
async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  successToast(`${what} zkopírován.`);
}

const PART_CLASS: Record<PreviewPart["kind"], string> = {
  text: "",
  value: "rounded bg-accent-soft px-0.5",
  missing: "rounded bg-warning-soft px-1 text-warning",
  unknown: "rounded bg-danger-soft px-0.5 text-danger",
  placeholder: "rounded bg-hover px-0.5 text-muted",
};

/** Text náhledu se zvýrazněnými proměnnými (vyplněné, chybějící, neznámé, zástupné). */
function Parts({ parts }: { parts: PreviewPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.text}</span>
        ) : (
          <span
            key={i}
            className={PART_CLASS[p.kind]}
            data-kind={p.kind}
            title={
              p.kind === "missing"
                ? `Chybí hodnota {${p.key}}`
                : p.kind === "unknown"
                  ? `Neznámá proměnná {${p.key}}`
                  : `{${p.key}}`
            }
          >
            {p.kind === "missing" ? `⟨chybí ${p.key}⟩` : p.text}
          </span>
        ),
      )}
    </>
  );
}

const SOURCE_LABEL: Record<VariableSource, string> = {
  person: "Kontakt",
  company: "Organizace",
  deal: "Obchod",
  job: "Zakázka",
  sender: "Odesílatel",
};

type Ctx = { personId?: string; companyId?: string; dealId?: string; jobId?: string };

/** Výběr záznamu (kontakt, organizace, obchod, zakázka) s hledáním na serveru. */
function RecordPick({
  kind,
  label,
  value,
  onChange,
}: {
  kind: "person" | "company" | "deal" | "job";
  label: string;
  value: { id: string; label: string } | null;
  onChange: (v: { id: string; label: string } | null) => void;
}) {
  const api = useEntityApi();
  const [seen, setSeen] = useState<Record<string, string>>({});
  return (
    <Combobox
      aria-label={label}
      placeholder={label}
      searchPlaceholder="Hledat…"
      clearable
      value={value?.id ?? null}
      selectedLabels={value ? { [value.id]: value.label } : seen}
      load={async (q) => {
        const rows = await api.command<
          unknown,
          { id: string; label: string; hint: string | null }[]
        >("muj-prostor.library.pick", { kind, q });
        setSeen(Object.fromEntries(rows.map((r) => [r.id, r.label])));
        return rows.map((r): ComboOption => ({
          value: r.id,
          label: r.label,
          ...(r.hint ? { hint: r.hint } : {}),
        }));
      }}
      onChange={(v) => {
        if (typeof v !== "string") return onChange(null);
        onChange({ id: v, label: seen[v] ?? v });
      }}
      className="min-w-48"
    />
  );
}

/** Náhled textu vyplněný daty vybraného kontaktu, s kopírováním a otevřením v Gmailu. */
function PreviewCard({
  id,
  rev,
  catalog,
}: {
  id: string;
  rev: string;
  catalog: LibraryVariables | undefined;
}) {
  const [pick, setPick] = useState<Partial<Record<keyof Ctx, { id: string; label: string }>>>({});
  const context = useMemo(
    () => ({
      ...(pick.personId ? { personId: pick.personId.id } : {}),
      ...(pick.companyId ? { companyId: pick.companyId.id } : {}),
      ...(pick.dealId ? { dealId: pick.dealId.id } : {}),
      ...(pick.jobId ? { jobId: pick.jobId.id } : {}),
    }),
    [pick],
  );
  const preview = useCommandQuery<LibraryPreview>("muj-prostor.library.preview", {
    id,
    context,
    rev,
  });
  const p = preview.data;
  const set = (k: keyof Ctx) => (v: { id: string; label: string } | null) =>
    setPick((cur) => {
      const next = { ...cur };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });
  const pickers = catalog?.pickers ?? ["person", "company"];
  return (
    <section className="card" data-testid="library-preview">
      <div className="card-head">
        <h3 className="truncate text-sm font-semibold">Náhled s daty kontaktu</h3>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <RecordPick
            kind="person"
            label="Kontakt"
            value={pick.personId ?? null}
            onChange={set("personId")}
          />
          {pickers.includes("company") && (
            <RecordPick
              kind="company"
              label="Organizace"
              value={pick.companyId ?? null}
              onChange={set("companyId")}
            />
          )}
          {pickers.includes("deal") && (
            <RecordPick
              kind="deal"
              label="Obchod"
              value={pick.dealId ?? null}
              onChange={set("dealId")}
            />
          )}
          {pickers.includes("job") && (
            <RecordPick
              kind="job"
              label="Zakázka"
              value={pick.jobId ?? null}
              onChange={set("jobId")}
            />
          )}
        </div>
        {!p ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            {!p.filled && (
              <p className="text-sm text-muted">
                Vyberte kontakt, doplní se jeho jméno, firma a adresát. Bez výběru zůstanou proměnné
                jako {"{jmeno}"}.
              </p>
            )}
            {p.filled && p.to && <p className="text-sm text-muted">Adresát: {p.to}</p>}
            {p.missing.length > 0 && (
              <p
                className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning"
                role="status"
                data-testid="preview-missing"
              >
                Chybí hodnota: {p.missing.map((k) => `{${k}}`).join(", ")}. V textu zůstane prázdné
                místo.
              </p>
            )}
            {p.unknown.length > 0 && (
              <p
                className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
                role="status"
                data-testid="preview-unknown"
              >
                Neznámá proměnná: {p.unknown.map((k) => `{${k}}`).join(", ")} (překlep?).
              </p>
            )}
            <div className="rounded-md border border-line p-3">
              <p className="text-sm text-muted">Předmět</p>
              <p className="font-medium" data-testid="preview-subject">
                {p.subject ? (
                  <Parts parts={p.subjectParts} />
                ) : (
                  <span className="text-faint">bez předmětu</span>
                )}
              </p>
              <p className="mt-3 text-sm text-muted">Text</p>
              <p className="whitespace-pre-wrap" data-testid="preview-body">
                <Parts parts={p.bodyParts} />
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                data-testid="copy-body"
                onClick={() => void copyText(p.body, "Text")}
              >
                <Icon name="copy" /> Kopírovat text
              </Button>
              <Button
                data-testid="copy-subject"
                disabled={!p.subject}
                onClick={() => void copyText(p.subject, "Předmět")}
              >
                Kopírovat předmět
              </Button>
              <Button
                data-testid="open-gmail"
                disabled={!p.gmailUrl}
                onClick={() => p.gmailUrl && window.open(p.gmailUrl, "_blank", "noopener")}
              >
                <Icon name="mail" /> Otevřít v Gmailu
              </Button>
              {p.mailtoUrl && (
                <a
                  className="inline-flex h-8 items-center px-2 text-sm text-muted hover:text-fg"
                  href={p.mailtoUrl}
                  data-testid="open-mailto"
                >
                  Jiný poštovní program
                </a>
              )}
            </div>
            {p.tooLong && (
              <p className="text-sm text-muted" data-testid="too-long">
                Text je příliš dlouhý pro odkaz do Gmailu. Zkopírujte ho a vložte do nové zprávy.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

type Draft = { title: string; category: string; subject: string; body: string; tags: string[] };

/** Editor položky (název, kategorie, štítky, předmět, text) s vkládáním proměnných na místo kurzoru. */
function Editor({
  initial,
  id,
  updatedAt,
  catalog,
  categories,
  onDone,
  onCancel,
  onChanged,
}: {
  initial: Draft;
  id: string | null;
  updatedAt?: string;
  catalog: LibraryVariables | undefined;
  categories: string[];
  onDone: (id: string) => void;
  onCancel: () => void;
  onChanged: () => void;
}) {
  const api = useEntityApi();
  const descriptor = useEntityDescriptor(ENTITY);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"subject" | "body">("body");
  const tagChoices = descriptor.data?.attributes.find((a) => a.key === "tags")?.choices ?? [];

  function insert(key: string) {
    const token = `{${key}}`;
    const field = lastField.current;
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const cur = draft[field === "subject" ? "subject" : "body"];
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + token + cur.slice(end);
    setDraft((d) => ({ ...d, [field]: next }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save() {
    if (!draft.title.trim()) return errorToast("Zadejte název.");
    setSaving(true);
    try {
      const values = {
        title: draft.title.trim(),
        category: draft.category.trim() || null,
        subject: draft.subject,
        body: draft.body || null,
        tags: draft.tags,
      };
      const res = id
        ? await api.update(ENTITY, id, values, updatedAt)
        : await api.create(ENTITY, values);
      onChanged();
      successToast("Uloženo.");
      onDone(res.row.id);
    } catch (e) {
      errorToast(e instanceof Error ? e.message : "Uložení se nepodařilo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card" data-testid="library-editor">
      <div className="card-head">
        <h3 className="text-sm font-semibold">{id ? "Úprava položky" : "Nová položka"}</h3>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-muted">
            Název
            <Input
              data-testid="edit-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="mt-1"
            />
          </label>
          <label className="block text-sm font-medium text-muted">
            Kategorie
            <Input
              data-testid="edit-category"
              list="library-categories"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="mt-1"
            />
            <datalist id="library-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-muted">Štítky</p>
          <Combobox
            multiple
            aria-label="Štítky"
            placeholder={
              tagChoices.length ? "Vybrat štítky…" : "Štítky se zakládají v Nastavení → Štítky"
            }
            options={tagChoices.map((c) => ({ value: c.value, label: c.label }))}
            value={draft.tags}
            onChange={(v) => setDraft({ ...draft, tags: Array.isArray(v) ? v : [] })}
          />
        </div>
        <label className="block text-sm font-medium text-muted">
          Předmět
          <Input
            ref={subjectRef}
            data-testid="edit-subject"
            value={draft.subject}
            onFocus={() => (lastField.current = "subject")}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            className="mt-1"
          />
        </label>
        <label className="block text-sm font-medium text-muted">
          Text
          <Textarea
            ref={bodyRef}
            data-testid="edit-body"
            rows={12}
            value={draft.body}
            onFocus={() => (lastField.current = "body")}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            className="mt-1 font-sans"
          />
        </label>
        <div>
          <p className="mb-1 text-sm font-medium text-muted">
            Proměnné (klik vloží na místo kurzoru)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(catalog?.variables ?? []).map((v) => (
              <button
                key={v.key}
                type="button"
                title={`${SOURCE_LABEL[v.source]}: ${v.label}${v.available ? "" : " (zatím nedostupná)"}`}
                data-testid={`var-${v.key}`}
                onClick={() => insert(v.key)}
                className={cn(
                  "rounded-md border border-line px-2 py-0.5 text-sm hover:bg-hover",
                  !v.available && "text-faint",
                )}
              >
                {`{${v.key}}`}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>Zrušit</Button>
          <Button
            variant="primary"
            loading={saving}
            data-testid="edit-save"
            onClick={() => void save()}
          >
            Uložit
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Detail položky: náhled s daty kontaktu a akce (upravit, duplikovat, přesunout do šablon, smazat). */
function Detail({
  id,
  catalog,
  categories,
  onGone,
  onSelect,
  onChanged,
}: {
  id: string;
  catalog: LibraryVariables | undefined;
  categories: string[];
  onGone: () => void;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const api = useEntityApi();
  const nav = useNav();
  const descriptor = useEntityDescriptor(ENTITY);
  const [item, setItem] = useState<{ row: Record<string, unknown> } | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "copy">("view");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmMove, setConfirmMove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(
    () => async () => {
      try {
        setItem(await api.get(ENTITY, id));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Položku se nepodařilo načíst.");
      }
    },
    [api, id],
  );
  useEffect(() => {
    setMode("view");
    setItem(null);
    void load();
  }, [load]);

  const move = useCommandMutation<unknown, LibraryMoveResult>("muj-prostor.library.move", {
    onSuccess: (r) => {
      successToast("Přesunuto do sdílených šablon.");
      setConfirmMove(false);
      nav.push(r.href);
    },
  });
  const tagLabel = (v: string) =>
    descriptor.data?.attributes.find((a) => a.key === "tags")?.choices?.find((c) => c.value === v)
      ?.label ?? v;

  if (error) return <EmptyState title="Položka není k dispozici" description={error} />;
  if (!item) return <Skeleton className="h-64 w-full" />;
  const row = item.row;
  const draft: Draft = {
    title: String(row.title ?? ""),
    category: String(row.category ?? ""),
    subject: String(row.subject ?? ""),
    body: String(row.body ?? ""),
    tags: (row.tags as string[] | null) ?? [],
  };

  if (mode === "edit")
    return (
      <Editor
        initial={draft}
        id={id}
        updatedAt={String(row.updatedAt)}
        catalog={catalog}
        categories={categories}
        onChanged={onChanged}
        onDone={() => {
          setMode("view");
          void load();
        }}
        onCancel={() => setMode("view")}
      />
    );
  if (mode === "copy")
    return (
      <Editor
        initial={{ ...draft, title: `${draft.title} (kopie)` }}
        id={null}
        catalog={catalog}
        categories={categories}
        onChanged={onChanged}
        onDone={(nid) => onSelect(nid)}
        onCancel={() => setMode("view")}
      />
    );

  return (
    <div className="space-y-4" data-testid="library-detail">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold" data-testid="detail-title">
            {draft.title}
          </h2>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {draft.category && <Chip color="blue">{draft.category}</Chip>}
            {draft.tags.map((t) => (
              <Chip key={t}>{tagLabel(t)}</Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button data-testid="action-edit" onClick={() => setMode("edit")}>
            Upravit
          </Button>
          <Button data-testid="action-copy" onClick={() => setMode("copy")}>
            Duplikovat
          </Button>
          <Button
            data-testid="action-move"
            disabled={!catalog?.templatesAvailable}
            title={
              catalog?.templatesAvailable ? undefined : "Sdílené šablony e-mailů nejsou zapnuté."
            }
            onClick={() => setConfirmMove(true)}
          >
            Do sdílených šablon
          </Button>
          <Button
            variant="ghost"
            data-testid="action-delete"
            onClick={() => setConfirmDelete(true)}
          >
            Smazat
          </Button>
        </div>
      </div>
      <PreviewCard id={id} rev={String(row.updatedAt)} catalog={catalog} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Smazat položku?"
        description="Položka půjde obnovit z koše do 30 dní."
        confirmLabel="Smazat"
        danger
        onConfirm={async () => {
          try {
            await api.remove(ENTITY, [id]);
            onChanged();
            successToast("Položka smazána.");
            onGone();
          } catch (e) {
            errorToast(e instanceof Error ? e.message : "Smazání se nepodařilo.");
            return false;
          }
        }}
      />
      <ConfirmDialog
        open={confirmMove}
        onOpenChange={setConfirmMove}
        title="Přesunout do sdílených šablon?"
        description="Text uvidí i Patrik. Z knihovny zmizí (půjde obnovit z koše)."
        confirmLabel="Přesunout"
        onConfirm={async () => {
          try {
            await move.mutateAsync({ direction: "toTemplates", id });
          } catch (e) {
            errorToast(e instanceof Error ? e.message : "Přesun se nepodařil.");
            return false;
          }
        }}
      />
    </div>
  );
}

function ListItem({
  row,
  active,
  tagLabel,
  onOpen,
}: {
  row: LibraryRow;
  active: boolean;
  tagLabel: (v: string) => string;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-testid="library-row"
        data-title={row.title}
        aria-current={active}
        className={cn(
          "w-full border-b border-line-soft px-3 py-2.5 text-left hover:bg-hover",
          active && "bg-accent-soft",
        )}
      >
        <span className="block truncate font-medium">{row.title}</span>
        {row.subject && <span className="block truncate text-sm text-muted">{row.subject}</span>}
        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-faint">
          {row.category && <span>{row.category}</span>}
          {row.tags.map((t) => (
            <Chip key={t} className="text-xs">
              {tagLabel(t)}
            </Chip>
          ))}
        </span>
      </button>
    </li>
  );
}

/** Stránka E-mailová knihovna: hledání a filtry vlevo, detail s náhledem a editor vpravo. */
export function LibraryPage({
  selectedId,
  startNew,
}: {
  selectedId: string | null;
  startNew: boolean;
}) {
  const nav = useNav();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<"title" | "updated">("title");
  const [creating, setCreating] = useState(startNew);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  const list = useCommandQuery<LibraryList>("muj-prostor.library.list", {
    ...(debounced ? { q: debounced } : {}),
    ...(category ? { category } : {}),
    ...(tag ? { tag } : {}),
    sort,
  });
  const catalog = useCommandQuery<LibraryVariables>("muj-prostor.library.variables", {});
  const data = list.data;
  const categories = data?.categories.map((c) => c.name) ?? [];
  const tagLabel = useMemo(() => {
    const m = new Map((data?.tags ?? []).map((t) => [t.value, t.label]));
    return (v: string) => m.get(v) ?? v;
  }, [data]);
  const open = (id: string) => {
    setCreating(false);
    nav.push(`${BASE}/${id}`);
  };
  const showDetail = !!selectedId || creating;

  return (
    <div
      className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[22rem_minmax(0,1fr)]"
      data-testid="library-page"
    >
      <aside
        className={cn("flex min-h-0 flex-col border-r border-line", showDetail && "hidden lg:flex")}
      >
        <div className="space-y-2 border-b border-line p-3">
          <div className="flex gap-2">
            <Input
              aria-label="Hledat v knihovně"
              placeholder="Hledat (název, text, štítek)…"
              value={q}
              data-testid="library-search"
              onChange={(e) => setQ(e.target.value)}
            />
            <Button
              variant="primary"
              data-testid="library-new"
              onClick={() => {
                setCreating(true);
                nav.push(BASE);
              }}
            >
              <Icon name="plus" /> Nová
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <SegmentedControl
              label="Řazení"
              value={sort}
              onChange={setSort}
              options={[
                { value: "title", label: "Název" },
                { value: "updated", label: "Nedávné" },
              ]}
            />
            <a className="text-sm text-muted hover:text-fg" href={`${BASE}/vse`}>
              Tabulka a export
            </a>
          </div>
          {data && data.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid="library-categories">
              {data.categories.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  aria-pressed={category === c.name}
                  onClick={() => setCategory(category === c.name ? null : c.name)}
                  className={cn(
                    "rounded-full border border-line px-2 py-0.5 text-sm hover:bg-hover",
                    category === c.name && "border-accent bg-accent-soft",
                  )}
                >
                  {c.name} <span className="text-faint">{c.count}</span>
                </button>
              ))}
            </div>
          )}
          {data && data.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-testid="library-tags">
              {data.tags.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={tag === t.value}
                  onClick={() => setTag(tag === t.value ? null : t.value)}
                  className={cn(
                    "rounded-md bg-hover px-2 py-0.5 text-sm",
                    tag === t.value && "bg-accent-soft text-fg",
                  )}
                >
                  {t.label} <span className="text-faint">{t.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {!data ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : data.rows.length === 0 ? (
            <EmptyState
              title={q || category || tag ? "Nic nenalezeno" : "Knihovna je prázdná"}
              description={
                q || category || tag
                  ? "Zkuste jiný výraz nebo zrušte filtry."
                  : "Uložte si sem e-maily a texty, které často používáte."
              }
            />
          ) : (
            <ul data-testid="library-list">
              {data.rows.map((r) => (
                <ListItem
                  key={r.id}
                  row={r}
                  active={r.id === selectedId}
                  tagLabel={tagLabel}
                  onOpen={() => open(r.id)}
                />
              ))}
            </ul>
          )}
          {data?.truncated && (
            <p className="p-3 text-sm text-muted">
              Ukázáno {data.rows.length} z {data.total}, upřesněte hledání.
            </p>
          )}
        </div>
      </aside>
      <main className={cn("min-h-0 overflow-auto p-4", !showDetail && "hidden lg:block")}>
        {showDetail && (
          <button
            type="button"
            className="mb-3 text-sm text-muted hover:text-fg lg:hidden"
            onClick={() => {
              setCreating(false);
              nav.push(BASE);
            }}
          >
            ← Zpět na seznam
          </button>
        )}
        {creating ? (
          <Editor
            initial={{
              title: "",
              category: category ?? "",
              subject: "",
              body: "",
              tags: tag ? [tag] : [],
            }}
            id={null}
            catalog={catalog.data}
            categories={categories}
            onDone={open}
            onChanged={() => void list.refetch()}
            onCancel={() => setCreating(false)}
          />
        ) : selectedId ? (
          <Detail
            key={selectedId}
            id={selectedId}
            catalog={catalog.data}
            categories={categories}
            onGone={() => nav.push(BASE)}
            onSelect={open}
            onChanged={() => void list.refetch()}
          />
        ) : (
          <EmptyState
            title="Vyberte položku"
            description="Vlevo najdete texty; po otevření si je můžete vyplnit daty kontaktu a zkopírovat nebo otevřít v Gmailu."
          />
        )}
      </main>
    </div>
  );
}
