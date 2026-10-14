"use client";

import { Dialog, DialogContent } from "./overlay";
import { Kbd } from "./badges";

export type ShortcutGroup = { heading: string; items: { keys: string[]; label: string }[] };

/** Přehled zkratek (klávesa `?`). */
export function ShortcutsDialog({
  open,
  onOpenChange,
  groups,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  groups: ShortcutGroup[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Klávesové zkratky"
        description="Fungují všude, kde právě nepíšete do pole."
      >
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.heading}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">
                {g.heading}
              </h3>
              <ul className="space-y-1.5">
                {g.items.map((i) => (
                  <li key={i.label} className="flex items-center justify-between gap-3">
                    <span>{i.label}</span>
                    <span className="flex gap-1">
                      {i.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
