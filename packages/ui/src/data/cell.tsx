import {
  formatDate,
  formatMinor,
  formatNumberUnit,
  type AttributeDescriptor,
  type Labels,
} from "@rebar/core/shared";
import { Building2, Check } from "lucide-react";
import { Avatar, Chip } from "../components/badges";
import { cn } from "../lib/cn";

/**
 * Zobrazení hodnoty atributu podle typu (v buňce tabulky, na kartě i v panelu atributů).
 * Výchozí je jednořádkové zkrácení (tabulka, karta kanbanu; plný text je v `title`). S `wrap` (panel údajů záznamu)
 * se dlouhý text zalomí na víc řádků a nic se nezkracuje.
 */
export function CellValue({
  attr,
  value,
  labels,
  className,
  wrap,
}: {
  attr: AttributeDescriptor;
  value: unknown;
  labels?: Labels | undefined;
  className?: string;
  wrap?: boolean;
}) {
  const text = wrap ? "min-w-0 [overflow-wrap:anywhere]" : "truncate";
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return attr.type === "checkbox" ? <span className="text-faint">—</span> : null;
  }
  switch (attr.type) {
    case "currency":
      return <span className={cn("tabular", className)}>{formatMinor(value as number)}</span>;
    case "number":
      return (
        <span className={cn("tabular", className)}>
          {formatNumberUnit(attr.unit, value as number)}
        </span>
      );
    case "date":
      return <span className={cn("tabular", className)}>{formatDate(value as string)}</span>;
    case "checkbox":
      return value ? (
        <Check className="size-4 text-success" aria-label="Ano" />
      ) : (
        <span className="text-faint">—</span>
      );
    case "status": {
      const stage = attr.stages?.find((s) => s.id === value);
      return stage ? (
        <Chip color={stage.color} dot>
          {stage.name}
        </Chip>
      ) : (
        <span className="text-faint">?</span>
      );
    }
    case "select": {
      const c = attr.choices?.find((x) => x.value === value);
      return <Chip color={c?.color ?? "gray"}>{c?.label ?? String(value)}</Chip>;
    }
    case "multiselect":
      return (
        <span className="flex flex-wrap gap-1">
          {(value as string[]).map((v) => {
            const c = attr.choices?.find((x) => x.value === v);
            return (
              <Chip key={v} color={c?.color ?? "gray"}>
                {c?.label ?? v}
              </Chip>
            );
          })}
        </span>
      );
    case "user": {
      const name = labels?.[attr.key]?.[String(value)]?.label ?? "…";
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar name={name} size={18} />
          <span className={text} {...(wrap ? {} : { title: name })}>
            {name}
          </span>
        </span>
      );
    }
    case "record": {
      const label = labels?.[attr.key]?.[String(value)]?.label ?? "…";
      return (
        <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-hover px-1.5 py-0.5">
          <Building2 className="size-3.5 shrink-0 text-faint" />
          <span className={text} {...(wrap ? {} : { title: label })}>
            {label}
          </span>
        </span>
      );
    }
    case "email":
      return (
        <span className={text} {...(wrap ? {} : { title: String(value) })}>
          {String(value)}
        </span>
      );
    case "url": {
      const shown = String(value)
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
      return (
        <span className={cn(text, "text-accent")} {...(wrap ? {} : { title: shown })}>
          {shown}
        </span>
      );
    }
    default:
      return (
        <span className={text} {...(wrap ? {} : { title: String(value) })}>
          {String(value)}
        </span>
      );
  }
}

/** Zarovnání obsahu: čísla a částky vpravo. */
export const alignRight = (attr: AttributeDescriptor) =>
  attr.type === "number" || attr.type === "currency";

/** Text hodnoty pro exporty a hledání (bez formátování komponent). */
export function plainValue(attr: AttributeDescriptor, value: unknown, labels?: Labels): string {
  if (value === null || value === undefined) return "";
  switch (attr.type) {
    case "currency":
      return formatMinor(value as number);
    case "number":
      return attr.unit ? formatNumberUnit(attr.unit, value as number) : String(value);
    case "date":
      return formatDate(value as string);
    case "status":
      return attr.stages?.find((s) => s.id === value)?.name ?? "";
    case "select":
      return attr.choices?.find((c) => c.value === value)?.label ?? String(value);
    case "multiselect":
      return (value as string[])
        .map((v) => attr.choices?.find((c) => c.value === v)?.label ?? v)
        .join(", ");
    case "user":
    case "record":
      return labels?.[attr.key]?.[String(value)]?.label ?? "";
    case "checkbox":
      return value ? "ano" : "ne";
    default:
      return String(value);
  }
}
