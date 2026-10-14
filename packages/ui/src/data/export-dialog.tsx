"use client";

import type { AttributeDescriptor, FilterGroup } from "@rebar/core/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/button";
import { Field, Input } from "../components/input";
import { Checkbox, Dialog, DialogContent } from "../components/overlay";
import { SegmentedControl } from "../components/segmented-control";
import { errorToast, successToast } from "../components/toast";
import { useEntityApi } from "./context";
import { useCan } from "./module-ui";

/** Formát souboru exportu seznamu. */
export type ExportFormat = "xlsx" | "csv" | "pdf";
/** Pohled seznamu, který se exportuje: filtry, řazení, hledání. */
export type ExportQuery = {
  filters?: FilterGroup | undefined;
  sort?: { attr: string; dir: "asc" | "desc" }[] | undefined;
  q?: string | undefined;
};

/** Požadavek na export seznamu (formát, rozsah, sloupce, pohled, název souboru). */
export type ExportRequest = {
  format: ExportFormat;
  scope: "view" | "all";
  columns: string[];
  query: ExportQuery;
  fileName?: string | undefined;
  background?: boolean | undefined;
  templateId?: string | undefined;
};

/** Spustí export na serveru. Malý se rovnou stáhne, velký se zařadí do fronty (odpověď 202) a čeká v „Moje exporty“. */
export async function runExport(
  entityKey: string,
  req: ExportRequest,
): Promise<"downloaded" | "queued"> {
  const res = await fetch(`/api/export/${entityKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      format: req.format,
      scope: req.scope,
      columns: req.columns,
      ...(req.scope === "view" ? { query: req.query } : {}),
      ...(req.fileName ? { fileName: req.fileName } : {}),
      ...(req.background ? { background: true } : {}),
      ...(req.templateId ? { templateId: req.templateId } : {}),
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Export se nepodařil.");
  }
  if (res.status === 202) return "queued";
  const blob = await res.blob();
  const name = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get("content-disposition") ?? "")?.[1];
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name ? decodeURIComponent(name) : `export.${req.format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const count = res.headers.get("x-export-count");
  successToast(count ? `Exportováno záznamů: ${count}.` : "Export je stažený.");
  return "downloaded";
}

/** Oznámení, že velký export běží na pozadí. */
export function notifyQueued() {
  successToast(
    "Velký export se zpracovává na pozadí. Hotový soubor najdete v Nastavení → Exporty.",
  );
}

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "xlsx", label: "Excel" },
  { value: "csv", label: "CSV" },
  { value: "pdf", label: "PDF" },
];

/**
 * Export seznamu: formát, rozsah (aktuální pohled s filtry a řazením, nebo všechno), výběr sloupců, název souboru,
 * šablony (uložená sada sloupců a filtrů, sdílená v týmu). Co se smí exportovat, určuje server (oprávnění, skryté sloupce).
 */
export function ExportDialog({
  open,
  onOpenChange,
  entityKey,
  entityLabel,
  attributes,
  currentColumns,
  query,
  total,
  initialTemplateId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entityKey: string;
  entityLabel: string;
  attributes: AttributeDescriptor[];
  /** Sloupce zobrazené v tabulce (výchozí výběr). */
  currentColumns: string[];
  query: ExportQuery;
  total: number | undefined;
  initialTemplateId?: string | undefined;
}) {
  const api = useEntityApi();
  const qc = useQueryClient();
  const can = useCan();
  const canShare = can("exports.schedule");
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [scope, setScope] = useState<"view" | "all">("view");
  const [columns, setColumns] = useState<string[]>(currentColumns);
  const [fileName, setFileName] = useState("");
  const [background, setBackground] = useState(false);
  const [busy, setBusy] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [tplQuery, setTplQuery] = useState<ExportQuery | null>(null);
  const [saveAs, setSaveAs] = useState("");
  const [shared, setShared] = useState(false);

  const templates = useQuery({
    queryKey: ["export-templates", entityKey],
    queryFn: () => api.exports?.templates(entityKey) ?? Promise.resolve([]),
    enabled: open && !!api.exports,
  });

  // při otevření se výběr sloupců vrátí na aktuální tabulku (nebo se použije šablona z adresy)
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setColumns(currentColumns);
      setTemplateId(null);
      setTplQuery(null);
      setScope("view");
    }
  }
  useEffect(() => {
    if (!open || !initialTemplateId || templateId === initialTemplateId) return;
    const t = templates.data?.find((x) => x.id === initialTemplateId);
    if (t) applyTemplate(t.id);
    // jen když se načtou šablony
  }, [open, templates.data, initialTemplateId]);

  function applyTemplate(id: string) {
    const t = templates.data?.find((x) => x.id === id);
    if (!t) {
      setTemplateId(null);
      setTplQuery(null);
      return;
    }
    setTemplateId(t.id);
    setFormat(t.spec.format);
    setScope(t.spec.scope);
    if (t.spec.columns?.length)
      setColumns(t.spec.columns.filter((k) => attributes.some((a) => a.key === k)));
    setFileName(t.spec.fileName ?? "");
    setTplQuery(t.spec.query ?? {});
  }

  const effectiveQuery = tplQuery ?? query;
  const toggle = (key: string) =>
    setColumns((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));
  const sizeText =
    scope === "view" && !tplQuery && total !== undefined
      ? `${total.toLocaleString("cs-CZ")} záznamů`
      : scope === "all"
        ? "všechny záznamy, které smíte vidět"
        : "záznamy podle šablony";

  async function go() {
    if (!columns.length) return errorToast("Vyberte aspoň jeden sloupec.");
    setBusy(true);
    try {
      const r = await runExport(entityKey, {
        format,
        scope,
        columns,
        query: effectiveQuery,
        fileName: fileName.trim() || undefined,
        background: background || undefined,
        templateId: templateId ?? undefined,
      });
      if (r === "queued") notifyQueued();
      onOpenChange(false);
    } catch (e) {
      errorToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (!saveAs.trim() || !api.exports) return;
    try {
      await api.exports.saveTemplate({
        name: saveAs.trim(),
        shared,
        spec: {
          entity: entityKey,
          format,
          scope,
          columns,
          ...(scope === "view" ? { query: effectiveQuery } : {}),
          ...(fileName.trim() ? { fileName: fileName.trim() } : {}),
        },
      });
      successToast("Šablona exportu je uložená.");
      setSaveAs("");
      await qc.invalidateQueries({ queryKey: ["export-templates", entityKey] });
    } catch (e) {
      errorToast((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Export: ${entityLabel.toLowerCase()}`}
        description="Soubor obsahuje jen to, co smíte v systému vidět."
        className="!w-[min(40rem,calc(100vw-1.5rem))]"
      >
        <form
          className="px-5 py-4"
          data-testid="export-dialog"
          onSubmit={(e) => {
            e.preventDefault();
            void go();
          }}
        >
          {api.exports && (templates.data?.length ?? 0) > 0 && (
            <Field label="Šablona" htmlFor="exp-template">
              <div className="flex gap-2">
                <select
                  id="exp-template"
                  className="h-8 w-full rounded-md border border-line-strong bg-bg px-2 text-base"
                  value={templateId ?? ""}
                  onChange={(e) => applyTemplate(e.target.value)}
                >
                  <option value="">Bez šablony (aktuální pohled)</option>
                  {templates.data!.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.shared ? " (sdílená)" : ""}
                    </option>
                  ))}
                </select>
                {templateId && templates.data?.find((t) => t.id === templateId)?.mine && (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Smazat šablonu"
                    onClick={async () => {
                      try {
                        await api.exports!.deleteTemplate(templateId);
                        setTemplateId(null);
                        setTplQuery(null);
                        await qc.invalidateQueries({ queryKey: ["export-templates", entityKey] });
                      } catch (e) {
                        errorToast((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </Field>
          )}
          <Field label="Formát" htmlFor="exp-format">
            <SegmentedControl
              label="Formát souboru"
              options={FORMATS}
              value={format}
              onChange={setFormat}
            />
          </Field>
          <Field label="Co exportovat" htmlFor="exp-scope" hint={sizeText}>
            <SegmentedControl
              label="Rozsah exportu"
              options={[
                { value: "view", label: "Aktuální pohled" },
                { value: "all", label: "Vše" },
              ]}
              value={scope}
              onChange={setScope}
            />
          </Field>
          <fieldset className="mb-3">
            <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-medium text-muted">
              Sloupce ({columns.length})
              <span className="flex gap-2 text-sm font-normal">
                <button
                  type="button"
                  className="text-accent-text hover:underline"
                  onClick={() => setColumns(currentColumns)}
                >
                  Jako v tabulce
                </button>
                <button
                  type="button"
                  className="text-accent-text hover:underline"
                  onClick={() => setColumns(attributes.map((a) => a.key))}
                >
                  Všechny
                </button>
              </span>
            </legend>
            <div className="grid max-h-48 grid-cols-1 gap-x-4 gap-y-1 overflow-auto rounded-md border border-line p-2 sm:grid-cols-2">
              {attributes.map((a) => (
                <label key={a.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={columns.includes(a.key)}
                    onCheckedChange={() => toggle(a.key)}
                  />
                  <span className="truncate">{a.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            label="Název souboru (bez přípony)"
            htmlFor="exp-name"
            hint="{datum} se nahradí dnešním datem."
          >
            <Input
              id="exp-name"
              value={fileName}
              maxLength={80}
              placeholder={`${entityLabel.toLowerCase()}-{datum}`}
              onChange={(e) => setFileName(e.target.value)}
            />
          </Field>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <Checkbox checked={background} onCheckedChange={(c) => setBackground(c === true)} />
            Zpracovat na pozadí (soubor najdete v Nastavení → Exporty)
          </label>
          {api.exports && (
            <div className="mb-3 rounded-md border border-line p-3">
              <div className="mb-1.5 text-sm font-medium text-muted">Uložit jako šablonu</div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Název šablony"
                  className="max-w-56"
                  value={saveAs}
                  maxLength={60}
                  placeholder="Název šablony"
                  onChange={(e) => setSaveAs(e.target.value)}
                />
                {canShare && (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={shared} onCheckedChange={(c) => setShared(c === true)} />
                    Sdílet v týmu
                  </label>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!saveAs.trim()}
                  onClick={() => void saveTemplate()}
                >
                  Uložit šablonu
                </Button>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={busy} data-testid="export-run">
              Exportovat
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
