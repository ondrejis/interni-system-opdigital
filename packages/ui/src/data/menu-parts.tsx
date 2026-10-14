"use client";

import { Check, ChevronRight } from "lucide-react";
import { DropdownMenu as M } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

/*
  Menu s podnabídkami a volbou jedné položky pro nástrojovou lištu seznamu (Zobrazení, Pohledy). Společné `DropdownMenu*`
  v `components/overlay` podnabídky nemá; tady jsou jen části navíc, stejný vzhled.
*/

const floating = "z-50 rounded-lg bg-bg text-fg shadow-float anim-pop outline-none";
const row =
  "flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-base outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-hover data-[state=open]:bg-hover [&_svg]:size-4 [&_svg]:text-muted";

export const MenuSub = M.Sub;
export const MenuRadioGroup = M.RadioGroup;

/** Položka, která otevře podnabídku; vpravo volitelná hodnota (např. počet) a šipka. */
export function MenuSubTrigger({
  className,
  children,
  hint,
  ...rest
}: ComponentProps<typeof M.SubTrigger> & { hint?: ReactNode }) {
  return (
    <M.SubTrigger className={cn(row, className)} {...rest}>
      {children}
      <span className="ml-auto flex items-center gap-1 pl-3 text-sm text-faint">
        {hint}
        <ChevronRight className="!size-3.5 !text-faint" aria-hidden />
      </span>
    </M.SubTrigger>
  );
}

export function MenuSubContent({ className, ...rest }: ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent
        sideOffset={4}
        collisionPadding={8}
        className={cn(
          floating,
          "scrollbar-thin max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] min-w-48 overflow-auto border border-line p-1",
          className,
        )}
        {...rest}
      />
    </M.Portal>
  );
}

/** Položka s volbou jedné hodnoty (`role="menuitemradio"`), zaškrtnutá, když je vybraná. */
export function MenuRadioItem({
  className,
  children,
  ...rest
}: ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(row, "relative items-start pl-8", className)} {...rest}>
      <M.ItemIndicator className="absolute left-2 top-2">
        <Check className="size-4 !text-accent" aria-hidden />
      </M.ItemIndicator>
      {children}
    </M.RadioItem>
  );
}
