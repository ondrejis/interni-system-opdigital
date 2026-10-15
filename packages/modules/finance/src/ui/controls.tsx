"use client";

import { cn } from "@rebar/ui";
import type { SelectHTMLAttributes } from "react";
import { useUsers } from "./common";

/** Nativní výběr ve stylu polí systému (výška 32 px, přístupný na dotyku i klávesnici). */
export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-8 w-full rounded-md border border-line-strong bg-bg px-2 text-base text-fg transition-colors duration-150 hover:border-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}

/** Výběr uživatele (v OPSYS dva lidé, proto nativní výběr); `allowEmpty` přidá volbu „Kdokoli“. */
export function UserSelect({
  value,
  onChange,
  allowEmpty,
  emptyLabel = "Kdokoli",
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: string | null | undefined;
  onChange: (id: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  "aria-label": string;
}) {
  const users = useUsers();
  return (
    <Select
      aria-label={ariaLabel}
      value={value ?? ""}
      disabled={disabled}
      className={className}
      onChange={(e) => onChange(e.target.value)}
    >
      {(allowEmpty || !value) && <option value="">{allowEmpty ? emptyLabel : "Vybrat…"}</option>}
      {users.map((u) => (
        <option key={u.value} value={u.value}>
          {u.label}
        </option>
      ))}
    </Select>
  );
}
