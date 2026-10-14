"use client";

import type { AttributeDescriptor, EntityDescriptor, Labels, RecordRow } from "@rebar/core/shared";
import {
  Card,
  CellEditor,
  CellValue,
  FieldList,
  FieldRow as UiFieldRow,
  Icon,
  cn,
  useEntityApi,
  useUpdateAttribute,
} from "@rebar/ui";
import { useEffect, useState, type ReactNode } from "react";

/** Přehledné sbalitelné sekce (karty) a řádky polí levého sloupce detailu. */

const STORE = "crm.deal.section.";

/** Zapamatuje sbalení sekce v prohlížeči (jen pohodlí; bez úložiště se sekce prostě otevře výchozím stavem). */
function useStoredOpen(id: string, initial: boolean, collapseOnPhone: boolean) {
  const [open, setOpen] = useState(initial);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORE + id);
    } catch {
      /* úložiště nemusí být dostupné */
    }
    if (stored === "0" || stored === "1") setOpen(stored === "1");
    // na telefonu jsou vedlejší sekce výchozně sbalené, ať je pracovní plocha na dosah
    else if (collapseOnPhone && window.matchMedia("(max-width: 639px)").matches) setOpen(false);
  }, [id, collapseOnPhone]);
  const toggle = () =>
    setOpen((o) => {
      try {
        window.localStorage.setItem(STORE + id, o ? "0" : "1");
      } catch {
        /* úložiště nemusí být dostupné */
      }
      return !o;
    });
  return [open, toggle] as const;
}

/**
 * Sbalitelná sekce levého sloupce: karta se záhlavím (šipka, nadpis, počet vyplněných polí, akce) a řádky polí.
 * Záhlaví je vždy vidět, takže i sbalené sekce jsou od sebe zřetelně oddělené.
 */
export function Section({
  id,
  title,
  defaultOpen = true,
  collapseOnPhone = false,
  action,
  summary,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  /** Na telefonu se sekce výchozně sbalí (uživatel si ji může otevřít a zapamatuje se to). */
  collapseOnPhone?: boolean;
  /** Malá akce vpravo v nadpisu (např. přidat). */
  action?: ReactNode;
  /** Krátký doplněk v záhlaví (např. „3 z 5“), ať je vidět obsah i u sbalené sekce. */
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [open, toggle] = useStoredOpen(id, defaultOpen, collapseOnPhone);
  return (
    <Card aria-label={title} data-testid={`deal-section-${id}`}>
      <div className="card-head p-0 pr-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="group flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-[inherit] px-4 text-left text-sm font-semibold hover:bg-hover/60 pointer-coarse:min-h-11"
        >
          <Icon
            name="chevron-right"
            className={cn("size-3.5 shrink-0 text-faint transition-transform", open && "rotate-90")}
          />
          <span className="min-w-0 truncate">{title}</span>
          {summary && <span className="ml-auto text-xs font-normal text-faint">{summary}</span>}
        </button>
        {action}
      </div>
      {open && <FieldList className="pb-1">{children}</FieldList>}
    </Card>
  );
}

/** Řádek „popisek — hodnota“ levého sloupce (sdílený `FieldRow` z `@rebar/ui`). */
export function FieldRow({
  label,
  children,
  hint,
  below,
  empty,
  testId,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  below?: ReactNode;
  empty?: boolean;
  testId?: string;
}) {
  return (
    <UiFieldRow
      label={label}
      hint={hint}
      below={below}
      empty={empty}
      className="hover:bg-hover/40"
      data-testid={testId}
    >
      {children}
    </UiFieldRow>
  );
}

const TEXT_TYPES = new Set(["text", "longtext", "number", "currency", "email", "phone", "url"]);

/** Typy, u kterých se editor ukáže hned (jinak by se otevřel výběr nebo kalendář sám). */
export const isTypedInline = (a: AttributeDescriptor) => TEXT_TYPES.has(a.type);

/**
 * Jedno pole zakázky s úpravou na místě: hodnota je tlačítko, klik otevře editor podle typu (Enter ukládá, Esc ruší).
 * Chybu zápisu (české věty z kontrol) ukáže pod polem. Pole, které aktér nevidí (oprávnění), se nevykreslí.
 */
export function AttrField({
  entity,
  attrKey,
  row,
  labels,
  label,
  render,
  display,
  hint,
  below,
  placeholder = "Vyplnit…",
  readOnly,
  onSaved,
}: {
  entity: EntityDescriptor;
  attrKey: string;
  row: RecordRow;
  labels: Labels;
  label?: string;
  /** Vlastní zobrazení hodnoty (jinak podle typu atributu). */
  render?: (value: unknown) => ReactNode;
  /** Nahradí zobrazení úplně (i u prázdné hodnoty), úprava na klik zůstává. */
  display?: ReactNode;
  hint?: ReactNode;
  /** Doplněk pod hodnotou (např. kontakt firmy). */
  below?: ReactNode;
  placeholder?: string;
  readOnly?: boolean;
  onSaved?: () => void;
}) {
  const attr = entity.attributes.find((a) => a.key === attrKey);
  const update = useUpdateAttribute(entity.key);
  const api = useEntityApi();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!attr) return null;
  const value = row[attr.key];
  const canEdit = entity.can.write && !attr.readonly && !readOnly;
  const empty =
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && !value.length);

  async function save(next: unknown) {
    setEditing(false);
    if (JSON.stringify(value ?? null) === JSON.stringify(next ?? null)) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: row.id,
        attr: attrKey,
        value: next,
        updatedAt: row.updatedAt,
      });
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <FieldRow
      label={label ?? attr.label}
      hint={hint}
      below={below}
      empty={empty && display === undefined}
      testId={`deal-field-${attrKey}`}
    >
      {editing ? (
        <div className="relative h-8 w-full">
          <CellEditor
            attr={attr}
            value={value}
            labels={labels}
            lookups={api.lookups}
            onCommit={(v) => void save(v)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setEditing(true)}
          aria-label={`Upravit ${label ?? attr.label}`}
          className={cn(
            "flex min-h-7 w-full min-w-0 items-center rounded-md px-1 py-0.5 text-left text-base [overflow-wrap:anywhere] pointer-coarse:min-h-11",
            canEdit && "hover:bg-hover",
          )}
        >
          {display !== undefined ? (
            display
          ) : empty ? (
            <span className="text-faint">{canEdit ? placeholder : "—"}</span>
          ) : render ? (
            render(value)
          ) : (
            <CellValue
              attr={attr}
              value={value}
              labels={labels}
              wrap
              className="min-w-0 [overflow-wrap:anywhere]"
            />
          )}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-1 px-1 text-sm text-danger">
          {error}
        </p>
      )}
    </FieldRow>
  );
}
