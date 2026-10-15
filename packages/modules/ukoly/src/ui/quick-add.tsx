"use client";

/*
  Rychlé přidání (UKO-05): jeden řádek, z něj parser pozná typ, datum, čas, délku a prioritu a hned ukáže, co rozpoznal.
  Úkol se uloží až po potvrzení (Enter nebo „Přidat“); rozpoznané jde v náhledu opravit. Na telefonu je to obyčejné
  textové pole, takže jde diktovat tlačítkem na klávesnici.
*/
import { formatDate } from "@rebar/core/shared";
import {
  Button,
  DatePicker,
  Icon,
  IconButton,
  Input,
  cn,
  errorToast,
  successToast,
} from "@rebar/ui";
import { useMemo, useState, type Ref } from "react";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from "../tasks/constants";
import { formatDuration } from "../tasks/logic/due";
import { parseQuickTask } from "../tasks/logic/quick-parse";
import type { ActivityLinks } from "./activity-form";
import { effectiveQuick, quickOverridePayload, type QuickOverride } from "./logic";
import {
  TypeBadge,
  messageOf,
  selectClass,
  typeOf,
  useCanPrivate,
  useTaskActions,
  useTaskTypes,
} from "./shared";

/** Rychlé přidání s živým náhledem rozpoznaného. `links` předá vazby (karta klienta, obchodu, zakázky, kontaktu). */
export function QuickAdd({
  links,
  inputRef,
  autoFocus,
  onAdded,
  placeholder = "Přidat úkol… např. „zavolat Novákovi zítra 10:00“",
}: {
  links?: ActivityLinks;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  onAdded?: () => void;
  placeholder?: string;
}) {
  const types = useTaskTypes();
  const actions = useTaskActions();
  const canPrivate = useCanPrivate();
  const [text, setText] = useState("");
  const [override, setOverride] = useState<QuickOverride>({});
  const [isPrivate, setPrivate] = useState(false);

  const parse = useMemo(
    () =>
      text.trim()
        ? parseQuickTask(
            text,
            new Date(),
            (types.data ?? undefined)?.map((t) => ({ key: t.key, name: t.name })),
          )
        : null,
    [text, types.data],
  );
  const eff = parse ? effectiveQuick(parse, override) : null;
  const type = eff ? typeOf(types.data, eff.typeKey) : undefined;
  const needsTitle = !!parse && !parse.title.trim();

  async function submit() {
    if (!parse || needsTitle || actions.quickAdd.isPending) return;
    const payload = quickOverridePayload(parse, override);
    try {
      const r = await actions.quickAdd.mutateAsync({
        text: text.trim(),
        ...(Object.keys(payload).length ? { override: payload } : {}),
        ...(isPrivate ? { isPrivate: true } : {}),
        ...(links?.dealId ? { dealId: links.dealId } : {}),
        ...(links?.companyId ? { companyId: links.companyId } : {}),
        ...(links?.personId ? { personId: links.personId } : {}),
        ...(links?.jobId ? { jobId: links.jobId } : {}),
        ...(links?.jobPhaseId ? { jobPhaseId: links.jobPhaseId } : {}),
      });
      successToast(`Přidáno: ${r?.task?.title ?? parse.title}`);
      setText("");
      setOverride({});
      onAdded?.();
    } catch (e) {
      errorToast(messageOf(e));
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-2"
      data-testid="quick-add"
    >
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Icon
            name="plus"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
          />
          <Input
            ref={inputRef}
            id="quick-add-input"
            aria-label="Rychlé přidání úkolu"
            data-testid="quick-add-input"
            className="h-10 pl-8 text-base pointer-coarse:h-12"
            placeholder={placeholder}
            value={text}
            maxLength={1000}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="send"
            lang="cs"
            autoFocus={autoFocus ?? false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setText("");
                setOverride({});
              }
            }}
          />
        </div>
        {canPrivate && (
          <IconButton
            label={isPrivate ? "Soukromý úkol (jen vy)" : "Sdílený úkol (vidí i Patrik)"}
            aria-pressed={isPrivate}
            variant={isPrivate ? "secondary" : "ghost"}
            size="lg"
            onClick={() => setPrivate((p) => !p)}
          >
            <Icon name={isPrivate ? "lock" : "eye"} />
          </IconButton>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="pointer-coarse:h-12"
          disabled={!parse || needsTitle}
          loading={actions.quickAdd.isPending}
        >
          Přidat
        </Button>
      </div>

      {parse && eff && (
        <div
          className="rounded-lg border border-line bg-subtle p-3"
          data-testid="quick-preview"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex items-center gap-1.5">
              <TypeBadge icon={type?.icon} color={type?.color} />
              <select
                aria-label="Typ"
                data-testid="quick-type"
                className={cn(selectClass, "!w-auto min-w-24")}
                value={eff.typeKey}
                onChange={(e) => setOverride((o) => ({ ...o, typeKey: e.target.value }))}
              >
                {(types.data ?? []).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </select>
            </span>
            <DatePicker
              value={eff.dueDate}
              onChange={(d) => setOverride((o) => ({ ...o, dueDate: d }))}
              placeholder="Bez termínu"
              className="!h-8 !w-auto min-w-36"
            />
            <Input
              type="time"
              step={300}
              aria-label="Čas"
              data-testid="quick-time"
              className="w-28"
              disabled={!eff.dueDate}
              value={eff.dueTime ?? ""}
              onChange={(e) => setOverride((o) => ({ ...o, dueTime: e.target.value || null }))}
            />
            <select
              aria-label="Priorita"
              className={cn(selectClass, "!w-auto")}
              value={eff.priority}
              onChange={(e) =>
                setOverride((o) => ({ ...o, priority: e.target.value as TaskPriority }))
              }
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p === "none" ? "Bez priority" : TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-sm text-muted" data-testid="quick-summary">
            {needsTitle ? (
              <span className="text-danger">Doplňte, co se má udělat.</span>
            ) : (
              <>
                <span className="font-medium text-fg">{parse.title}</span>
                {" · "}
                {type?.name ?? "Úkol"}
                {eff.dueDate ? ` · ${formatDate(eff.dueDate)}` : " · bez termínu"}
                {eff.dueTime ? ` ${eff.dueTime}` : ""}
                {eff.durationMin ? ` · ${formatDuration(eff.durationMin)}` : ""}
              </>
            )}
          </p>
          {parse.recognized.length > 0 && (
            <p className="mt-1 text-sm text-faint">
              Rozpoznáno: {parse.recognized.map((t) => t.label).join(" · ")}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
