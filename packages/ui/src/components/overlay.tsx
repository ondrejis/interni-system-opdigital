"use client";

import { Check, X } from "lucide-react";
import {
  Dialog as D,
  DropdownMenu as M,
  Popover as P,
  Tooltip as T,
  Checkbox as C,
  Tabs as TB,
} from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

const floating = "z-50 rounded-lg bg-bg text-fg shadow-float anim-pop outline-none";

/* ---------- Popover ---------- */
export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...rest
}: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(floating, "min-w-56 border border-line p-1", className)}
        {...rest}
      />
    </P.Portal>
  );
}

/* ---------- Tooltip ---------- */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <T.Provider delayDuration={400}>{children}</T.Provider>;
}
export function Tooltip({
  label,
  shortcut,
  children,
  side = "top",
}: {
  label: string;
  shortcut?: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 flex items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs text-bg anim-fade"
        >
          {label}
          {shortcut && <span className="rounded bg-white/15 px-1 font-medium">{shortcut}</span>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/* ---------- Dialog (modál) ---------- */
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;
export function DialogContent({
  title,
  description,
  className,
  children,
  ...rest
}: ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[var(--bg-overlay)] anim-fade" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-[12vh] z-50 max-h-[80vh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 overflow-auto rounded-xl border border-line bg-bg shadow-float anim-pop outline-none",
          className,
        )}
        {...rest}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3">
          <div>
            <D.Title className="text-lg font-semibold">{title}</D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close
            aria-label="Zavřít"
            className="rounded-md p-1 text-muted hover:bg-hover hover:text-fg"
          >
            <X className="size-4" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

/* ---------- Sheet: boční panel (detail záznamu) ---------- */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  width = 520,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <D.Portal>
        <D.Content
          onInteractOutside={(e) => {
            // klik mimo panel ho nezavírá — kontext seznamu zůstává; zavírá se křížkem, Esc nebo klikem na jiný záznam
            e.preventDefault();
          }}
          className="fixed bottom-0 right-0 top-0 z-40 flex max-w-full flex-col border-l border-line bg-bg shadow-float anim-slide-in outline-none"
          style={{ width }}
        >
          <D.Title className="sr-only">{title}</D.Title>
          <D.Description className="sr-only">{title}</D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/* ---------- Menu ---------- */
export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 6,
  ...rest
}: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(floating, "min-w-48 border border-line p-1", className)}
        {...rest}
      />
    </M.Portal>
  );
}
export function DropdownMenuItem({
  className,
  danger,
  inset,
  ...rest
}: ComponentProps<typeof M.Item> & { danger?: boolean; inset?: boolean }) {
  return (
    <M.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-base outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-hover [&_svg]:size-4 [&_svg]:text-muted",
        danger && "text-danger [&_svg]:text-danger",
        inset && "pl-8",
        className,
      )}
      {...rest}
    />
  );
}
export function DropdownMenuLabel({ className, ...rest }: ComponentProps<typeof M.Label>) {
  return (
    <M.Label
      className={cn("px-2 py-1 text-xs font-medium uppercase tracking-wide text-faint", className)}
      {...rest}
    />
  );
}
export function DropdownMenuSeparator({ className, ...rest }: ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...rest} />;
}
export function DropdownMenuCheckboxItem({
  className,
  children,
  ...rest
}: ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem
      className={cn(
        "relative flex cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-base outline-none data-[highlighted]:bg-hover",
        className,
      )}
      {...rest}
    >
      <M.ItemIndicator className="absolute left-2">
        <Check className="size-4" />
      </M.ItemIndicator>
      {children}
    </M.CheckboxItem>
  );
}

/* ---------- Checkbox ---------- */
export function Checkbox({ className, ...rest }: ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded border border-line-strong bg-bg transition-colors hover:border-faint data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent",
        className,
      )}
      {...rest}
    >
      <C.Indicator className="text-accent-fg">
        <Check className="size-3" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  );
}

/* ---------- Tabs ---------- */
export const Tabs = TB.Root;
export function TabsList({ className, ...rest }: ComponentProps<typeof TB.List>) {
  return <TB.List className={cn("flex gap-1 border-b border-line", className)} {...rest} />;
}
export function TabsTrigger({ className, ...rest }: ComponentProps<typeof TB.Trigger>) {
  return (
    <TB.Trigger
      className={cn(
        "-mb-px shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-base font-medium text-muted transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg",
        className,
      )}
      {...rest}
    />
  );
}
export const TabsContent = TB.Content;
