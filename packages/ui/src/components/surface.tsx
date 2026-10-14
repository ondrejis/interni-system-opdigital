import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "../lib/cn";

/*
  Primitiva oddělování prvků (docs/UI-SPACING.md, „Oddělování prvků“): karta, záhlaví karty a řádek „popisek: hodnota“.
  Karta je povrch `--bg-card` s okrajem `--line` a jemným stínem; uvnitř ji dělí `--line-soft`. Podklad pod kartami
  (`bg-sunken`) dává kartám něco, od čeho se odlišují.
*/

/** Karta: povrch s okrajem a jemným stínem (třída `.card` ve `styles.css`). */
export function Card({
  as,
  className,
  ...rest
}: { as?: ElementType } & Omit<ComponentProps<"section">, "ref">) {
  const Tag = as ?? "section";
  return <Tag className={cn("card", className)} {...rest} />;
}

/**
 * Záhlaví karty: pruh s nadpisem (`text-sm font-semibold`), volitelnou ikonou, počtem a akcí vpravo,
 * od těla odděleno jemnou čárou. Nadpis je `h3`, pokud `heading` neurčí jinak.
 */
export function CardHeader({
  title,
  icon,
  count,
  action,
  heading: Heading = "h3",
  className,
  children,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
  heading?: ElementType;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("card-head", className)}>
      {icon && <span className="flex shrink-0 text-faint [&_svg]:size-4">{icon}</span>}
      {title && <Heading className="min-w-0 truncate text-sm font-semibold">{title}</Heading>}
      {count !== undefined && count !== null && (
        <span className="tabular rounded-full bg-hover px-1.5 text-xs font-medium text-muted">
          {count}
        </span>
      )}
      {children}
      {action && <div className="ml-auto flex shrink-0 items-center gap-1">{action}</div>}
    </div>
  );
}

/** Tělo karty: odsazení `p-4`; `flush` je bez něj (seznam nebo řádky polí přes celou šířku karty). */
export function CardBody({
  flush,
  className,
  ...rest
}: { flush?: boolean } & ComponentProps<"div">) {
  return <div className={cn(!flush && "p-4", className)} {...rest} />;
}

/** Šířka sloupce popisků u řádků polí; stejná v celém detailu, aby popisky ležely pod sebou. */
export const FIELD_LABEL_COLUMN = "grid-cols-[minmax(6rem,8rem)_minmax(0,1fr)]";

/** Seznam řádků polí v kartě (řádky odděluje `--line-soft`). */
export function FieldList({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("field-list", className)} {...rest} />;
}

/**
 * Řádek „popisek — hodnota“: popisek vlevo (zalamuje se, nezkracuje), hodnota vpravo (dlouhý text se zalomí
 * bez přetečení). `below` je doplněk pod hodnotou (kontakt firmy), `hint` nápověda drobným písmem.
 */
export function FieldRow({
  label,
  icon,
  children,
  hint,
  below,
  empty,
  className,
  ...rest
}: {
  label: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  below?: ReactNode;
  /** Prázdná hodnota: popisek je tlumenější, aby se prázdná pole nepletla s vyplněnými. */
  empty?: boolean;
  className?: string;
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      className={cn("field-row grid items-start gap-x-3", FIELD_LABEL_COLUMN, className)}
      {...rest}
    >
      <div
        className={cn(
          "flex min-h-7 items-start gap-1.5 py-1 text-sm leading-5 [overflow-wrap:anywhere] pointer-coarse:min-h-11 pointer-coarse:items-center",
          empty ? "text-faint" : "text-muted",
        )}
      >
        {icon && <span className="mt-0.5 flex shrink-0 text-faint [&_svg]:size-3.5">{icon}</span>}
        <span className="min-w-0">{label}</span>
      </div>
      <div className="min-w-0">
        {children}
        {hint && <div className="mt-0.5 px-1 text-xs text-faint">{hint}</div>}
        {below}
      </div>
    </div>
  );
}
