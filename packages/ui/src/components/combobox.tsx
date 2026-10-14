"use client";

import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Command } from "cmdk";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "./overlay";

export type ComboOption = { value: string; label: string; hint?: string; color?: string };

export type ComboboxProps = {
  /** Statické možnosti, nebo `load` pro vyhledávání na serveru. */
  options?: readonly ComboOption[];
  load?: (query: string) => Promise<ComboOption[]>;
  value: string | string[] | null;
  /** Popisek aktuální hodnoty, když není mezi načtenými možnostmi (např. jméno vybrané firmy). */
  selectedLabels?: Record<string, string>;
  onChange: (value: string | string[] | null) => void;
  multiple?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  renderOption?: (o: ComboOption) => ReactNode;
  trigger?: ReactNode;
  /** Název pole pro čtečky obrazovky; za něj se přidá vybraná hodnota. */
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Výběr z možností s hledáním (bez diakritiky díky vlastnímu filtru), jedna i více hodnot. */
export function Combobox({
  options,
  load,
  value,
  selectedLabels = {},
  onChange,
  multiple,
  placeholder = "Vybrat…",
  searchPlaceholder = "Hledat…",
  emptyText = "Nic nenalezeno",
  clearable,
  renderOption,
  trigger,
  "aria-label": ariaLabel,
  className,
  disabled,
  open: openProp,
  onOpenChange,
}: ComboboxProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setOpenState(o));
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<ComboOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !load) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(
      () => {
        load(query)
          .then((r) => !cancelled && setRemote(r))
          .finally(() => !cancelled && setLoading(false));
      },
      query ? 180 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, load]);

  const list = load ? remote : (options ?? []);
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  const labelOf = (v: string) =>
    list.find((o) => o.value === v)?.label ??
    options?.find((o) => o.value === v)?.label ??
    selectedLabels[v] ??
    v;

  function pick(v: string) {
    if (multiple) {
      const next = new Set(selected);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      onChange([...next]);
    } else {
      onChange(selected.has(v) && clearable ? null : v);
      setOpen(false);
    }
  }

  const summary = selected.size ? [...selected].map(labelOf).join(", ") : null;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <button
            type="button"
            {...(ariaLabel
              ? { "aria-label": summary ? `${ariaLabel}: ${summary}` : ariaLabel }
              : {})}
            className={cn(
              "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-bg px-2.5 text-left text-base hover:border-faint disabled:opacity-50",
              className,
            )}
          >
            <span className={cn("truncate", !summary && "text-faint")}>
              {summary ?? placeholder}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-faint" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command
          shouldFilter={!load}
          filter={(v, s) => (normalize(v).includes(normalize(s)) ? 1 : 0)}
        >
          <div className="flex items-center gap-2 border-b border-line px-2.5">
            <Search className="size-4 text-faint" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
              className="h-9 w-full bg-transparent text-base outline-none placeholder:text-faint"
            />
          </div>
          <Command.List className="scrollbar-thin max-h-64 overflow-auto p-1">
            {loading && !list.length ? (
              <div className="px-3 py-2 text-muted">Načítám…</div>
            ) : (
              <Command.Empty className="px-3 py-2 text-muted">{emptyText}</Command.Empty>
            )}
            {clearable && !multiple && selected.size > 0 && (
              <Command.Item
                value="__clear"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-muted data-[selected=true]:bg-hover"
              >
                Zrušit výběr
              </Command.Item>
            )}
            {list.map((o) => (
              <Command.Item
                key={o.value}
                value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                onSelect={() => pick(o.value)}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 data-[selected=true]:bg-hover"
              >
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    selected.has(o.value) ? "text-accent" : "invisible",
                  )}
                />
                {renderOption ? (
                  renderOption(o)
                ) : (
                  <span className="min-w-0 flex-1 truncate">
                    {o.label}
                    {o.hint && <span className="ml-2 text-faint">{o.hint}</span>}
                  </span>
                )}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
