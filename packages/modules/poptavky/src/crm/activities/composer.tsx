"use client";

import {
  Button,
  Card,
  Field,
  Icon,
  Input,
  Kbd,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Checkbox,
  errorToast,
  modKey,
  successToast,
  useCommandMutation,
  useEntityApi,
} from "@rebar/ui";
import { useState } from "react";
import { NextActivityDialog, suggestionFromActivity } from "./activity-actions";
import {
  ActivityForm,
  newValues,
  submitOnModEnter,
  toDraft,
  type FormValues,
} from "./activity-form";
import { Timeline } from "./timeline-ui";
import { UpcomingSteps } from "./steps";
import { mainTarget, useActivityTypes, type ActivityTarget } from "./ui-shared";
import type { ActivityDraft, ActivityDto, NoteDto } from "./types";

/** Hint pod formulářem: `Cmd+Enter` uloží. */
function ShortcutHint({ verb }: { verb: string }) {
  return (
    <span className="hidden items-center gap-1 text-sm text-faint sm:flex">
      <Kbd>{modKey()}</Kbd>
      <Kbd>Enter</Kbd> {verb}
    </span>
  );
}

/**
 * Psací panel „Aktivita“: typ jako ikony, předmět, termín (datum a čas, nebo celý den), délka, přiřazeno a v rozbalení
 * priorita, místo a poznámka. `Cmd+Enter` aktivitu naplánuje; vazby se berou z `jobId` / `companyId` / `personId`.
 */
export function ActivityComposer({
  onCreated,
  defaultTypeKey,
  autoFocus,
  ...target
}: ActivityTarget & {
  onCreated?: (id: string) => void;
  defaultTypeKey?: string;
  autoFocus?: boolean;
}) {
  const api = useEntityApi();
  const types = useActivityTypes();
  const create = useCommandMutation<ActivityDraft, ActivityDto>("crm.activity.create");
  const [draft, setDraft] = useState<FormValues | null>(null);
  const values: FormValues | null =
    draft ?? (types.data ? newValues(types.data, api.me, defaultTypeKey) : null);

  async function submit() {
    if (!values || !types.data || create.isPending) return;
    try {
      const a = await create.mutateAsync(toDraft(values, types.data, target));
      successToast("Aktivita je naplánovaná.");
      setDraft(null);
      onCreated?.(a.id);
    } catch (e) {
      errorToast((e as Error).message);
    }
  }

  if (types.isError)
    return <p className="text-sm text-danger">Typy aktivit se nepodařilo načíst.</p>;
  if (!values || !types.data) return <Skeleton className="h-48" />;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={submitOnModEnter(() => void submit())}
    >
      <ActivityForm
        idPrefix="composer"
        values={values}
        onChange={setDraft}
        types={types.data}
        {...(autoFocus ? { autoFocus } : {})}
      />
      <div className="mt-3 flex items-center justify-between gap-2">
        <ShortcutHint verb="naplánuje" />
        <Button type="submit" variant="primary" loading={create.isPending} className="ml-auto">
          <Icon name="calendar-plus" /> Naplánovat
        </Button>
      </div>
    </form>
  );
}

/** Psací panel „Poznámka“: text a volba „Připnout nahoru“ (připnuté poznámky jsou v Dalších krocích). */
export function NoteComposer({
  target,
  onCreated,
  autoFocus,
}: {
  target: ActivityTarget;
  onCreated?: (n: NoteDto) => void;
  autoFocus?: boolean;
}) {
  const main = mainTarget(target);
  const create = useCommandMutation<
    { entityType: string; entityId: string; body: string; pinned: boolean },
    NoteDto
  >("crm.note.create");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);

  async function submit() {
    if (!main || !body.trim() || create.isPending) return;
    try {
      const n = await create.mutateAsync({
        entityType: main.type,
        entityId: main.id,
        body: body.trim(),
        pinned,
      });
      setBody("");
      setPinned(false);
      successToast("Poznámka je uložená.");
      onCreated?.(n);
    } catch (e) {
      errorToast((e as Error).message);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={submitOnModEnter(() => void submit())}
    >
      <Textarea
        aria-label="Poznámka"
        rows={4}
        maxLength={10_000}
        placeholder="Napište poznámku…"
        value={body}
        autoFocus={autoFocus ?? false}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-base">
          <Checkbox checked={pinned} onCheckedChange={(c) => setPinned(c === true)} />
          Připnout nahoru
        </label>
        <div className="ml-auto flex items-center gap-3">
          <ShortcutHint verb="uloží" />
          <Button
            type="submit"
            variant="primary"
            loading={create.isPending}
            disabled={!body.trim()}
          >
            Uložit poznámku
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Psací panel „Hovor“: zaloguje proběhlý hovor (rovnou hotová aktivita) a nabídne naplánování dalšího kroku. */
export function CallLogger({ target, autoFocus }: { target: ActivityTarget; autoFocus?: boolean }) {
  const create = useCommandMutation<ActivityDraft, ActivityDto>("crm.activity.create");
  const [subject, setSubject] = useState("");
  const [outcome, setOutcome] = useState("");
  const [next, setNext] = useState<ActivityDto | null>(null);

  async function submit() {
    if (create.isPending) return;
    try {
      const a = await create.mutateAsync({
        typeKey: "call",
        subject: subject.trim() || "Hovor",
        done: true,
        outcome: outcome.trim() || null,
        ...(target.jobId ? { jobId: target.jobId } : {}),
        ...(target.companyId ? { companyId: target.companyId } : {}),
        ...(target.personId ? { personId: target.personId } : {}),
      });
      setSubject("");
      setOutcome("");
      successToast("Hovor je zalogovaný.");
      setNext(a);
    } catch (e) {
      errorToast((e as Error).message);
    }
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={submitOnModEnter(() => void submit())}
      >
        <Field label="S kým a o čem" htmlFor="call-subject">
          <Input
            id="call-subject"
            value={subject}
            maxLength={200}
            autoFocus={autoFocus ?? false}
            placeholder="Např. Hovor s investorem"
            onChange={(e) => setSubject(e.target.value)}
          />
        </Field>
        <Field label="Poznámky z hovoru" htmlFor="call-outcome">
          <Textarea
            id="call-outcome"
            rows={3}
            maxLength={2000}
            placeholder="Na čem jste se domluvili?"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          />
        </Field>
        <div className="flex items-center justify-between gap-2">
          <ShortcutHint verb="zaloguje" />
          <Button type="submit" variant="primary" loading={create.isPending} className="ml-auto">
            <Icon name="phone" /> Zalogovat hovor
          </Button>
        </div>
      </form>
      {next && (
        <NextActivityDialog
          mode="followUp"
          previous={next}
          suggestion={suggestionFromActivity(next)}
          onClose={() => setNext(null)}
        />
      )}
    </>
  );
}

/**
 * Pravá pracovní plocha detailu zakázky, firmy nebo osoby: psací panel (Aktivita / Poznámka / Hovor), „Další kroky“
 * a časová osa s filtry. U firmy a osoby (`aggregate`) sbírá dění ze všech jejích zakázek a osob.
 */
export function WorkPanel({ aggregate, ...target }: ActivityTarget & { aggregate?: boolean }) {
  const [tab, setTab] = useState("activity");
  const trigger = "gap-1.5 px-3";
  return (
    <div className="space-y-3">
      <Card aria-label="Nový záznam" data-testid="work-composer">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="rounded-t-[inherit] border-line bg-subtle px-2">
            <TabsTrigger value="activity" className={trigger}>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="calendar-clock" className="size-4" /> Aktivita
              </span>
            </TabsTrigger>
            <TabsTrigger value="note" className={trigger}>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="message-square" className="size-4" /> Poznámka
              </span>
            </TabsTrigger>
            <TabsTrigger value="call" className={trigger}>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="phone" className="size-4" /> Hovor
              </span>
            </TabsTrigger>
          </TabsList>
          <div className="p-4">
            <TabsContent value="activity" forceMount className="data-[state=inactive]:hidden">
              <ActivityComposer {...target} />
            </TabsContent>
            <TabsContent value="note" forceMount className="data-[state=inactive]:hidden">
              <NoteComposer target={target} />
            </TabsContent>
            <TabsContent value="call" forceMount className="data-[state=inactive]:hidden">
              <CallLogger target={target} />
            </TabsContent>
          </div>
        </Tabs>
      </Card>
      <UpcomingSteps {...target} {...(aggregate ? { aggregate } : {})} />
      <Timeline {...target} {...(aggregate ? { aggregate } : {})} />
    </div>
  );
}
