"use client";

import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";

/** Dialog bez záhlaví pro paletu příkazů (vyhledávací pole je jeho hlavička). */
export function DialogRoot({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[var(--bg-overlay)] anim-fade" />
        <D.Content className="fixed left-1/2 top-[14vh] z-50 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-bg shadow-float anim-pop outline-none">
          <D.Title className="sr-only">{title}</D.Title>
          <D.Description className="sr-only">{title}</D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export { D };
