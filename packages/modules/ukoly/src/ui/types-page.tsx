"use client";

/*
  Nastavení → Typy aktivit (`/ukoly/typy`, NAS-07): název, ikona, barva a zda se typ ukazuje v kalendáři. Systémové typy
  (Úkol, Hovor, Schůzka, E-mail, Termín) jdou upravit, ne smazat; typ, který úkoly používají, také ne.
*/
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  Icon,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SettingsPage,
  Skeleton,
  cn,
  useCan,
} from "@rebar/ui";
import { useState } from "react";
import type { TaskTypeDto } from "../contract";
import { TYPE_COLORS, TYPE_ICONS, slugKey } from "./logic";
import { TypeBadge, guard, useTaskTypes } from "./shared";
import { useCommandMutation } from "@rebar/ui";

type SaveInput = {
  id?: string;
  key: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  isCalendarEvent?: boolean;
  position?: number;
};

function IconColorPicker({
  type,
  disabled,
  onPick,
}: {
  type: Pick<TaskTypeDto, "icon" | "color" | "name">;
  disabled: boolean;
  onPick: (p: { icon?: string; color?: string }) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={`Ikona a barva: ${type.name}`}
          data-testid="type-style"
          className="rounded-md p-1 hover:bg-hover disabled:opacity-50"
        >
          <TypeBadge icon={type.icon} color={type.color} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3">
        <p className="mb-1.5 text-sm font-medium text-muted">Ikona</p>
        <div className="grid grid-cols-7 gap-1">
          {TYPE_ICONS.map((i) => (
            <button
              key={i}
              type="button"
              aria-label={i}
              aria-pressed={type.icon === i}
              onClick={() => onPick({ icon: i })}
              className={cn(
                "flex size-8 items-center justify-center rounded-md border",
                type.icon === i
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-transparent text-muted hover:bg-hover",
              )}
            >
              <Icon name={i} className="size-4" />
            </button>
          ))}
        </div>
        <p className="mb-1.5 mt-3 text-sm font-medium text-muted">Barva</p>
        <div className="flex flex-wrap gap-1.5">
          {TYPE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Barva ${c}`}
              aria-pressed={type.color === c}
              onClick={() => onPick({ color: c })}
              className={cn(
                "chip size-6 !p-0",
                type.color === c && "ring-2 ring-accent ring-offset-1",
              )}
              data-color={c}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TypeRow({
  type,
  index,
  total,
  canWrite,
  onSave,
  onMove,
  onDelete,
}: {
  type: TaskTypeDto;
  index: number;
  total: number;
  canWrite: boolean;
  onSave: (input: SaveInput) => Promise<unknown>;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const base = (): SaveInput => ({
    id: type.id,
    key: type.key,
    name: type.name,
    icon: type.icon,
    color: type.color,
    isCalendarEvent: type.isCalendarEvent,
  });
  const used = type.usage ?? 0;
  return (
    <li
      className="flex flex-wrap items-center gap-3 px-3 py-2.5"
      data-testid="type-row"
      data-key={type.key}
    >
      <IconColorPicker
        type={type}
        disabled={!canWrite}
        onPick={(p) => void onSave({ ...base(), ...p })}
      />
      <Input
        key={type.name}
        aria-label={`Název typu ${type.name}`}
        className="min-w-40 flex-1 basis-48"
        defaultValue={type.name}
        maxLength={60}
        disabled={!canWrite}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== type.name) void onSave({ ...base(), name: v });
          else e.target.value = type.name;
        }}
      />
      <label className="flex items-center gap-2 text-base">
        <Checkbox
          aria-label={`Zobrazit v kalendáři: ${type.name}`}
          checked={type.isCalendarEvent}
          disabled={!canWrite}
          onCheckedChange={(c) => void onSave({ ...base(), isCalendarEvent: c === true })}
        />
        V kalendáři
      </label>
      <span className="w-24 text-sm text-faint">
        {type.isSystem ? "systémový" : `${used} úkolů`}
      </span>
      <div className="flex items-center">
        <IconButton
          label="Posunout nahoru"
          size="sm"
          disabled={!canWrite || index === 0}
          onClick={() => onMove(-1)}
        >
          <Icon name="chevron-down" className="rotate-180" />
        </IconButton>
        <IconButton
          label="Posunout dolů"
          size="sm"
          disabled={!canWrite || index === total - 1}
          onClick={() => onMove(1)}
        >
          <Icon name="chevron-down" />
        </IconButton>
        <IconButton
          label={
            type.isSystem
              ? "Systémový typ nejde smazat"
              : used
                ? "Typ používají úkoly, nejde smazat"
                : `Smazat typ ${type.name}`
          }
          size="sm"
          disabled={!canWrite || type.isSystem || used > 0}
          onClick={onDelete}
        >
          <Icon name="trash" />
        </IconButton>
      </div>
    </li>
  );
}

/** Stránka Nastavení → Typy aktivit. */
export function TaskTypesPage() {
  const types = useTaskTypes();
  const canWrite = useCan()("ukoly.types");
  const save = useCommandMutation<SaveInput, TaskTypeDto>("ukoly.type.save");
  const reorder = useCommandMutation<{ ids: string[] }, unknown>("ukoly.type.reorder");
  const remove = useCommandMutation<{ id: string }, unknown>("ukoly.type.delete");
  const [name, setName] = useState("");
  const [del, setDel] = useState<TaskTypeDto | null>(null);
  const list = types.data ?? [];
  const key = slugKey(name);

  async function add() {
    if (!name.trim() || !key) return;
    const r = await guard(
      save.mutateAsync({
        key,
        name: name.trim(),
        icon: "check-square",
        color: "gray",
        isCalendarEvent: false,
        position: (list.at(-1)?.position ?? 0) + 10,
      }),
      "Typ je přidaný.",
    );
    if (r) setName("");
  }

  function move(i: number, dir: -1 | 1) {
    const ids = list.map((t) => t.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void guard(reorder.mutateAsync({ ids }));
  }

  return (
    <SettingsPage
      title="Typy aktivit"
      icon={<Icon name="check-square" />}
      description="Úkol, hovor, schůzka, e-mail a termín jsou základ. Další typy (např. Návštěva) si přidejte tady; typ s volbou „V kalendáři“ se ukáže i v kalendáři."
    >
      <Card>
        <CardHeader title="Typy" count={list.length || undefined} />
        <CardBody flush>
          {types.isLoading ? (
            <Skeleton className="m-3 h-24" />
          ) : (
            <ul className="divide-y divide-line" data-testid="type-list">
              {list.map((t, i) => (
                <TypeRow
                  key={t.id}
                  type={t}
                  index={i}
                  total={list.length}
                  canWrite={canWrite}
                  onSave={(input) => guard(save.mutateAsync(input))}
                  onMove={(d) => move(i, d)}
                  onDelete={() => setDel(t)}
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      {canWrite && (
        <Card>
          <CardHeader title="Nový typ" />
          <CardBody>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
            >
              <Input
                aria-label="Název nového typu"
                data-testid="new-type-name"
                className="min-w-48 flex-1"
                placeholder="Např. Návštěva u klienta"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" variant="primary" loading={save.isPending} disabled={!key}>
                <Icon name="plus" /> Přidat typ
              </Button>
            </form>
            {name.trim() && (
              <p className="mt-2 text-sm text-faint">
                Klíč typu: {key || "—"} (po založení se nemění)
              </p>
            )}
          </CardBody>
        </Card>
      )}
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Smazat typ „${del?.name ?? ""}“?`}
        description="Typ zmizí z nabídek. Nepoužívají ho žádné úkoly."
        confirmLabel="Smazat typ"
        danger
        onConfirm={async () => {
          if (!del) return;
          return !!(await guard(remove.mutateAsync({ id: del.id }), "Typ je smazaný."));
        }}
      />
    </SettingsPage>
  );
}
