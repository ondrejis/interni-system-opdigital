"use client";

import { Command } from "cmdk";
import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DialogRoot } from "./palette-parts";

/** Akce u řádku, která nic neotevírá (zavolat, zkopírovat telefon, napsat e-mail, otevřít Disk). */
export type PaletteRowAction = {
  id: string;
  label: string;
  icon: ReactNode;
  /** Odkaz (`tel:`, `mailto:`, adresa složky na Disku). */
  href?: string;
  /** Otevře odkaz v nové záložce. */
  external?: boolean;
  /** Provede se po kliknutí (kopírování); paleta se přitom nezavře. */
  onRun?: () => void;
};

export type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  /** Podtitulek pod názvem (firma, fáze, telefon). */
  subtitle?: string;
  icon?: ReactNode;
  keywords?: string;
  shortcut?: string;
  actions?: PaletteRowAction[];
  onSelect: () => void;
};
export type PaletteGroup = { heading: string; items: PaletteItem[] };

const GROUP =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-faint";

/**
 * Cmd/Ctrl+K (HLE-01…07): bez zadání nedávné záznamy a nejčastější příkazy (`idleGroups`), při psaní nálezy ze serveru
 * seskupené podle typu (`search`) a příkazy, které odpovídají textu. Nálezy naskakují během psaní (bez čekání na
 * pauzu, předchozí výsledky zůstávají, dokud nepřijdou nové).
 */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  idleGroups = [],
  search,
  onRun,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Příkazy a navigace: filtruje je cmdk podle zadaného textu. */
  groups: PaletteGroup[];
  /** Jen při prázdném poli: nedávné záznamy a nejčastější příkazy. */
  idleGroups?: PaletteGroup[];
  /** Nálezy ze serveru podle textu, už seskupené. */
  search?: (q: string) => Promise<PaletteGroup[]>;
  /** Zavolá se po výběru řádku (např. započítání použití příkazu). */
  onRun?: (item: PaletteItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!search || query.trim().length < 2) {
      seq.current += 1;
      setResults([]);
      setBusy(false);
      return;
    }
    const mine = ++seq.current;
    setBusy(true);
    // krátká prodleva sloučí rychlé stisky kláves; starší odpověď nikdy nepřepíše novější
    const t = setTimeout(() => {
      search(query)
        .then((r) => mine === seq.current && setResults(r))
        .catch(() => mine === seq.current && setResults([]))
        .finally(() => mine === seq.current && setBusy(false));
    }, 40);
    return () => clearTimeout(t);
  }, [query, search]);

  const run = (item: PaletteItem) => {
    onOpenChange(false);
    onRun?.(item);
    item.onSelect();
  };
  const idle = query.trim() === "";

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
            placeholder="Hledat klienty, kontakty, obchody… nebo napsat příkaz"
            enterKeyHint="search"
            className="h-11 w-full bg-transparent text-lg outline-none placeholder:text-faint max-md:h-14"
            data-testid="palette-input"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="-mr-2 shrink-0 rounded-md px-3 text-base font-medium text-accent md:hidden"
          >
            Zavřít
          </button>
        </div>
        <Command.List className="scrollbar-thin max-h-[52vh] overflow-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-muted">
            {busy ? "Hledám…" : "Nic nenalezeno"}
          </Command.Empty>
          {results.map((g) => (
            <Command.Group key={`r-${g.heading}`} heading={g.heading} className={GROUP}>
              {g.items.map((r) => (
                <Row key={`r-${r.id}`} item={r} value={`__result ${r.id} ${query}`} onRun={run} />
              ))}
            </Command.Group>
          ))}
          {idle &&
            idleGroups.map((g) => (
              <Command.Group key={`i-${g.heading}`} heading={g.heading} className={GROUP}>
                {g.items.map((i) => (
                  <Row key={`i-${i.id}`} item={i} value={`__idle ${i.id} ${i.label}`} onRun={run} />
                ))}
              </Command.Group>
            ))}
          {groups.map((g) => (
            <Command.Group key={g.heading} heading={g.heading} className={GROUP}>
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
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-faint max-md:hidden">
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
      data-testid="palette-item"
      className="flex cursor-default items-center gap-3 rounded-md px-2 py-2 data-[selected=true]:bg-hover"
    >
      {item.icon && <span className="text-muted [&_svg]:size-4">{item.icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {item.label}
          {item.hint && <span className="ml-2 text-faint">{item.hint}</span>}
        </span>
        {item.subtitle && (
          <span className="block truncate text-sm text-muted">{item.subtitle}</span>
        )}
      </span>
      {item.actions?.map((a) => {
        const cls =
          "flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-line hover:text-fg max-md:size-11 max-md:bg-subtle [&_svg]:size-4 max-md:[&_svg]:size-5";
        const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
        return a.href ? (
          <a
            key={a.id}
            href={a.href}
            title={a.label}
            aria-label={a.label}
            className={cls}
            {...(a.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            onClick={stop}
            onPointerDown={stop}
          >
            {a.icon}
          </a>
        ) : (
          <button
            key={a.id}
            type="button"
            title={a.label}
            aria-label={a.label}
            className={cls}
            onClick={(e) => {
              e.stopPropagation();
              a.onRun?.();
            }}
            onPointerDown={stop}
          >
            {a.icon}
          </button>
        );
      })}
      {item.shortcut && <span className="text-xs text-faint">{item.shortcut}</span>}
    </Command.Item>
  );
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
