"use client";

import {
  Button,
  Checkbox,
  Chip,
  Combobox,
  ConfirmDialog,
  DatePicker,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  FormSection,
  IconButton,
  Input,
  MoneyInput,
  Notice,
  SegmentedControl,
  cn,
  undoToast,
} from "@rebar/ui";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { runAction } from "@/lib/run-action";
import {
  createFieldAction,
  deleteFieldAction,
  reorderFieldsAction,
  restoreFieldAction,
  updateFieldAction,
} from "@/server/config-actions";
import { MoveButtons, moved, slugify, useRefreshConfig } from "../_shared/config-ui";

type Choice = { value: string; label: string; color?: string | undefined };
type FieldView = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  showInTable: boolean;
  showInForm: boolean;
  hidden: boolean;
  defaultValue: string | number | boolean | null;
  choices: Choice[];
  recordEntity: string | null;
};
export type EntityView = { key: string; label: string; fields: FieldView[] };

const TYPES = [
  { value: "text", label: "Text" },
  { value: "longtext", label: "Dlouhý text" },
  { value: "number", label: "Číslo" },
  { value: "currency", label: "Částka (Kč)" },
  { value: "date", label: "Datum" },
  { value: "select", label: "Výběr z možností" },
  { value: "multiselect", label: "Výběr více možností" },
  { value: "user", label: "Osoba" },
  { value: "checkbox", label: "Ano / ne" },
  { value: "url", label: "Odkaz (web)" },
  { value: "phone", label: "Telefon" },
  { value: "email", label: "E-mail" },
] as const;
const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label ?? t;
const NO_DEFAULT = ["user", "record", "multiselect"];

function ChoicesEditor({
  choices,
  onChange,
}: {
  choices: Choice[];
  onChange: (c: Choice[]) => void;
}) {
  return (
    <div className="space-y-2" data-testid="choices-editor">
      {choices.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            aria-label={`Název možnosti ${i + 1}`}
            value={c.label}
            maxLength={80}
            onChange={(e) =>
              onChange(choices.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
            }
            placeholder="Název možnosti"
          />
          <Combobox
            aria-label={`Barva možnosti ${i + 1}`}
            value={c.color ?? "gray"}
            options={[
              "gray",
              "blue",
              "green",
              "orange",
              "red",
              "purple",
              "pink",
              "teal",
              "yellow",
              "indigo",
            ].map((v) => ({ value: v, label: colorLabel(v), color: v }))}
            onChange={(v) =>
              onChange(choices.map((x, j) => (j === i ? { ...x, color: v as string } : x)))
            }
            className="w-36 shrink-0"
          />
          <IconButton
            label={`Odebrat možnost ${i + 1}`}
            variant="ghost"
            onClick={() => onChange(choices.filter((_, j) => j !== i))}
          >
            <X />
          </IconButton>
        </div>
      ))}
      <Button variant="ghost" onClick={() => onChange([...choices, { value: "", label: "" }])}>
        <Plus /> Přidat možnost
      </Button>
    </div>
  );
}

const COLOR_LABELS: Record<string, string> = {
  gray: "Šedá",
  blue: "Modrá",
  green: "Zelená",
  orange: "Oranžová",
  red: "Červená",
  purple: "Fialová",
  pink: "Růžová",
  teal: "Tyrkysová",
  yellow: "Žlutá",
  indigo: "Indigo",
};
const colorLabel = (c: string) => COLOR_LABELS[c] ?? c;

/** Stabilní hodnoty možností: existující zůstanou, nové se odvodí z názvu (a nesmí se opakovat). */
function withValues(choices: Choice[]): Choice[] {
  const taken = new Set(choices.map((c) => c.value).filter(Boolean));
  return choices
    .filter((c) => c.label.trim())
    .map((c) => {
      if (c.value) return { ...c, label: c.label.trim() };
      const base = slugify(c.label) || "moznost";
      let v = base;
      for (let n = 2; taken.has(v); n++) v = `${base}_${n}`;
      taken.add(v);
      return { ...c, value: v, label: c.label.trim() };
    });
}

function FieldDialog({
  entity,
  field,
  recordTargets,
  onClose,
  onSaved,
}: {
  entity: EntityView;
  field: FieldView | null;
  recordTargets: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(field?.label ?? "");
  const [key, setKey] = useState(field?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState(field?.type ?? "text");
  const [choices, setChoices] = useState<Choice[]>(field?.choices ?? []);
  const [recordEntity, setRecordEntity] = useState<string | null>(field?.recordEntity ?? null);
  const [required, setRequired] = useState(field?.required ?? false);
  const [showInTable, setShowInTable] = useState(field?.showInTable ?? true);
  const [showInForm, setShowInForm] = useState(field?.showInForm ?? false);
  const [hidden, setHidden] = useState(field?.hidden ?? false);
  const [def, setDef] = useState<string | number | boolean | null>(field?.defaultValue ?? null);
  const [busy, setBusy] = useState(false);
  const editing = !!field;

  function changeType(t: string) {
    setType(t);
    setDef(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const opts = {
      ...(type === "select" || type === "multiselect"
        ? {
            choices: withValues(choices).map((c) => ({
              value: c.value,
              label: c.label,
              ...(c.color ? { color: c.color } : {}),
            })),
          }
        : {}),
      ...(type === "record" && recordEntity ? { entityType: recordEntity } : {}),
      ...(def !== null && def !== "" && !NO_DEFAULT.includes(type) ? { defaultValue: def } : {}),
      ...(hidden ? { hidden: true } : {}),
    };
    const res = await runAction(
      editing
        ? updateFieldAction({
            id: field.id,
            entityType: entity.key,
            label,
            options: opts,
            required,
            showInTable,
            showInForm,
          })
        : createFieldAction({
            entityType: entity.key,
            key: key || slugify(label, 40),
            label,
            type: type as never,
            options: opts,
            required,
            showInTable,
            showInForm,
          }),
      editing ? "Pole uloženo." : "Pole přidáno.",
    );
    setBusy(false);
    if (res) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={editing ? "Upravit pole" : "Nové pole"}
        description={entity.label}
        className="top-[8vh]"
      >
        <form onSubmit={submit} className="px-5 py-4">
          <Field label="Název pole" htmlFor="field-label">
            <Input
              id="field-label"
              autoFocus
              value={label}
              maxLength={80}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!editing && !keyTouched) setKey(slugify(e.target.value, 40));
              }}
              placeholder="např. Číslo smlouvy"
            />
          </Field>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Typ pole" hint={editing ? "Typ se po vytvoření nemění." : undefined}>
              <Combobox
                aria-label="Typ pole"
                value={type}
                disabled={editing}
                options={TYPES}
                onChange={(v) => v && changeType(v as string)}
              />
            </Field>
            <Field
              label="Interní klíč"
              htmlFor="field-key"
              hint={editing ? "Klíč se nemění." : "Malá písmena, číslice a podtržítko."}
            >
              <Input
                id="field-key"
                value={key}
                disabled={editing}
                maxLength={41}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value);
                }}
              />
            </Field>
          </div>

          {(type === "select" || type === "multiselect") && (
            <Field
              label="Možnosti"
              hint="Přejmenovat jde kdykoli, interní hodnota možnosti zůstává."
            >
              <ChoicesEditor choices={choices} onChange={setChoices} />
            </Field>
          )}
          {type === "record" && (
            <Field label="Odkazuje na">
              <Combobox
                aria-label="Odkazuje na"
                value={recordEntity}
                options={recordTargets}
                onChange={(v) => setRecordEntity((v as string | null) ?? null)}
                placeholder="Vyberte typ záznamu"
                disabled={editing}
              />
            </Field>
          )}
          {!NO_DEFAULT.includes(type) && (
            <Field
              label="Výchozí hodnota"
              hint="Předvyplní se u nových záznamů. Prázdné = bez výchozí hodnoty."
            >
              <DefaultInput type={type} choices={choices} value={def} onChange={setDef} />
            </Field>
          )}

          <div className="mb-3 space-y-2 rounded-lg border border-line bg-subtle px-3 py-3">
            <Toggle
              checked={required}
              onChange={setRequired}
              title="Povinné pole"
              hint="Bez vyplnění nejde nový záznam uložit."
            />
            <Toggle
              checked={showInTable}
              onChange={setShowInTable}
              title="Zobrazit ve výchozí tabulce"
              hint="Sloupec jde v tabulce kdykoli zapnout a vypnout i ručně."
            />
            <Toggle
              checked={showInForm}
              onChange={setShowInForm}
              title="Zobrazit při vytvoření"
              hint="Pole bude i v krátkém formuláři „Nový…“; jinak se vyplňuje až v detailu."
            />
            <Toggle
              checked={hidden}
              onChange={setHidden}
              title="Archivovat pole"
              hint="Pole zmizí z tabulek, filtrů, detailu i formulářů. Zadané hodnoty zůstanou uložené a po obnovení se ukážou."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={
                !label.trim() ||
                (!editing && !key.trim()) ||
                (type === "record" && !recordEntity) ||
                ((type === "select" || type === "multiselect") && withValues(choices).length === 0)
              }
            >
              {editing ? "Uložit" : "Přidat pole"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
    </label>
  );
}

function DefaultInput({
  type,
  choices,
  value,
  onChange,
}: {
  type: string;
  choices: Choice[];
  value: string | number | boolean | null;
  onChange: (v: string | number | boolean | null) => void;
}) {
  switch (type) {
    case "currency":
      return (
        <MoneyInput
          aria-label="Výchozí hodnota"
          value={typeof value === "number" ? value : null}
          onChange={onChange}
        />
      );
    case "number":
      return (
        <Input
          aria-label="Výchozí hodnota"
          inputMode="decimal"
          value={value === null ? "" : String(value)}
          onChange={(e) => {
            const t = e.target.value.replace(",", ".");
            onChange(t.trim() === "" || Number.isNaN(Number(t)) ? null : Number(t));
          }}
        />
      );
    case "date":
      return <DatePicker value={typeof value === "string" ? value : null} onChange={onChange} />;
    case "checkbox":
      return (
        <SegmentedControl
          label="Výchozí hodnota"
          value={value === true ? "yes" : value === false ? "no" : "none"}
          onChange={(v) => onChange(v === "yes" ? true : v === "no" ? false : null)}
          options={[
            { value: "none", label: "Bez výchozí" },
            { value: "yes", label: "Ano" },
            { value: "no", label: "Ne" },
          ]}
        />
      );
    case "select":
      return (
        <Combobox
          aria-label="Výchozí hodnota"
          value={typeof value === "string" ? value : null}
          clearable
          options={withValues(choices).map((c) => ({
            value: c.value,
            label: c.label,
            ...(c.color ? { color: c.color } : {}),
          }))}
          onChange={(v) => onChange((v as string | null) ?? null)}
          placeholder="Bez výchozí hodnoty"
        />
      );
    default:
      return (
        <Input
          aria-label="Výchozí hodnota"
          value={typeof value === "string" ? value : ""}
          maxLength={2000}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
  }
}

/** Správa vlastních polí po typech záznamů. */
export function FieldsAdmin({
  entities,
  recordTargets,
}: {
  entities: EntityView[];
  recordTargets: { value: string; label: string }[];
}) {
  const refresh = useRefreshConfig();
  const [selectedKey, setSelectedKey] = useState(entities[0]?.key);
  const entity = entities.find((e) => e.key === selectedKey) ?? entities[0];
  const [order, setOrder] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<{ field: FieldView | null } | null>(null);
  const [removing, setRemoving] = useState<FieldView | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOrder(null), [entities]);

  if (!entity)
    return (
      <EmptyState
        title="Žádné záznamy k rozšíření"
        description="Zapnuté moduly nemají záznamy, ke kterým by šla přidat vlastní pole."
      />
    );

  const fields = order
    ? order.map((id) => entity.fields.find((f) => f.id === id)).filter((f): f is FieldView => !!f)
    : entity.fields;

  async function move(from: number, delta: -1 | 1) {
    const ids = moved(
      fields.map((f) => f.id),
      from,
      delta,
    );
    setOrder(ids);
    setBusy(true);
    const ok = await runAction(reorderFieldsAction({ entityType: entity!.key, ids }));
    setBusy(false);
    if (ok) refresh();
    else setOrder(null);
  }

  async function remove(f: FieldView) {
    const ok = await runAction(deleteFieldAction({ id: f.id, entityType: entity!.key }));
    if (!ok) return false;
    refresh();
    undoToast(`Pole „${f.label}“ archivováno.`, async () => {
      if (
        await runAction(restoreFieldAction({ id: f.id, entityType: entity!.key }), "Pole obnoveno.")
      )
        refresh();
    });
    return true;
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 @3xl:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Typy záznamů" className="min-w-0 @3xl:sticky @3xl:top-0">
        <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 @3xl:mx-0 @3xl:flex-col @3xl:gap-1 @3xl:overflow-visible @3xl:px-0 @3xl:pb-0">
          {entities.map((e) => (
            <li key={e.key} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedKey(e.key);
                  setOrder(null);
                }}
                aria-current={e.key === entity.key}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors duration-150 @3xl:py-2.5",
                  e.key === entity.key
                    ? "border-[var(--accent-line)] bg-accent-soft"
                    : "border-line bg-bg hover:bg-hover",
                )}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{e.label}</span>
                <span className="rounded-full bg-hover px-1.5 text-sm text-muted tabular">
                  {e.fields.length}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 space-y-6">
        <FormSection
          title={`Vlastní pole: ${entity.label}`}
          flush
          footer={
            <Button variant="primary" onClick={() => setEditing({ field: null })}>
              <Plus /> Nové pole
            </Button>
          }
        >
          {fields.length === 0 ? (
            <p className="px-5 pb-4 text-base text-muted">
              Zatím žádné vlastní pole. Přidejte první tlačítkem níže.
            </p>
          ) : (
            <ul className="divide-y divide-line border-t border-line" data-testid="field-list">
              {fields.map((f, i) => (
                <li
                  key={f.id}
                  data-testid="field-row"
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3"
                >
                  <div className="min-w-48 flex-1">
                    <div className="font-medium">{f.label}</div>
                    <div className="text-sm text-faint">{f.key}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip>{typeLabel(f.type)}</Chip>
                    {f.required && <Chip color="orange">Povinné</Chip>}
                    {f.hidden && <Chip color="red">Skryté</Chip>}
                    {f.defaultValue !== null && <Chip color="blue">Má výchozí hodnotu</Chip>}
                  </div>
                  <div className="flex gap-1">
                    <MoveButtons
                      index={i}
                      count={fields.length}
                      name={f.label}
                      disabled={busy}
                      onMove={(d) => void move(i, d)}
                    />
                    <IconButton
                      label={`Upravit pole ${f.label}`}
                      variant="ghost"
                      onClick={() => setEditing({ field: f })}
                    >
                      <Pencil />
                    </IconButton>
                    <IconButton
                      label={`Archivovat pole ${f.label}`}
                      variant="ghost"
                      onClick={() => setRemoving(f)}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </FormSection>
        <Notice tone="info" title="Kde se pole objeví">
          Nové pole je k dispozici jako sloupec v tabulce (zapnete ho v nabídce sloupců), ve
          filtrech, při řazení, v detailu záznamu, v exportu do CSV a při hledání. Archivace pole
          hodnoty z databáze nevymaže; po obnovení se ukážou znovu.
        </Notice>
      </div>

      {editing && (
        <FieldDialog
          key={editing.field?.id ?? "new"}
          entity={entity}
          field={editing.field}
          recordTargets={recordTargets}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Archivovat vlastní pole?"
        description={removing?.label ?? ""}
        confirmLabel="Archivovat pole"
        danger
        onConfirm={() => (removing ? remove(removing) : undefined)}
      >
        <p>
          Pole zmizí z tabulek, filtrů a detailu. Hodnoty zůstanou uložené a archivaci jde vrátit
          tlačítkem „Zpět“.
        </p>
      </ConfirmDialog>
    </div>
  );
}
