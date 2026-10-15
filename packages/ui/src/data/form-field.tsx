"use client";

import {
  formatMinor,
  inputToNumber,
  numberToInput,
  parseMinor,
  type AttributeDescriptor,
  type Labels,
} from "@rebar/core/shared";
import { useState } from "react";
import { Combobox, type ComboOption } from "../components/combobox";
import { DatePicker } from "../components/date-picker";
import { Input, Textarea } from "../components/input";
import { Checkbox } from "../components/overlay";
import type { Lookups } from "./types";

const HTML_TYPE: Record<string, string> = { email: "email", phone: "tel", url: "url" };

export function optionsOf(attr: AttributeDescriptor): ComboOption[] {
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

/** Vstupní pole pro atribut podle jeho typu (formuláře: vytvoření záznamu, panel atributů). */
export function FormField({
  attr,
  value,
  onChange,
  lookups,
  labels,
  id,
  autoFocus,
  invalid,
}: {
  attr: AttributeDescriptor;
  value: unknown;
  onChange: (v: unknown) => void;
  lookups: Lookups;
  labels?: Labels | undefined;
  id?: string;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  switch (attr.type) {
    case "longtext":
      return (
        <Textarea
          id={id}
          autoFocus={autoFocus}
          aria-invalid={invalid}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        />
      );
    case "number":
    case "currency":
      return (
        <MoneyOrNumber
          attr={attr}
          id={id}
          autoFocus={autoFocus}
          invalid={invalid}
          value={value as number | null}
          onChange={onChange}
        />
      );
    case "date":
      return <DatePicker value={(value as string | null) ?? null} onChange={onChange} />;
    case "checkbox":
      return <Checkbox id={id} checked={!!value} onCheckedChange={(v) => onChange(!!v)} />;
    case "status":
    case "select":
      return (
        <Combobox
          options={optionsOf(attr)}
          value={(value as string | null) ?? null}
          onChange={onChange}
          clearable={!attr.required}
        />
      );
    case "multiselect":
      return (
        <Combobox
          multiple
          options={optionsOf(attr)}
          value={(value as string[] | null) ?? []}
          onChange={onChange}
        />
      );
    case "user":
      return (
        <Combobox
          load={lookups.users}
          value={(value as string | null) ?? null}
          selectedLabels={selected(attr, value, labels)}
          onChange={onChange}
          clearable={!attr.required}
        />
      );
    case "record":
      return (
        <Combobox
          load={(q) => lookups.records(attr.record?.entityType ?? "", q)}
          value={(value as string | null) ?? null}
          selectedLabels={selected(attr, value, labels)}
          onChange={onChange}
          clearable={!attr.required}
        />
      );
    default:
      return (
        <Input
          id={id}
          autoFocus={autoFocus}
          aria-invalid={invalid}
          type={HTML_TYPE[attr.type] ?? "text"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        />
      );
  }
}

function selected(
  attr: AttributeDescriptor,
  value: unknown,
  labels?: Labels,
): Record<string, string> {
  if (typeof value !== "string") return {};
  const label = labels?.[attr.key]?.[value]?.label;
  return label ? { [value]: label } : {};
}

function MoneyOrNumber({
  attr,
  value,
  onChange,
  id,
  autoFocus,
  invalid,
}: {
  attr: AttributeDescriptor;
  value: number | null;
  onChange: (v: unknown) => void;
  id?: string | undefined;
  autoFocus?: boolean | undefined;
  invalid?: boolean | undefined;
}) {
  const isMoney = attr.type === "currency";
  const [text, setText] = useState(
    value === null || value === undefined
      ? ""
      : isMoney
        ? String(value / 100).replace(".", ",")
        : numberToInput(attr.unit, value),
  );
  const [bad, setBad] = useState(false);
  return (
    <div>
      <Input
        id={id}
        autoFocus={autoFocus}
        inputMode="decimal"
        aria-invalid={invalid || bad}
        value={text}
        placeholder={isMoney ? "např. 125 000" : ""}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (t.trim() === "") {
            setBad(false);
            return onChange(null);
          }
          if (isMoney) {
            const m = parseMinor(t);
            setBad(m === null);
            if (m !== null) onChange(m);
          } else {
            const n = inputToNumber(attr.unit, t);
            setBad(n === null);
            if (n !== null) onChange(n);
          }
        }}
      />
      {bad ? (
        <p role="alert" className="mt-1 text-sm text-danger">
          {isMoney ? "Zadejte částku, např. 125 000 nebo 1 250,50." : "Zadejte číslo."}
        </p>
      ) : isMoney && typeof value === "number" ? (
        <p className="mt-1 text-sm text-faint">{formatMinor(value)}</p>
      ) : null}
    </div>
  );
}
