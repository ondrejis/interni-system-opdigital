"use client";

/*
  Záložka „Úkoly a aktivity“ na kartách organizace, kontaktu, obchodu a zakázky (UKO-01, OBCH-14): rychlé přidání,
  composer „Další aktivita“ (naplánovat) i „Zapsat hotovou“ (rychlý zápis proběhlého hovoru, e-mailu, schůzky),
  další kroky a časová osa aktivit s výsledky.
*/
import { formatDate } from "@rebar/core/shared";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Icon,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Input,
  cn,
  successToast,
  useCommandQuery,
} from "@rebar/ui";
import { useState } from "react";
import type { RecordTasksResult, TaskDto } from "../contract";
import { formatDuration } from "../tasks/logic/due";
import {
  ActivityForm,
  newActivityValues,
  submitOnModEnter,
  toCreateInput,
  type ActivityLinks,
  type ActivityValues,
} from "./activity-form";
import { useTaskOps } from "./ops";
import { QuickAdd } from "./quick-add";
import { AssigneeAvatar, TypeBadge, guard, useTaskActions, useTaskTypes } from "./shared";
import { TaskDialog } from "./task-dialog";
import { TaskRow } from "./task-row";
import { useEntityApi } from "@rebar/ui";

/** Záznam, ke kterému se úkoly vážou; `entity` je klíč entity jádra. */
export type RecordTarget = { entity: string; id: string };

/** Vazby úkolu podle typu záznamu (firma → `companyId`…). */
export function linksFor(t: RecordTarget): ActivityLinks {
  switch (t.entity) {
    case "company":
      return { companyId: t.id };
    case "person":
      return { personId: t.id };
    case "deal":
      return { dealId: t.id };
    case "job":
      return { jobId: t.id };
    default:
      return {};
  }
}

const forRecordInput = (l: ActivityLinks) => ({
  ...(l.dealId ? { dealId: l.dealId } : {}),
  ...(l.companyId ? { companyId: l.companyId } : {}),
  ...(l.personId ? { personId: l.personId } : {}),
  ...(l.jobId ? { jobId: l.jobId } : {}),
});

/** Úkoly a aktivity záznamu (`ukoly.forRecord`). */
export function useRecordTasks(links: ActivityLinks, enabled = true) {
  return useCommandQuery<RecordTasksResult>(
    "ukoly.forRecord",
    { ...forRecordInput(links), include: "all", limit: 200 },
    { enabled, refetchInterval: 30_000 },
  );
}

/* ---------- composer „Další aktivita“ ---------- */

/** Naplánování další aktivity (typ, název, termín, délka, řešitel) k záznamu. */
export function PlanComposer({ links, onDone }: { links: ActivityLinks; onDone?: () => void }) {
  const api = useEntityApi();
  const types = useTaskTypes();
  const actions = useTaskActions();
  const [draft, setDraft] = useState<ActivityValues | null>(null);
  const values = draft ?? (types.data ? newActivityValues(types.data, api.me) : null);

  async function submit() {
    if (!values || !types.data || actions.create.isPending) return;
    if (
      await guard(
        actions.create.mutateAsync(toCreateInput(values, types.data, links)),
        "Aktivita je naplánovaná.",
      )
    ) {
      setDraft(null);
      onDone?.();
    }
  }
  if (!values || !types.data) return <Skeleton className="h-48" />;
  return (
    <form
      data-testid="plan-composer"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={submitOnModEnter(() => void submit())}
    >
      <ActivityForm idPrefix="plan" values={values} onChange={setDraft} types={types.data} />
      <div className="mt-3 flex justify-end">
        <Button type="submit" variant="primary" loading={actions.create.isPending}>
          <Icon name="calendar-plus" /> Naplánovat
        </Button>
      </div>
    </form>
  );
}

/** Rychlý zápis proběhlé aktivity (hovor, e-mail, schůzka…): rovnou hotová, s výsledkem. */
export function LogComposer({ links, onDone }: { links: ActivityLinks; onDone?: () => void }) {
  const types = useTaskTypes();
  const actions = useTaskActions();
  const [typeKey, setTypeKey] = useState("call");
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState("");
  const type = types.data?.find((t) => t.key === typeKey);

  async function submit() {
    if (actions.create.isPending) return;
    const r = await guard(
      actions.create.mutateAsync({
        title: title.trim() || type?.name || "Aktivita",
        typeKey,
        done: true,
        outcome: outcome.trim() || null,
        ...links,
      }),
      "Aktivita je zapsaná.",
    );
    if (r) {
      setTitle("");
      setOutcome("");
      onDone?.();
    }
  }
  return (
    <form
      data-testid="log-composer"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={submitOnModEnter(() => void submit())}
      className="space-y-3"
    >
      <div
        className="flex flex-wrap items-center gap-1"
        role="radiogroup"
        aria-label="Typ proběhlé aktivity"
      >
        {(types.data ?? []).map((t) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={t.key === typeKey}
            aria-label={t.name}
            title={t.name}
            onClick={() => setTypeKey(t.key)}
            className={cn(
              "flex size-8 items-center justify-center rounded-md border transition-colors pointer-coarse:size-11",
              t.key === typeKey
                ? "border-accent bg-accent-soft text-accent"
                : "border-line-strong text-muted hover:bg-hover hover:text-fg",
            )}
          >
            <Icon name={t.icon ?? "check-square"} className="size-4" />
          </button>
        ))}
        {type && <span className="ml-1.5 text-sm font-medium text-muted">{type.name}</span>}
      </div>
      <Input
        aria-label="S kým a o čem"
        placeholder="S kým a o čem, např. Hovor s Novákem"
        maxLength={300}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Field label="Výsledek" htmlFor="log-outcome">
        <Textarea
          id="log-outcome"
          rows={3}
          maxLength={5000}
          placeholder="Na čem jste se domluvili?"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={actions.create.isPending}>
          <Icon name="check" /> Zapsat
        </Button>
      </div>
    </form>
  );
}

/* ---------- časová osa ---------- */

/** Časová osa proběhlých aktivit od nejnovější: typ, název, kdy, kdo, výsledek. */
export function TaskTimeline({ done, onOpen }: { done: TaskDto[]; onOpen: (id: string) => void }) {
  const rows = [...done].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  if (!rows.length)
    return (
      <p className="p-2 text-sm text-muted">
        Zatím nic neproběhlo. Hotové aktivity a jejich výsledky se objeví tady.
      </p>
    );
  return (
    <ol className="relative space-y-3 border-l border-line pl-5" data-testid="timeline">
      {rows.map((t) => (
        <li key={t.id} className="relative">
          <span className="absolute -left-[33px] top-0.5">
            <TypeBadge icon={t.typeIcon} color={t.typeColor} name={t.typeName} />
          </span>
          <button
            type="button"
            onClick={() => onOpen(t.id)}
            className={cn(
              "text-left text-base font-medium hover:underline",
              t.status === "canceled" && "text-muted line-through",
            )}
          >
            {t.title}
          </button>
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span>
              {t.status === "canceled" ? "Zrušeno" : "Hotovo"}{" "}
              {t.completedAt ? formatDate(t.completedAt) : ""}
            </span>
            {t.dueTime && t.durationMin ? <span>· {formatDuration(t.durationMin)}</span> : null}
            {t.assigneeName && (
              <span className="flex items-center gap-1">
                · <AssigneeAvatar name={t.assigneeName} size={16} /> {t.assigneeName}
              </span>
            )}
          </div>
          {t.outcome && (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-base">{t.outcome}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ---------- záložka ---------- */

/** Obsah záložky „Úkoly a aktivity“. */
export function RecordTasksPanel({ target }: { target: RecordTarget }) {
  const links = linksFor(target);
  const q = useRecordTasks(links);
  const ops = useTaskOps();
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState("plan");
  const open = q.data?.open ?? [];
  const done = q.data?.done ?? [];

  return (
    <div className="space-y-3 p-1" data-testid="record-tasks">
      <QuickAdd links={links} placeholder="Rychle přidat… např. „zavolat zítra 10:00“" />
      <Card aria-label="Další aktivita" data-testid="activity-composer">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="rounded-t-[inherit] border-line bg-subtle px-2">
            <TabsTrigger value="plan">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="calendar-clock" className="size-4" /> Další aktivita
              </span>
            </TabsTrigger>
            <TabsTrigger value="log">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="phone" className="size-4" /> Zapsat hotovou
              </span>
            </TabsTrigger>
          </TabsList>
          <div className="p-4">
            <TabsContent value="plan" forceMount className="data-[state=inactive]:hidden">
              <PlanComposer links={links} />
            </TabsContent>
            <TabsContent value="log" forceMount className="data-[state=inactive]:hidden">
              <LogComposer links={links} onDone={() => successToast("Zapsáno do časové osy.")} />
            </TabsContent>
          </div>
        </Tabs>
      </Card>

      <Card aria-label="Další kroky">
        <CardHeader
          title="Další kroky"
          icon={<Icon name="calendar-clock" />}
          count={open.length || undefined}
        />
        <CardBody flush>
          {q.isLoading ? (
            <Skeleton className="m-3 h-16" />
          ) : q.isError ? (
            <p className="p-3 text-sm text-danger">Úkoly se nepodařilo načíst.</p>
          ) : open.length === 0 ? (
            <p className="m-3 flex items-center gap-2 rounded-md border border-dashed border-line-strong bg-warning-soft/40 px-3 py-2.5 text-muted">
              <Icon name="circle-alert" className="size-4 shrink-0 text-warning" />
              Zatím nic není naplánováno. Naplánujte další krok, ať záznam nestojí.
            </p>
          ) : (
            <ul className="divide-y divide-line" data-testid="record-open-tasks">
              {open.map((t) => (
                <TaskRow key={t.id} task={t} ops={ops} onOpen={setOpenId} showLinks={false} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card aria-label="Časová osa">
        <CardHeader
          title="Časová osa"
          icon={<Icon name="history" />}
          count={done.length || undefined}
        />
        <CardBody>
          <TaskTimeline done={done} onOpen={setOpenId} />
        </CardBody>
      </Card>

      {ops.dialogs}
      {openId && (
        <TaskDialog taskId={openId} onClose={() => setOpenId(null)} onSwitch={setOpenId} />
      )}
    </div>
  );
}

/** Karta „Úkoly“ na přehledu záznamu: nejbližší otevřené kroky a odkaz na celou záložku. */
export function RecordTasksCard({
  target,
  openTab,
}: {
  target: RecordTarget;
  openTab: (tab: string) => void;
}) {
  const links = linksFor(target);
  const q = useRecordTasks(links);
  const ops = useTaskOps();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = (q.data?.open ?? []).slice(0, 5);
  return (
    <Card aria-label="Úkoly a aktivity">
      <CardHeader
        title="Úkoly a aktivity"
        icon={<Icon name="check-square" />}
        count={q.data?.counts.open || undefined}
        action={
          <Button size="sm" variant="ghost" onClick={() => openTab("ukoly")}>
            Zobrazit vše
          </Button>
        }
      />
      <CardBody flush>
        {q.isLoading ? (
          <Skeleton className="m-3 h-12" />
        ) : open.length === 0 ? (
          <p className="p-3 text-sm text-muted">Žádné otevřené úkoly.</p>
        ) : (
          <ul className="divide-y divide-line">
            {open.map((t) => (
              <TaskRow key={t.id} task={t} ops={ops} onOpen={setOpenId} showLinks={false} />
            ))}
          </ul>
        )}
      </CardBody>
      {ops.dialogs}
      {openId && (
        <TaskDialog taskId={openId} onClose={() => setOpenId(null)} onSwitch={setOpenId} />
      )}
    </Card>
  );
}
