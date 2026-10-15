"use client";

import {
  Button,
  Checkbox,
  Combobox,
  DatePicker,
  Dialog,
  DialogContent,
  Field,
  IconButton,
  Input,
  successToast,
  useCan,
  useCommandMutation,
  useEntityApi,
} from "@rebar/ui";
import { X } from "lucide-react";
import { useRef, useState } from "react";
import type { CreateMeetingInput, CreateMeetingResult } from "../contract";
import { clock, localToInstant, parseEmails } from "./lib";

/*
  Nová schůzka (KAL-05): z tažení v kalendáři (čas je předvyplněný), z tlačítka „Nová schůzka“ a na mobilu jako
  formulář. Název, čas, místo, vazba na klienta/obchod/kontakt, účastníci a „Poslat pozvánky“ (výchozí vypnuto, O-8).
*/

/** Předvyplněný čas nové schůzky (datum a minuty od půlnoci). */
export type MeetingDraft = { date: string; startMin: number; endMin: number };

type Ref = { id: string; label: string } | null;

const toTime = (min: number) => clock(min);
const fromTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

function RefPicker({
  label,
  entity,
  value,
  onChange,
}: {
  label: string;
  entity: string;
  value: Ref;
  onChange: (r: Ref) => void;
}) {
  const api = useEntityApi();
  const cache = useRef(new Map<string, string>());
  return (
    <Field label={label}>
      <Combobox
        load={async (q) => {
          const r = await api.lookups.records(entity, q);
          for (const o of r) cache.current.set(o.value, o.label);
          return r;
        }}
        value={value?.id ?? null}
        selectedLabels={value ? { [value.id]: value.label } : {}}
        onChange={(v) => {
          const id = v as string | null;
          onChange(id ? { id, label: cache.current.get(id) ?? "Vybráno" } : null);
        }}
        aria-label={label}
        placeholder="Bez vazby"
        clearable
      />
    </Field>
  );
}

function Form({
  draft,
  connected,
  onDone,
}: {
  draft: MeetingDraft;
  connected: boolean;
  onDone: () => void;
}) {
  const can = useCan();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string | null>(draft.date);
  const [start, setStart] = useState(toTime(draft.startMin));
  const [end, setEnd] = useState(toTime(draft.endMin >= 1440 ? 1439 : draft.endMin));
  const [allDay, setAllDay] = useState(false);
  const [place, setPlace] = useState("");
  const [company, setCompany] = useState<Ref>(null);
  const [deal, setDeal] = useState<Ref>(null);
  const [person, setPerson] = useState<Ref>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const [emailText, setEmailText] = useState("");
  const [invites, setInvites] = useState(false);
  const [meet, setMeet] = useState(false);
  const [priv, setPriv] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCommandMutation<CreateMeetingInput, CreateMeetingResult>(
    "kalendar.createMeeting",
    {
      onSuccess: (r) => {
        successToast(
          r.pending && connected
            ? "Schůzka je uložená, do Google Kalendáře se zapíše do minuty."
            : "Schůzka vytvořena.",
        );
        onDone();
      },
    },
  );

  function addEmails(text: string): boolean {
    const r = parseEmails(text);
    if (r.invalid.length) {
      setError(`Neplatný e-mail: ${r.invalid.join(", ")}`);
      return false;
    }
    setError(null);
    setEmails((cur) => [...new Set([...cur, ...r.valid])]);
    setEmailText("");
    return true;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Vyplňte název schůzky.");
    if (!date) return setError("Vyplňte datum.");
    let all = emails;
    if (emailText.trim()) {
      const r = parseEmails(emailText);
      if (r.invalid.length) return setError(`Neplatný e-mail: ${r.invalid.join(", ")}`);
      all = [...new Set([...emails, ...r.valid])];
    }
    const s = allDay ? 0 : fromTime(start);
    const en = allDay ? 1440 : fromTime(end);
    if (!allDay && en <= s) return setError("Konec musí být po začátku.");
    setError(null);
    create.mutate({
      title: title.trim(),
      startsAt: localToInstant(date, s),
      endsAt: localToInstant(date, en),
      allDay,
      place: place.trim() || null,
      ...(all.length ? { attendeeEmails: all } : {}),
      sendInvites: invites && all.length > 0,
      addMeet: connected && meet,
      dealId: deal?.id ?? null,
      companyId: company?.id ?? null,
      personId: person?.id ?? null,
      isPrivate: priv,
    });
  }

  const pick = (label: string, entity: string, value: Ref, set: (r: Ref) => void) => (
    <RefPicker label={label} entity={entity} value={value} onChange={set} />
  );

  return (
    <form className="space-y-3 px-5 py-4" onSubmit={submit} data-testid="meeting-form">
      <Field label="Název" htmlFor="mt-title">
        <Input id="mt-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem_6.5rem] items-end gap-x-3">
        <Field label="Datum">
          <DatePicker value={date} onChange={setDate} clearable={false} />
        </Field>
        <Field label="Od" htmlFor="mt-start">
          <Input
            id="mt-start"
            type="time"
            step={900}
            disabled={allDay}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Do" htmlFor="mt-end">
          <Input
            id="mt-end"
            type="time"
            step={900}
            disabled={allDay}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox checked={allDay} onCheckedChange={(v) => setAllDay(!!v)} /> Celý den
      </label>
      <Field label="Místo" htmlFor="mt-place">
        <Input id="mt-place" value={place} onChange={(e) => setPlace(e.target.value)} />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-3">
        {pick("Klient", "company", company, setCompany)}
        {pick("Obchod", "deal", deal, setDeal)}
        {pick("Kontakt", "person", person, setPerson)}
      </div>
      <Field label="Účastníci (e-maily)" hint="Čárkou nebo mezerou oddělené e-maily, Enter přidá.">
        <div className="space-y-1.5">
          {emails.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Přidaní účastníci">
              {emails.map((m) => (
                <li
                  key={m}
                  className="flex items-center gap-1 rounded-full border border-line-strong py-0.5 pl-2.5 pr-1 text-sm"
                >
                  {m}
                  <IconButton
                    label={`Odebrat ${m}`}
                    size="sm"
                    className="size-5 w-5"
                    onClick={() => setEmails(emails.filter((x) => x !== m))}
                  >
                    <X />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <Input
            aria-label="Přidat účastníka"
            type="email"
            inputMode="email"
            placeholder="jmeno@firma.cz"
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                if (emailText.trim()) addEmails(emailText);
              }
            }}
            onBlur={() => emailText.trim() && addEmails(emailText)}
          />
        </div>
      </Field>
      <div className="space-y-2 rounded-lg border border-line bg-subtle p-3">
        <label className="flex cursor-pointer items-start gap-2">
          <Checkbox
            className="mt-0.5"
            checked={invites}
            onCheckedChange={(v) => setInvites(!!v)}
            aria-label="Poslat pozvánky"
          />
          <span>
            <span className="font-medium">Poslat pozvánky</span>
            <span className="block text-sm text-muted">
              Vypnuto: účastníci se do Google Kalendáře nezapíšou a nikomu nic nedorazí.
            </span>
          </span>
        </label>
        {connected && (
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={meet}
              onCheckedChange={(v) => setMeet(!!v)}
              aria-label="Přidat Google Meet"
            />{" "}
            Přidat Google Meet
          </label>
        )}
        {can("private.read") && (
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={priv}
              onCheckedChange={(v) => setPriv(!!v)}
              aria-label="Soukromá schůzka"
            />{" "}
            Soukromá schůzka
            <span className="text-sm text-muted">(druhý uvidí jen „Obsazeno“)</span>
          </label>
        )}
      </div>
      {!connected && (
        <p className="text-sm text-muted">
          Google Kalendář není připojený: schůzka se uloží jen v OPSYS (mezi úkoly). Po připojení se
          zapíše i do Googlu.
        </p>
      )}
      {(error || create.error) && (
        <p role="alert" className="text-sm text-danger">
          {error ?? create.error?.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Zrušit
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          Vytvořit schůzku
        </Button>
      </div>
    </form>
  );
}

/** Dialog „Nová schůzka“; `draft === null` je zavřený. */
export function MeetingDialog({
  draft,
  connected,
  onClose,
}: {
  draft: MeetingDraft | null;
  connected: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Nová schůzka" className="w-[min(40rem,calc(100vw-2rem))]">
        {draft && (
          <Form
            key={`${draft.date}-${draft.startMin}-${draft.endMin}`}
            draft={draft}
            connected={connected}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
