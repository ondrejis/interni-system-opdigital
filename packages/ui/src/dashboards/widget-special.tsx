"use client";

import {
  NO_VIEW_ID,
  type AggFn,
  type DashboardWidget,
  type MetricInfo,
} from "@rebar/core/dashboards-shared";
import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button, IconButton } from "../components/button";
import { Field, Input } from "../components/input";
import type { SourceCatalog } from "./api";

/*
  Nastavení widgetů Přehledu, které nejsou „souhrn z entity“: Číslo a Seznam z pohledu, Rychlé odkazy, Moje úkoly a
  dlaždice modulů. Obecný editor je pro ně schová pod jednu sekci (typ a zdroj se u hotových widgetů nemění).
*/

const selectCls =
  "h-8 w-full rounded-md border border-line-strong bg-bg px-2 text-base text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] disabled:opacity-50";

/** Widget má vlastní nastavení (a obecný výběr typu a zdroje se nezobrazuje). */
export function isSpecialSource(w: DashboardWidget, _metric?: MetricInfo): boolean {
  const s = w.source;
  if (s.kind === "view" || s.kind === "links") return true;
  if (s.kind === "builtin") return !!s.params?.tileIds?.length;
  return false;
}

/** Kontrola nastavení speciálních widgetů (pohled, odkazy); věta pro uživatele, nebo `null`. */
export function validateSpecial(w: DashboardWidget): string | null {
  const s = w.source;
  if (s.kind === "view") {
    if (s.viewId === NO_VIEW_ID) return "Vyberte uložený pohled.";
    if (w.type === "kpi" && s.agg && s.agg.fn !== "count" && !s.agg.attr)
      return "Vyberte pole, které se má sečíst.";
  }
  if (s.kind === "links") {
    if (s.links.some((l) => !l.title.trim() || !l.href.trim()))
      return "Vyplňte název i adresu každého odkazu, nebo prázdný odkaz odeberte.";
    if (s.links.some((l) => !/^(\/(?!\/)\S*|https?:\/\/\S+)$/i.test(l.href.trim())))
      return "Adresa odkazu musí začínat „/“ (stránka v systému) nebo „https://“.";
    if (!s.links.length && !s.viewIds.length) return "Přidejte aspoň jeden odkaz nebo pohled.";
  }
  return null;
}

const AGG: { value: AggFn; label: string }[] = [
  { value: "count", label: "Počet záznamů" },
  { value: "sum", label: "Součet pole" },
];

export function SpecialFields({
  w,
  set,
  catalog,
}: {
  w: DashboardWidget;
  set: (p: Partial<DashboardWidget>) => void;
  catalog: SourceCatalog | undefined;
}): ReactNode {
  const s = w.source;
  const views = catalog?.views ?? [];

  if (s.kind === "view") {
    const view = views.find((v) => v.id === s.viewId);
    return (
      <>
        <Field
          label="Uložený pohled"
          htmlFor="ws-view"
          hint="Pohled z libovolného seznamu (uložte ho tlačítkem Uložit pohled). Čte se stejně jako seznam: každý vidí jen své."
        >
          <select
            id="ws-view"
            className={selectCls}
            value={s.viewId}
            onChange={(e) => {
              const v = views.find((x) => x.id === e.target.value);
              set({
                source: {
                  ...s,
                  viewId: e.target.value,
                  ...(w.type === "kpi" ? { agg: { fn: "count" as const } } : {}),
                },
                ...(v && /^(Číslo|Seznam) z pohledu$/.test(w.title) ? { title: v.name } : {}),
              });
            }}
          >
            <option value={NO_VIEW_ID}>Vyberte pohled…</option>
            {views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.entityLabel})
              </option>
            ))}
          </select>
        </Field>
        {w.type === "kpi" && (
          <>
            <Field label="Co spočítat" htmlFor="ws-agg">
              <select
                id="ws-agg"
                className={selectCls}
                value={s.agg?.fn ?? "count"}
                onChange={(e) => {
                  const fn = e.target.value as AggFn;
                  set({
                    source: {
                      ...s,
                      agg:
                        fn === "count"
                          ? { fn }
                          : { fn, attr: view?.numericAttrs[0]?.key ?? s.agg?.attr },
                    },
                  });
                }}
              >
                {AGG.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
            {s.agg && s.agg.fn !== "count" && (
              <Field label="Pole" htmlFor="ws-attr">
                <select
                  id="ws-attr"
                  className={selectCls}
                  value={s.agg.attr ?? ""}
                  onChange={(e) =>
                    set({ source: { ...s, agg: { fn: s.agg!.fn, attr: e.target.value } } })
                  }
                >
                  <option value="">Vyberte pole…</option>
                  {(view?.numericAttrs ?? []).map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
        )}
        {w.type === "table" && (
          <Field label="Počet řádků" htmlFor="ws-limit" hint="Prvních N řádků v pořadí pohledu.">
            <Input
              id="ws-limit"
              type="number"
              min={1}
              max={50}
              value={s.limit ?? 10}
              onChange={(e) =>
                set({
                  source: {
                    ...s,
                    limit: Math.min(50, Math.max(1, Math.round(Number(e.target.value)) || 10)),
                  },
                })
              }
            />
          </Field>
        )}
      </>
    );
  }

  if (s.kind === "links") {
    const patch = (links: typeof s.links) => set({ source: { ...s, links } });
    return (
      <>
        <fieldset className="mb-3" data-testid="links-editor">
          <legend className="mb-1 text-sm font-medium">Vlastní odkazy</legend>
          <ul className="space-y-2">
            {s.links.map((l, i) => (
              <li key={i} className="flex items-center gap-2">
                <Input
                  aria-label={`Název odkazu ${i + 1}`}
                  placeholder="Název"
                  value={l.title}
                  maxLength={60}
                  onChange={(e) =>
                    patch(s.links.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                  }
                />
                <Input
                  aria-label={`Adresa odkazu ${i + 1}`}
                  placeholder="/obchody nebo https://…"
                  value={l.href}
                  maxLength={300}
                  onChange={(e) =>
                    patch(s.links.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))
                  }
                />
                <IconButton
                  label="Odebrat odkaz"
                  variant="ghost"
                  size="sm"
                  onClick={() => patch(s.links.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ul>
          {s.links.length < 12 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => patch([...s.links, { title: "", href: "" }])}
              data-testid="links-add"
            >
              <Plus /> Přidat odkaz
            </Button>
          )}
        </fieldset>
        {views.length > 0 && (
          <fieldset className="mb-3">
            <legend className="mb-1 text-sm font-medium">Uložené pohledy</legend>
            <ul className="max-h-40 space-y-1 overflow-auto">
              {views.map((v) => (
                <li key={v.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={s.viewIds.includes(v.id)}
                      onChange={(e) =>
                        set({
                          source: {
                            ...s,
                            viewIds: e.target.checked
                              ? [...s.viewIds, v.id].slice(0, 12)
                              : s.viewIds.filter((x) => x !== v.id),
                          },
                        })
                      }
                    />
                    {v.name} <span className="text-muted">({v.entityLabel})</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </>
    );
  }

  if (s.kind === "builtin" && s.builtin === "my_tasks") {
    return (
      <>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!s.params?.includeDelegated}
            onChange={(e) =>
              set({ source: { ...s, params: { ...s.params, includeDelegated: e.target.checked } } })
            }
            data-testid="ws-delegated"
          />
          Zahrnout i delegované úkoly (zadal jsem je já, řeší je někdo jiný)
        </label>
        <Field label="Nejvíc úkolů" htmlFor="ws-tasks-limit">
          <Input
            id="ws-tasks-limit"
            type="number"
            min={1}
            max={30}
            value={s.params?.limit ?? 8}
            onChange={(e) =>
              set({
                source: {
                  ...s,
                  params: {
                    ...s.params,
                    limit: Math.min(30, Math.max(1, Math.round(Number(e.target.value)) || 8)),
                  },
                },
              })
            }
          />
        </Field>
      </>
    );
  }

  return (
    <p className="mb-3 text-sm text-muted">
      Údaje dodává modul. Tady se nastavuje jen název a velikost widgetu.
    </p>
  );
}
