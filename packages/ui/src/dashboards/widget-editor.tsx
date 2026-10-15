"use client";

import {
  AGG_FUNCTIONS,
  BUCKETS,
  CHART_KINDS,
  COMPARE_LABELS,
  WIDGET_WIDTHS,
  MAX_WIDGET_HEIGHT,
  type AggFn,
  type Bucket,
  type ChartKind,
  type CompareMode,
  type DashboardFilters,
  type DashboardWidget,
  type EntitySource,
  type MetricInfo,
  type RecordsSource,
  type ValueFormat,
  type WidgetType,
} from "@rebar/core/dashboards-shared";
import type { AttributeDescriptor, FilterGroup } from "@rebar/core/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "../components/button";
import { Combobox } from "../components/combobox";
import { Field, Input } from "../components/input";
import { Dialog, DialogContent } from "../components/overlay";
import { useEntityApi } from "../data/context";
import { FilterBar } from "../data/filter-bar";
import { completeFilters } from "../data/filters";
import { cn } from "../lib/cn";
import type { SourceCatalog } from "./api";
import { isSpecialSource, SpecialFields, validateSpecial } from "./widget-special";
import { WidgetCard } from "./widget-card";

const TYPE_LABEL: Record<WidgetType, string> = {
  kpi: "Číslo (KPI)",
  chart: "Graf",
  table: "Tabulka (top N)",
  list: "Seznam",
  status: "Souhrn podle stavu",
  gauge: "Měřidlo (cíl)",
  builtin: "Vestavěný blok",
};
const TYPE_HINT: Record<WidgetType, string> = {
  kpi: "Jedno číslo, volitelně se srovnáním s předchozím obdobím.",
  chart: "Sloupcový, čárový, koláčový, skládaný graf nebo časová řada.",
  table: "Nejvyšší položky podle součtu / počtu, nebo seznam záznamů ve sloupcích.",
  list: "Například moje úkoly nebo blížící se termíny.",
  status: "Počty (a součty) záznamů podle stavu, například zakázky podle stavu.",
  gauge: "Hodnota proti cíli (plnění v %).",
  builtin: "Vyžaduje pozornost, dlaždice modulů, moje úkoly.",
};
const CHART_LABEL: Record<ChartKind, string> = {
  bar: "Sloupcový",
  stacked: "Skládaný sloupcový",
  line: "Čárový",
  timeseries: "Časová řada (plocha)",
  pie: "Koláčový",
  donut: "Donut",
};
const AGG_LABEL: Record<AggFn, string> = {
  count: "Počet záznamů",
  sum: "Součet",
  avg: "Průměr",
  min: "Minimum / nejdřívější",
  max: "Maximum / nejpozdější",
};
const BUCKET_LABEL: Record<Bucket, string> = {
  day: "po dnech",
  week: "po týdnech",
  month: "po měsících",
  quarter: "po čtvrtletích",
  year: "po letech",
};
const BUILTIN_LABEL = {
  attention: "Vyžaduje pozornost",
  tiles: "Dlaždice modulů (neuhrazené faktury, sklad…)",
  my_tasks: "Moje úkoly",
} as const;

const GROUPABLE = [
  "status",
  "select",
  "user",
  "record",
  "checkbox",
  "text",
  "email",
  "phone",
  "date",
];
const SPLITTABLE = ["status", "select", "user", "record", "checkbox"];

const selectCls =
  "h-8 w-full rounded-md border border-line-strong bg-bg px-2 text-base text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] disabled:opacity-50";

function Select<T extends string>({
  value,
  onChange,
  options,
  id,
  label,
}: {
  value: T | "";
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  id?: string;
  label?: string;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      className={selectCls}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const newId = () => `w-${Math.random().toString(36).slice(2, 10)}`;

const DEFAULT_SIZE: Record<WidgetType, { w: number; h: number }> = {
  kpi: { w: 3, h: 1 },
  gauge: { w: 3, h: 1 },
  chart: { w: 6, h: 3 },
  table: { w: 6, h: 3 },
  list: { w: 6, h: 3 },
  status: { w: 6, h: 2 },
  builtin: { w: 12, h: 2 },
};

/** Nový prázdný widget daného typu s rozumným výchozím zdrojem. */
export const newWidgetId = () => newId();

export function newWidget(type: WidgetType, catalog: SourceCatalog | undefined): DashboardWidget {
  const entity = catalog?.entities[0]?.key ?? "job";
  const base = { id: newId(), type, title: TYPE_LABEL[type], ...DEFAULT_SIZE[type] };
  switch (type) {
    case "kpi":
    case "gauge":
      return {
        ...base,
        source: { kind: "entity", entity, agg: { fn: "count" } },
        options: type === "gauge" ? { target: 10 } : { compare: "none" },
      };
    case "chart":
      return {
        ...base,
        source: { kind: "entity", entity, agg: { fn: "count" } },
        options: { chart: "bar" },
      };
    case "status":
      return { ...base, source: { kind: "entity", entity, agg: { fn: "count" } } };
    case "builtin":
      return {
        ...base,
        title: BUILTIN_LABEL.attention,
        source: { kind: "builtin", builtin: "attention" },
      };
    case "list":
      return { ...base, source: { kind: "builtin", builtin: "my_tasks" }, title: "Moje úkoly" };
    case "table":
      return { ...base, source: { kind: "entity", entity, agg: { fn: "count" } } };
  }
}

type Props = {
  widget: DashboardWidget;
  catalog: SourceCatalog | undefined;
  filters: DashboardFilters;
  isNew: boolean;
  onSave: (w: DashboardWidget) => void;
  onClose: () => void;
};

/**
 * Editor widgetu: typ, zdroj (entita nebo pojmenovaná metrika), filtry stejné jako v seznamech, agregace, seskupení,
 * řazení a limit, vzhled. Náhled se vyhodnocuje na serveru s oprávněními uživatele, takže editor nabídne a ukáže jen to,
 * co smí vidět.
 */
export function WidgetEditor({ widget, catalog, filters, isNew, onSave, onClose }: Props) {
  const [w, setW] = useState<DashboardWidget>(widget);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<DashboardWidget>) => setW((s) => ({ ...s, ...p }));
  const src = w.source;
  const entityKey = src.kind === "entity" || src.kind === "records" ? src.entity : null;
  const entityApi = useEntityApi();
  const desc = useQuery({
    queryKey: ["dashboards", "describe", entityKey],
    queryFn: () => entityApi.describe(entityKey!),
    enabled: !!entityKey,
    staleTime: 60_000,
  });
  const attrs: AttributeDescriptor[] = desc.data?.attributes ?? [];
  const metric: MetricInfo | undefined =
    src.kind === "metric" ? catalog?.metrics.find((m) => m.key === src.metric) : undefined;

  // druhy zdroje, které typ widgetu připouští
  type Kind = "entity" | "metric" | "records" | "builtin";
  const special = isSpecialSource(w, metric);
  const kinds: Record<WidgetType, Kind[]> = {
    kpi: ["entity", "metric"],
    gauge: ["entity", "metric"],
    chart: ["entity", "metric"],
    table: ["records", "entity", "metric"],
    list: ["records", "builtin", "metric"],
    status: ["entity"],
    builtin: ["builtin"],
  };
  const KIND_LABEL = {
    entity: "Souhrn ze záznamů",
    records: "Seznam záznamů",
    metric: "Pojmenovaná metrika",
    builtin: "Vestavěný zdroj",
  } as const;

  function changeType(type: WidgetType) {
    const fresh = newWidget(type, catalog);
    setW((s) => ({
      ...fresh,
      id: s.id,
      title: s.title === TYPE_LABEL[s.type] || !s.title ? fresh.title : s.title,
      w: fresh.w,
      h: fresh.h,
    }));
  }

  function changeKind(kind: Kind) {
    const entity = entityKey ?? catalog?.entities[0]?.key ?? "job";
    if (kind === "entity") set({ source: { kind: "entity", entity, agg: { fn: "count" } } });
    else if (kind === "records")
      set({ source: { kind: "records", entity, columns: [], limit: 10 } });
    else if (kind === "metric") {
      const m = catalog?.metrics.find((x) =>
        w.type === "kpi" || w.type === "gauge"
          ? x.shape === "scalar"
          : w.type === "list"
            ? x.shape === "list"
            : x.shape === "series",
      );
      set({
        source: { kind: "metric", metric: m?.key ?? "" },
        ...(m ? { options: { ...w.options, format: m.format } } : {}),
      });
    } else
      set({ source: { kind: "builtin", builtin: w.type === "list" ? "my_tasks" : "attention" } });
  }

  function patchEntity(p: Partial<EntitySource>) {
    if (src.kind === "entity") set({ source: { ...src, ...p } });
  }
  function patchRecords(p: Partial<RecordsSource>) {
    if (src.kind === "records") set({ source: { ...src, ...p } });
  }

  const dateAttrs = attrs.filter((a) => a.type === "date");
  const numericAttrs = attrs.filter((a) => a.type === "number" || a.type === "currency");
  const aggAttrs = (fn: AggFn) =>
    fn === "min" || fn === "max" ? [...numericAttrs, ...dateAttrs] : numericAttrs;
  const groupAttrs = attrs.filter((a) => GROUPABLE.includes(a.type) && a.type !== "longtext");

  function entityChanged(key: string) {
    if (src.kind === "entity")
      set({ source: { kind: "entity", entity: key, agg: { fn: "count" } } });
    else if (src.kind === "records")
      set({ source: { kind: "records", entity: key, columns: [], limit: src.limit ?? 10 } });
  }

  // náhled: widget bez nehotových podmínek filtru
  const preview = useMemo<DashboardWidget>(() => {
    if (w.source.kind === "entity" || w.source.kind === "records") {
      const f = completeFilters(w.source.filters);
      return { ...w, source: { ...w.source, filters: f } as typeof w.source };
    }
    return w;
  }, [w]);
  const previewReady = useMemo(() => validate(preview, attrs) === null, [preview, attrs]);

  function submit() {
    const problem = validate(preview, attrs);
    if (problem) return setError(problem);
    setError(null);
    onSave(preview);
  }

  const targetUnit =
    w.type === "gauge"
      ? (w.options?.format ?? metric?.format ?? entityFormat(src, attrs)) === "money"
        ? 100
        : 1
      : 1;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={isNew ? "Nový widget" : "Upravit widget"}
        className="!w-[min(64rem,calc(100vw-1.5rem))] !top-[4vh] !max-h-[92vh]"
      >
        <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <form
            className="min-w-0"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            data-testid="widget-editor"
          >
            {!special && (
              <Field label="Typ widgetu" htmlFor="we-type" hint={TYPE_HINT[w.type]}>
                <Select
                  id="we-type"
                  value={w.type}
                  onChange={changeType}
                  options={(Object.keys(TYPE_LABEL) as WidgetType[]).map((t) => ({
                    value: t,
                    label: TYPE_LABEL[t],
                  }))}
                />
              </Field>
            )}
            <Field label="Název widgetu" htmlFor="we-title">
              <Input
                id="we-title"
                value={w.title}
                maxLength={80}
                onChange={(e) => set({ title: e.target.value })}
              />
            </Field>

            {special && <SpecialFields w={w} set={set} catalog={catalog} />}

            {!special && kinds[w.type].length > 1 && (
              <Field label="Odkud data jsou" htmlFor="we-kind">
                <Select
                  id="we-kind"
                  value={src.kind as Kind}
                  onChange={changeKind}
                  options={kinds[w.type].map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                />
              </Field>
            )}

            {!special && src.kind === "builtin" && (
              <Field label="Blok" htmlFor="we-builtin">
                <Select
                  id="we-builtin"
                  value={src.builtin}
                  onChange={(b) => {
                    set({
                      source: { kind: "builtin", builtin: b },
                      title:
                        w.title === BUILTIN_LABEL[src.builtin] || !w.title
                          ? BUILTIN_LABEL[b]
                          : w.title,
                    });
                  }}
                  options={(w.type === "list"
                    ? (["my_tasks"] as const)
                    : (["attention", "tiles", "my_tasks"] as const)
                  ).map((b) => ({ value: b, label: BUILTIN_LABEL[b] }))}
                />
              </Field>
            )}

            {!special && (src.kind === "entity" || src.kind === "records") && (
              <>
                <Field label="Záznamy" htmlFor="we-entity">
                  <Select
                    id="we-entity"
                    value={src.entity}
                    onChange={entityChanged}
                    options={(catalog?.entities ?? []).map((e) => ({
                      value: e.key,
                      label: e.label,
                    }))}
                  />
                </Field>
                <div className="mb-3">
                  <div className="mb-1.5 text-sm font-medium text-muted">Filtr záznamů</div>
                  {desc.data ? (
                    <FilterBar
                      attributes={attrs}
                      value={src.filters as FilterGroup | undefined}
                      onChange={(f) =>
                        src.kind === "entity"
                          ? patchEntity({ filters: f })
                          : patchRecords({ filters: f })
                      }
                      lookups={entityApi.lookups}
                    />
                  ) : (
                    <p className="text-sm text-faint">Načítám atributy…</p>
                  )}
                </div>
              </>
            )}

            {src.kind === "entity" && desc.data && (
              <EntityFields
                w={w}
                src={src}
                attrs={attrs}
                aggAttrs={aggAttrs(src.agg.fn)}
                groupAttrs={groupAttrs}
                patch={patchEntity}
              />
            )}

            {src.kind === "records" && desc.data && (
              <>
                <Field label="Sloupce (první je název řádku)" htmlFor="we-cols">
                  <Combobox
                    multiple
                    value={src.columns}
                    onChange={(v) => patchRecords({ columns: (v as string[]) ?? [] })}
                    options={attrs.map((a) => ({ value: a.key, label: a.label }))}
                    placeholder="Vyberte sloupce"
                    searchPlaceholder="Hledat sloupec…"
                    aria-label="Sloupce"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Řadit podle" htmlFor="we-sortattr">
                    <Select
                      id="we-sortattr"
                      value={src.sort?.[0]?.attr ?? ""}
                      onChange={(a) =>
                        patchRecords({
                          sort: a ? [{ attr: a, dir: src.sort?.[0]?.dir ?? "asc" }] : [],
                        })
                      }
                      options={[
                        { value: "", label: "Bez řazení" },
                        ...attrs
                          .filter((a) => a.sortable)
                          .map((a) => ({ value: a.key, label: a.label })),
                      ]}
                    />
                  </Field>
                  <Field label="Směr" htmlFor="we-sortdir">
                    <Select
                      id="we-sortdir"
                      value={src.sort?.[0]?.dir ?? "asc"}
                      onChange={(d) =>
                        src.sort?.[0] &&
                        patchRecords({ sort: [{ attr: src.sort[0].attr, dir: d }] })
                      }
                      options={[
                        { value: "asc", label: "Vzestupně (nejbližší)" },
                        { value: "desc", label: "Sestupně (nejvyšší)" },
                      ]}
                    />
                  </Field>
                  <Field label="Počet řádků" htmlFor="we-limit">
                    <Input
                      id="we-limit"
                      type="number"
                      min={1}
                      max={50}
                      value={src.limit ?? 10}
                      onChange={(e) =>
                        patchRecords({ limit: clamp(Number(e.target.value), 1, 50) })
                      }
                    />
                  </Field>
                </div>
              </>
            )}

            {(src.kind === "entity" || src.kind === "records") && desc.data && (
              <PeriodFields
                src={src}
                dateAttrs={dateAttrs}
                attrs={attrs}
                onChange={(p) => (src.kind === "entity" ? patchEntity(p) : patchRecords(p))}
              />
            )}

            {!special && src.kind === "metric" && (
              <>
                <Field label="Metrika" htmlFor="we-metric" hint={metric?.description}>
                  <Select
                    id="we-metric"
                    value={src.metric}
                    onChange={(key) => {
                      const m = catalog?.metrics.find((x) => x.key === key);
                      set({
                        source: { kind: "metric", metric: key },
                        ...(m ? { options: { ...w.options, format: m.format } } : {}),
                      });
                    }}
                    options={[
                      { value: "", label: "Vyberte metriku…" },
                      ...(catalog?.metrics ?? [])
                        .filter((m) =>
                          w.type === "kpi" || w.type === "gauge"
                            ? m.shape === "scalar"
                            : w.type === "list"
                              ? m.shape === "list"
                              : m.shape === "series",
                        )
                        .map((m) => ({ value: m.key, label: m.label })),
                    ]}
                  />
                </Field>
                {metric?.params.map((p) => (
                  <Field key={p.key} label={p.label} htmlFor={`we-p-${p.key}`}>
                    {p.type === "select" ? (
                      <Select
                        id={`we-p-${p.key}`}
                        value={String(src.params?.[p.key] ?? p.default ?? "")}
                        onChange={(v) =>
                          set({ source: { ...src, params: { ...src.params, [p.key]: v } } })
                        }
                        options={(p.choices ?? []).map((c) => ({ value: c.value, label: c.label }))}
                      />
                    ) : (
                      <Input
                        id={`we-p-${p.key}`}
                        type="number"
                        value={String(src.params?.[p.key] ?? p.default ?? "")}
                        onChange={(e) =>
                          set({
                            source: {
                              ...src,
                              params: { ...src.params, [p.key]: Number(e.target.value) },
                            },
                          })
                        }
                      />
                    )}
                  </Field>
                ))}
                {metric?.supports.bucket && w.type !== "kpi" && (
                  <Field label="Členění v čase" htmlFor="we-mbucket">
                    <Select
                      id="we-mbucket"
                      value={src.bucket ?? ""}
                      onChange={(b) =>
                        set({ source: { ...src, ...(b ? { bucket: b as Bucket } : {}) } })
                      }
                      options={[
                        { value: "", label: "Podle délky období" },
                        ...BUCKETS.map((b) => ({ value: b, label: BUCKET_LABEL[b] })),
                      ]}
                    />
                  </Field>
                )}
                {(w.type === "chart" || w.type === "table") && metric?.shape === "series" && (
                  <Field label="Počet položek" htmlFor="we-mlimit">
                    <Input
                      id="we-mlimit"
                      type="number"
                      min={1}
                      max={100}
                      value={src.limit ?? 12}
                      onChange={(e) =>
                        set({ source: { ...src, limit: clamp(Number(e.target.value), 1, 100) } })
                      }
                    />
                  </Field>
                )}
              </>
            )}

            {w.type === "chart" && (
              <Field label="Druh grafu" htmlFor="we-chart">
                <Select
                  id="we-chart"
                  value={w.options?.chart ?? "bar"}
                  onChange={(c) => set({ options: { ...w.options, chart: c } })}
                  options={CHART_KINDS.filter((c) => c !== "stacked" || src.kind === "entity").map(
                    (c) => ({ value: c, label: CHART_LABEL[c] }),
                  )}
                />
              </Field>
            )}
            {w.type === "kpi" && (src.kind === "entity" || metric?.supports.period) && (
              <Field
                label="Srovnání"
                htmlFor="we-compare"
                hint="Funguje, když je na nástěnce zvolené období."
              >
                <Select
                  id="we-compare"
                  value={w.options?.compare ?? "none"}
                  onChange={(c) => set({ options: { ...w.options, compare: c as CompareMode } })}
                  options={(Object.keys(COMPARE_LABELS) as CompareMode[]).map((c) => ({
                    value: c,
                    label: COMPARE_LABELS[c],
                  }))}
                />
              </Field>
            )}
            {w.type === "gauge" && (
              <Field
                label={`Cíl${targetUnit === 100 ? " (Kč)" : ""}`}
                htmlFor="we-target"
                hint="Plnění se ukáže jako podíl hodnoty z cíle."
              >
                <Input
                  id="we-target"
                  type="number"
                  min={0}
                  step="any"
                  value={w.options?.target !== undefined ? w.options.target / targetUnit : ""}
                  onChange={(e) =>
                    set({
                      options: {
                        ...w.options,
                        target: Math.max(0, Number(e.target.value) || 0) * targetUnit,
                      },
                    })
                  }
                />
              </Field>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Šířka" htmlFor="we-w">
                <Select
                  id="we-w"
                  value={String(w.w)}
                  onChange={(v) => set({ w: Number(v) })}
                  options={WIDGET_WIDTHS.map((x) => ({
                    value: String(x),
                    label: {
                      3: "Čtvrtina",
                      4: "Třetina",
                      6: "Polovina",
                      8: "Dvě třetiny",
                      12: "Celá šířka",
                    }[x]!,
                  }))}
                />
              </Field>
              <Field label="Výška" htmlFor="we-h">
                <Select
                  id="we-h"
                  value={String(w.h)}
                  onChange={(v) => set({ h: Number(v) })}
                  options={Array.from({ length: MAX_WIDGET_HEIGHT }, (_, i) => ({
                    value: String(i + 1),
                    label: `${i + 1} ${i === 0 ? "řádek" : i < 4 ? "řádky" : "řádků"}`,
                  }))}
                />
              </Field>
            </div>

            {error && (
              <p
                role="alert"
                className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
              >
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <Button type="button" variant="ghost" onClick={onClose}>
                Zrušit
              </Button>
              <Button type="submit" variant="primary" data-testid="widget-save">
                {isNew ? "Přidat na nástěnku" : "Uložit widget"}
              </Button>
            </div>
          </form>
          <aside
            aria-label="Náhled widgetu"
            className={cn("min-w-0", "lg:sticky lg:top-0 lg:self-start")}
          >
            <div className="mb-1.5 text-sm font-medium text-muted">Náhled</div>
            <div className="min-h-[9rem]" data-testid="widget-preview">
              {previewReady ? (
                <WidgetCard
                  key={JSON.stringify(preview)}
                  widget={{ ...preview, h: Math.min(preview.h, 3) }}
                  filters={filters}
                  refreshKey={0}
                  hideMenu
                />
              ) : (
                <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
                  Dokončete nastavení (zdroj, seskupení, sloupce) a ukáže se náhled.
                </p>
              )}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(n) ? Math.round(n) : lo));

function entityFormat(src: DashboardWidget["source"], attrs: AttributeDescriptor[]): ValueFormat {
  if (src.kind !== "entity" || src.agg.fn === "count") return "number";
  const a = attrs.find((x) => x.key === src.agg.attr);
  return a?.type === "currency" ? "money" : a?.unit ? "percent" : "number";
}

/** Kontrola v editoru; server ověří všechno znovu schématem a oprávněními. Vrací větu, nebo `null`. */
export function validate(w: DashboardWidget, attrs: AttributeDescriptor[]): string | null {
  if (!w.title.trim()) return "Vyplňte název widgetu.";
  const s = w.source;
  const specialProblem = validateSpecial(w);
  if (specialProblem) return specialProblem;
  if (s.kind === "metric" && !s.metric) return "Vyberte metriku.";
  if (s.kind === "records") {
    if (!s.columns.length) return "Vyberte aspoň jeden sloupec.";
  }
  if (s.kind === "entity") {
    if (s.agg.fn !== "count" && !s.agg.attr)
      return "Vyberte, ze kterého atributu se hodnota počítá.";
    const grouped = w.type === "chart" || w.type === "status" || (w.type === "table" && true);
    if (grouped && !s.groupBy?.attr) return "Vyberte, podle čeho se má seskupovat.";
    if (w.type === "status" && attrs.length) {
      const g = attrs.find((a) => a.key === s.groupBy?.attr);
      if (g && g.type !== "status" && g.type !== "select")
        return "Souhrn podle stavu seskupuje podle atributu typu stav nebo výběr.";
    }
  }
  if (w.type === "gauge" && !(w.options?.target && w.options.target > 0))
    return "Zadejte cíl měřidla větší než nula.";
  return null;
}

function EntityFields({
  w,
  src,
  attrs,
  aggAttrs,
  groupAttrs,
  patch,
}: {
  w: DashboardWidget;
  src: EntitySource;
  attrs: AttributeDescriptor[];
  aggAttrs: AttributeDescriptor[];
  groupAttrs: AttributeDescriptor[];
  patch: (p: Partial<EntitySource>) => void;
}) {
  const grouped = w.type === "chart" || w.type === "status" || w.type === "table";
  const groupAttr = attrs.find((a) => a.key === src.groupBy?.attr);
  const isDate = groupAttr?.type === "date";
  const statusAttrs = groupAttrs.filter((a) => a.type === "status" || a.type === "select");
  const splitAttrs = attrs.filter(
    (a) => SPLITTABLE.includes(a.type) && a.key !== src.groupBy?.attr,
  );
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Co se počítá" htmlFor="we-fn">
          <Select
            id="we-fn"
            value={src.agg.fn}
            onChange={(fn) =>
              patch({
                agg: { fn, ...(fn !== "count" && src.agg.attr ? { attr: src.agg.attr } : {}) },
              })
            }
            options={AGG_FUNCTIONS.map((f) => ({ value: f, label: AGG_LABEL[f] }))}
          />
        </Field>
        {src.agg.fn !== "count" && (
          <Field label="Z atributu" htmlFor="we-attr">
            <Select
              id="we-attr"
              value={src.agg.attr ?? ""}
              onChange={(a) => patch({ agg: { fn: src.agg.fn, ...(a ? { attr: a } : {}) } })}
              options={[
                { value: "", label: "Vyberte atribut…" },
                ...aggAttrs.map((a) => ({ value: a.key, label: a.label })),
              ]}
            />
          </Field>
        )}
      </div>
      {grouped && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={w.type === "status" ? "Stav (seskupit podle)" : "Seskupit podle"}
              htmlFor="we-group"
            >
              <Select
                id="we-group"
                value={src.groupBy?.attr ?? ""}
                onChange={(a) => {
                  const next = (w.type === "status" ? statusAttrs : groupAttrs).find(
                    (x) => x.key === a,
                  );
                  patch({
                    groupBy: a
                      ? { attr: a, ...(next?.type === "date" ? { bucket: "month" as Bucket } : {}) }
                      : undefined,
                  });
                }}
                options={[
                  { value: "", label: "Vyberte atribut…" },
                  ...(w.type === "status" ? statusAttrs : groupAttrs).map((a) => ({
                    value: a.key,
                    label: a.label,
                  })),
                ]}
              />
            </Field>
            {isDate && (
              <Field label="Členění v čase" htmlFor="we-bucket">
                <Select
                  id="we-bucket"
                  value={src.groupBy?.bucket ?? "month"}
                  onChange={(b) => patch({ groupBy: { attr: src.groupBy!.attr, bucket: b } })}
                  options={BUCKETS.map((b) => ({ value: b, label: BUCKET_LABEL[b] }))}
                />
              </Field>
            )}
          </div>
          {w.type === "chart" && (w.options?.chart ?? "bar") === "stacked" && (
            <Field label="Rozpad v sloupci podle" htmlFor="we-split">
              <Select
                id="we-split"
                value={src.splitBy ?? ""}
                onChange={(a) => patch({ splitBy: a || undefined })}
                options={[
                  { value: "", label: "Bez rozpadu" },
                  ...splitAttrs.map((a) => ({ value: a.key, label: a.label })),
                ]}
              />
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Řadit podle" htmlFor="we-sortby">
              <Select
                id="we-sortby"
                value={src.sort?.by ?? (isDate ? "label" : "value")}
                onChange={(by) =>
                  patch({ sort: { by, dir: src.sort?.dir ?? (by === "value" ? "desc" : "asc") } })
                }
                options={[
                  { value: "value", label: "Hodnoty" },
                  { value: "label", label: isDate ? "Období" : "Názvu skupiny" },
                ]}
              />
            </Field>
            <Field label="Směr" htmlFor="we-sortdir2">
              <Select
                id="we-sortdir2"
                value={src.sort?.dir ?? (isDate ? "asc" : "desc")}
                onChange={(dir) =>
                  patch({ sort: { by: src.sort?.by ?? (isDate ? "label" : "value"), dir } })
                }
                options={[
                  { value: "desc", label: "Sestupně" },
                  { value: "asc", label: "Vzestupně" },
                ]}
              />
            </Field>
            <Field label="Nejvýše položek" htmlFor="we-lim">
              <Input
                id="we-lim"
                type="number"
                min={1}
                max={100}
                value={src.limit ?? (isDate ? 24 : 10)}
                onChange={(e) => patch({ limit: clamp(Number(e.target.value), 1, 100) })}
              />
            </Field>
          </div>
        </>
      )}
      {w.type === "table" && !src.groupBy && (
        <p className="mb-3 text-sm text-muted">
          Vyberte seskupení, nebo přepněte zdroj na „Seznam záznamů“.
        </p>
      )}
    </>
  );
}

function PeriodFields({
  src,
  dateAttrs,
  attrs,
  onChange,
}: {
  src: EntitySource | RecordsSource;
  dateAttrs: AttributeDescriptor[];
  attrs: AttributeDescriptor[];
  onChange: (p: {
    dateAttr?: string | undefined;
    jobAttr?: string | undefined;
    personAttr?: string | undefined;
  }) => void;
}): ReactNode {
  const jobAttrs = attrs.filter((a) => a.type === "record" && a.record?.entityType === "job");
  const userAttrs = attrs.filter((a) => a.type === "user");
  if (!dateAttrs.length && jobAttrs.length < 2 && userAttrs.length < 2) return null;
  return (
    <fieldset className="mb-3 rounded-md border border-line p-3">
      <legend className="px-1 text-sm font-medium text-muted">Vazba na filtry nástěnky</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {dateAttrs.length > 0 && (
          <Field label="Období podle data" htmlFor="we-dateattr">
            <Select
              id="we-dateattr"
              value={src.dateAttr ?? ""}
              onChange={(a) => onChange({ dateAttr: a || undefined })}
              options={[
                { value: "", label: "Období se neuplatní" },
                ...dateAttrs.map((a) => ({ value: a.key, label: a.label })),
              ]}
            />
          </Field>
        )}
        {jobAttrs.length > 1 && (
          <Field label="Zakázka podle" htmlFor="we-jobattr">
            <Select
              id="we-jobattr"
              value={src.jobAttr ?? ""}
              onChange={(a) => onChange({ jobAttr: a || undefined })}
              options={[
                { value: "", label: "Automaticky" },
                ...jobAttrs.map((a) => ({ value: a.key, label: a.label })),
              ]}
            />
          </Field>
        )}
        {userAttrs.length > 1 && (
          <Field label="Osoba podle" htmlFor="we-userattr">
            <Select
              id="we-userattr"
              value={src.personAttr ?? ""}
              onChange={(a) => onChange({ personAttr: a || undefined })}
              options={[
                { value: "", label: "Automaticky" },
                ...userAttrs.map((a) => ({ value: a.key, label: a.label })),
              ]}
            />
          </Field>
        )}
      </div>
    </fieldset>
  );
}
