import { cn } from "@rebar/ui";
import type { ReactNode } from "react";

export type TableColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Hlavní buňka řádku: na úzké obrazovce je nadpis karty bez popisku. */
  primary?: boolean;
  className?: string;
};

/**
 * Tabulka stránek Nastavení. Na široké ploše běžná tabulka, na úzké (podle šířky sloupce stránky, ne okna) se každý
 * řádek změní v kartu s popisky u hodnot, takže se nikdy neposouvá do strany. Jeden DOM, jen jiné zobrazení.
 */
export function SettingsTable<T>({
  label,
  columns,
  rows,
  rowKey,
  actions,
  actionsLabel = "Akce",
  actionsPlacement = "corner",
  rowClassName,
  rowId,
  testId,
}: {
  /** Název tabulky pro čtečky obrazovky. */
  label: string;
  columns: TableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Poslední sloupec bez záhlaví (nabídka akcí). */
  actions?: (row: T) => ReactNode;
  actionsLabel?: string;
  /** Na úzké obrazovce: `corner` = v pravém horním rohu karty (jedna ikona), `footer` = vlastní řádek pod kartou. */
  actionsPlacement?: "corner" | "footer";
  rowClassName?: (row: T) => string | undefined;
  rowId?: (row: T) => string | undefined;
  testId?: string;
}) {
  return (
    <table
      aria-label={label}
      data-testid={testId}
      className="block w-full text-left text-base @3xl:table"
    >
      <thead className="sr-only @3xl:not-sr-only @3xl:table-header-group">
        <tr className="border-b border-line bg-subtle text-sm font-medium text-muted">
          {columns.map((c) => (
            <th
              key={c.key}
              scope="col"
              className="h-9 whitespace-nowrap px-3 font-medium first:pl-5"
            >
              {c.header}
            </th>
          ))}
          {actions && (
            <th scope="col" className="h-9 w-px pr-3">
              <span className="sr-only">{actionsLabel}</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody className="block divide-y divide-line @3xl:table-row-group">
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            id={rowId?.(row)}
            className={cn("relative block px-4 py-3 @3xl:table-row @3xl:p-0", rowClassName?.(row))}
          >
            {columns.map((c) => (
              <td
                key={c.key}
                data-label={c.primary ? undefined : c.header}
                className={cn(
                  "flex min-w-0 gap-2 py-0.5 @3xl:table-cell @3xl:h-9 @3xl:px-3 @3xl:py-1 @3xl:align-middle @3xl:first:pl-5",
                  c.primary
                    ? "pr-10 font-medium @3xl:pr-3"
                    : "text-muted before:w-28 before:shrink-0 before:text-faint before:content-[attr(data-label)] @3xl:text-fg @3xl:before:hidden",
                  c.className,
                )}
              >
                <div className="min-w-0 flex-1">{c.cell(row)}</div>
              </td>
            ))}
            {actions && (
              <td
                className={cn(
                  "@3xl:static @3xl:table-cell @3xl:w-px @3xl:whitespace-nowrap @3xl:py-1 @3xl:pr-3 @3xl:text-right @3xl:align-middle",
                  actionsPlacement === "corner"
                    ? "absolute right-3 top-2"
                    : "flex justify-end gap-2 pt-2",
                )}
              >
                {actions(row)}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
