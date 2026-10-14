"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DashboardSummary } from "@rebar/core/dashboards-shared";
import { GripVertical } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/button";
import { Field, Input } from "../components/input";
import { Dialog, DialogContent } from "../components/overlay";
import { errorToast } from "../components/toast";

/** Pojmenování nové nástěnky. */
export function NewBoardDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Nová nástěnka"
        description="Prázdnou nástěnku pak poskládáte z widgetů."
      >
        <form
          className="px-5 py-4"
          data-testid="new-board-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setBusy(true);
            try {
              await onCreate(name.trim());
              setName("");
              onOpenChange(false);
            } catch (err) {
              errorToast((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Název nástěnky" htmlFor="new-board-name">
            <Input
              id="new-board-name"
              autoFocus
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Např. Provoz tento týden"
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
              Vytvořit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ b }: { b: DashboardSummary }) {
  const s = useSortable({ id: b.id });
  return (
    <li
      ref={s.setNodeRef}
      style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition }}
      className="flex items-center gap-2 rounded-md border border-line bg-bg px-2 py-1.5"
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-0.5 text-faint hover:bg-hover"
        aria-label={`Přesunout nástěnku „${b.name}“`}
        {...s.attributes}
        {...s.listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="truncate">{b.name}</span>
    </li>
  );
}

/** Pořadí nástěnek v přepínači (moje osobní řazení; přetažením nebo klávesnicí). */
export function OrderDialog({
  open,
  onOpenChange,
  boards,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  boards: DashboardSummary[];
  onSave: (ids: string[]) => Promise<void>;
}) {
  const [items, setItems] = useState(boards);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function end(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((b) => b.id === e.active.id);
    const to = items.findIndex((b) => b.id === e.over!.id);
    setItems(arrayMove(items, from, to));
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Pořadí nástěnek"
        description="Přetáhněte nástěnky do požadovaného pořadí."
      >
        <div className="px-5 py-4">
          <DndContext
            id="board-order"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={end}
          >
            <SortableContext items={items.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {items.map((b) => (
                  <Row key={b.id} b={b} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <div className="mt-3 flex justify-end gap-2 border-t border-line pt-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSave(items.map((b) => b.id));
                  onOpenChange(false);
                } catch (e) {
                  errorToast((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Uložit pořadí
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
