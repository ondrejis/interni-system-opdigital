"use client";

import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Skeleton,
  successToast,
  useCommandQuery,
  type ComboOption,
} from "@rebar/ui";
import { useState } from "react";
import type { BudgetTreeView, SectionView } from "./types";
import type { SectionNode } from "./math";
import { plural } from "./ui-format";
import { useCmd } from "./use-cmd";

type SecNode = SectionNode<SectionView, unknown>;

/** Oddíly stromu jako volby výběru („Elektro › Rozvaděč“, u více objektů s názvem objektu). */
export function sectionOptions(tree: BudgetTreeView, exclude: ReadonlySet<string> = new Set()) {
  const out: ComboOption[] = [];
  for (const o of tree.objects) {
    const walk = (s: SecNode, path: string[]) => {
      if (exclude.has(s.id)) return;
      const names = [...path, s.title];
      out.push({
        value: s.id,
        label: (tree.singleObject ? names : [o.title, ...names]).join(" › "),
      });
      s.children.forEach((c) => walk(c, names));
    };
    o.sections.forEach((s) => walk(s as unknown as SecNode, []));
  }
  return out;
}

/** Přesun vybraných položek do jiného oddílu. */
export function MoveItemsDialog({
  tree,
  ids,
  onClose,
}: {
  tree: BudgetTreeView;
  ids: string[];
  onClose: () => void;
}) {
  const bulk = useCmd("zakazky.budget.item.bulk");
  const [target, setTarget] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Přesunout do oddílu"
        description={`Položek: ${ids.length}`}
        className="top-[18vh] w-[min(28rem,calc(100vw-2rem))]"
      >
        <div className="px-5 py-4">
          <Combobox
            options={sectionOptions(tree)}
            value={target}
            onChange={(v) => setTarget(v as string | null)}
            placeholder="Vyberte oddíl…"
            searchPlaceholder="Najít oddíl…"
            aria-label="Cílový oddíl"
          />
        </div>
        <div className="flex justify-end gap-2 px-5 pb-4">
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button
            variant="primary"
            disabled={!target}
            loading={bulk.pending}
            onClick={async () => {
              const r = await bulk.run({ ids, patch: { sectionId: target } });
              if (r) onClose();
            }}
          >
            Přesunout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Hromadná změna cen: procentem nahoru / dolů (prodejní, nákladové, obě). */
export function PriceAdjustDialog({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const bulk = useCmd("zakazky.budget.item.bulk");
  const [target, setTarget] = useState<"price" | "cost" | "both">("price");
  const [text, setText] = useState("");
  const value = Number(text.replace(",", ".").replace(/[\s%+]/g, ""));
  const valid = text.trim() !== "" && Number.isFinite(value) && value >= -100 && value <= 1000;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Upravit ceny o procento"
        description={`Položek: ${ids.length}`}
        className="top-[18vh] w-[min(28rem,calc(100vw-2rem))]"
      >
        <div className="px-5 py-4">
          <SegmentedControl
            label="Které ceny"
            value={target}
            onChange={setTarget}
            options={[
              { value: "price", label: "Prodejní" },
              { value: "cost", label: "Nákladové" },
              { value: "both", label: "Obě" },
            ]}
          />
          <div className="mt-3">
            <Field label="Změna v procentech (např. 5 nebo −10)">
              <Input
                autoFocus
                inputMode="decimal"
                value={text}
                aria-invalid={text !== "" && !valid}
                onChange={(e) => setText(e.target.value.replace("−", "-"))}
                onKeyDown={(e) =>
                  e.key === "Enter" && valid && e.currentTarget.form?.requestSubmit()
                }
              />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-4">
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            loading={bulk.pending}
            onClick={async () => {
              const r = await bulk.run({
                ids,
                patch: {
                  ...(target !== "cost" ? { priceAdjustPct: value } : {}),
                  ...(target !== "price" ? { costAdjustPct: value } : {}),
                },
              });
              if (r) onClose();
            }}
          >
            Použít
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  summary: { sections: number; items: number; tasks: number; roles: number; hasBudget: boolean };
};

/** Výběr šablony zakázky pro prázdný rozpočet (kostra oddílů a položek, úkoly, role týmu). */
export function TemplatePickerDialog({
  jobId,
  versionId,
  onClose,
}: {
  jobId: string;
  versionId: string | null;
  onClose: () => void;
}) {
  const q = useCommandQuery<TemplateRow[]>("zakazky.template.list", {});
  const apply = useCmd<Record<string, unknown>, { sections: number; items: number; tasks: number }>(
    "zakazky.template.apply",
  );
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Použít šablonu"
        description="Rozpočet se naplní kostrou ze šablony."
        className="top-[12vh] w-[min(34rem,calc(100vw-2rem))]"
      >
        <div className="px-5 py-4">
          {q.isLoading ? (
            <Skeleton className="h-20" />
          ) : !q.data?.length ? (
            <EmptyState
              title="Zatím žádné šablony"
              description="Šablonu vytvoříte z hotové zakázky akcí „Uložit jako šablonu“."
            />
          ) : (
            <ul
              role="listbox"
              aria-label="Šablony"
              className="divide-y divide-line rounded-lg border border-line"
            >
              {q.data.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={picked === t.id}
                    onClick={() => setPicked(t.id)}
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-hover aria-selected:bg-accent-soft"
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="text-sm text-muted">
                      {t.description ? `${t.description} · ` : ""}
                      {t.summary.hasBudget
                        ? `${plural(t.summary.sections, "oddíl", "oddíly", "oddílů")}, ${plural(t.summary.items, "položka", "položky", "položek")}`
                        : "bez rozpočtu"}
                      {t.summary.tasks
                        ? `, ${plural(t.summary.tasks, "úkol", "úkoly", "úkolů")}`
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-4">
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button
            variant="primary"
            disabled={!picked}
            loading={apply.pending}
            onClick={async () => {
              const r = await apply.run({ jobId, templateId: picked, versionId });
              if (r) {
                successToast(
                  `Šablona použita: ${plural(r.sections, "oddíl", "oddíly", "oddílů")}, ${plural(r.items, "položka", "položky", "položek")}.`,
                );
                onClose();
              }
            }}
          >
            Použít šablonu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
