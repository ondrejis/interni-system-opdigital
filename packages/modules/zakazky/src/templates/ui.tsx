"use client";

import { formatDate } from "@rebar/core/shared";
import {
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  IconButton,
  Input,
  Skeleton,
  Textarea,
  successToast,
  useCan,
  useCommandQuery,
  type ModulePage,
  type RecordAction,
  type RecordTab,
} from "@rebar/ui";
import { ChevronDown, ChevronRight, LayoutTemplate, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useCmd } from "../budget/use-cmd";
import { amount, plural } from "../budget/ui-format";
import type { SectionTemplate, TemplatePayload } from "./payload";

/** UI oblasti „templates“: stránka Šablony zakázek a akce „Uložit jako šablonu“. Klientský kód: žádné importy serverových částí. */

type Summary = {
  sections: number;
  items: number;
  tasks: number;
  roles: number;
  hasBudget: boolean;
  withPrices: boolean;
};
type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  summary: Summary;
};
type TemplateFull = TemplateRow & { payload: TemplatePayload };

function Outline({ id }: { id: string }) {
  const q = useCommandQuery<TemplateFull>("zakazky.template.get", { id });
  if (q.isLoading || !q.data) return <Skeleton className="h-16" />;
  const p = q.data.payload;
  const walk = (s: SectionTemplate, depth: number): React.ReactNode => (
    <li key={`${s.title}-${depth}`}>
      <div className="flex items-baseline gap-2" style={{ paddingLeft: depth * 16 }}>
        <span className="font-medium">{s.title}</span>
        <span className="text-sm text-faint">
          {plural(s.items.length, "položka", "položky", "položek")}
        </span>
      </div>
      {s.items.length > 0 && (
        <ul className="text-sm text-muted" style={{ paddingLeft: depth * 16 + 12 }}>
          {s.items.slice(0, 6).map((i, n) => (
            <li key={n} className="flex gap-2">
              <span className="truncate">{i.title}</span>
              {p.budget?.withPrices && i.unitPriceMinor > 0 && (
                <span className="tabular shrink-0 text-faint">
                  {i.quantity} {i.unit} × {amount(i.unitPriceMinor)} Kč
                </span>
              )}
            </li>
          ))}
          {s.items.length > 6 && <li className="text-faint">… a dalších {s.items.length - 6}</li>}
        </ul>
      )}
      {s.children.length > 0 && <ul>{s.children.map((c) => walk(c, depth + 1))}</ul>}
    </li>
  );
  return (
    <div className="space-y-3 border-t border-line px-3 py-3 text-base">
      {p.budget?.objects.map((o, n) => (
        <div key={n}>
          {!o.isDefault && (
            <p className="mb-1 font-semibold">{[o.code, o.title].filter(Boolean).join(" ")}</p>
          )}
          <ul className="space-y-1">{o.sections.map((s) => walk(s, 0))}</ul>
        </div>
      ))}
      {p.tasks.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium uppercase tracking-wide text-faint">Úkoly</p>
          <ul className="text-muted">
            {p.tasks.map((t, n) => (
              <li key={n}>
                {t.title}
                {t.daysFromStart !== null && (
                  <span className="text-faint"> · den {t.daysFromStart} od zahájení</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.roles.length > 0 && (
        <p className="text-muted">
          <span className="text-sm font-medium uppercase tracking-wide text-faint">Role týmu </span>
          {p.roles.join(", ")}
        </p>
      )}
    </div>
  );
}

function TemplateItem({ t }: { t: TemplateRow }) {
  const can = useCan();
  const [open, setOpen] = useState(false);
  const [rename, setRename] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const remove = useCmd("zakazky.template.delete");
  const s = t.summary;
  return (
    <li className="rounded-lg border border-line" data-testid="template-row">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? `Skrýt obsah šablony ${t.name}` : `Ukázat obsah šablony ${t.name}`}
          onClick={() => setOpen((o) => !o)}
          className="rounded p-0.5 text-muted hover:bg-hover"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{t.name}</p>
          {t.description && <p className="truncate text-sm text-muted">{t.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {s.hasBudget && (
            <Chip>
              {plural(s.sections, "oddíl", "oddíly", "oddílů")} ·{" "}
              {plural(s.items, "položka", "položky", "položek")}
            </Chip>
          )}
          {s.hasBudget && s.withPrices && <Chip color="blue">s cenami</Chip>}
          {s.tasks > 0 && <Chip>{plural(s.tasks, "úkol", "úkoly", "úkolů")}</Chip>}
          {s.roles > 0 && <Chip>{plural(s.roles, "role", "role", "rolí")}</Chip>}
        </div>
        <span className="text-sm text-faint">{formatDate(t.createdAt)}</span>
        {can("zakazky.budget") && (
          <div className="flex gap-1">
            <IconButton
              label={`Upravit šablonu ${t.name}`}
              size="sm"
              onClick={() => setRename(true)}
            >
              <Pencil />
            </IconButton>
            <IconButton
              label={`Smazat šablonu ${t.name}`}
              size="sm"
              onClick={() => setConfirm(true)}
            >
              <Trash2 />
            </IconButton>
          </div>
        )}
      </div>
      {open && <Outline id={t.id} />}
      {rename && <RenameDialog t={t} onClose={() => setRename(false)} />}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Smazat šablonu „${t.name}“?`}
        description="Zakázky, které ji už použily, zůstanou beze změny."
        confirmLabel="Smazat"
        danger
        onConfirm={async () => {
          const r = await remove.run({ id: t.id });
          return r ? undefined : false;
        }}
      />
    </li>
  );
}

function RenameDialog({ t, onClose }: { t: TemplateRow; onClose: () => void }) {
  const save = useCmd("zakazky.template.save");
  const [name, setName] = useState(t.name);
  const [description, setDescription] = useState(t.description ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Upravit šablonu"
        description="Obsah šablony se mění uložením nové z hotové zakázky."
        className="top-[16vh] w-[min(30rem,calc(100vw-2rem))]"
      >
        <form
          className="px-5 py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await save.run({ id: t.id, name, description });
            if (r) onClose();
          }}
        >
          <Field label="Název">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Popis">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.pending}
              disabled={name.trim().length < 2}
            >
              Uložit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesPage() {
  const q = useCommandQuery<TemplateRow[]>("zakazky.template.list", {});
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-lg font-semibold">Šablony zakázek</h1>
        <p className="text-base text-muted">
          Kostra rozpočtu, úkoly a role týmu pro opakované zakázky. Novou šablonu vytvoříte na
          detailu hotové zakázky akcí „Uložit jako šablonu“.
        </p>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-24" />
      ) : !q.data?.length ? (
        <EmptyState
          icon={<LayoutTemplate />}
          title="Zatím žádné šablony"
          description="Otevřete zakázku, jejíž rozpočet se hodí do dalších, a zvolte „Uložit jako šablonu“."
        />
      ) : (
        <ul className="space-y-2" data-testid="template-list">
          {q.data.map((t) => (
            <TemplateItem key={t.id} t={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SaveTemplateForm({
  jobId,
  title,
  close,
}: {
  jobId: string;
  title: string;
  close: () => void;
}) {
  const can = useCan();
  const save = useCmd<Record<string, unknown>, { id: string }>("zakazky.template.createFromJob");
  const [name, setName] = useState(title);
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState(true);
  const [prices, setPrices] = useState(false);
  const [tasks, setTasks] = useState(true);
  const [roles, setRoles] = useState(true);
  const check = (label: string, checked: boolean, set: (v: boolean) => void, disabled = false) => (
    <label className={`flex items-center gap-2 text-base ${disabled ? "opacity-50" : ""}`}>
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => set(v === true)} />
      {label}
    </label>
  );
  return (
    <form
      className="px-5 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await save.run({
          jobId,
          name,
          description,
          includeBudget: budget,
          withPrices: budget && prices,
          includeTasks: tasks,
          includeRoles: roles,
        });
        if (r) {
          successToast(`Šablona „${name}“ je uložená.`);
          close();
        }
      }}
    >
      <Field label="Název šablony">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Popis (nepovinný)">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="mb-4 space-y-2">
        {check("Kostra rozpočtu (oddíly a položky)", budget, setBudget, !can("zakazky.economics"))}
        <div className="pl-6">
          {check("včetně cen a nákladů", prices, setPrices, !budget || !can("zakazky.economics"))}
        </div>
        {check("Otevřené úkoly zakázky", tasks, setTasks)}
        {check("Role v týmu (bez konkrétních lidí)", roles, setRoles)}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Zrušit
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={save.pending}
          disabled={name.trim().length < 2}
        >
          Uložit šablonu
        </Button>
      </div>
    </form>
  );
}

export const tabs: RecordTab[] = [];
export const actions: RecordAction[] = [
  {
    id: "save-as-template",
    label: "Uložit jako šablonu",
    permission: "zakazky.budget",
    dialog: {
      title: "Uložit jako šablonu",
      render: ({ id, row, close }) => (
        <SaveTemplateForm jobId={id} title={String(row.title ?? "")} close={close} />
      ),
    },
  },
];
export const pages: ModulePage[] = [{ path: "/zakazky/sablony", render: () => <TemplatesPage /> }];
