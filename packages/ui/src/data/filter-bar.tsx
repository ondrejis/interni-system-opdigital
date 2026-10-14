"use client";

import {
  formatDate,
  formatMinor,
  inputToNumber,
  numberToInput,
  OPERATOR_LABELS,
  OPERATORS_BY_TYPE,
  parseMinor,
  VALUELESS_OPERATORS,
  type AttributeDescriptor,
  type Condition,
  type FilterGroup,
  type Operator,
} from "@rebar/core/shared";
import { Command } from "cmdk";
import { ChevronRight, ListFilter, Search, X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "../components/button";
import { Combobox, type ComboOption } from "../components/combobox";
import { DatePicker } from "../components/date-picker";
import { Input } from "../components/input";
import { Popover, PopoverContent, PopoverTrigger } from "../components/overlay";
import { useIsMobile } from "../hooks/use-media";
import { cn } from "../lib/cn";
import {
  markBaseline,
  sameCondition,
  sectionFilterAttributes,
  type FilterAttributeGroup,
  type FilterSection,
} from "./filter-attributes";
import { isCondition } from "./filters";
import { TYPE_ICONS } from "./type-icons";
import type { Lookups } from "./types";

/**
 * Navržená („rychlá“) podmínka: nabídne se v nabídce „Filtr“ ve skupině „Návrhy“ a jedním kliknutím přidá hotovou
 * podmínku (chybí-li jí hodnota, rovnou se otevře její editor). Nabídne se jen tehdy, když atribut existuje a smí se filtrovat.
 */
export type QuickCondition = { id: string; label: string; condition: Condition };

type Props = {
  attributes: AttributeDescriptor[];
  value: FilterGroup | undefined;
  onChange: (next: FilterGroup | undefined) => void;
  lookups: Lookups;
  /** Popisky vybraných záznamů a uživatelů (id → text), aby chip ukázal jméno, ne UUID. */
  labelOf?: (attr: string, id: string) => string | undefined;
  /** Navržené podmínky (viz `QuickCondition`); bez nich se nabízí jen výběr atributu. */
  quickConditions?: readonly QuickCondition[] | undefined;
  /** Skupiny atributů v nabídce (výčet klíčů); bez nich se atributy dělí podle typu. */
  groups?: readonly FilterAttributeGroup[] | undefined;
  /**
   * Výchozí filtr pohledu (uložený pohled, `defaultFilters`): jeho podmínky jsou jako chipy šedé a označené jako součást pohledu,
   * podmínky přidané uživatelem modré.
   */
  baseline?: FilterGroup | undefined;
};

/** Předpona hodnoty v nabídce, kterou se liší navržená podmínka od atributu. */
const QUICK = "__quick:";

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Ovládání filtru rozdělené na dvě části, které si stránka položí podle potřeby: `button` je jedno tlačítko „Filtr“ s počtem
 * podmínek (na počítači nabídka, na telefonu spodní panel) a `chips` řada aktivních podmínek s „Vymazat vše“ (`null`, když
 * žádná není, takže prázdný stav nic nekreslí). Složitější vnořené skupiny z uložených pohledů se zachovají.
 */
export function useFilterUi({
  attributes,
  value,
  onChange,
  lookups,
  labelOf,
  quickConditions,
  groups,
  baseline,
}: Props): { button: ReactNode; chips: ReactNode | null; count: number } {
  const isMobile = useIsMobile();
  const sections = useMemo(() => sectionFilterAttributes(attributes, groups), [attributes, groups]);
  const filterable = useMemo(() => attributes.filter((a) => a.filterable), [attributes]);
  const group: FilterGroup = value ?? { op: "and", conditions: [] };
  const quick = useMemo(
    () =>
      (quickConditions ?? []).filter(
        (q) =>
          filterable.some((a) => a.key === q.condition.attr) &&
          !group.conditions.some((c) => isCondition(c) && sameCondition(c, q.condition)),
      ),
    [quickConditions, filterable, group.conditions],
  );
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const count = group.conditions.length;
  const isBase = markBaseline(value, baseline);

  const commit = (conditions: (Condition | FilterGroup)[], op = group.op) =>
    onChange(conditions.length ? { op, conditions } : undefined);

  const replace = (i: number, c: Condition) =>
    commit(group.conditions.map((x, j) => (j === i ? c : x)));
  const remove = (i: number) => commit(group.conditions.filter((_, j) => j !== i));

  function addQuick(id: string) {
    const q = quick.find((x) => x.id === id);
    if (!q) return;
    const next = [...group.conditions, q.condition];
    onChange({ op: group.op, conditions: next });
    setAdding(false);
    const done =
      VALUELESS_OPERATORS.includes(q.condition.op) ||
      (q.condition.value !== undefined && q.condition.value !== null && q.condition.value !== "");
    if (!done) setTimeout(() => setEditing(next.length - 1), 60);
  }

  function add(attrKey: string) {
    const a = attributes.find((x) => x.key === attrKey);
    if (!a) return;
    const op = OPERATORS_BY_TYPE[a.type][0]!;
    const next = [...group.conditions, { attr: a.key, op } as Condition];
    onChange({ op: group.op, conditions: next });
    setAdding(false);
    // Editor podmínky se otevře až po zavření výběru atributu; jinak mu Radix při vracení fokusu otevření zruší.
    setTimeout(() => setEditing(next.length - 1), 60);
  }

  const picker = <FilterPicker sections={sections} quick={quick} onAttr={add} onQuick={addQuick} />;
  const trigger = (
    <Button
      variant={count ? "secondary" : "ghost"}
      data-testid="add-filter"
      aria-label={count ? `Filtr, aktivních podmínek: ${count}` : "Filtr"}
      {...(isMobile ? { onClick: () => setAdding(true) } : {})}
    >
      <ListFilter />
      {!isMobile && "Filtr"}
      {count > 0 && (
        <span className="tabular rounded-full bg-accent-soft px-1.5 text-xs font-medium text-accent-text">
          {count}
        </span>
      )}
    </Button>
  );

  const button = isMobile ? (
    <>
      {trigger}
      <FilterSheet open={adding} onOpenChange={setAdding}>
        {picker}
      </FilterSheet>
    </>
  ) : (
    <Popover open={adding} onOpenChange={setAdding}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[22rem] max-w-[calc(100vw-1.5rem)] p-0" align="start">
        {picker}
      </PopoverContent>
    </Popover>
  );

  const chips = count ? (
    <div
      className="flex items-center gap-2"
      data-testid="filter-bar"
      role="group"
      aria-label="Aktivní filtry"
    >
      <div className="scrollbar-none flex min-w-0 items-center gap-1.5 overflow-x-auto py-0.5">
        {group.conditions.map((c, i) =>
          isCondition(c) ? (
            <ConditionChip
              key={i}
              condition={c}
              attr={attributes.find((a) => a.key === c.attr)}
              open={editing === i}
              onOpenChange={(o) => setEditing(o ? i : null)}
              onChange={(n) => replace(i, n)}
              onRemove={() => remove(i)}
              lookups={lookups}
              labelOf={labelOf}
              base={isBase[i] ?? false}
            />
          ) : (
            <span key={i} className="chip shrink-0" data-color="gray">
              Skupina podmínek ({c.conditions.length})
              <button type="button" aria-label="Odebrat skupinu" onClick={() => remove(i)}>
                <X className="size-3" />
              </button>
            </span>
          ),
        )}
        {count > 1 && (
          <button
            type="button"
            onClick={() => commit(group.conditions, group.op === "and" ? "or" : "and")}
            className="shrink-0 rounded px-1 text-sm text-muted hover:bg-hover hover:text-fg"
            title="Přepnout mezi „a zároveň“ a „nebo“"
          >
            {group.op === "and" ? "a zároveň" : "nebo"}
          </button>
        )}
      </div>
      <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onChange(undefined)}>
        Vymazat vše
      </Button>
    </div>
  ) : null;

  return { button, chips, count };
}

/** Filtr na jednom místě: tlačítko „Filtr“ a vedle něj aktivní podmínky (jen v rámci řádku, kde není místo na dvě části). */
export function FilterBar(props: Props) {
  const { button, chips } = useFilterUi(props);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {button}
      {chips && <div className="min-w-0 flex-1">{chips}</div>}
    </div>
  );
}

/** Spodní panel s výběrem filtru na telefonu (na počítači je to nabídka pod tlačítkem). */
function FilterSheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[var(--bg-overlay)] anim-fade" />
        <D.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-xl border border-line bg-bg pb-[env(safe-area-inset-bottom)] shadow-float anim-fade outline-none">
          <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-2">
            <D.Title className="text-lg font-semibold">Filtr</D.Title>
            <D.Description className="sr-only">Vyberte, podle čeho seznam filtrovat.</D.Description>
            <D.Close
              aria-label="Zavřít"
              className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
            >
              <X className="size-4" />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/**
 * Výběr atributu nebo návrhu: hledání, nahoře malá skupina „Návrhy“, pod ní atributy ve skupinách. Skupiny jsou sbalené
 * (rozbalená je první), při hledání se rozbalí všechny a ukážou jen shody.
 */
function FilterPicker({
  sections,
  quick,
  onAttr,
  onQuick,
}: {
  sections: FilterSection[];
  quick: readonly QuickCondition[];
  onAttr: (key: string) => void;
  onQuick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(sections.slice(0, 1).map((s) => s.id)),
  );
  const q = normalize(query.trim());
  const searching = q !== "";
  const hit = (...texts: string[]) => !searching || texts.some((t) => normalize(t).includes(q));

  const shownQuick = quick.filter((x) => hit(x.label, "návrh"));
  const shown = sections
    .map((s) => ({
      ...s,
      attributes: s.attributes.filter((a) => hit(a.label, s.label)),
    }))
    .filter((s) => s.attributes.length > 0);
  const empty = shownQuick.length === 0 && shown.length === 0;
  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Command shouldFilter={false} label="Filtrovat podle" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2.5">
        <Search className="size-4 text-faint" aria-hidden />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Hledat podmínku…"
          aria-label="Hledat atribut filtru"
          className="h-9 w-full bg-transparent text-base outline-none placeholder:text-faint"
        />
      </div>
      <Command.List className="scrollbar-thin max-h-[min(26rem,60dvh)] flex-1 overflow-auto p-1">
        {empty && <div className="px-3 py-2 text-muted">Nic nenalezeno</div>}
        {shownQuick.length > 0 && (
          <div
            role="group"
            aria-label="Návrhy"
            className="mb-1 border-b border-line px-1 pb-2 pt-1"
          >
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-faint">
              Návrhy
            </div>
            <div className="scrollbar-none flex gap-1.5 overflow-x-auto md:flex-wrap md:overflow-visible">
              {shownQuick.map((x) => (
                <Command.Item
                  key={x.id}
                  value={QUICK + x.id}
                  onSelect={() => onQuick(x.id)}
                  className="shrink-0 cursor-default whitespace-nowrap rounded-full border border-line px-2.5 py-0.5 text-sm text-muted data-[selected=true]:border-accent-line data-[selected=true]:bg-accent-soft data-[selected=true]:text-fg"
                >
                  {x.label}
                </Command.Item>
              ))}
            </div>
          </div>
        )}
        {shown.map((s) => {
          const expanded = searching || open.has(s.id);
          return (
            <div key={s.id} role="group" aria-label={s.label}>
              {searching ? (
                <div className="px-2 pb-0.5 pt-2 text-xs font-medium uppercase tracking-wide text-faint">
                  {s.label}
                </div>
              ) : (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggle(s.id)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium uppercase tracking-wide text-muted hover:bg-hover"
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 text-faint transition-transform",
                      expanded && "rotate-90",
                    )}
                    aria-hidden
                  />
                  {s.label}
                  <span className="tabular ml-auto text-xs font-normal text-faint">
                    {s.attributes.length}
                  </span>
                </button>
              )}
              {expanded &&
                s.attributes.map((a) => {
                  const Icon = TYPE_ICONS[a.type];
                  return (
                    <Command.Item
                      key={a.key}
                      value={a.key}
                      onSelect={() => onAttr(a.key)}
                      className="flex cursor-default items-center gap-2 rounded-md py-1.5 pl-7 pr-2 data-[selected=true]:bg-hover"
                    >
                      <Icon className="size-3.5 shrink-0 text-faint" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{a.label}</span>
                    </Command.Item>
                  );
                })}
            </div>
          );
        })}
      </Command.List>
    </Command>
  );
}

function ConditionChip({
  condition,
  attr,
  open,
  onOpenChange,
  onChange,
  onRemove,
  lookups,
  labelOf,
  base,
}: {
  condition: Condition;
  attr: AttributeDescriptor | undefined;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChange: (c: Condition) => void;
  onRemove: () => void;
  lookups: Lookups;
  labelOf: Props["labelOf"];
  /** Podmínka patří k výchozímu filtru pohledu (šedý chip), ne k tomu, co uživatel přidal (modrý). */
  base: boolean;
}) {
  if (!attr) return null;
  const summary = valueSummary(attr, condition, labelOf);
  const incomplete = !VALUELESS_OPERATORS.includes(condition.op) && summary === "";
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <span
        className={cn("chip shrink-0 gap-1 whitespace-nowrap", incomplete && "ring-1 ring-warning")}
        data-color={base ? "gray" : "blue"}
        data-base={base ? "true" : undefined}
        title={base ? "Součást pohledu (jde změnit nebo odebrat)" : undefined}
        data-testid="filter-chip"
      >
        <PopoverTrigger asChild>
          <button type="button" className="flex items-center gap-1">
            <span className="font-medium">{attr.label}</span>
            <span className="opacity-70">{OPERATOR_LABELS[condition.op]}</span>
            {summary && <span className="font-medium">{summary}</span>}
          </button>
        </PopoverTrigger>
        <button type="button" aria-label={`Odebrat filtr ${attr.label}`} onClick={onRemove}>
          <X className="size-3" />
        </button>
      </span>
      <PopoverContent className="w-80 p-3" align="start">
        <ConditionEditor
          attr={attr}
          condition={condition}
          lookups={lookups}
          onChange={onChange}
          onDone={() => onOpenChange(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function ConditionEditor({
  attr,
  condition,
  lookups,
  onChange,
  onDone,
}: {
  attr: AttributeDescriptor;
  condition: Condition;
  lookups: Lookups;
  onChange: (c: Condition) => void;
  onDone: () => void;
}) {
  const ops = OPERATORS_BY_TYPE[attr.type];
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">{attr.label}</div>
      <Combobox
        options={ops.map((o) => ({ value: o, label: OPERATOR_LABELS[o] }))}
        value={condition.op}
        onChange={(v) => v && onChange({ attr: attr.key, op: v as Operator })}
        searchPlaceholder="Operátor…"
      />
      {!VALUELESS_OPERATORS.includes(condition.op) && (
        <ValueInput
          attr={attr}
          condition={condition}
          lookups={lookups}
          onChange={onChange}
          onDone={onDone}
        />
      )}
      <div className="flex justify-end">
        <Button size="sm" variant="primary" onClick={onDone}>
          Hotovo
        </Button>
      </div>
    </div>
  );
}

const optionsOf = (attr: AttributeDescriptor): ComboOption[] =>
  attr.type === "status"
    ? (attr.stages ?? []).map((s) => ({ value: s.id, label: s.name, color: s.color }))
    : (attr.choices ?? []).map((c) => ({
        value: c.value,
        label: c.label,
        ...(c.color ? { color: c.color } : {}),
      }));

function ValueInput({
  attr,
  condition,
  lookups,
  onChange,
  onDone,
}: {
  attr: AttributeDescriptor;
  condition: Condition;
  lookups: Lookups;
  onChange: (c: Condition) => void;
  onDone: () => void;
}) {
  const set = (value: unknown) => onChange({ attr: attr.key, op: condition.op, value });
  const v = condition.value;
  const op = condition.op;

  if (op === "in_last_days" || op === "in_next_days" || op === "older_than_days")
    return (
      <Input
        type="number"
        min={0}
        max={3650}
        autoFocus
        aria-label="Počet dnů"
        value={(v as number) ?? ""}
        onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))}
        placeholder="Počet dnů"
      />
    );

  if (attr.type === "date") {
    if (op === "between") {
      const [a, b] = (v as [string, string] | undefined) ?? [null, null];
      return (
        <div className="flex items-center gap-2">
          <DatePicker value={a} onChange={(x) => set([x, b])} placeholder="Od" />
          <DatePicker value={b} onChange={(x) => set([a, x])} placeholder="Do" />
        </div>
      );
    }
    return <DatePicker value={(v as string | null) ?? null} onChange={set} />;
  }

  if (attr.type === "number" || attr.type === "currency") {
    const isMoney = attr.type === "currency";
    const show = (x: unknown) =>
      typeof x === "number"
        ? isMoney
          ? String(x / 100).replace(".", ",")
          : numberToInput(attr.unit, x)
        : "";
    const parse = (t: string): number | undefined => {
      if (t.trim() === "") return undefined;
      if (isMoney) return parseMinor(t) ?? undefined;
      return inputToNumber(attr.unit, t) ?? undefined;
    };
    if (op === "between") {
      const [a, b] = (v as [number, number] | undefined) ?? [undefined, undefined];
      return (
        <div className="flex items-center gap-2">
          <NumField value={show(a)} placeholder="Od" onValue={(t) => set([parse(t), b])} />
          <NumField value={show(b)} placeholder="Do" onValue={(t) => set([a, parse(t)])} />
        </div>
      );
    }
    return (
      <NumField
        autoFocus
        value={show(v)}
        placeholder={isMoney ? "Částka v Kč" : "Číslo"}
        onValue={(t) => set(parse(t))}
        onEnter={onDone}
      />
    );
  }

  if (["status", "select", "multiselect", "user", "record"].includes(attr.type)) {
    const multi =
      op === "is_any_of" || op === "is_none_of" || op === "contains_any" || op === "contains_all";
    const load =
      attr.type === "user"
        ? lookups.users
        : attr.type === "record"
          ? (q: string) => lookups.records(attr.record?.entityType ?? "", q)
          : undefined;
    return (
      <Combobox
        {...(load ? { load } : { options: optionsOf(attr) })}
        multiple={multi}
        value={multi ? ((v as string[] | undefined) ?? []) : ((v as string | undefined) ?? null)}
        onChange={(x) => set(x === null || (Array.isArray(x) && !x.length) ? undefined : x)}
        placeholder="Vyberte…"
      />
    );
  }

  return (
    <Input
      autoFocus
      aria-label={attr.label}
      value={(v as string) ?? ""}
      onChange={(e) => set(e.target.value === "" ? undefined : e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onDone()}
      placeholder="Hodnota"
    />
  );
}

function NumField({
  value,
  onValue,
  onEnter,
  placeholder,
  autoFocus,
}: {
  value: string;
  onValue: (t: string) => void;
  onEnter?: () => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(value);
  return (
    <Input
      autoFocus={autoFocus}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onValue(e.target.value);
      }}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
    />
  );
}

/** Krátký popis hodnoty pro chip; prázdný řetězec = hodnota ještě chybí. */
function valueSummary(attr: AttributeDescriptor, c: Condition, labelOf: Props["labelOf"]): string {
  const v = c.value;
  if (VALUELESS_OPERATORS.includes(c.op)) return "";
  if (
    v === undefined ||
    v === null ||
    v === "" ||
    (Array.isArray(v) && v.every((x) => x === undefined || x === null))
  )
    return "";
  const one = (x: unknown): string => {
    if (x === undefined || x === null) return "…";
    switch (attr.type) {
      case "currency":
        return formatMinor(x as number);
      case "date":
        return formatDate(x as string);
      case "status":
        return attr.stages?.find((s) => s.id === x)?.name ?? String(x);
      case "select":
      case "multiselect":
        return attr.choices?.find((ch) => ch.value === x)?.label ?? String(x);
      case "user":
      case "record":
        return labelOf?.(attr.key, String(x)) ?? "…";
      default:
        return String(x);
    }
  };
  if (c.op === "in_last_days" || c.op === "in_next_days" || c.op === "older_than_days")
    return `${v} dní`;
  if (Array.isArray(v))
    return c.op === "between" ? `${one(v[0])} – ${one(v[1])}` : v.map(one).join(", ");
  return one(v);
}
