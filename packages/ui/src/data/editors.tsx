"use client";

import {
  inputToNumber,
  numberToInput,
  parseMinor,
  type AttributeDescriptor,
  type Labels,
} from "@rebar/core/shared";
import { useEffect, useRef, useState } from "react";
import { Combobox, type ComboOption } from "../components/combobox";
import { DatePicker } from "../components/date-picker";
import { Popover, PopoverAnchor, PopoverContent } from "../components/overlay";
import type { Lookups } from "./types";

export type EditorProps = {
  attr: AttributeDescriptor;
  value: unknown;
  labels?: Labels | undefined;
  lookups: Lookups;
  /** První napsaný znak (psaní do vybrané buňky přepíše hodnotu). */
  seed?: string;
  /** Uloží hodnotu. `move` říká, kam se po uložení posunout (Tab / Enter). */
  onCommit: (value: unknown, move?: "next" | "prev" | "down") => void;
  onCancel: () => void;
};

const TEXT_INPUT: Record<string, string> = {
  text: "text",
  email: "email",
  phone: "tel",
  url: "url",
  number: "text",
  currency: "text",
};

/**
 * Editor hodnoty v buňce podle typu atributu. Enter ukládá, Esc ruší, Tab ukládá a přejde dál,
 * ztráta fokusu ukládá. Výběry a datum se otevřou rovnou jako popover.
 */
export function CellEditor(props: EditorProps) {
  const { attr } = props;
  switch (attr.type) {
    case "date":
      return <DateEditor {...props} />;
    case "status":
    case "select":
      return <ChoiceEditor {...props} />;
    case "multiselect":
      return <MultiEditor {...props} />;
    case "user":
    case "record":
      return <RefEditor {...props} />;
    case "longtext":
      return <LongTextEditor {...props} />;
    default:
      return <TextEditor {...props} />;
  }
}

function TextEditor({ attr, value, seed, onCommit, onCancel }: EditorProps) {
  const initial =
    value === null || value === undefined
      ? ""
      : attr.type === "currency"
        ? String((value as number) / 100).replace(".", ",")
        : attr.type === "number"
          ? numberToInput(attr.unit, value as number)
          : String(value);
  const [text, setText] = useState(seed ?? initial);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  const commit = (move?: "next" | "prev" | "down") => {
    if (done.current) return;
    const t = text.trim();
    let out: unknown = t === "" ? null : t;
    if (t !== "" && attr.type === "number") {
      const n = inputToNumber(attr.unit, t);
      if (n === null) return setError("Zadejte číslo.");
      out = n;
    }
    if (t !== "" && attr.type === "currency") {
      const m = parseMinor(t);
      if (m === null) return setError("Zadejte částku, např. 125 000 nebo 1 250,50.");
      out = m;
    }
    done.current = true;
    onCommit(out, move);
  };

  return (
    <div className="relative size-full">
      <input
        autoFocus
        type={TEXT_INPUT[attr.type] ?? "text"}
        inputMode={attr.type === "number" || attr.type === "currency" ? "decimal" : undefined}
        value={text}
        aria-invalid={!!error}
        aria-label={attr.label}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onFocus={(e) =>
          seed
            ? e.currentTarget.setSelectionRange(seed.length, seed.length)
            : e.currentTarget.select()
        }
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit("down");
          } else if (e.key === "Escape") {
            done.current = true;
            onCancel();
          } else if (e.key === "Tab") {
            e.preventDefault();
            commit(e.shiftKey ? "prev" : "next");
          }
        }}
        onBlur={() => {
          if (!done.current) {
            if (text.trim() === initial.trim()) {
              done.current = true;
              onCancel();
            } else commit();
          }
        }}
        className={`size-full rounded-none bg-bg px-2 text-base outline-2 -outline-offset-2 ${error ? "outline-danger" : "outline-accent"}`}
      />
      {error && (
        <div
          role="alert"
          className="absolute left-0 top-full z-20 mt-0.5 rounded-md bg-danger px-2 py-1 text-xs text-white shadow-float"
        >
          {error}
        </div>
      )}
    </div>
  );
}

function LongTextEditor({ attr, value, onCommit, onCancel }: EditorProps) {
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value));
  return (
    <Popover open onOpenChange={(o) => !o && onCancel()}>
      <PopoverAnchor className="size-full" />
      <PopoverContent className="w-96 p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
        <textarea
          autoFocus
          aria-label={attr.label}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
              onCommit(text.trim() === "" ? null : text.trim());
          }}
          className="h-40 w-full resize-none rounded-md border border-line-strong bg-bg p-2 text-base outline-none focus:border-accent"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-faint">
          <span>Cmd/Ctrl + Enter uloží, Esc zruší</span>
          <button
            type="button"
            onClick={() => onCommit(text.trim() === "" ? null : text.trim())}
            className="rounded-md bg-accent px-2 py-1 font-medium text-accent-fg"
          >
            Uložit
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DateEditor({ value, onCommit, onCancel }: EditorProps) {
  return (
    <DatePicker
      value={(value as string | null) ?? null}
      open
      onOpenChange={(o) => !o && onCancel()}
      onChange={(v) => onCommit(v)}
      trigger={<button type="button" className="size-full" aria-label="Datum" />}
    />
  );
}

function optionsOf(attr: AttributeDescriptor): ComboOption[] {
  if (attr.type === "status")
    return (attr.stages ?? []).map((s) => ({ value: s.id, label: s.name, color: s.color }));
  // archivované štítky a možnosti se k novému výběru nenabízejí (u záznamů, které je mají, zůstávají vidět)
  return (attr.choices ?? [])
    .filter((c) => !c.archived)
    .map((c) => ({
      value: c.value,
      label: c.label,
      ...(c.color ? { color: c.color } : {}),
    }));
}

function ChoiceEditor({ attr, value, onCommit, onCancel }: EditorProps) {
  return (
    <Combobox
      open
      onOpenChange={(o) => !o && onCancel()}
      options={optionsOf(attr)}
      value={(value as string | null) ?? null}
      clearable={!attr.required}
      onChange={(v) => onCommit(v)}
      trigger={<button type="button" className="size-full" aria-label={attr.label} />}
    />
  );
}

function MultiEditor({ attr, value, onCommit }: EditorProps) {
  const [v, setV] = useState<string[]>((value as string[] | null) ?? []);
  const committed = useRef(false);
  const finish = () => {
    if (committed.current) return;
    committed.current = true;
    onCommit(v);
  };
  return (
    <Combobox
      open
      multiple
      onOpenChange={(o) => {
        if (!o) finish();
      }}
      options={optionsOf(attr)}
      value={v}
      onChange={(n) => setV(n as string[])}
      trigger={<button type="button" className="size-full" aria-label={attr.label} />}
    />
  );
}

function RefEditor({ attr, value, labels, lookups, onCommit, onCancel }: EditorProps) {
  const current = value as string | null;
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(true), []);
  const load = (q: string) =>
    attr.type === "user" ? lookups.users(q) : lookups.records(attr.record?.entityType ?? "", q);
  return (
    <Combobox
      open={loaded}
      onOpenChange={(o) => !o && onCancel()}
      load={load}
      value={current}
      selectedLabels={current ? { [current]: labels?.[attr.key]?.[current]?.label ?? "" } : {}}
      clearable={!attr.required}
      onChange={(v) => onCommit(v)}
      trigger={<button type="button" className="size-full" aria-label={attr.label} />}
    />
  );
}
