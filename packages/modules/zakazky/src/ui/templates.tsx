"use client";

import { formatMinor } from "@rebar/core/shared";
import {
  Button,
  Checkbox,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  IconButton,
  Input,
  MoneyInput,
  PageHeader,
  SegmentedControl,
  Skeleton,
  Textarea,
  Dialog,
  DialogContent,
  Notice,
  errorToast,
  successToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import {
  ArrowDown,
  ArrowUp,
  LayoutTemplate,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { TemplateListItem, TemplatePayloadData, TemplateView } from "../contract";
import {
  BILLING_MODELS,
  BILLING_MODEL_LABELS,
  JOB_TYPES,
  JOB_TYPE_LABELS,
  PHASE_ROLES,
  PHASE_ROLE_LABELS,
  type BillingModelCode,
  type PhaseRole,
} from "../shared";
import { CreateJobDialog } from "./create-job";
import { useModuleEnabled, useTemplate, useTemplateList } from "./hooks";
import {
  addPayment,
  addPhase,
  addTask,
  emptyPayload,
  movePhase,
  payloadDirty,
  payloadIssues,
  paymentsTotal,
  phaseSpan,
  plural,
  removePayment,
  removePhase,
  removeTask,
  tasksByPhaseIndex,
  updatePayment,
  updatePhase,
  updateTask,
} from "./logic";
import { LoadError, TypeChip, UserCombobox } from "./parts";

const sel =
  "h-8 rounded-md border border-line-strong bg-bg px-2 text-base focus-visible:border-accent focus-visible:outline-none disabled:opacity-50";

/* ---------- seznam šablon ---------- */

/** Stránka Nastavení → Šablony zakázek: šablony po typech, výchozí, duplikace, archivace, nová šablona a zakázka ze šablony. */
export function TemplatesPage() {
  const can = useCan();
  const { Link } = useNav();
  const api = useEntityApi();
  const [archived, setArchived] = useState(false);
  const list = useTemplateList(undefined, archived);
  const [newOpen, setNewOpen] = useState(false);
  const [from, setFrom] = useState<TemplateListItem | null>(null);
  const manage = can("zakazky.templates");
  const duplicate = useCommandMutation<{ id: string }, { id: string }>(
    "zakazky.template.duplicate",
  );
  const setDefault = useCommandMutation<{ id: string }>("zakazky.template.setDefault");
  const archive = useCommandMutation<{ id: string; archived: boolean }>("zakazky.template.archive");
  const fail = { onError: (e: Error) => errorToast(e.message) };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="templates-page">
      <PageHeader
        breadcrumbs={[{ label: "Nastavení", href: "/nastaveni" }, { label: "Šablony zakázek" }]}
        actions={
          manage && (
            <Button variant="primary" onClick={() => setNewOpen(true)} data-testid="new-template">
              <Plus /> Nová šablona
            </Button>
          )
        }
      />
      <div className="scrollbar-thin mx-auto min-h-0 w-full max-w-5xl flex-1 space-y-6 overflow-y-auto p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-2xl text-base text-muted">
            Šablona určuje fáze, úkoly s termínem v dnech od startu a plánované platby nové zakázky.
            Pro každý typ je jedna výchozí. Změna šablony neovlivní zakázky, které už běží.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={archived}
              onCheckedChange={(v) => setArchived(v === true)}
              aria-label="Zobrazit archivované šablony"
            />
            Zobrazit archivované
          </label>
        </div>
        {list.isLoading ? (
          <Skeleton className="h-32" />
        ) : list.error ? (
          <LoadError message={list.error.message} onRetry={() => void list.refetch()} />
        ) : !list.data?.length ? (
          <EmptyState
            icon={<LayoutTemplate />}
            title="Zatím žádné šablony"
            description="Vytvořte první šablonu, nebo uložte hotovou zakázku jako šablonu."
          />
        ) : (
          JOB_TYPES.map((type) => {
            const items = list.data!.filter((t) => t.type === type);
            if (!items.length) return null;
            return (
              <section key={type} aria-label={`Šablony: ${JOB_TYPE_LABELS[type]}`}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <TypeChip type={type} /> {plural(items.length, "šablona", "šablony", "šablon")}
                </h2>
                <ul className="space-y-2" data-testid="template-list">
                  {items.map((t) => {
                    const href = api.hrefFor("job_template", t.id) ?? `/zakazky/sablony/${t.id}`;
                    return (
                      <li
                        key={t.id}
                        data-testid="template-row"
                        className={`flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2 ${t.archivedAt ? "opacity-60" : ""}`}
                      >
                        <div className="min-w-0 flex-1 basis-56">
                          <Link href={href} className="font-medium hover:underline">
                            {t.name}
                          </Link>
                          {t.description && (
                            <p className="truncate text-sm text-muted">{t.description}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-sm">
                          {t.isDefault && (
                            <Chip color="yellow" data-testid="template-default">
                              <Star className="size-3" /> Výchozí
                            </Chip>
                          )}
                          {t.archivedAt && <Chip>Archivovaná</Chip>}
                          <Chip>{plural(t.summary.phases, "fáze", "fáze", "fází")}</Chip>
                          <Chip>{plural(t.summary.tasks, "úkol", "úkoly", "úkolů")}</Chip>
                          {t.summary.payments > 0 && (
                            <Chip>
                              {plural(t.summary.payments, "platba", "platby", "plateb")} ·{" "}
                              {formatMinor(t.summary.paymentsMinor)}
                            </Chip>
                          )}
                          <span className="text-muted">
                            {BILLING_MODEL_LABELS[t.defaultBillingModel]}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {!t.archivedAt && can("zakazky.create") && (
                            <Button
                              size="sm"
                              onClick={() => setFrom(t)}
                              data-testid="job-from-template"
                            >
                              Vytvořit zakázku
                            </Button>
                          )}
                          <Link href={href} className="text-sm text-accent hover:underline">
                            {manage ? "Upravit" : "Zobrazit"}
                          </Link>
                          {manage && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <IconButton label={`Další akce šablony ${t.name}`} size="sm">
                                  <MoreHorizontal />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    duplicate.mutate(
                                      { id: t.id },
                                      {
                                        ...fail,
                                        onSuccess: () => successToast("Šablona je zduplikovaná."),
                                      },
                                    )
                                  }
                                >
                                  Duplikovat
                                </DropdownMenuItem>
                                {!t.archivedAt && !t.isDefault && (
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setDefault.mutate(
                                        { id: t.id },
                                        {
                                          ...fail,
                                          onSuccess: () =>
                                            successToast(
                                              `Výchozí šablona typu ${JOB_TYPE_LABELS[t.type]}: ${t.name}.`,
                                            ),
                                        },
                                      )
                                    }
                                  >
                                    Nastavit jako výchozí
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  danger={!t.archivedAt}
                                  onSelect={() =>
                                    archive.mutate(
                                      { id: t.id, archived: !t.archivedAt },
                                      {
                                        ...fail,
                                        onSuccess: () =>
                                          successToast(
                                            t.archivedAt
                                              ? "Šablona je obnovená."
                                              : "Šablona je archivovaná.",
                                          ),
                                      },
                                    )
                                  }
                                >
                                  {t.archivedAt ? "Obnovit z archivu" : "Archivovat"}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
      <NewTemplateDialog open={newOpen} onOpenChange={setNewOpen} />
      {from && (
        <CreateJobDialog
          open
          onOpenChange={(o) => !o && setFrom(null)}
          preset={{ type: from.type, templateId: from.id }}
        />
      )}
    </div>
  );
}

function NewTemplateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const api = useEntityApi();
  const nav = useNav();
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof JOB_TYPES)[number]>("web");
  const [error, setError] = useState<string | null>(null);
  const create = useCommandMutation<
    { name: string; type: string; payload: TemplatePayloadData },
    { id: string }
  >("zakazky.template.create");
  async function submit() {
    setError(null);
    try {
      const t = await create.mutateAsync({ name: name.trim(), type, payload: emptyPayload() });
      onOpenChange(false);
      nav.push(api.hrefFor("job_template", t.id) ?? `/zakazky/sablony/${t.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      {open && (
        <DialogContent
          title="Nová šablona zakázky"
          description="Fáze, úkoly a platby doplníte v editoru."
          className="top-[14vh] w-[min(30rem,calc(100vw-2rem))]"
        >
          <form
            className="px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void submit();
            }}
          >
            <Field label="Název šablony">
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={160}
              />
            </Field>
            <Field label="Typ zakázky" hint="Typ se po založení nemění.">
              <SegmentedControl
                label="Typ šablony"
                value={type}
                onChange={setType}
                options={JOB_TYPES.map((t) => ({ value: t, label: JOB_TYPE_LABELS[t] }))}
              />
            </Field>
            {error && (
              <p role="alert" className="mb-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Zrušit
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={create.isPending}
                disabled={!name.trim()}
                data-testid="new-template-submit"
              >
                Vytvořit a upravit
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

/* ---------- editor šablony ---------- */

/** Typy úkolů pro výběr (z modulu Úkoly; bez něj pevná sada). */
function useTaskTypes(): { key: string; name: string }[] {
  const enabled = useModuleEnabled("ukoly");
  const q = useCommandQuery<{ key: string; name: string }[]>("ukoly.type.list", {}, { enabled });
  return q.data?.length
    ? q.data
    : [
        { key: "task", name: "Úkol" },
        { key: "call", name: "Hovor" },
        { key: "meeting", name: "Schůzka" },
        { key: "email", name: "E-mail" },
        { key: "deadline", name: "Termín" },
      ];
}

/** Editor jedné šablony: fáze, úkoly s termínem a odhadem, plánované platby, výchozí šablona, duplikace, archivace. */
export function TemplateEditorPage({ id }: { id: string }) {
  const q = useTemplate(id);
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="template-editor">
      <PageHeader
        breadcrumbs={[
          { label: "Nastavení", href: "/nastaveni" },
          { label: "Šablony zakázek", href: "/zakazky/sablony" },
          { label: q.data?.name ?? "…" },
        ]}
      />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {q.isLoading ? (
          <Skeleton className="m-6 h-64" />
        ) : q.error || !q.data ? (
          <div className="p-6">
            <LoadError
              message={q.error?.message ?? "Šablona nenalezena."}
              onRetry={() => void q.refetch()}
            />
          </div>
        ) : (
          <EditorBody key={q.data.id} tpl={q.data} />
        )}
      </div>
    </div>
  );
}

function EditorBody({ tpl }: { tpl: TemplateView }) {
  const can = useCan();
  const edit = can("zakazky.templates");
  const taskTypes = useTaskTypes();
  const [name, setName] = useState(tpl.name);
  const [description, setDescription] = useState(tpl.description ?? "");
  const [billing, setBilling] = useState<BillingModelCode>(tpl.defaultBillingModel);
  const [p, setP] = useState<TemplatePayloadData>(tpl.payload);
  const [saved, setSaved] = useState({
    name: tpl.name,
    description: tpl.description ?? "",
    billing: tpl.defaultBillingModel,
    payload: tpl.payload,
  });
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(false);
  const save = useCommandMutation<Record<string, unknown>>("zakazky.template.update");
  const duplicate = useCommandMutation<{ id: string }, { id: string }>(
    "zakazky.template.duplicate",
  );
  const archive = useCommandMutation<{ id: string; archived: boolean }>("zakazky.template.archive");
  const setDefault = useCommandMutation<{ id: string }>("zakazky.template.setDefault");
  const api = useEntityApi();
  const nav = useNav();

  const issues = payloadIssues(p);
  const dirty =
    name !== saved.name ||
    description !== saved.description ||
    billing !== saved.billing ||
    payloadDirty(saved.payload, p);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function submit() {
    setError(null);
    try {
      await save.mutateAsync({
        id: tpl.id,
        name: name.trim(),
        description: description.trim() || null,
        defaultBillingModel: billing,
        payload: p,
      });
      setSaved({ name: name.trim(), description: description.trim(), billing, payload: p });
      successToast("Šablona je uložená. Běžící zakázky se nemění.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const rows = tasksByPhaseIndex(p);
  const phaseName = (i: number) => p.phases[i]?.name || `Fáze ${i + 1}`;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <Notice tone="info" className="md:hidden">
        Editor šablon je dostupný na počítači. Na telefonu je šablona jen ke čtení.
      </Notice>
      {tpl.archivedAt && (
        <Notice tone="warning">Šablona je archivovaná: nenabízí se při zakládání zakázek.</Notice>
      )}

      <fieldset disabled={!edit} className="space-y-4 max-md:pointer-events-none max-md:opacity-80">
        <section className="grid gap-x-4 md:grid-cols-[1fr_16rem]">
          <Field label="Název šablony">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
          </Field>
          <Field label="Výchozí model fakturace">
            <select
              className={`${sel} w-full`}
              value={billing}
              onChange={(e) => setBilling(e.target.value as BillingModelCode)}
              aria-label="Výchozí model fakturace"
            >
              {BILLING_MODELS.map((b) => (
                <option key={b} value={b}>
                  {BILLING_MODEL_LABELS[b]}
                </option>
              ))}
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Popis">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </Field>
          </div>
          <p className="flex items-center gap-2 text-sm text-muted md:col-span-2">
            <TypeChip type={tpl.type} />
            {tpl.isDefault ? (
              <Chip color="yellow">Výchozí šablona typu</Chip>
            ) : (
              "Typ se po založení nemění."
            )}
          </p>
        </section>

        {/* fáze */}
        <section aria-label="Fáze šablony" className="space-y-2" data-testid="tpl-phases">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Fáze ({p.phases.length})</h2>
            <Button size="sm" onClick={() => setP(addPhase(p))} data-testid="tpl-add-phase">
              <Plus /> Přidat fázi
            </Button>
          </div>
          {p.phases.length === 0 && (
            <p className="text-sm text-muted">
              Bez fází. Zakázka vznikne s úkoly ve skupině „Bez fáze“.
            </p>
          )}
          {p.phases.map((f, i) => (
            <div
              key={i}
              className="grid items-end gap-2 rounded-lg border border-line p-2 md:grid-cols-[minmax(0,1fr)_12rem_6.5rem_6.5rem_auto]"
              data-testid="tpl-phase"
            >
              <label className="text-sm text-muted">
                Název
                <Input
                  value={f.name}
                  onChange={(e) => setP(updatePhase(p, i, { name: e.target.value }))}
                  aria-label={`Název fáze ${i + 1}`}
                />
              </label>
              <label className="text-sm text-muted">
                Zvláštní role
                <select
                  className={`${sel} w-full`}
                  aria-label={`Role fáze ${i + 1}`}
                  value={f.role ?? ""}
                  onChange={(e) =>
                    setP(updatePhase(p, i, { role: (e.target.value || null) as PhaseRole | null }))
                  }
                >
                  <option value="">Běžná fáze</option>
                  {PHASE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {PHASE_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-muted">
                Začátek (den)
                <Input
                  type="number"
                  min={0}
                  value={f.offsetDays}
                  onChange={(e) =>
                    setP(
                      updatePhase(p, i, { offsetDays: Math.max(0, Number(e.target.value) || 0) }),
                    )
                  }
                  aria-label={`Začátek fáze ${i + 1} ve dnech od startu`}
                />
              </label>
              <label className="text-sm text-muted">
                Délka (dny)
                <Input
                  type="number"
                  min={0}
                  value={f.durationDays}
                  onChange={(e) =>
                    setP(
                      updatePhase(p, i, { durationDays: Math.max(0, Number(e.target.value) || 0) }),
                    )
                  }
                  aria-label={`Délka fáze ${i + 1} ve dnech`}
                />
              </label>
              <div className="flex items-center">
                <span className="mr-1 hidden text-xs text-faint xl:inline">{phaseSpan(f)}</span>
                <IconButton
                  label={`Posunout fázi ${f.name || i + 1} nahoru`}
                  size="sm"
                  disabled={i === 0}
                  onClick={() => setP(movePhase(p, i, -1))}
                >
                  <ArrowUp />
                </IconButton>
                <IconButton
                  label={`Posunout fázi ${f.name || i + 1} dolů`}
                  size="sm"
                  disabled={i === p.phases.length - 1}
                  onClick={() => setP(movePhase(p, i, 1))}
                >
                  <ArrowDown />
                </IconButton>
                <IconButton
                  label={`Odebrat fázi ${f.name || i + 1}`}
                  size="sm"
                  onClick={() => setP(removePhase(p, i))}
                >
                  <Trash2 />
                </IconButton>
              </div>
            </div>
          ))}
        </section>

        {/* úkoly */}
        <section aria-label="Úkoly šablony" className="space-y-3" data-testid="tpl-tasks">
          <h2 className="text-sm font-semibold">Úkoly ({p.tasks.length})</h2>
          {rows.map(({ phaseIndex, tasks }) => (
            <div key={phaseIndex} className="rounded-lg border border-line">
              <div className="flex items-center justify-between border-b border-line-soft px-3 py-1.5">
                <h3 className="text-sm font-medium">{phaseName(phaseIndex)}</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setP(addTask(p, phaseIndex))}
                  data-testid="tpl-add-task"
                >
                  <Plus /> Úkol
                </Button>
              </div>
              {tasks.length === 0 ? (
                <p className="px-3 py-2 text-sm text-faint">Žádné úkoly.</p>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {tasks.map(({ task: t, index }) => (
                    <li
                      key={index}
                      className="grid items-end gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_9rem_8rem_12rem_5.5rem_5.5rem_auto]"
                      data-testid="tpl-task"
                    >
                      <label className="text-sm text-muted">
                        Název úkolu
                        <Input
                          value={t.title}
                          onChange={(e) => setP(updateTask(p, index, { title: e.target.value }))}
                          aria-label={`Název úkolu ${index + 1}`}
                        />
                      </label>
                      <label className="text-sm text-muted">
                        Typ
                        <select
                          className={`${sel} w-full`}
                          value={t.typeKey}
                          aria-label={`Typ úkolu ${index + 1}`}
                          onChange={(e) => setP(updateTask(p, index, { typeKey: e.target.value }))}
                        >
                          {taskTypes.map((x) => (
                            <option key={x.key} value={x.key}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm text-muted">
                        Priorita
                        <select
                          className={`${sel} w-full`}
                          value={t.priority}
                          aria-label={`Priorita úkolu ${index + 1}`}
                          onChange={(e) =>
                            setP(
                              updateTask(p, index, {
                                priority: e.target.value as typeof t.priority,
                              }),
                            )
                          }
                        >
                          <option value="none">Žádná</option>
                          <option value="low">Nízká</option>
                          <option value="medium">Střední</option>
                          <option value="high">Vysoká</option>
                          <option value="urgent">Urgentní</option>
                        </select>
                      </label>
                      <div className="text-sm text-muted">
                        Řešitel
                        <div className="flex gap-1">
                          <select
                            className={`${sel} w-28 shrink-0`}
                            value={t.assignee.rule}
                            aria-label={`Řešitel úkolu ${index + 1}`}
                            onChange={(e) =>
                              setP(
                                updateTask(p, index, {
                                  assignee: { rule: e.target.value as typeof t.assignee.rule },
                                }),
                              )
                            }
                          >
                            <option value="owner">Vlastník</option>
                            <option value="lead">Vedoucí</option>
                            <option value="user">Uživatel</option>
                            <option value="none">Nikdo</option>
                          </select>
                          {t.assignee.rule === "user" && (
                            <UserCombobox
                              value={t.assignee.userId ?? null}
                              onChange={(u) =>
                                setP(
                                  updateTask(p, index, {
                                    assignee: { rule: "user", ...(u ? { userId: u } : {}) },
                                  }),
                                )
                              }
                              aria-label={`Uživatel úkolu ${index + 1}`}
                            />
                          )}
                        </div>
                      </div>
                      <label className="text-sm text-muted">
                        Termín (den)
                        <Input
                          type="number"
                          min={0}
                          value={t.dueOffsetDays ?? ""}
                          placeholder="—"
                          aria-label={`Termín úkolu ${index + 1} ve dnech od startu`}
                          onChange={(e) =>
                            setP(
                              updateTask(p, index, {
                                dueOffsetDays:
                                  e.target.value === ""
                                    ? null
                                    : Math.max(0, Number(e.target.value) || 0),
                              }),
                            )
                          }
                        />
                      </label>
                      <label className="text-sm text-muted">
                        Odhad (min)
                        <Input
                          type="number"
                          min={0}
                          value={t.estimateMin ?? ""}
                          placeholder="—"
                          aria-label={`Odhad úkolu ${index + 1} v minutách`}
                          onChange={(e) =>
                            setP(
                              updateTask(p, index, {
                                estimateMin:
                                  e.target.value === ""
                                    ? null
                                    : Math.max(0, Number(e.target.value) || 0),
                              }),
                            )
                          }
                        />
                      </label>
                      <div className="flex items-center gap-1">
                        {p.phases.length > 1 && (
                          <select
                            className={`${sel} w-28`}
                            aria-label={`Fáze úkolu ${index + 1}`}
                            value={t.phaseIndex}
                            onChange={(e) =>
                              setP(updateTask(p, index, { phaseIndex: Number(e.target.value) }))
                            }
                          >
                            {p.phases.map((_, i) => (
                              <option key={i} value={i}>
                                {phaseName(i)}
                              </option>
                            ))}
                          </select>
                        )}
                        <IconButton
                          label={`Odebrat úkol ${t.title || index + 1}`}
                          size="sm"
                          onClick={() => setP(removeTask(p, index))}
                        >
                          <Trash2 />
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>

        {/* platby */}
        <section aria-label="Plánované platby" className="space-y-2" data-testid="tpl-payments">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Plánované platby ({p.payments.length})
              {p.payments.length > 0 && (
                <span className="ml-2 font-normal text-muted">
                  celkem {formatMinor(paymentsTotal(p))}
                </span>
              )}
            </h2>
            <Button size="sm" onClick={() => setP(addPayment(p))} data-testid="tpl-add-payment">
              <Plus /> Přidat platbu
            </Button>
          </div>
          {p.payments.map((x, i) => (
            <div
              key={i}
              className="grid items-end gap-2 rounded-lg border border-line p-2 lg:grid-cols-[minmax(0,1fr)_8rem_9rem_14rem_6rem_auto]"
              data-testid="tpl-payment"
            >
              <label className="text-sm text-muted">
                Popis
                <Input
                  value={x.description}
                  onChange={(e) => setP(updatePayment(p, i, { description: e.target.value }))}
                  aria-label={`Popis platby ${i + 1}`}
                />
              </label>
              <label className="text-sm text-muted">
                Druh
                <select
                  className={`${sel} w-full`}
                  value={x.kind}
                  aria-label={`Druh platby ${i + 1}`}
                  onChange={(e) =>
                    setP(updatePayment(p, i, { kind: e.target.value as typeof x.kind }))
                  }
                >
                  <option value="one_off">Jednorázová</option>
                  <option value="intro">Úvodní fáze</option>
                  <option value="retainer">Retainer</option>
                  <option value="extra">Navíc</option>
                </select>
              </label>
              <div className="text-sm text-muted">
                Částka
                <MoneyInput
                  value={x.amountMinor || null}
                  onChange={(v) => setP(updatePayment(p, i, { amountMinor: v ?? 0 }))}
                  aria-label={`Částka platby ${i + 1}`}
                  placeholder="7 000"
                />
              </div>
              <div className="text-sm text-muted">
                Fakturuje
                <div className="flex gap-1">
                  <select
                    className={`${sel} w-28 shrink-0`}
                    value={x.issuer.rule}
                    aria-label={`Fakturující platby ${i + 1}`}
                    onChange={(e) =>
                      setP(
                        updatePayment(p, i, {
                          issuer: { rule: e.target.value as typeof x.issuer.rule },
                        }),
                      )
                    }
                  >
                    <option value="owner">Vlastník</option>
                    <option value="other">Druhý z dvojice</option>
                    <option value="user">Uživatel</option>
                  </select>
                  {x.issuer.rule === "user" && (
                    <UserCombobox
                      value={x.issuer.userId ?? null}
                      onChange={(u) =>
                        setP(
                          updatePayment(p, i, {
                            issuer: { rule: "user", ...(u ? { userId: u } : {}) },
                          }),
                        )
                      }
                      aria-label={`Uživatel platby ${i + 1}`}
                    />
                  )}
                </div>
              </div>
              <label className="text-sm text-muted">
                Splatnost (den)
                <Input
                  type="number"
                  min={0}
                  value={x.dueOffsetDays ?? ""}
                  placeholder="—"
                  aria-label={`Splatnost platby ${i + 1} ve dnech od startu`}
                  onChange={(e) =>
                    setP(
                      updatePayment(p, i, {
                        dueOffsetDays:
                          e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),
                      }),
                    )
                  }
                />
              </label>
              <IconButton
                label={`Odebrat platbu ${x.description || i + 1}`}
                size="sm"
                onClick={() => setP(removePayment(p, i))}
              >
                <Trash2 />
              </IconButton>
            </div>
          ))}
        </section>
      </fieldset>

      {issues.length > 0 && edit && (
        <Notice tone="warning" title="Před uložením opravte">
          <ul className="list-disc pl-4">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Notice>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger" data-testid="tpl-error">
          {error}
        </p>
      )}
      {edit && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-bg px-4 py-3 md:-mx-6 md:px-6 max-md:hidden">
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!dirty || issues.length > 0 || !name.trim()}
            onClick={() => void submit()}
            data-testid="tpl-save"
          >
            Uložit šablonu
          </Button>
          {dirty && <span className="text-sm text-muted">Neuložené změny</span>}
          <span className="ml-auto flex flex-wrap gap-2">
            {!tpl.archivedAt && <Button onClick={() => setFrom(true)}>Vytvořit zakázku</Button>}
            {!tpl.archivedAt && !tpl.isDefault && (
              <Button
                onClick={() =>
                  setDefault.mutate(
                    { id: tpl.id },
                    {
                      onSuccess: () => successToast("Šablona je výchozí pro svůj typ."),
                      onError: (e) => errorToast(e.message),
                    },
                  )
                }
              >
                Nastavit jako výchozí
              </Button>
            )}
            <Button
              onClick={() =>
                duplicate.mutate(
                  { id: tpl.id },
                  {
                    onSuccess: (t) =>
                      nav.push(api.hrefFor("job_template", t.id) ?? "/zakazky/sablony"),
                    onError: (e) => errorToast(e.message),
                  },
                )
              }
            >
              Duplikovat
            </Button>
            <Button
              variant={tpl.archivedAt ? "secondary" : "danger"}
              onClick={() =>
                archive.mutate(
                  { id: tpl.id, archived: !tpl.archivedAt },
                  {
                    onSuccess: () =>
                      successToast(
                        tpl.archivedAt ? "Šablona je obnovená." : "Šablona je archivovaná.",
                      ),
                    onError: (e) => errorToast(e.message),
                  },
                )
              }
            >
              {tpl.archivedAt ? "Obnovit z archivu" : "Archivovat"}
            </Button>
          </span>
        </div>
      )}
      {from && (
        <CreateJobDialog
          open
          onOpenChange={setFrom}
          preset={{ type: tpl.type, templateId: tpl.id }}
        />
      )}
    </div>
  );
}

/** Obsah okna „Uložit jako šablonu“ na detailu zakázky (fáze bez dat, úkoly jako posuny od startu, volitelně platby). */
export function SaveAsTemplateForm({
  jobId,
  title,
  close,
}: {
  jobId: string;
  title: string;
  close: () => void;
}) {
  const api = useEntityApi();
  const { Link } = useNav();
  const can = useCan();
  const [name, setName] = useState(title);
  const [description, setDescription] = useState("");
  const [tasks, setTasks] = useState(true);
  const [payments, setPayments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const run = useCommandMutation<Record<string, unknown>, { id: string }>(
    "zakazky.template.saveFromJob",
  );
  if (!can("zakazky.templates"))
    return <p className="p-5 text-muted">K ukládání šablon nemáte oprávnění.</p>;
  if (savedId)
    return (
      <div className="space-y-3 px-5 py-4" data-testid="template-saved">
        <p>Šablona „{name}“ je uložená.</p>
        <div className="flex justify-end gap-2">
          <Link
            href={api.hrefFor("job_template", savedId) ?? "/zakazky/sablony"}
            className="text-accent hover:underline"
          >
            Otevřít v editoru
          </Link>
          <Button onClick={close}>Zavřít</Button>
        </div>
      </div>
    );
  return (
    <form
      className="px-5 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          const r = await run.mutateAsync({
            jobId,
            name: name.trim(),
            description: description.trim() || null,
            includeTasks: tasks,
            includePayments: payments,
          });
          successToast(`Šablona „${name}“ je uložená.`);
          setSavedId(r.id);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <Field label="Název šablony">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
      </Field>
      <Field label="Popis (nepovinný)">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="mb-4 space-y-2">
        <label className="flex items-center gap-2">
          <Checkbox checked onCheckedChange={() => undefined} disabled aria-label="Fáze" /> Fáze
          (bez konkrétních dat)
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={tasks}
            onCheckedChange={(v) => setTasks(v === true)}
            aria-label="Úkoly"
          />{" "}
          Úkoly (termíny jako dny od startu)
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={payments}
            onCheckedChange={(v) => setPayments(v === true)}
            aria-label="Plánované platby"
          />{" "}
          Plánované platby
        </label>
      </div>
      {error && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Zrušit
        </Button>
        <Button type="submit" variant="primary" loading={run.isPending} disabled={!name.trim()}>
          Uložit šablonu
        </Button>
      </div>
    </form>
  );
}
