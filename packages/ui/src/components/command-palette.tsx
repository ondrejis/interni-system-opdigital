"use client";

import { Command } from "cmdk";
import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { DialogRoot } from "./palette-parts";

export type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  keywords?: string;
  shortcut?: string;
  onSelect: () => void;
};
export type PaletteGroup = { heading: string; items: PaletteItem[] };

/**
 * Cmd/Ctrl+K: hledání záznamů napříč entitami, navigace, akce a nedávné záznamy.
 * `search` vrací výsledky ze serveru (hledání bez diakritiky); statické skupiny filtruje cmdk lokálně.
 */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  search,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  groups: PaletteGroup[];
  search?: (q: string) => Promise<PaletteItem[]>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!search || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(() => {
      search(query)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setBusy(false));
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, search]);

  const run = (item: PaletteItem) => {
    onOpenChange(false);
    item.onSelect();
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange} title="Hledání a příkazy">
      <Command
        shouldFilter
        label="Hledání a příkazy"
        filter={(v, s) => (norm(v).includes(norm(s)) ? 1 : 0)}
        className="flex flex-col"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-faint" />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Hledat zakázky, firmy, osoby… nebo napsat příkaz"
            className="h-11 w-full bg-transparent text-lg outline-none placeholder:text-faint"
          />
        </div>
        <Command.List className="scrollbar-thin max-h-[52vh] overflow-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-muted">
            {busy ? "Hledám…" : "Nic nenalezeno"}
          </Command.Empty>
          {results.length > 0 && (
            <Command.Group
              heading="Záznamy"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-faint"
            >
              {results.map((r) => (
                <Row key={`r-${r.id}`} item={r} value={`__result ${r.id} ${query}`} onRun={run} />
              ))}
            </Command.Group>
          )}
          {groups.map((g) => (
            <Command.Group
              key={g.heading}
              heading={g.heading}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-faint"
            >
              {g.items.map((i) => (
                <Row
                  key={i.id}
                  item={i}
                  value={`${i.label} ${i.keywords ?? ""} ${i.hint ?? ""}`}
                  onRun={run}
                />
              ))}
            </Command.Group>
          ))}
        </Command.List>
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-faint">
          <span>↑↓ pohyb</span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="size-3" /> otevřít · Esc zavřít
          </span>
        </div>
      </Command>
    </DialogRoot>
  );
}

function Row({
  item,
  value,
  onRun,
}: {
  item: PaletteItem;
  value: string;
  onRun: (i: PaletteItem) => void;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={() => onRun(item)}
      className="flex cursor-default items-center gap-3 rounded-md px-2 py-2 data-[selected=true]:bg-hover"
    >
      {item.icon && <span className="text-muted [&_svg]:size-4">{item.icon}</span>}
      <span className="min-w-0 flex-1 truncate">
        {item.label}
        {item.hint && <span className="ml-2 text-faint">{item.hint}</span>}
      </span>
      {item.shortcut && <span className="text-xs text-faint">{item.shortcut}</span>}
    </Command.Item>
  );
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
