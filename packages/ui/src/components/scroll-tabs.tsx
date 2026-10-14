"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "../lib/cn";
import { TabsList } from "./overlay";

/**
 * Lišta záložek, která se při nedostatku místa posouvá do stran. U kraje se ukáže šipka a stínování,
 * takže je vidět, že jsou další záložky; aktivní záložka se sama dostane do výhledu.
 */
export function ScrollTabsList({
  className,
  wrapperClassName,
  children,
  ...rest
}: ComponentProps<typeof TabsList> & { wrapperClassName?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(() => {
      measure();
      el.querySelector<HTMLElement>('[data-state="active"]')?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure]);

  const by = (dir: -1 | 1) =>
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });

  const arrow =
    "absolute top-0 z-10 hidden h-full items-center bg-bg px-1 text-muted hover:text-fg md:flex";
  return (
    <div className={cn("relative", wrapperClassName)}>
      <TabsList
        ref={ref}
        onScroll={measure}
        className={cn("scrollbar-none overflow-x-auto scroll-smooth", className)}
        {...rest}
      >
        {children}
      </TabsList>
      {edge.left && (
        <button
          type="button"
          aria-label="Záložky doleva"
          onClick={() => by(-1)}
          className={cn(
            arrow,
            "left-0 border-r border-line shadow-[8px_0_8px_-6px_rgb(0_0_0/0.08)]",
          )}
        >
          <ChevronLeft className="size-4" />
        </button>
      )}
      {edge.right && (
        <button
          type="button"
          aria-label="Záložky doprava"
          onClick={() => by(1)}
          className={cn(
            arrow,
            "right-0 border-l border-line shadow-[-8px_0_8px_-6px_rgb(0_0_0/0.08)]",
          )}
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
}
