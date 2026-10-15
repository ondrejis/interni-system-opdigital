"use client";

import { useMemo, useRef, useState } from "react";
import {
  Button,
  Chip,
  Input,
  Textarea,
  errorToast,
  successToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
} from "@rebar/ui";
import type {
  EmailContext,
  EmailEntityType,
  PickOption,
  PreviewResult,
  TemplateVariable,
  VariablesResult,
} from "../contract";
import { findVariables } from "../logic";
import { PreviewParts, useDebounced } from "./shared";

const KIND_LABEL: Record<EmailEntityType, string> = {
  person: "Kontakt",
  company: "Organizace",
  deal: "Obchod",
  job: "Zakázka",
};
const CONTEXT_KEY: Record<EmailEntityType, keyof EmailContext> = {
  person: "personId",
  company: "companyId",
  deal: "dealId",
  job: "jobId",
};
const SOURCE_ORDER = ["person", "company", "deal", "job", "sender"] as const;
const SOURCE_LABEL: Record<(typeof SOURCE_ORDER)[number], string> = {
  person: "Kontakt",
  company: "Organizace",
  deal: "Obchod",
  job: "Zakázka",
  sender: "Odesílatel",
};

/** Výběr záznamu (kontakt, organizace, obchod, zakázka), kterým se náhled vyplní. */
function RecordPicker({
  value,
  onChange,
}: {
  value: Partial<Record<EmailEntityType, PickOption>>;
  onChange: (kind: EmailEntityType, option: PickOption | null) => void;
}) {
  const [kind, setKind] = useState<EmailEntityType>("person");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q.trim(), 250);
  const found = useCommandQuery<PickOption[]>(
    "sablony-emailu.pick",
    { kind, ...(dq ? { q: dq } : {}) },
    { enabled: open },
  );
  const chosen = (Object.keys(value) as EmailEntityType[]).filter((k) => value[k]);
  return (
    <div className="flex flex-col gap-2" data-testid="record-picker">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted">Náhled pro:</span>
        {chosen.length === 0 && (
          <span className="text-faint">žádný záznam (proměnné zůstanou jako {"{klíč}"})</span>
        )}
        {chosen.map((k) => (
          <Chip key={k} color="blue">
            {KIND_LABEL[k]}: {value[k]!.label}
            <button
              type="button"
              className="ml-1"
              aria-label={`Zrušit výběr: ${KIND_LABEL[k]}`}
              onClick={() => onChange(k, null)}
            >
              ×
            </button>
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(KIND_LABEL) as EmailEntityType[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setOpen(true);
            }}
            className="rounded-full"
          >
            <Chip color={kind === k ? "blue" : "gray"}>{KIND_LABEL[k]}</Chip>
          </button>
        ))}
        <Input
          className="max-w-64"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          placeholder={`Hledat: ${KIND_LABEL[kind].toLowerCase()}`}
          aria-label="Hledat záznam pro náhled"
        />
      </div>
      {open && (
        <ul
          className="flex max-h-40 flex-col overflow-auto rounded-md border border-line p-1"
          aria-label="Nalezené záznamy"
        >
          {(found.data ?? []).length === 0 && !found.isLoading && (
            <li className="px-2 py-1 text-muted">Nic nenalezeno.</li>
          )}
          {(found.data ?? []).map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left hover:bg-hover"
                data-pick={o.label}
                onClick={() => {
                  onChange(kind, o);
                  setOpen(false);
                  setQ("");
                }}
              >
                <span>{o.label}</span>
                {o.hint && <span className="text-sm text-faint">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Záložka „Text e-mailu“ šablony: předmět a text s proměnnými vkládanými jedním klikem (na místo kurzoru) a živý
 * náhled vyplněný daty vybraného kontaktu, organizace, obchodu nebo zakázky (SAB-02). Uložení jde přes příkaz, který
 * dodrží oprávnění, audit a kolize úprav. Kontrola proměnných: neznámá (překlep) se hlásí hned při psaní.
 */
export function TemplateEditorTab({
  id,
  row,
}: {
  id: string;
  row: { updatedAt: string; subject?: unknown; bodyText?: unknown; usageCount?: unknown };
}) {
  const can = useCan();
  const canWrite = can("sablony-emailu.write");
  const savedSubject = String(row.subject ?? "");
  const savedBody = String(row.bodyText ?? "");
  const [subject, setSubject] = useState(savedSubject);
  const [body, setBody] = useState(savedBody);
  // uložená hodnota se změnila (po uložení, nebo změnil někdo jiný): nerozepsaný formulář ji převezme
  const [base, setBase] = useState({ s: savedSubject, b: savedBody });
  if (base.s !== savedSubject || base.b !== savedBody) {
    if (subject === base.s && body === base.b) {
      setSubject(savedSubject);
      setBody(savedBody);
    }
    setBase({ s: savedSubject, b: savedBody });
  }
  const [picked, setPicked] = useState<Partial<Record<EmailEntityType, PickOption>>>({});
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"subject" | "body">("body");

  const dirty = subject !== savedSubject || body !== savedBody;
  const vars = useCommandQuery<VariablesResult>("sablony-emailu.variables", {});
  const catalog = vars.data?.variables ?? [];
  const grouped = useMemo(
    () =>
      SOURCE_ORDER.map((source) => ({
        source,
        items: catalog.filter((v) => v.source === source),
      })).filter((g) => g.items.length),
    [catalog],
  );

  const context = useMemo<EmailContext>(() => {
    const c: EmailContext = {};
    for (const k of Object.keys(picked) as EmailEntityType[])
      if (picked[k]) c[CONTEXT_KEY[k]] = picked[k]!.id;
    return c;
  }, [picked]);
  const draft = useDebounced({ subject, body, context }, 350);
  const preview = useCommandQuery<PreviewResult>("sablony-emailu.preview", draft);
  const view = preview.data;

  const save = useCommandMutation<
    { id: string; subject: string; bodyText: string; expectedUpdatedAt: string },
    { updatedAt: string }
  >("sablony-emailu.saveContent", {
    onSuccess: () => successToast("Šablona uložena."),
  });

  /** Vloží `{klíč}` na místo kurzoru v naposledy upravovaném poli (předmět, nebo text). */
  function insert(v: TemplateVariable) {
    const token = `{${v.key}}`;
    const useSubject = lastField.current === "subject";
    const el = useSubject ? subjectRef.current : bodyRef.current;
    const value = useSubject ? subject : body;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    (useSubject ? setSubject : setBody)(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const unknownInDraft = view?.unknown ?? [];
  const used = findVariables(`${subject}\n${body}`);

  return (
    <div className="grid gap-4 p-1 @3xl:grid-cols-2" data-testid="template-editor">
      <div className="flex flex-col gap-3">
        <div>
          <label
            htmlFor={`tpl-subject-${id}`}
            className="mb-1.5 block text-sm font-medium text-muted"
          >
            Předmět
          </label>
          <Input
            id={`tpl-subject-${id}`}
            ref={subjectRef}
            value={subject}
            readOnly={!canWrite}
            onFocus={() => (lastField.current = "subject")}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={500}
          />
        </div>
        <div>
          <label htmlFor={`tpl-body-${id}`} className="mb-1.5 block text-sm font-medium text-muted">
            Text e-mailu
          </label>
          <Textarea
            id={`tpl-body-${id}`}
            ref={bodyRef}
            value={body}
            readOnly={!canWrite}
            onFocus={() => (lastField.current = "body")}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-64 font-sans"
            maxLength={50_000}
          />
        </div>
        {canWrite && (
          <div className="flex flex-col gap-2" data-testid="variable-palette">
            <span className="text-sm font-medium text-muted">
              Vložit proměnnou (na místo kurzoru)
            </span>
            {grouped.map((g) => (
              <div key={g.source} className="flex flex-wrap items-center gap-1.5">
                <span className="w-24 text-sm text-faint">{SOURCE_LABEL[g.source]}</span>
                {g.items.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    data-var={v.key}
                    title={
                      v.available ? v.label : `${v.label} (modul není zapnutý, hodnota se nevyplní)`
                    }
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insert(v)}
                    className="rounded-full"
                  >
                    <Chip color={v.available ? "gray" : "yellow"}>{`{${v.key}}`}</Chip>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          {canWrite && (
            <Button
              variant="primary"
              disabled={!dirty}
              loading={save.isPending}
              data-testid="save-content"
              onClick={() =>
                save.mutate(
                  { id, subject, bodyText: body, expectedUpdatedAt: row.updatedAt },
                  { onError: (e) => errorToast(e.message) },
                )
              }
            >
              Uložit
            </Button>
          )}
          {canWrite && dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setSubject(savedSubject);
                setBody(savedBody);
              }}
            >
              Zahodit změny
            </Button>
          )}
          {dirty && <span className="text-sm text-warning">Neuložené změny</span>}
          <span className="ml-auto text-sm text-faint" data-testid="usage-count">
            Použito {Number(row.usageCount ?? 0)}×
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <RecordPicker
          value={picked}
          onChange={(kind, o) =>
            setPicked((p) => {
              const next = { ...p };
              if (o) next[kind] = o;
              else delete next[kind];
              return next;
            })
          }
        />
        <section
          className="flex flex-col gap-2 rounded-md border border-line bg-subtle p-3"
          aria-label="Živý náhled"
        >
          <h3 className="text-sm font-medium text-muted">Náhled</h3>
          {view ? (
            <>
              <div className="font-medium" data-testid="editor-preview-subject">
                <PreviewParts parts={view.subjectParts} />
              </div>
              <div
                className="whitespace-pre-wrap rounded bg-bg p-2"
                data-testid="editor-preview-body"
              >
                <PreviewParts parts={view.bodyParts} />
              </div>
              {view.to && <p className="text-sm text-muted">Komu: {view.to}</p>}
              {view.missing.length > 0 && view.filled && (
                <p className="text-sm text-danger" role="status" data-testid="editor-missing">
                  Pro vybraný záznam chybí: {view.missing.map((k) => `{${k}}`).join(", ")}.
                </p>
              )}
            </>
          ) : (
            <p className="text-muted">Náhled se načítá…</p>
          )}
          {unknownInDraft.length > 0 && (
            <p className="text-sm text-warning" role="status" data-testid="editor-unknown">
              Neznámá proměnná: {unknownInDraft.map((k) => `{${k}}`).join(", ")}. Zkontrolujte
              překlep.
            </p>
          )}
          {used.length === 0 && (
            <p className="text-sm text-faint">Text zatím nepoužívá žádnou proměnnou.</p>
          )}
        </section>
      </div>
    </div>
  );
}
