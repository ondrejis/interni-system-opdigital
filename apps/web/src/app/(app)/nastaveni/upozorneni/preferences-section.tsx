"use client";

import {
  Button,
  Checkbox,
  Chip,
  FormSection,
  Notice,
  SegmentedControl,
  TextField,
  cn,
} from "@rebar/ui";
import { Clock, ListChecks } from "lucide-react";
import { useMemo, useState } from "react";
import { runAction } from "@/lib/run-action";
import { saveMyNotificationPrefs } from "@/server/notification-actions";

type PushMode = "instant" | "digest" | "off";
type EventView = {
  key: string;
  label: string;
  description: string;
  group: string;
  severity: "normal" | "urgent";
  scheduled: boolean;
  mandatory: boolean;
  defaults: { push: PushMode; bell: boolean; email: boolean };
  pref: { push?: PushMode; bell?: boolean; email?: boolean };
};
export type Prefs = {
  events: EventView[];
  quiet: { enabled: boolean; start: string; end: string };
  quietCustom: boolean;
  clientQuiet: { enabled: boolean; start: string; end: string };
  digestTimes: string[];
  digestCustom: boolean;
  clientDigestTimes: string[];
  timezone: string;
};

const PUSH_OPTIONS = [
  { value: "instant", label: "Ihned" },
  { value: "digest", label: "Shrnutí" },
  { value: "off", label: "Ne" },
] as const;

/** Co chci dostávat: událost × kanál, tiché hodiny a časy shrnutí. */
export function PreferencesSection({ initial }: { initial: Prefs }) {
  const [events, setEvents] = useState(() =>
    Object.fromEntries(initial.events.map((e) => [e.key, e.pref])),
  );
  const [quiet, setQuiet] = useState(initial.quiet);
  const [digest, setDigest] = useState<[string, string]>([
    initial.digestTimes[0] ?? "07:00",
    initial.digestTimes[1] ?? "",
  ]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, EventView[]>();
    for (const e of initial.events) map.set(e.group, [...(map.get(e.group) ?? []), e]);
    return [...map];
  }, [initial.events]);

  const patch = (key: string, p: EventView["pref"]) => {
    setEvents((cur) => ({ ...cur, [key]: { ...cur[key], ...p } }));
    setDirty(true);
  };

  const digestTimes = [digest[0], digest[1]].filter((t) => t);
  const sameTimes = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((t, i) => t === b[i]);

  async function save() {
    setSaving(true);
    const clean = Object.fromEntries(
      Object.entries(events).filter(([, p]) => p && Object.keys(p).length),
    );
    const quietChanged =
      quiet.enabled !== initial.clientQuiet.enabled ||
      quiet.start !== initial.clientQuiet.start ||
      quiet.end !== initial.clientQuiet.end;
    const r = await runAction(
      saveMyNotificationPrefs({
        events: clean,
        ...(quietChanged ? { quiet } : {}),
        ...(digestTimes.length && !sameTimes(digestTimes, initial.clientDigestTimes)
          ? { digestTimes }
          : {}),
      }),
      "Předvolby upozornění jsou uložené.",
    );
    setSaving(false);
    if (r) setDirty(false);
  }

  const hasDigest = initial.events.some((e) => !e.mandatory && e.severity !== "urgent");

  return (
    <div className="space-y-6">
      <FormSection
        title="Co chci dostávat"
        icon={<ListChecks />}
        description="U každé události zvolte, jestli vám má přijít do telefonu hned, ve shrnutí, nebo vůbec, a zda se má ukázat ve zvonečku. Naléhavé události a ty, které správce označil jako povinné, nejdou vypnout."
        flush
        footer={
          <>
            {dirty && <span className="mr-auto text-sm text-muted">Neuložené změny</span>}
            <Button
              variant="primary"
              loading={saving}
              disabled={!dirty}
              onClick={() => void save()}
            >
              Uložit předvolby
            </Button>
          </>
        }
      >
        <div data-testid="prefs-matrix">
          {groups.map(([group, list]) => (
            <div key={group} className="border-t border-line first:border-t-0">
              <h4 className="bg-subtle px-5 py-2 text-sm font-semibold uppercase tracking-wide text-muted">
                {group}
              </h4>
              <ul className="divide-y divide-line">
                {list.map((e) => {
                  const cur = { ...e.defaults, ...events[e.key] };
                  const locked = e.mandatory;
                  return (
                    <li
                      key={e.key}
                      className="grid gap-3 px-5 py-3 @2xl:grid-cols-[minmax(0,1fr)_auto_auto_auto] @2xl:items-center"
                      data-testid={`pref-${e.key}`}
                    >
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {e.label}
                          {e.severity === "urgent" && <Chip color="red">Naléhavé</Chip>}
                          {locked && <Chip color="blue">Povinné</Chip>}
                          {e.scheduled && <Chip>Plánované</Chip>}
                        </p>
                        <p className="text-sm text-muted">{e.description}</p>
                      </div>
                      <SegmentedControl<PushMode>
                        label={`Upozornění v telefonu: ${e.label}`}
                        options={
                          e.severity === "urgent"
                            ? PUSH_OPTIONS.filter((o) => o.value !== "digest").map((o) => ({
                                ...o,
                              }))
                            : PUSH_OPTIONS.map((o) => ({ ...o }))
                        }
                        value={
                          locked
                            ? "instant"
                            : cur.push === "digest" && e.severity === "urgent"
                              ? "instant"
                              : cur.push
                        }
                        disabled={locked}
                        onChange={(v) => patch(e.key, { push: v })}
                      />
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <Checkbox
                          checked={locked ? e.defaults.bell : cur.bell}
                          disabled={locked}
                          onCheckedChange={(v) => patch(e.key, { bell: v === true })}
                          aria-label={`Zvoneček: ${e.label}`}
                        />
                        Zvoneček
                      </label>
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <Checkbox
                          checked={locked ? e.defaults.email : cur.email}
                          disabled={locked}
                          onCheckedChange={(v) => patch(e.key, { email: v === true })}
                          aria-label={`E-mail: ${e.label}`}
                        />
                        E-mail
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!groups.length && (
            <p className="px-5 pb-5 text-muted">Pro vaši roli zatím nejsou žádná upozornění.</p>
          )}
        </div>
      </FormSection>

      <FormSection
        title="Tiché hodiny a shrnutí"
        icon={<Clock />}
        description={`Časy jsou v pásmu ${initial.timezone}. Naléhavá upozornění tiché hodiny prorazí.`}
        footer={
          <>
            {dirty && <span className="mr-auto text-sm text-muted">Neuložené změny</span>}
            <Button
              variant="primary"
              loading={saving}
              disabled={!dirty}
              onClick={() => void save()}
            >
              Uložit předvolby
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-base font-medium">
              <Checkbox
                checked={quiet.enabled}
                onCheckedChange={(v) => {
                  setQuiet({ ...quiet, enabled: v === true });
                  setDirty(true);
                }}
                aria-label="Nerušit v tichých hodinách"
                data-testid="quiet-enabled"
              />
              Nerušit v tichých hodinách
            </label>
            <div className={cn("grid max-w-md grid-cols-2 gap-3", !quiet.enabled && "opacity-50")}>
              <TextField
                label="Od"
                type="time"
                density="compact"
                value={quiet.start}
                disabled={!quiet.enabled}
                onChange={(e) => {
                  setQuiet({ ...quiet, start: e.target.value });
                  setDirty(true);
                }}
              />
              <TextField
                label="Do"
                type="time"
                density="compact"
                value={quiet.end}
                disabled={!quiet.enabled}
                onChange={(e) => {
                  setQuiet({ ...quiet, end: e.target.value });
                  setDirty(true);
                }}
              />
            </div>
            <p className="text-sm text-muted">
              Zvoneček a e-mail dostanete hned. Upozornění do telefonu se v tichých hodinách zdrží a
              pošlou se po jejich skončení (víc najednou jako jedno shrnutí).
            </p>
            {(quiet.start !== initial.clientQuiet.start ||
              quiet.end !== initial.clientQuiet.end ||
              quiet.enabled !== initial.clientQuiet.enabled) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto min-h-7 max-w-full whitespace-normal py-1 text-left"
                onClick={() => {
                  setQuiet(initial.clientQuiet);
                  setDirty(true);
                }}
              >
                Vrátit výchozí nastavení firmy (
                {initial.clientQuiet.enabled
                  ? `${initial.clientQuiet.start}–${initial.clientQuiet.end}`
                  : "vypnuto"}
                )
              </Button>
            )}
          </div>
          {hasDigest && (
            <div className="space-y-3">
              <h4 className="font-medium">Kdy posílat shrnutí</h4>
              <div className="grid max-w-md grid-cols-2 gap-3">
                <TextField
                  label="První shrnutí"
                  type="time"
                  density="compact"
                  value={digest[0]}
                  onChange={(e) => {
                    setDigest([e.target.value, digest[1]]);
                    setDirty(true);
                  }}
                />
                <TextField
                  label="Druhé (nepovinné)"
                  type="time"
                  density="compact"
                  value={digest[1]}
                  onChange={(e) => {
                    setDigest([digest[0], e.target.value]);
                    setDirty(true);
                  }}
                />
              </div>
              <p className="text-sm text-muted">
                U událostí, které máte na „Shrnutí“, vám přijde jedna zpráva v těchto časech místo
                mnoha jednotlivých.
              </p>
            </div>
          )}
          {!initial.quietCustom && !dirty && (
            <Notice tone="info">
              Platí výchozí tiché hodiny vaší firmy. Můžete si je upravit.
            </Notice>
          )}
        </div>
      </FormSection>
    </div>
  );
}
