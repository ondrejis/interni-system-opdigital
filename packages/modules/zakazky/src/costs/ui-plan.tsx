"use client";

import { formatMinor } from "@rebar/core/shared";
import { Chip, EmptyState, Skeleton, cn, useCommandQuery } from "@rebar/ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { drawdownTone, type Metrics } from "./plan";
import { DrawdownBar, fmtPct } from "./ui-shared";
import { UnpairedCostsCard } from "./ui-list";

type SectionNode = {
  id: string;
  code: string | null;
  title: string;
  metrics: Metrics;
  children: SectionNode[];
};
type ObjectNode = {
  id: string;
  code: string | null;
  title: string;
  isDefault: boolean;
  metrics: Metrics;
  sections: SectionNode[];
};
type Plan = {
  versionId: string | null;
  objects: ObjectNode[];
  totals: Metrics;
  unpairedActualMinor: number;
  unassignedOrderedMinor: number;
  unpairedCount: number;
};
type Summary = {
  contractMinor: number;
  originalContractMinor: number;
  approvedChangesMinor: number;
  plannedCostMinor: number;
  costMinor: number;
  drawdownPct: number | null;
  marginMinor: number;
  marginPct: number | null;
  plannedMarginMinor: number;
  plannedMarginPct: number | null;
  health: "ok" | "warning" | "danger" | null;
};

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "success" | "warning";
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-sm text-muted">{label}</div>
      <div
        className={cn(
          "tabular mt-0.5 text-xl font-semibold",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-sm text-muted">{hint}</div>}
    </div>
  );
}

/** „Původní → aktuální“ jen tam, kde se hodnota změnila schválenou změnou. */
function Was({ original, current }: { original: number; current: number }) {
  if (original === current) return null;
  return <div className="text-xs text-faint">původně {formatMinor(original)}</div>;
}

function Row({
  label,
  code,
  m,
  depth,
  kind,
  open,
  onToggle,
  hasChildren,
}: {
  label: string;
  code: string | null;
  m: Metrics;
  depth: number;
  kind: "object" | "section";
  open?: boolean;
  onToggle?: () => void;
  hasChildren?: boolean;
}) {
  const tone = drawdownTone(m);
  return (
    <tr
      className={cn("h-9 align-top", kind === "object" && "bg-subtle font-semibold")}
      data-testid={kind === "section" ? "plan-row" : "plan-object"}
    >
      <td className="px-3 py-1.5" style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}>
        <span className="inline-flex items-center gap-1">
          {hasChildren ? (
            <button
              type="button"
              className="-ml-1 flex size-5 items-center justify-center rounded text-muted hover:bg-hover"
              aria-label={open ? `Sbalit ${label}` : `Rozbalit ${label}`}
              aria-expanded={open}
              onClick={onToggle}
            >
              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          ) : (
            <span className="size-5" />
          )}
          {code && <span className="text-muted">{code}</span>}
          <span>{label}</span>
        </span>
      </td>
      <td className="tabular px-3 py-1.5 text-right">
        {formatMinor(m.plannedSellMinor)}
        <Was original={m.originalSellMinor} current={m.plannedSellMinor} />
      </td>
      <td className="tabular px-3 py-1.5 text-right">
        {formatMinor(m.plannedCostMinor)}
        <Was original={m.originalCostMinor} current={m.plannedCostMinor} />
      </td>
      <td className="tabular px-3 py-1.5 text-right font-medium">{formatMinor(m.actualMinor)}</td>
      <td className="tabular px-3 py-1.5 text-right text-muted">
        {m.orderedMinor ? formatMinor(m.orderedMinor) : "–"}
      </td>
      <td
        className={cn(
          "tabular px-3 py-1.5 text-right",
          m.varianceMinor < 0 ? "text-danger" : "text-muted",
        )}
      >
        {m.plannedCostMinor || m.actualMinor ? formatMinor(m.varianceMinor) : "–"}
      </td>
      <td className="px-3 py-1.5">
        <DrawdownBar pct={m.drawdownPct} tone={tone} />
      </td>
      <td className="tabular px-3 py-1.5 text-right text-muted">
        {fmtPct(m.plannedMarginPct)}
        {m.actualMinor > 0 && m.actualMarginPct !== null && (
          <span className={m.actualMarginPct < (m.plannedMarginPct ?? 0) - 10 ? "text-danger" : ""}>
            {" → "}
            {fmtPct(m.actualMarginPct)}
          </span>
        )}
      </td>
    </tr>
  );
}

function Rows({
  nodes,
  depth,
  collapsed,
  toggle,
}: {
  nodes: SectionNode[];
  depth: number;
  collapsed: Set<string>;
  toggle: (id: string) => void;
}) {
  return (
    <>
      {nodes.map((s) => (
        <FragmentRows key={s.id} s={s} depth={depth} collapsed={collapsed} toggle={toggle} />
      ))}
    </>
  );
}

function FragmentRows({
  s,
  depth,
  collapsed,
  toggle,
}: {
  s: SectionNode;
  depth: number;
  collapsed: Set<string>;
  toggle: (id: string) => void;
}) {
  const open = !collapsed.has(s.id);
  return (
    <>
      <Row
        label={s.title}
        code={s.code}
        m={s.metrics}
        depth={depth}
        kind="section"
        open={open}
        hasChildren={s.children.length > 0}
        onToggle={() => toggle(s.id)}
      />
      {open && s.children.length > 0 && (
        <Rows nodes={s.children} depth={depth + 1} collapsed={collapsed} toggle={toggle} />
      )}
    </>
  );
}

/** Přehled nákladů: plán vs skutečnost po oddílech rozpočtu, čerpání, marže a nespárované náklady nahoře. */
export function CostOverviewTab({ id, openCosts }: { id: string; openCosts?: () => void }) {
  const plan = useCommandQuery<Plan>("zakazky.costs.plan", { jobId: id });
  const sum = useCommandQuery<Summary>("zakazky.summary", { jobId: id });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (sid: string) =>
    setCollapsed((cur) => {
      const n = new Set(cur);
      if (n.has(sid)) n.delete(sid);
      else n.add(sid);
      return n;
    });
  if (plan.isLoading || !plan.data) return <Skeleton className="h-40" />;
  const p = plan.data;
  const s = sum.data;
  const t = p.totals;
  const multi = p.objects.filter((o) => !o.isDefault).length > 0;
  const tone = drawdownTone(t);

  return (
    <div className="space-y-4" data-testid="cost-overview">
      <UnpairedCostsCard jobId={id} {...(openCosts ? { onOpenAll: openCosts } : {})} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Plánovaný náklad"
          value={formatMinor(t.plannedCostMinor)}
          hint={
            t.originalCostMinor !== t.plannedCostMinor
              ? `původně ${formatMinor(t.originalCostMinor)}`
              : `plánovaná marže ${fmtPct(t.plannedMarginPct)}`
          }
        />
        <Stat
          label="Skutečné náklady"
          value={formatMinor(t.actualMinor)}
          hint={`čerpání ${fmtPct(t.drawdownPct)}`}
          {...(tone === "over"
            ? { tone: "danger" as const }
            : tone === "warn"
              ? { tone: "warning" as const }
              : {})}
        />
        <Stat
          label="Objednáno, nepokryto"
          value={formatMinor(t.orderedMinor)}
          hint={`s objednávkami ${formatMinor(t.actualMinor + t.orderedMinor)}`}
        />
        <Stat
          label="Marže"
          value={s ? formatMinor(s.marginMinor) : "–"}
          hint={s ? `${fmtPct(s.marginPct)} · plán ${fmtPct(s.plannedMarginPct)}` : undefined}
          tone={s && s.marginMinor < 0 ? "danger" : "success"}
        />
      </div>

      {!p.versionId || !p.objects.some((o) => o.sections.length) ? (
        <EmptyState
          title="Zakázka nemá rozpočet"
          description="Plán vs skutečnost se počítá po oddílech rozpočtu. Založte rozpočet v záložce Rozpočet a náklady se k němu spárují."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[60rem] text-left">
            <thead className="bg-subtle text-sm text-muted">
              <tr className="h-9">
                <th className="px-3 font-medium">Oddíl</th>
                <th className="px-3 text-right font-medium">Plán prodej</th>
                <th className="px-3 text-right font-medium">Plán náklad</th>
                <th className="px-3 text-right font-medium">Skutečnost</th>
                <th className="px-3 text-right font-medium">Objednáno</th>
                <th className="px-3 text-right font-medium">Rozdíl</th>
                <th className="px-3 font-medium">Čerpání</th>
                <th className="px-3 text-right font-medium">Marže plán → skutečnost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {p.objects.map((o) => (
                <ObjectRows key={o.id} o={o} multi={multi} collapsed={collapsed} toggle={toggle} />
              ))}
              {(p.unpairedActualMinor !== 0 || p.unassignedOrderedMinor !== 0) && (
                <tr className="h-9 text-warning">
                  <td className="px-3 py-1.5">
                    Nespárováno s oddílem
                    {p.unpairedCount > 0 && (
                      <Chip color="yellow" className="ml-2">
                        {p.unpairedCount}
                      </Chip>
                    )}
                  </td>
                  <td />
                  <td />
                  <td className="tabular px-3 text-right">{formatMinor(p.unpairedActualMinor)}</td>
                  <td className="tabular px-3 text-right">
                    {p.unassignedOrderedMinor ? formatMinor(p.unassignedOrderedMinor) : "–"}
                  </td>
                  <td colSpan={3} />
                </tr>
              )}
            </tbody>
            <tfoot className="bg-subtle text-sm font-semibold">
              <tr className="h-9">
                <td className="px-3">Celkem</td>
                <td className="tabular px-3 text-right">{formatMinor(t.plannedSellMinor)}</td>
                <td className="tabular px-3 text-right">{formatMinor(t.plannedCostMinor)}</td>
                <td className="tabular px-3 text-right">{formatMinor(t.actualMinor)}</td>
                <td className="tabular px-3 text-right">{formatMinor(t.orderedMinor)}</td>
                <td className={cn("tabular px-3 text-right", t.varianceMinor < 0 && "text-danger")}>
                  {formatMinor(t.varianceMinor)}
                </td>
                <td className="px-3">
                  <DrawdownBar pct={t.drawdownPct} tone={tone} />
                </td>
                <td className="tabular px-3 text-right">{fmtPct(t.plannedMarginPct)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-sm text-faint">
        Všechny částky jsou bez DPH. Rozdíl je plánovaný náklad minus skutečný; objednáno je závazek
        ze schválených objednávek, který ještě nepokrývají náklady.
      </p>
    </div>
  );
}

function ObjectRows({
  o,
  multi,
  collapsed,
  toggle,
}: {
  o: ObjectNode;
  multi: boolean;
  collapsed: Set<string>;
  toggle: (id: string) => void;
}) {
  const open = !collapsed.has(o.id);
  return (
    <>
      {multi && (
        <Row
          label={o.title}
          code={o.code}
          m={o.metrics}
          depth={0}
          kind="object"
          open={open}
          hasChildren
          onToggle={() => toggle(o.id)}
        />
      )}
      {(!multi || open) && (
        <Rows nodes={o.sections} depth={multi ? 1 : 0} collapsed={collapsed} toggle={toggle} />
      )}
    </>
  );
}
