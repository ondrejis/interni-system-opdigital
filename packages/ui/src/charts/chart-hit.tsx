"use client";

import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { useNav } from "../nav";

type HitProps = {
  label: string;
  href?: string;
  onSelect?: () => void;
  tabIndex: number;
  "data-hit": number;
  onFocus: () => void;
  onBlur: () => void;
  onPointerEnter: () => void;
  onPointerMove: () => void;
  onPointerLeave: (e: PointerEvent) => void;
  onKeyDown: (e: KeyboardEvent<Element>) => void;
  children: ReactNode;
};

/**
 * Průhledná zásahová plocha kategorie, bodu nebo výřezu: větší než samotná značka, dosažitelná z klávesnice.
 * S `href` je to odkaz, s `onSelect` tlačítko (Enter i mezerník), jinak jen popsaný prvek s fokusem.
 */
export function ChartHit({ label, href, onSelect, children, ...rest }: HitProps) {
  const { Link } = useNav();
  if (href) {
    return (
      <Link
        href={href}
        aria-label={label}
        onClick={() => onSelect?.()}
        {...(rest as object)}
        className="outline-offset-0"
      >
        {children}
      </Link>
    );
  }
  if (onSelect) {
    return (
      <g
        role="button"
        aria-label={label}
        style={{ cursor: "pointer" }}
        onClick={onSelect}
        {...rest}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
            return;
          }
          rest.onKeyDown(e);
        }}
      >
        {children}
      </g>
    );
  }
  return (
    <g role="graphics-symbol" aria-label={label} {...rest}>
      {children}
    </g>
  );
}
