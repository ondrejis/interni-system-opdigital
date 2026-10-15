"use client";

/*
  Dialog úkolu (UKO-03, UKO-10, VID-06): každá hodnota se mění přímo (ukládá se při změně nebo opuštění pole), podúkoly
  (jedna úroveň), komentáře z jádra, výsledek u hovoru a schůzky, vazby, štítky a slot „Zapsat čas“. Součástí je
  i dialog „Nový úkol“ s předvyplněnými vazbami.
*/
import {
  Button,
  Checkbox,
  ConfirmDialog,
  DatePicker,
  Dialog,
  DialogContent,
  Icon,
  Input,
  Skeleton,
  Slot,
  Textarea,
  cn,
  errorToast,
  successToast,
  useCommandQuery,
  useEntityApi,
  useNav,
  type ActivityResult,
} from "@rebar/ui";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { TaskDetailDto, TaskDto, UpdateTaskInput } from "../contract";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "../tasks/constants";
import {
  ActivityForm,
  CheckRow,
  newActivityValues,
  submitOnModEnter,
  toCreateInput,
  type ActivityLinks,
  type ActivityValues,
} from "./activity-form";
import { CompleteCircle } from "./complete";
import { estimateLabel, isOpen, parseEstimate, splitMentions } from "./logic";
import { useTaskOps } from "./ops";
import {
  AssigneePicker,
  RecordPicker,
  TypeBadge,
  guard,
  messageOf,
  selectClass,
  typeOf,
  useCanPrivate,
  useTaskActions,
  useTaskTypes,
} from "./shared";

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-1.5">
      <span className="text-sm text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ---------- komentáře ---------- */

function Comments({ taskId }: { taskId: string }) {
  const api = useEntityApi();
  const [data, setData] = useState<ActivityResult | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api.activity("task", taskId));
    } catch {
      setData({ timeline: [] } as unknown as ActivityResult);
    }
  }, [api, taskId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function post() {
    if (!body.trim() || busy) return;
    setBusy(true);
    if (await guard(api.addComment("task", taskId, body.trim()).then(() => true))) {
      setBody("");
      await load();
    }
    setBusy(false);
  }

  const comments = (data?.timeline ?? []).filter((i) => i.kind === "comment");
  const audit = (data?.timeline ?? []).filter((i) => i.kind === "audit");
  return (
    <section aria-label="Komentáře" data-testid="comments">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted">
        <Icon name="message-square" className="size-4" /> Komentáře
        {comments.length > 0 && (
          <span className="tabular rounded-full bg-hover px-1.5 text-xs">{comments.length}</span>
        )}
      </h3>
      <ul className="space-y-2">
        {comments.map((c) =>
          c.kind === "comment" ? (
            <li key={c.id} className="group rounded-lg bg-subtle px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="font-medium text-fg">{c.actor}</span>
                <time>
                  {new Date(c.at).toLocaleString("cs-CZ", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: "Europe/Prague",
                  })}
                </time>
                {c.edited && <span>(upraveno)</span>}
                {c.actorId === api.me.id && (
                  <button
                    type="button"
                    aria-label="Smazat komentář"
                    className="ml-auto opacity-0 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                    onClick={async () => {
                      if (await guard(api.deleteComment(c.id).then(() => true))) await load();
                    }}
                  >
                    <Icon name="trash" className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-base">
                {splitMentions(c.body).map((s, i) =>
                  s.mention ? (
                    <mark key={i} className="rounded bg-accent-soft px-0.5 font-medium text-accent">
                      {s.text}
                    </mark>
                  ) : (
                    <span key={i}>{s.text}</span>
                  ),
                )}
              </p>
            </li>
          ) : null,
        )}
      </ul>
      <form
        className="mt-2 flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void post();
        }}
        onKeyDown={submitOnModEnter(() => void post())}
      >
        <Textarea
          aria-label="Nový komentář"
          rows={2}
          maxLength={5000}
          placeholder="Napište komentář… (@jméno jen zvýrazní jméno, nic se neposílá)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit" variant="primary" loading={busy} disabled={!body.trim()}>
          Přidat
        </Button>
      </form>
      {audit.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-muted hover:text-fg"
            aria-expanded={history}
            onClick={() => setHistory((h) => !h)}
          >
            <Icon name="history" className="size-4" /> Historie změn ({audit.length})
          </button>
          {history && (
            <ul className="mt-1 space-y-1 text-sm text-muted">
              {audit.map((a) =>
                a.kind === "audit" ? (
                  <li key={a.id}>
                    {new Date(a.at).toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" })} ·{" "}
                    {a.actor}: {a.summary ?? a.action}
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------- podúkoly ---------- */

function Subtasks({ task, ops }: { task: TaskDetailDto; ops: ReturnType<typeof useTaskOps> }) {
  const actions = useTaskActions();
  const [title, setTitle] = useState("");
  async function add() {
    const t = title.trim();
    if (!t) return;
    if (await guard(actions.create.mutateAsync({ title: t, parentId: task.id }))) setTitle("");
  }
  return (
    <section aria-label="Podúkoly" data-testid="subtasks">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted">
        <Icon name="list-todo" className="size-4" /> Podúkoly
        {task.subtasks.total > 0 && (
          <span className="tabular rounded-full bg-hover px-1.5 text-xs">
            {task.subtasks.done}/{task.subtasks.total}
          </span>
        )}
      </h3>
      <ul className="space-y-0.5">
        {task.subtaskList.map((s: TaskDto) => (
          <li key={s.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-hover">
            <CompleteCircle
              task={s}
              onComplete={() => void ops.flow.complete(s)}
              onReopen={() => void ops.flow.reopen(s)}
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                !isOpen(s.status) && "text-muted line-through",
              )}
            >
              {s.title}
            </span>
          </li>
        ))}
      </ul>
      <form
        className="mt-1 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          aria-label="Nový podúkol"
          placeholder="Přidat podúkol…"
          maxLength={300}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" disabled={!title.trim() || actions.create.isPending}>
          Přidat
        </Button>
      </form>
    </section>
  );
}

/* ---------- štítky ---------- */

function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((g) => (
        <span key={g} className="chip" data-color="gray">
          {g}
          <button
            type="button"
            aria-label={`Odebrat štítek ${g}`}
            onClick={() => onChange(tags.filter((x) => x !== g))}
          >
            <Icon name="x" className="size-3" />
          </button>
        </span>
      ))}
      <Input
        aria-label="Nový štítek"
        placeholder="+ štítek"
        className="h-7 w-28"
        maxLength={60}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            e.preventDefault();
            if (!tags.includes(text.trim())) onChange([...tags, text.trim()]);
            setText("");
          }
        }}
      />
    </div>
  );
}

/* ---------- detail ---------- */

/** Dialog detailu úkolu; `onSwitch` přepne na jiný úkol (nadřazený). */
export function TaskDialog({
  taskId,
  onClose,
  onSwitch,
}: {
  taskId: string;
  onClose: () => void;
  onSwitch?: (id: string) => void;
}) {
  const api = useEntityApi();
  const { Link } = useNav();
  const ops = useTaskOps();
  const types = useTaskTypes();
  const q = useCommandQuery<TaskDetailDto>("ukoly.get", { id: taskId });
  const t = q.data;
  const [askDelete, setAskDelete] = useState(false);
  const jobDetail = useCommandQuery<{ phases: { id: string; name: string }[] }>(
    "zakazky.detail",
    { jobId: t?.job?.id ?? "" },
    { enabled: !!t?.job?.id },
  );

  const save = (patch: Omit<UpdateTaskInput, "id">) =>
    guard(ops.actions.update.mutateAsync({ id: taskId, ...patch }));

  const type = t ? typeOf(types.data, t.typeKey) : undefined;
  const closed = t ? !isOpen(t.status) : false;
  const callish = !!t && (type?.isCalendarEvent || t.typeKey === "call" || t.typeKey === "meeting");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t ? t.title : "Úkol"}
        description={t ? `${t.typeName} · ${TASK_STATUS_LABELS[t.status]}` : "Načítám…"}
        className="top-[6vh] max-h-[88vh] w-[min(62rem,calc(100vw-1rem))]"
      >
        {q.isLoading || !t ? (
          q.isError ? (
            <p className="p-5 text-danger" role="alert">
              {messageOf(q.error)}
            </p>
          ) : (
            <div className="space-y-3 p-5">
              <Skeleton className="h-8" />
              <Skeleton className="h-40" />
            </div>
          )
        ) : (
          <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_19rem]" data-testid="task-dialog">
            <div className="min-w-0 space-y-5 p-5">
              <div className="flex items-center gap-2">
                <TypeBadge icon={t.typeIcon} color={t.typeColor} name={t.typeName} />
                <Input
                  key={t.title}
                  aria-label="Název úkolu"
                  data-testid="dialog-title"
                  className="h-9 text-lg font-semibold"
                  defaultValue={t.title}
                  maxLength={300}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== t.title) void save({ title: v });
                    else e.target.value = t.title;
                  }}
                />
                {t.isPrivate && <Icon name="lock" className="size-4 shrink-0 text-faint" />}
              </div>
              {t.parentId && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-accent hover:underline"
                  onClick={() => onSwitch?.(t.parentId!)}
                >
                  <Icon name="arrow-right" className="size-4 rotate-180" /> Podúkol úkolu:{" "}
                  {t.parentTitle ?? "nadřazený úkol"}
                </button>
              )}
              <div>
                <label htmlFor="task-desc" className="mb-1 block text-sm font-semibold text-muted">
                  Popis
                </label>
                <Textarea
                  key={t.description ?? ""}
                  id="task-desc"
                  rows={4}
                  maxLength={20000}
                  defaultValue={t.description ?? ""}
                  placeholder="Co je potřeba udělat…"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (t.description ?? "")) void save({ description: v || null });
                  }}
                />
              </div>
              {(callish || t.outcome) && (
                <div>
                  <label
                    htmlFor="task-outcome"
                    className="mb-1 block text-sm font-semibold text-muted"
                  >
                    Výsledek
                  </label>
                  <Textarea
                    key={t.outcome ?? ""}
                    id="task-outcome"
                    rows={3}
                    maxLength={5000}
                    defaultValue={t.outcome ?? ""}
                    placeholder="Co z hovoru nebo schůzky vzešlo?"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (t.outcome ?? "")) void save({ outcome: v || null });
                    }}
                  />
                </div>
              )}
              {!t.parentId && <Subtasks task={t} ops={ops} />}
              <Comments taskId={taskId} />
            </div>

            <aside
              className="space-y-0.5 border-t border-line bg-subtle p-4 md:border-l md:border-t-0"
              aria-label="Vlastnosti úkolu"
            >
              <Prop label="Stav">
                <select
                  aria-label="Stav"
                  data-testid="dialog-status"
                  className={selectClass}
                  value={t.status}
                  onChange={(e) => {
                    const s = e.target.value as TaskStatus;
                    if (s === "done") void ops.flow.complete(t);
                    else void guard(ops.actions.setStatus.mutateAsync({ id: t.id, status: s }));
                  }}
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TASK_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Prop>
              <Prop label="Typ">
                <select
                  aria-label="Typ"
                  className={selectClass}
                  value={t.typeKey}
                  onChange={(e) => void save({ typeKey: e.target.value })}
                >
                  {(types.data ?? []).map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </Prop>
              <Prop label="Priorita">
                <select
                  aria-label="Priorita"
                  className={selectClass}
                  value={t.priority}
                  onChange={(e) => void save({ priority: e.target.value as TaskPriority })}
                >
                  {[...TASK_PRIORITIES].reverse().map((p) => (
                    <option key={p} value={p}>
                      {TASK_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </Prop>
              <Prop label="Řešitel">
                <AssigneePicker
                  value={t.assigneeId}
                  name={t.assigneeName}
                  onChange={(id) => void ops.assign([t], id)}
                />
              </Prop>
              <Prop label="Termín">
                <DatePicker
                  value={t.dueDate}
                  disabled={closed}
                  placeholder="Bez termínu"
                  onChange={(d) => void save({ dueDate: d })}
                />
              </Prop>
              <Prop label="Čas">
                <div className="flex gap-1.5">
                  <Input
                    key={t.dueTime ?? ""}
                    type="time"
                    step={300}
                    aria-label="Čas"
                    disabled={!t.dueDate || closed}
                    defaultValue={t.dueTime ?? ""}
                    onBlur={(e) => {
                      if ((e.target.value || null) !== t.dueTime)
                        void save({ dueTime: e.target.value || null });
                    }}
                  />
                  <select
                    aria-label="Délka"
                    className={cn(selectClass, "!w-24")}
                    disabled={!t.dueTime}
                    value={t.durationMin ?? ""}
                    onChange={(e) =>
                      void save({ durationMin: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">bez délky</option>
                    {[15, 30, 45, 60, 90, 120, 180, 240].map((d) => (
                      <option key={d} value={d}>
                        {estimateLabel(d)}
                      </option>
                    ))}
                    {t.durationMin &&
                      ![15, 30, 45, 60, 90, 120, 180, 240].includes(t.durationMin) && (
                        <option value={t.durationMin}>{t.durationMin} min</option>
                      )}
                  </select>
                </div>
              </Prop>
              <Prop label="Celý den">
                <Checkbox
                  aria-label="Celý den"
                  checked={t.allDay}
                  disabled={!t.dueDate || closed}
                  onCheckedChange={(c) => void save({ allDay: c === true })}
                />
              </Prop>
              <Prop label="Místo">
                <Input
                  key={t.place ?? ""}
                  aria-label="Místo"
                  maxLength={300}
                  defaultValue={t.place ?? ""}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== (t.place ?? ""))
                      void save({ place: e.target.value.trim() || null });
                  }}
                />
              </Prop>
              <Prop label="Odhad času">
                <Input
                  key={t.estimateMin ?? 0}
                  aria-label="Odhad času"
                  placeholder="např. 1,5 h"
                  defaultValue={estimateLabel(t.estimateMin)}
                  onBlur={(e) => {
                    const v = parseEstimate(e.target.value);
                    if (v === undefined) {
                      errorToast("Odhad zadejte jako 90, 1,5 h nebo 1:30.");
                      e.target.value = estimateLabel(t.estimateMin);
                    } else if (v !== (t.estimateMin ?? null)) void save({ estimateMin: v });
                  }}
                />
              </Prop>
              <Prop label="Štítky">
                <TagsEditor tags={t.tags} onChange={(tags) => void save({ tags })} />
              </Prop>
              <div className="my-2 border-t border-line" />
              <Prop label="Obchod">
                <RecordPicker
                  entity="deal"
                  label="Obchod"
                  value={t.deal?.id ?? null}
                  title={t.deal?.title ?? null}
                  onChange={(id) => void save({ dealId: id })}
                />
              </Prop>
              <Prop label="Organizace">
                <RecordPicker
                  entity="company"
                  label="Organizace"
                  value={t.company?.id ?? null}
                  title={t.company?.title ?? null}
                  onChange={(id) => void save({ companyId: id })}
                />
              </Prop>
              <Prop label="Kontakt">
                <RecordPicker
                  entity="person"
                  label="Kontakt"
                  value={t.person?.id ?? null}
                  title={t.person?.title ?? null}
                  onChange={(id) => void save({ personId: id })}
                />
              </Prop>
              <Prop label="Zakázka">
                <RecordPicker
                  entity="job"
                  label="Zakázka"
                  value={t.job?.id ?? null}
                  title={t.job?.title ?? null}
                  onChange={(id) => void save({ jobId: id, jobPhaseId: null })}
                />
              </Prop>
              {t.job && (
                <Prop label="Fáze">
                  {jobDetail.data?.phases?.length ? (
                    <select
                      aria-label="Fáze zakázky"
                      className={selectClass}
                      value={t.jobPhaseId ?? ""}
                      onChange={(e) => void save({ jobPhaseId: e.target.value || null })}
                    >
                      <option value="">Bez fáze</option>
                      {jobDetail.data.phases.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-base text-muted">{t.jobPhaseName ?? "Bez fáze"}</span>
                  )}
                </Prop>
              )}
              <div className="pt-2">
                <Slot name="task.dialog.extras" taskId={taskId} />
              </div>
            </aside>
          </div>
        )}
        {t && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            <Button variant="ghost" className="text-danger" onClick={() => setAskDelete(true)}>
              <Icon name="trash" /> Smazat
            </Button>
            {api.hrefFor("task", taskId) && (
              <Link
                href={api.hrefFor("task", taskId)!}
                className="text-sm text-muted hover:text-fg hover:underline"
              >
                Otevřít na celé stránce
              </Link>
            )}
            <div className="ml-auto flex gap-2">
              {closed ? (
                <Button onClick={() => void ops.flow.reopen(t)}>
                  <Icon name="rotate-ccw" /> Znovu otevřít
                </Button>
              ) : (
                <Button
                  variant="primary"
                  data-testid="dialog-done"
                  onClick={() => void ops.flow.complete(t)}
                >
                  <Icon name="check" /> Hotovo
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
      {ops.dialogs}
      <ConfirmDialog
        open={askDelete}
        onOpenChange={setAskDelete}
        title="Smazat úkol?"
        description="Úkol půjde do koše, odkud ho jde 30 dní vrátit."
        confirmLabel="Smazat"
        danger
        onConfirm={async () => {
          if (t && (await ops.remove([taskId], `Smazáno: ${t.title}`))) onClose();
        }}
      />
    </Dialog>
  );
}

/* ---------- nový úkol ---------- */

/** Formulář „Nový úkol“ s předvyplněnými vazbami (karta klienta, obchodu, zakázky, kontaktu); obsah dialogu. */
export function NewTaskForm({
  links,
  typeKey,
  onClose,
  onCreated,
}: {
  links?: ActivityLinks;
  typeKey?: string;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const api = useEntityApi();
  const types = useTaskTypes();
  const actions = useTaskActions();
  const canPrivate = useCanPrivate();
  const [values, setValues] = useState<ActivityValues | null>(null);
  const [isPrivate, setPrivate] = useState(false);
  const v = values ?? (types.data ? newActivityValues(types.data, api.me, typeKey) : null);

  async function submit() {
    if (!v || !types.data || actions.create.isPending) return;
    const r = await guard(
      actions.create.mutateAsync(
        toCreateInput(v, types.data, links ?? {}, isPrivate ? { isPrivate: true } : {}),
      ),
    );
    if (r) {
      successToast("Úkol je přidaný.");
      onCreated?.();
      onClose();
    }
  }
  return (
    <form
      className="px-5 py-4"
      data-testid="new-task"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={submitOnModEnter(() => void submit())}
    >
      {v && types.data ? (
        <ActivityForm idPrefix="new" values={v} onChange={setValues} types={types.data} autoFocus />
      ) : (
        <Skeleton className="h-48" />
      )}
      {canPrivate && (
        <div className="mt-2">
          <CheckRow checked={isPrivate} onChange={setPrivate}>
            <Icon name="lock" className="size-4" /> Soukromý úkol (jen vy)
          </CheckRow>
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2 border-t border-line pt-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Zrušit
        </Button>
        <Button type="submit" variant="primary" loading={actions.create.isPending} disabled={!v}>
          Přidat úkol
        </Button>
      </div>
    </form>
  );
}

/** Dialog „Nový úkol“. */
export function NewTaskDialog({
  links,
  typeKey,
  title = "Nový úkol",
  onClose,
}: {
  links?: ActivityLinks;
  typeKey?: string;
  title?: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={title}
        description="Název, termín a řešitel; ostatní doplníte v detailu."
      >
        <NewTaskForm
          {...(links ? { links } : {})}
          {...(typeKey ? { typeKey } : {})}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
