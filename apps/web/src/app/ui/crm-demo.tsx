"use client";

import type {
  EntityDescriptor,
  GroupSummary,
  Labels,
  QueryPage,
  QueryParams,
  RecordRow,
  StageDescriptor,
} from "@rebar/core/shared";
import { formatMinor } from "@rebar/core/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ConfirmDialog,
  EntityApiProvider,
  EntityList,
  Icon,
  KanbanInteractive,
  ModuleUiProvider,
  PipelineStepper,
  Popover,
  PopoverContent,
  PopoverTrigger,
  defineModuleUi,
  successToast,
  useEntityApi,
  type EntityApi,
  type KanbanDropTarget,
  type PipelineStage,
} from "@rebar/ui";

/*
  Ukázka obecných prvků pro nástěnku ve stylu Pipedrive (pás fází, karta a hlavička sloupce kanbanu z modulu,
  cílové sloupce, zkratky, detail v pop-upu s ?record=). Data jsou jen v paměti prohlížeče; žádný modul ani server.
*/

const ENTITY = "demo_deal";

const STAGES: StageDescriptor[] = [
  { id: "new", name: "Nová poptávka", color: "gray", kind: "open" },
  { id: "contacted", name: "Kontaktováno", color: "blue", kind: "open" },
  { id: "visit", name: "Obhlídka", color: "indigo", kind: "open" },
  { id: "offer_draft", name: "Nabídka v přípravě", color: "orange", kind: "open" },
  { id: "offer_sent", name: "Nabídka odeslána", color: "purple", kind: "open" },
  { id: "negotiation", name: "Jednání", color: "teal", kind: "open" },
];
const PROBABILITY: Record<string, number> = {
  new: 10,
  contacted: 20,
  visit: 35,
  offer_draft: 50,
  offer_sent: 65,
  negotiation: 80,
};

const descriptor: EntityDescriptor = {
  key: ENTITY,
  label: { one: "Zakázka", many: "Zakázky" },
  listPath: "/ui",
  titleKey: "name",
  statusKey: "stage",
  can: { create: false, write: true, delete: false, export: false },
  attributes: [
    attr("name", "Název", "text", { width: 240, defaultVisible: true }),
    attr("company", "Firma", "text", { defaultVisible: true }),
    attr("valueMinor", "Hodnota", "currency", { aggregate: true, defaultVisible: true }),
    {
      ...attr("stage", "Stav", "status", { defaultVisible: true }),
      stages: STAGES,
    },
    attr("closeDate", "Plánované uzavření", "date", { defaultVisible: true }),
  ],
};

function attr(
  key: string,
  label: string,
  type: EntityDescriptor["attributes"][number]["type"],
  extra: Partial<EntityDescriptor["attributes"][number]> = {},
): EntityDescriptor["attributes"][number] {
  return {
    key,
    label,
    type,
    custom: false,
    readonly: false,
    required: false,
    sortable: true,
    filterable: true,
    aggregate: false,
    defaultVisible: false,
    width: 160,
    ...extra,
  };
}

type Deal = RecordRow & {
  stage: string;
  valueMinor: number | null;
  /** Dny ve fázích, kterými zakázka prošla (včetně aktuální). */
  stageDays: Record<string, number>;
  /** Dny bez aktivity (hnití). */
  idleDays: number;
  nextActivity: "today" | "overdue" | "future" | "none";
};

const now = () => new Date().toISOString();
const deal = (
  n: number,
  name: string,
  company: string,
  stage: string,
  valueMinor: number | null,
  stageDays: Record<string, number>,
  idleDays: number,
  nextActivity: Deal["nextActivity"],
): Deal => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  updatedAt: now(),
  name,
  company,
  stage,
  valueMinor,
  closeDate: "2026-11-30",
  stageDays,
  idleDays,
  nextActivity,
});

function seed(): Deal[] {
  return [
    deal(1, "Rekonstrukce koupelny", "Novák s.r.o.", "new", 18_500_000, { new: 1 }, 1, "today"),
    deal(2, "Fasáda bytového domu", "SVJ Zelená 12", "new", 125_000_000, { new: 6 }, 6, "overdue"),
    deal(
      3,
      "Půdní vestavba",
      "Černý a syn",
      "contacted",
      84_000_000,
      { new: 2, contacted: 3 },
      3,
      "future",
    ),
    deal(
      4,
      "Hala pro sklad",
      "Logistika Plzeň",
      "visit",
      560_000_000,
      { new: 1, contacted: 4, visit: 2 },
      2,
      "today",
    ),
    deal(
      5,
      "Oplocení pozemku",
      "Jan Dvořák",
      "offer_draft",
      null,
      { new: 1, contacted: 2, visit: 3, offer_draft: 9 },
      9,
      "none",
    ),
    deal(
      6,
      "Střecha rodinného domu",
      "Svobodovi",
      "offer_sent",
      72_000_000,
      { new: 1, contacted: 2, visit: 2, offer_draft: 4, offer_sent: 12 },
      12,
      "overdue",
    ),
    deal(
      7,
      "Zateplení školky",
      "Obec Třemošná",
      "negotiation",
      310_000_000,
      { new: 1, contacted: 3, visit: 5, offer_draft: 6, offer_sent: 8, negotiation: 2 },
      2,
      "future",
    ),
  ];
}

function matches(row: RecordRow, g: NonNullable<QueryParams["filters"]>): boolean {
  const test = (c: (typeof g.conditions)[number]): boolean =>
    "conditions" in c ? matches(row, c) : c.op !== "is" || row[c.attr] === c.value;
  return g.op === "and" ? g.conditions.every(test) : g.conditions.some(test);
}

function makeApi(rows: Deal[]): EntityApi {
  const nothing = async () => {
    throw new Error("V ukázce není k dispozici.");
  };
  const page = (p: QueryParams): QueryPage => {
    const all = rows.filter((r) => (p.filters ? matches(r, p.filters) : true));
    const part = all.slice(p.offset ?? 0, (p.offset ?? 0) + (p.limit ?? 100));
    return {
      rows: part.map((r) => ({ ...r })),
      total: all.length,
      totals: { valueMinor: all.reduce((n, r) => n + (r.valueMinor ?? 0), 0) },
      labels: {} as Labels,
    };
  };
  return {
    me: { id: "demo", name: "Ondřej Dvořák" },
    describe: async () => descriptor,
    query: async (_e, p) => page(p),
    groups: async (_e, _g, p): Promise<GroupSummary[]> =>
      STAGES.map((s) => {
        const part = rows.filter(
          (r) => r.stage === s.id && (p.filters ? matches(r, p.filters) : true),
        );
        return {
          value: s.id,
          count: part.length,
          sums: { valueMinor: part.reduce((n, r) => n + (r.valueMinor ?? 0), 0) },
        };
      }),
    get: async (_e, id) => {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error("Záznam nenalezen.");
      return { row: { ...row }, labels: {} };
    },
    update: async (_e, id, patch) => {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error("Záznam nenalezen.");
      if (patch.stage && patch.stage !== row.stage)
        row.stageDays = { ...row.stageDays, [patch.stage as string]: 0 };
      Object.assign(row, patch, { updatedAt: now() });
      return { row: { ...row }, labels: {} };
    },
    create: nothing,
    remove: nothing,
    restore: nothing,
    lookups: { records: async () => [], users: async () => [] },
    hrefFor: () => null,
    command: nothing,
    activity: async () => ({ timeline: [], tasks: [], files: [] }),
    addComment: nothing,
    deleteComment: nothing,
    uploadFile: nothing,
    detachFile: nothing,
    views: {
      list: async () => [
        {
          id: "board",
          name: "Nástěnka",
          shared: true,
          mine: false,
          favorite: false,
          config: {
            viewType: "kanban",
            columns: ["name", "company", "valueMinor", "stage", "closeDate"],
            cardAttributes: [],
          },
        },
      ],
      save: nothing,
      update: nothing,
      remove: nothing,
      favorite: nothing,
    },
  };
}

/* ---------- rozšíření od „modulu“ ---------- */

/** Stav další aktivity na kartě: text, ikona a barva (jeden jazyk pro čtyři stavy; červená jen po termínu). */
const ACTIVITY_LOOK: Record<
  Deal["nextActivity"],
  { icon: string; cls: string; text: string; hint: string }
> = {
  today: {
    icon: "calendar-clock",
    cls: "text-success hover:bg-success-soft",
    text: "Dnes 14:00",
    hint: "Další aktivita je dnes: 14:00",
  },
  overdue: {
    icon: "alarm-clock",
    cls: "text-danger hover:bg-danger-soft",
    text: "Po termínu 2 d",
    hint: "Další aktivita je po termínu",
  },
  future: {
    icon: "calendar",
    cls: "text-muted hover:bg-hover hover:text-fg",
    text: "Zítra 9:00",
    hint: "Další aktivita je naplánovaná: zítra 9:00",
  },
  none: {
    icon: "calendar-plus",
    cls: "text-muted hover:bg-hover hover:text-fg",
    text: "Naplánovat",
    hint: "Zakázka nemá naplánovanou další aktivitu. Kliknutím ji naplánujete.",
  },
};

function stagesOf(entity: EntityDescriptor): PipelineStage[] {
  return (entity.attributes.find((a) => a.key === "stage")?.stages ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    kind: s.kind,
  }));
}

function DealHeader({ entity, id, row }: { entity: EntityDescriptor; id: string; row: RecordRow }) {
  const api = useEntityApi();
  const qc = useQueryClient();
  const d = row as Deal;
  const stages = stagesOf(entity).map((s) => ({ ...s, daysInStage: d.stageDays?.[s.id] ?? null }));
  return (
    <div className="space-y-3">
      <PipelineStepper
        stages={stages}
        currentId={d.stage}
        disabledReason={(stageId) =>
          stageId === "offer_sent" && d.valueMinor === null
            ? "Nejdřív vyplňte hodnotu zakázky."
            : null
        }
        onSelect={async (stage) => {
          await api.update(ENTITY, id, { stage }, row.updatedAt);
          await qc.invalidateQueries({ queryKey: ["entity", ENTITY] });
        }}
      />
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        <span>
          Hodnota:{" "}
          <b className="tabular font-medium text-fg">
            {d.valueMinor === null ? "—" : formatMinor(d.valueMinor)}
          </b>
        </span>
        <span>Pravděpodobnost: {PROBABILITY[d.stage] ?? 0} %</span>
      </div>
    </div>
  );
}

const ui = defineModuleUi({
  recordHeader: { [ENTITY]: DealHeader },
  kanbanCard: {
    [ENTITY]: {
      rotting: (row) => {
        const idle = (row as Deal).idleDays;
        return idle >= 7 ? `Zhnilá: ${idle} dní bez aktivity` : false;
      },
      body: ({ row }) => {
        const d = row as Deal;
        return (
          <div className="space-y-1">
            <div className="line-clamp-2 font-medium leading-snug">{String(d.name)}</div>
            <div className="truncate text-sm text-muted">{String(d.company)}</div>
            <div className="tabular pt-1 text-sm font-semibold">
              {d.valueMinor === null ? (
                <span className="font-normal text-faint">Bez ceny</span>
              ) : (
                formatMinor(d.valueMinor)
              )}
            </div>
          </div>
        );
      },
      footer: ({ row }) => {
        const d = row as Deal;
        const look = ACTIVITY_LOOK[d.nextActivity];
        const rotting = d.idleDays >= 7;
        return (
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <KanbanInteractive className="-ml-1.5 min-w-0">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={look.hint}
                    title={look.hint}
                    className={`inline-flex h-6 max-w-full items-center gap-1.5 rounded-md px-1.5 text-sm transition-colors pointer-coarse:px-2 ${look.cls}`}
                  >
                    <Icon name={look.icon} className="size-3.5 shrink-0" />
                    <span className="truncate">{look.text}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-60 p-3 text-sm">
                  {look.hint}
                </PopoverContent>
              </Popover>
            </KanbanInteractive>
            {rotting && (
              <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full bg-warning-soft px-2 text-xs font-medium text-warning">
                <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden />
                Bez pohybu {d.idleDays} dní
              </span>
            )}
          </div>
        );
      },
    },
  },
  kanbanColumnHeader: {
    [ENTITY]: ({ stage, rows }) => {
      const weighted = rows.reduce(
        (n, r) => n + ((r as Deal).valueMinor ?? 0) * ((PROBABILITY[stage.id] ?? 0) / 100),
        0,
      );
      return (
        <span className="tabular" title="Vážený součet podle pravděpodobnosti fáze">
          Vážená {formatMinor(Math.round(weighted))} · {PROBABILITY[stage.id]} %
        </span>
      );
    },
  },
});

/* ---------- ukázka ---------- */

const NARROW: PipelineStage[] = STAGES.map((s, i) => ({
  id: s.id,
  name: s.name,
  color: s.color,
  daysInStage: i < 4 ? [3, 5, 2, 9][i]! : null,
}));

export function CrmDemo() {
  const rows = useMemo(seed, []);
  const api = useMemo(() => makeApi(rows), [rows]);
  const [current, setCurrent] = useState("offer_draft");
  const [dropped, setDropped] = useState<{ kind: "won" | "lost"; row: RecordRow } | null>(null);

  const targets: KanbanDropTarget[] = [
    {
      id: "won",
      label: "Vyhráno",
      color: "green",
      icon: "trophy",
      hint: "nebo klávesa W",
      onDrop: (_id, row) => setDropped({ kind: "won", row }),
    },
    {
      id: "lost",
      label: "Prohráno",
      color: "red",
      icon: "thumbs-down",
      hint: "nebo klávesa L",
      onDrop: (_id, row) => setDropped({ kind: "lost", row }),
    },
  ];

  return (
    <section className="space-y-4" aria-label="Prvky pro CRM">
      <h2 className="text-lg font-semibold">Pás fází (PipelineStepper)</h2>
      <div className="space-y-3 rounded-lg border border-line p-4" data-testid="stepper-demo">
        <PipelineStepper
          stages={NARROW}
          currentId={current}
          onSelect={setCurrent}
          disabledReason={(id) => (id === "negotiation" ? "Nejdřív odešlete nabídku." : null)}
        />
        <PipelineStepper stages={NARROW} currentId="visit" size="compact" onSelect={setCurrent} />
        <PipelineStepper stages={NARROW} currentId="new" label="Jen k prohlížení" />
        <div className="max-w-xs" data-testid="stepper-narrow">
          <PipelineStepper stages={NARROW} currentId="offer_sent" onSelect={setCurrent} />
        </div>
      </div>

      <h2 className="text-lg font-semibold">Nástěnka a detail v pop-upu</h2>
      <p className="text-sm text-muted">
        Karta, hlavička sloupce a pás fází v detailu dodává „modul“; přetažení na Vyhráno / Prohráno
        otevře dialog a kartu nepřesune. Klávesy: šipky mezi kartami, Enter otevře, A / W / L.
      </p>
      <div
        className="flex h-[640px] min-w-0 flex-col overflow-hidden rounded-lg border border-line"
        data-testid="crm-board"
      >
        <EntityApiProvider api={api}>
          <ModuleUiProvider all={{ demo: ui }} enabled={["demo"]} permissions={[]}>
            <EntityList
              entity={descriptor}
              initialViewId="board"
              openMode="dialog"
              basePath="/ui"
              compact
              kanban={{
                dropTargets: targets,
                onShortcut: (key, row) => {
                  if (key === "w") setDropped({ kind: "won", row });
                  else if (key === "l") setDropped({ kind: "lost", row });
                  else successToast(`Naplánovat aktivitu: ${String(row.name)}`);
                },
              }}
            />
          </ModuleUiProvider>
        </EntityApiProvider>
      </div>
      <ConfirmDialog
        open={!!dropped}
        onOpenChange={(o) => !o && setDropped(null)}
        title={dropped?.kind === "won" ? "Označit jako vyhranou" : "Označit jako prohranou"}
        confirmLabel={dropped?.kind === "won" ? "Vyhráno" : "Prohráno"}
        danger={dropped?.kind === "lost"}
        onConfirm={() => successToast("V ukázce se nic neukládá.")}
      >
        {dropped ? `Zakázka „${String(dropped.row.name)}“.` : ""}
      </ConfirmDialog>
    </section>
  );
}
