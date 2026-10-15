"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Chip,
  Input,
  Skeleton,
  errorToast,
  successToast,
  useCommandMutation,
  useCommandQuery,
} from "@rebar/ui";
import type {
  EmailEntityType,
  LogActivityResult,
  MarkUsedResult,
  RenderResult,
  TemplateOption,
} from "../contract";
import { copyText, LANGUAGE_LABELS, PreviewParts, useDebounced, type Language } from "./shared";

/**
 * Dialog „E-mail ze šablony“ (SAB-03): výběr šablony, náhled vyplněný daty záznamu a dvě cesty ven: Otevřít v Gmailu
 * (připravený e-mail s adresátem, předmětem a textem) nebo Kopírovat. Z OPSYS se nic neodesílá (SAB-05). Po otevření
 * v Gmailu nabídne jedním klikem zapsat e-mail jako hotovou aktivitu (SAB-04).
 */
export function EmailFromTemplate({
  entityType,
  id,
  onClose,
}: {
  entityType: EmailEntityType;
  id: string;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState<Language | "all">("all");
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  /** Šablony, jejichž použití se už v tomto dialogu započítalo (jedno otevření = jedno použití). */
  const [counted, setCounted] = useState<ReadonlySet<string>>(new Set());
  const [offer, setOffer] = useState<"offer" | "logged" | null>(null);
  /** Modul úkolů je zapnutý, takže jde nabídnout zápis aktivity (vrací `markUsed`). */
  const [canLog, setCanLog] = useState(false);

  const dq = useDebounced(q.trim());
  const list = useCommandQuery<TemplateOption[]>("sablony-emailu.templates", {
    ...(dq ? { q: dq } : {}),
    ...(language !== "all" ? { language } : {}),
  });
  const templates = useMemo(
    () => (list.data ?? []).filter((t) => !category || t.category === category),
    [list.data, category],
  );
  const categories = useMemo(
    () => [...new Set((list.data ?? []).map((t) => t.category).filter((c): c is string => !!c))],
    [list.data],
  );

  const preview = useCommandQuery<RenderResult>(
    "sablony-emailu.render",
    { entityType, id, templateId: selected ?? "" },
    { enabled: !!selected },
  );
  const view = preview.data;

  const markUsed = useCommandMutation<{ templateId: string }, MarkUsedResult>(
    "sablony-emailu.markUsed",
    { invalidate: [["entity", "email_template"]] },
  );
  const logActivity = useCommandMutation<
    { entityType: EmailEntityType; id: string; subject: string },
    LogActivityResult
  >("sablony-emailu.logActivity", { invalidate: [["entity"]] });

  /** Započítá použití (jednou na šablonu a otevření dialogu); vrací, zda jde nabídnout zápis aktivity. */
  async function count(templateId: string): Promise<boolean> {
    if (counted.has(templateId)) return canLog;
    try {
      const r = await markUsed.mutateAsync({ templateId });
      setCounted(new Set([...counted, templateId]));
      setCanLog(r.canLogActivity);
      return r.canLogActivity;
    } catch (e) {
      errorToast((e as Error).message);
      return false;
    }
  }

  async function openGmail() {
    if (!view?.gmailUrl || !selected) return;
    window.open(view.gmailUrl, "_blank", "noopener,noreferrer");
    if ((await count(selected)) && offer !== "logged") setOffer("offer");
  }

  async function copy(what: "body" | "subject") {
    if (!view || !selected) return;
    const ok = await copyText(what === "body" ? view.body : view.subject);
    if (!ok)
      return errorToast("Kopírování se nepovedlo. Označte text v náhledu a zkopírujte ho ručně.");
    successToast(what === "body" ? "Text e-mailu zkopírován." : "Předmět zkopírován.");
    await count(selected);
  }

  async function record() {
    if (!view) return;
    try {
      await logActivity.mutateAsync({
        entityType,
        id,
        subject: view.subject || view.template.name,
      });
      setOffer("logged");
      successToast("E-mail zapsán jako hotová aktivita.");
    } catch (e) {
      errorToast((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="email-from-template">
      <div className="flex flex-col gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Hledat šablonu podle názvu nebo předmětu"
          aria-label="Hledat šablonu"
        />
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtr šablon">
          {(["all", "cs", "sk", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLanguage(l)}
              aria-pressed={language === l}
              className="rounded-full"
            >
              <Chip color={language === l ? "blue" : "gray"}>
                {l === "all" ? "Všechny jazyky" : LANGUAGE_LABELS[l]}
              </Chip>
            </button>
          ))}
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(category === c ? null : c)}
              aria-pressed={category === c}
              className="rounded-full"
            >
              <Chip color={category === c ? "blue" : "gray"}>{c}</Chip>
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex max-h-56 flex-col gap-1 overflow-auto rounded-md border border-line p-1"
        role="listbox"
        aria-label="Šablony e-mailů"
      >
        {list.isLoading && <Skeleton className="h-10 w-full" />}
        {!list.isLoading && templates.length === 0 && (
          <p className="px-2 py-3 text-muted" data-testid="no-templates">
            Žádná šablona nevyhovuje. Šablony se zakládají v Marketing → Šablony e-mailů.
          </p>
        )}
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            role="option"
            aria-selected={selected === t.id}
            data-template={t.name}
            onClick={() => {
              setSelected(t.id);
              setOffer(null);
            }}
            className={
              "flex flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-hover " +
              (selected === t.id ? "bg-accent-soft" : "")
            }
          >
            <span className="flex items-center gap-2">
              <span className="font-medium">{t.name}</span>
              {t.category && <Chip>{t.category}</Chip>}
              <span className="text-sm text-faint">{LANGUAGE_LABELS[t.language]}</span>
              <span className="ml-auto text-sm text-faint">{t.usageCount}×</span>
            </span>
            <span className="truncate text-sm text-muted">{t.subject || t.snippet}</span>
          </button>
        ))}
      </div>

      {selected && (
        <section
          className="flex flex-col gap-2 rounded-md border border-line bg-subtle p-3"
          aria-label="Náhled e-mailu"
        >
          {preview.isLoading && <Skeleton className="h-24 w-full" />}
          {preview.isError && (
            <p className="text-danger" role="alert">
              {(preview.error as Error).message}
            </p>
          )}
          {view && (
            <>
              <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1">
                <dt className="text-muted">Komu</dt>
                <dd data-testid="preview-to">
                  {view.to ?? (
                    <span className="text-warning">Adresát nemá e-mail, vyplňte ho v Gmailu.</span>
                  )}
                </dd>
                <dt className="text-muted">Předmět</dt>
                <dd className="font-medium" data-testid="preview-subject">
                  <PreviewParts parts={view.subjectParts} />
                </dd>
              </dl>
              <div
                className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-bg p-2"
                data-testid="preview-body"
              >
                <PreviewParts parts={view.bodyParts} />
              </div>
              {view.missing.length > 0 && (
                <p className="text-sm text-danger" role="status" data-testid="preview-missing">
                  Chybí hodnota pro: {view.missing.map((k) => `{${k}}`).join(", ")}. V e-mailu
                  zůstane prázdné místo.
                </p>
              )}
              {view.unknown.length > 0 && (
                <p className="text-sm text-warning" role="status">
                  Neznámá proměnná: {view.unknown.map((k) => `{${k}}`).join(", ")}. Zkontrolujte
                  šablonu.
                </p>
              )}
              {view.tooLong && (
                <p className="text-sm text-warning" role="status" data-testid="preview-too-long">
                  E-mail je příliš dlouhý pro odkaz do Gmailu. Použijte Kopírovat a vložte text do
                  nové zprávy.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  disabled={!view.gmailUrl}
                  onClick={() => void openGmail()}
                  data-testid="open-gmail"
                >
                  Otevřít v Gmailu
                </Button>
                <Button onClick={() => void copy("body")} data-testid="copy-body">
                  Kopírovat text
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void copy("subject")}
                  data-testid="copy-subject"
                >
                  Kopírovat předmět
                </Button>
              </div>
              <p className="text-sm text-faint">
                E-mail se z OPSYS neodesílá: připraví se v Gmailu, kde ho zkontrolujete a odešlete
                sami.
              </p>
            </>
          )}
        </section>
      )}

      {offer === "offer" && view && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-accent-line bg-accent-soft p-3"
          role="status"
          data-testid="log-offer"
        >
          <span className="mr-auto">Odeslali jste e-mail? Zapsat ho jako hotovou aktivitu?</span>
          <Button
            variant="primary"
            size="sm"
            loading={logActivity.isPending}
            onClick={() => void record()}
            data-testid="log-activity"
          >
            Zapsat aktivitu
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOffer(null)}>
            Ne
          </Button>
        </div>
      )}
      {offer === "logged" && (
        <p className="text-success" role="status" data-testid="log-done">
          Aktivita zapsána.
        </p>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Zavřít
        </Button>
      </div>
    </div>
  );
}
