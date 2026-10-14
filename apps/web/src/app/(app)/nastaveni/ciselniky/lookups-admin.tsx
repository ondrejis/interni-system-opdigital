"use client";

import {
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  FormSection,
  IconButton,
  Input,
  Notice,
  cn,
} from "@rebar/ui";
import { Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { runAction } from "@/lib/run-action";
import {
  addLookupItemAction,
  reorderLookupItemsAction,
  updateLookupItemAction,
} from "@/server/config-actions";
import { ColorPicker, MoveButtons, moved, slugify, useRefreshConfig } from "../_shared/config-ui";

type Item = { id: string; value: string; label: string; color: string | null; active: boolean };
type List = { id: string; key: string; name: string; items: Item[] };

function ItemDialog({
  list,
  item,
  onClose,
  onSaved,
}: {
  list: List;
  item: Item | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(item?.label ?? "");
  const [color, setColor] = useState(item?.color ?? "gray");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await runAction(
      item
        ? updateLookupItemAction({ id: item.id, label, color })
        : addLookupItemAction({
            key: list.key,
            // stabilní klíč se odvodí z názvu; při shodě dostane číslo
            value: uniqueValue(
              slugify(label) || "polozka",
              list.items.map((i) => i.value),
            ),
            label,
            color,
          }),
      item ? "Položka uložena." : "Položka přidána.",
    );
    setBusy(false);
    if (res) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={item ? "Upravit položku" : "Nová položka"} description={list.name}>
        <form onSubmit={submit} className="px-5 py-4">
          <Field label="Název položky" htmlFor="lookup-label">
            <Input
              id="lookup-label"
              autoFocus
              value={label}
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field label="Barva">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!label.trim()}>
              {item ? "Uložit" : "Přidat položku"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function uniqueValue(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base}_${n}`)) return `${base}_${n}`;
}

/** Správa číselníků: položky přidat, přejmenovat, přebarvit, deaktivovat a přeřadit. Mazání se nedělá (záznamy se na položky odkazují). */
export function LookupsAdmin({ lists }: { lists: List[] }) {
  const refresh = useRefreshConfig();
  const [selectedKey, setSelectedKey] = useState(lists[0]?.key);
  const list = lists.find((l) => l.key === selectedKey) ?? lists[0];
  const [order, setOrder] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<{ item: Item | null } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOrder(null), [lists]);

  if (!list)
    return <EmptyState title="Žádné číselníky" description="Zapnuté moduly zatím žádné nemají." />;

  const items = order
    ? order.map((id) => list.items.find((i) => i.id === id)).filter((i): i is Item => !!i)
    : list.items;

  async function move(from: number, delta: -1 | 1) {
    const ids = moved(
      items.map((i) => i.id),
      from,
      delta,
    );
    setOrder(ids);
    setBusy(true);
    const ok = await runAction(reorderLookupItemsAction({ key: list!.key, ids }));
    setBusy(false);
    if (ok) refresh();
    else setOrder(null);
  }

  async function toggle(item: Item, active: boolean) {
    if (await runAction(updateLookupItemAction({ id: item.id, active }))) refresh();
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 @3xl:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Číselníky" className="min-w-0 @3xl:sticky @3xl:top-0">
        <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 @3xl:mx-0 @3xl:flex-col @3xl:gap-1 @3xl:overflow-visible @3xl:px-0 @3xl:pb-0">
          {lists.map((l) => (
            <li key={l.id} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedKey(l.key);
                  setOrder(null);
                }}
                aria-current={l.key === list.key}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors duration-150 @3xl:py-2.5",
                  l.key === list.key
                    ? "border-[var(--accent-line)] bg-accent-soft"
                    : "border-line bg-bg hover:bg-hover",
                )}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                <span className="rounded-full bg-hover px-1.5 text-sm text-muted tabular">
                  {l.items.length}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 space-y-6">
        <FormSection
          title={list.name}
          description="Neaktivní položka se už nenabízí při výběru, ale u starších záznamů zůstává."
          flush
          footer={
            <Button variant="primary" onClick={() => setEditing({ item: null })}>
              <Plus /> Přidat položku
            </Button>
          }
        >
          {items.length === 0 ? (
            <p className="px-5 pb-4 text-base text-muted">Číselník zatím nemá žádné položky.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line" data-testid="lookup-items">
              {items.map((it, i) => (
                <li
                  key={it.id}
                  data-testid="lookup-row"
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3"
                >
                  <label className="flex min-w-48 flex-1 items-center gap-3">
                    <Checkbox
                      aria-label={`Položka ${it.label} je aktivní`}
                      checked={it.active}
                      onCheckedChange={(v) => void toggle(it, !!v)}
                    />
                    <Chip color={it.color ?? "gray"} className={cn(!it.active && "opacity-50")}>
                      {it.label}
                    </Chip>
                  </label>
                  {!it.active && <Chip>Neaktivní</Chip>}
                  <div className="flex gap-1">
                    <MoveButtons
                      index={i}
                      count={items.length}
                      name={it.label}
                      disabled={busy}
                      onMove={(d) => void move(i, d)}
                    />
                    <IconButton
                      label={`Upravit položku ${it.label}`}
                      variant="ghost"
                      onClick={() => setEditing({ item: it })}
                    >
                      <Pencil />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </FormSection>
        <Notice tone="info" title="Proč se položky nemažou">
          Záznamy se na položky odkazují. Nepotřebnou položku proto jen vypněte: přestane se
          nabízet, ale starší záznamy o ni nepřijdou.
        </Notice>
      </div>
      {editing && (
        <ItemDialog
          key={editing.item?.id ?? "new"}
          list={list}
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
