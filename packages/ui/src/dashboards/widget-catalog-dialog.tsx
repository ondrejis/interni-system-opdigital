"use client";

import type { WidgetPresetInfo, WidgetType } from "@rebar/core/dashboards-shared";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Chip } from "../components/badges";
import { Button } from "../components/button";
import { Input } from "../components/input";
import { Dialog, DialogContent } from "../components/overlay";

const CUSTOM: [WidgetType, string, string][] = [
  [
    "kpi",
    "Číslo (KPI)",
    "Jedno číslo z libovolných dat, volitelně se srovnáním s předchozím obdobím.",
  ],
  ["chart", "Graf", "Sloupcový, čárový, koláčový, skládaný graf nebo časová řada."],
  ["table", "Tabulka", "Nejvyšší položky podle součtu nebo seznam záznamů ve sloupcích."],
  ["list", "Seznam", "Například nejbližší termíny nebo moje úkoly."],
  ["status", "Souhrn podle stavu", "Počty a součty záznamů podle stavu."],
  ["gauge", "Měřidlo (cíl)", "Hodnota proti cíli."],
];

/**
 * Katalog widgetů („Přidat widget“): hotové widgety Přehledu seskupené podle tématu a vlastní widget z libovolných dat.
 * Nabídka je už filtrovaná serverem podle zapnutých modulů a oprávnění uživatele.
 */
export function WidgetCatalogDialog({
  presets,
  onPick,
  onCustom,
  onClose,
}: {
  presets: WidgetPresetInfo[];
  onPick: (p: WidgetPresetInfo) => void;
  onCustom: (type: WidgetType) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("cs");
    const hit = presets.filter(
      (p) =>
        !needle ||
        p.title.toLocaleLowerCase("cs").includes(needle) ||
        p.description.toLocaleLowerCase("cs").includes(needle) ||
        p.group.toLocaleLowerCase("cs").includes(needle),
    );
    const by = new Map<string, WidgetPresetInfo[]>();
    for (const p of hit) by.set(p.group, [...(by.get(p.group) ?? []), p]);
    return [...by.entries()];
  }, [presets, q]);
  const customHit = CUSTOM.filter(
    ([, label]) =>
      !q.trim() || label.toLocaleLowerCase("cs").includes(q.trim().toLocaleLowerCase("cs")),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Přidat widget"
        className="!w-[min(52rem,calc(100vw-1.5rem))] !top-[4vh] !max-h-[92vh]"
      >
        <div className="px-5 py-4" data-testid="widget-catalog">
          <label className="sr-only" htmlFor="catalog-q">
            Hledat widget
          </label>
          <Input
            id="catalog-q"
            placeholder="Hledat widget…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mb-4"
          />
          {groups.map(([group, items]) => (
            <section key={group} className="mb-5" aria-label={group}>
              <h3 className="mb-2 text-sm font-semibold text-muted">{group}</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {items.map((p) => (
                  <li
                    key={p.key}
                    className="flex flex-col justify-between gap-2 rounded-lg border border-line p-3"
                    data-testid="catalog-item"
                  >
                    <div>
                      <div className="flex items-center gap-2 font-medium">
                        {p.title}
                        {p.phase === "v2" && <Chip>v2</Chip>}
                      </div>
                      <p className="mt-0.5 text-sm text-muted">{p.description}</p>
                    </div>
                    <div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onPick(p)}
                        data-testid={`catalog-add-${p.key}`}
                      >
                        <Plus /> {p.configure ? "Přidat a nastavit" : "Přidat"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {customHit.length > 0 && (
            <section className="mb-2" aria-label="Vlastní widget">
              <h3 className="mb-2 text-sm font-semibold text-muted">
                Vlastní widget z libovolných dat
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {customHit.map(([type, label, hint]) => (
                  <li
                    key={type}
                    className="flex flex-col justify-between gap-2 rounded-lg border border-dashed border-line p-3"
                  >
                    <div>
                      <div className="font-medium">{label}</div>
                      <p className="mt-0.5 text-sm text-muted">{hint}</p>
                    </div>
                    <div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCustom(type)}
                        data-testid={`catalog-custom-${type}`}
                      >
                        <Plus /> Nastavit
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!groups.length && !customHit.length && (
            <p className="py-6 text-center text-muted">Nic takového v nabídce není.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
