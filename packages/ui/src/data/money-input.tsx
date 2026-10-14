"use client";

import { formatMinor, parseMinor } from "@rebar/core/shared";
import { useState } from "react";
import { Input } from "../components/input";

/**
 * Pole pro částku: uživatel píše „125 000“ nebo „1 250,50“, hodnota jde ven v haléřích (`null` = prázdné nebo neplatné).
 * Neplatný vstup se označí, ale neztratí se.
 */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  className,
  "aria-label": ariaLabel,
  id,
}: {
  value: number | null;
  onChange: (minor: number | null) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  id?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value / 100).replace(".", ","));
  const [bad, setBad] = useState(false);
  return (
    <Input
      id={id}
      inputMode="decimal"
      aria-label={ariaLabel}
      aria-invalid={bad}
      className={className}
      value={text}
      placeholder={placeholder ?? "0"}
      title={value !== null ? formatMinor(value) : undefined}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === "") {
          setBad(false);
          return onChange(null);
        }
        const m = parseMinor(t);
        setBad(m === null);
        onChange(m);
      }}
    />
  );
}
