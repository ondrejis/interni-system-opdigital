"use client";

import { formatInstant } from "@rebar/core/time";
import type { RecordRow } from "@rebar/core/shared";
import {
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogContent,
  Field,
  Input,
  Notice,
  SegmentedControl,
  Skeleton,
  Textarea,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useNav,
  type BulkAction,
  type RecordAction,
} from "@rebar/ui";
import { BellRing, Mail, Paperclip, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

type Kind = "invoice" | "reminder";

type Prepared = {
  number: string | null;
  kind: Kind;
  to: string;
  toSource: string | null;
  cc: string[];
  myEmail: string | null;
  subject: string;
  body: string;
  attachmentName: string;
  smtpConfigured: boolean;
  settingsUrl: string;
  blocker: string | null;
  lastReminderAt: string | null;
  sentCount: number;
};

type Dispatch = {
  id: string;
  kind: Kind;
  to: string;
  cc: string[];
  subject: string;
  status: "queued" | "sent" | "failed";
  error: string | null;
  sentBy: string | null;
  createdAt: string;
  sentAt: string | null;
};

const when = (iso: string) => formatInstant(iso, { year: true });

const parseList = (v: string) =>
  v
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Odkaz do Nastavení (SMTP) bez plného znovunačtení stránky. */
function SettingsLink({ href }: { href: string }) {
  const nav = useNav();
  return (
    <a
      href={href}
      className="font-medium underline underline-offset-2"
      onClick={(e) => {
        e.preventDefault();
        nav.push(href);
      }}
    >
      Nastavení → E-maily
    </a>
  );
}

function SmtpNotice({ href }: { href: string }) {
  return (
    <Notice tone="warning" title="Odesílání e-mailů není nastavené">
      Správce ho zapne v <SettingsLink href={href} /> (SMTP server). Bez toho se e-mail neodešle.
    </Notice>
  );
}

/* ---------- dialog: odeslat doklad / upomínku ---------- */

export function SendMailForm({
  id,
  kind,
  retryOf,
  close,
  refresh,
}: {
  id: string;
  kind: Kind;
  retryOf?: string;
  close: () => void;
  refresh: () => void;
}) {
  const q = useCommandQuery<Prepared>("fakturace.mail.prepare", {
    invoiceId: id,
    kind,
    ...(retryOf ? { retryOf } : {}),
  });
  const p = q.data;
  const [f, setF] = useState<{
    to: string;
    cc: string;
    copyToMe: boolean;
    subject: string;
    body: string;
  } | null>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  useEffect(() => {
    if (p && !f)
      setF({ to: p.to, cc: p.cc.join(", "), copyToMe: false, subject: p.subject, body: p.body });
  }, [p, f]);
  const send = useCommandMutation<Record<string, unknown>>("fakturace.mail.send", {
    onSuccess: () => {
      successToast(
        kind === "reminder"
          ? "Upomínka je zařazená k odeslání."
          : "E-mail s dokladem je zařazený k odeslání.",
      );
      refresh();
      close();
    },
  });
  if (q.isError)
    return (
      <div className="px-5 py-4">
        <Notice tone="error">{(q.error as Error).message}</Notice>
      </div>
    );
  if (!p || !f) return <Skeleton className="m-5 h-48" />;

  const ccList = [...parseList(f.cc), ...(f.copyToMe && p.myEmail ? [p.myEmail] : [])];
  const canSend =
    p.smtpConfigured && !p.blocker && f.to.trim() && f.subject.trim() && f.body.trim();

  return (
    <form
      className="space-y-3 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate({
          invoiceId: id,
          kind,
          to: f.to.trim(),
          cc: ccList,
          subject: f.subject,
          body: f.body,
        });
      }}
    >
      {p.blocker && <Notice tone="error">{p.blocker}</Notice>}
      {!p.smtpConfigured && <SmtpNotice href={p.settingsUrl} />}
      {kind === "reminder" && p.lastReminderAt && (
        <Notice tone="info">
          Poslední upomínka odešla {when(p.lastReminderAt)}. Počet upomínek se eviduje u faktury.
        </Notice>
      )}
      {kind === "invoice" && p.sentCount > 0 && (
        <Notice tone="info">
          Tento doklad už byl odeslán ({p.sentCount}×). Odesláním vznikne další záznam v evidenci.
        </Notice>
      )}
      <div className="grid gap-x-3 sm:grid-cols-[3fr_2fr]">
        <Field
          label="Komu"
          htmlFor="mail-to"
          {...(p.toSource ? { hint: `Předvyplněno: ${p.toSource}.` } : {})}
        >
          <Input
            id="mail-to"
            type="email"
            autoComplete="off"
            value={f.to}
            onChange={(e) => setF({ ...f, to: e.target.value })}
            placeholder="adresa@firma.cz"
          />
        </Field>
        <Field label="Kopie (oddělte čárkou)" htmlFor="mail-cc">
          <Input
            id="mail-cc"
            value={f.cc}
            onChange={(e) => setF({ ...f, cc: e.target.value })}
            placeholder="nepovinné"
          />
        </Field>
      </div>
      {p.myEmail && (
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={f.copyToMe} onCheckedChange={(v) => setF({ ...f, copyToMe: !!v })} />{" "}
          Poslat kopii mně ({p.myEmail})
        </label>
      )}
      <Field label="Předmět" htmlFor="mail-subject">
        <Input
          id="mail-subject"
          value={f.subject}
          onChange={(e) => setF({ ...f, subject: e.target.value })}
        />
      </Field>
      <SegmentedControl
        label="Text e-mailu"
        value={tab}
        onChange={setTab}
        options={[
          { value: "edit", label: "Upravit text" },
          { value: "preview", label: "Náhled" },
        ]}
      />
      {tab === "edit" ? (
        <Textarea
          aria-label="Text e-mailu"
          className="min-h-40"
          value={f.body}
          onChange={(e) => setF({ ...f, body: e.target.value })}
        />
      ) : (
        <div className="space-y-2 rounded-lg border border-line p-3" data-testid="mail-preview">
          <dl className="space-y-0.5 text-sm text-muted">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0">Komu</dt>
              <dd className="min-w-0 break-words text-fg">{f.to || "—"}</dd>
            </div>
            {ccList.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-16 shrink-0">Kopie</dt>
                <dd className="min-w-0 break-words text-fg">{ccList.join(", ")}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="w-16 shrink-0">Předmět</dt>
              <dd className="min-w-0 break-words font-medium text-fg">{f.subject}</dd>
            </div>
          </dl>
          <hr className="border-line" />
          <p className="whitespace-pre-wrap break-words">{f.body}</p>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <Paperclip className="size-3.5" aria-hidden /> Příloha: {p.attachmentName} (PDF dokladu)
      </p>
      {send.error && (
        <p role="alert" className="text-sm text-danger">
          {send.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Zrušit
        </Button>
        <Button type="submit" variant="primary" loading={send.isPending} disabled={!canSend}>
          {kind === "reminder" ? "Odeslat upomínku" : "Odeslat e-mail"}
        </Button>
      </div>
    </form>
  );
}

const canSendRow = (row: RecordRow) => row.state !== "draft";
const canRemindRow = (row: RecordRow) =>
  (row.state === "issued" || row.state === "partial") &&
  row.kind !== "credit_note" &&
  row.overdue === true;

export const sendMailAction: RecordAction = {
  id: "send-email",
  label: "Odeslat e-mailem",
  permission: "fakturace.write",
  visible: canSendRow,
  dialog: {
    title: "Odeslat doklad e-mailem",
    render: ({ id, close, refresh }) => (
      <SendMailForm id={id} kind="invoice" close={close} refresh={refresh} />
    ),
  },
};

export const reminderAction: RecordAction = {
  id: "send-reminder",
  label: "Poslat upomínku",
  permission: "fakturace.write",
  visible: canRemindRow,
  dialog: {
    title: "Poslat upomínku po splatnosti",
    render: ({ id, close, refresh }) => (
      <SendMailForm id={id} kind="reminder" close={close} refresh={refresh} />
    ),
  },
};

/* ---------- záložka Odeslání (evidence) ---------- */

const STATUS = {
  sent: { color: "green", label: "Odesláno" },
  queued: { color: "blue", label: "Ve frontě" },
  failed: { color: "red", label: "Selhalo" },
} as const;

export function DispatchTab({ id, row }: { id: string; row: RecordRow }) {
  const q = useCommandQuery<Dispatch[]>(
    "fakturace.mail.list",
    { invoiceId: id },
    { refetchInterval: 10_000 },
  );
  const [open, setOpen] = useState<{ kind: Kind; retryOf?: string } | null>(null);
  if (q.isLoading || !q.data) return <Skeleton className="h-24" />;
  const list = q.data;
  const chrono = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const reminderNo = new Map(
    chrono.filter((d) => d.kind === "reminder").map((d, i) => [d.id, i + 1]),
  );
  const sentReminders = list.filter((d) => d.kind === "reminder" && d.status === "sent").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {canSendRow(row) && (
          <Button variant="secondary" onClick={() => setOpen({ kind: "invoice" })}>
            <Mail /> Odeslat e-mailem
          </Button>
        )}
        {canRemindRow(row) && (
          <Button variant="secondary" onClick={() => setOpen({ kind: "reminder" })}>
            <BellRing /> Poslat upomínku
          </Button>
        )}
        <span className="text-sm text-muted">Odeslaných upomínek: {sentReminders}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-muted">Doklad zatím nebyl odeslán e-mailem.</p>
      ) : (
        <ul
          className="divide-y divide-line rounded-lg border border-line"
          data-testid="dispatch-list"
        >
          {list.map((d) => {
            const st = STATUS[d.status];
            return (
              <li key={d.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2">
                <span className="mt-0.5 text-muted">
                  {d.kind === "reminder" ? (
                    <BellRing className="size-4" aria-hidden />
                  ) : (
                    <Mail className="size-4" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1 basis-60">
                  <p className="font-medium">
                    {d.kind === "reminder"
                      ? `Upomínka č. ${reminderNo.get(d.id)}`
                      : "E-mail s dokladem"}
                    <span className="font-normal text-muted"> · {d.to}</span>
                  </p>
                  {d.cc.length > 0 && (
                    <p className="text-sm text-muted">Kopie: {d.cc.join(", ")}</p>
                  )}
                  <p className="break-words text-sm text-muted">{d.subject}</p>
                  <p className="text-sm text-faint">
                    {when(d.createdAt)}
                    {d.sentBy ? ` · ${d.sentBy}` : ""}
                    {d.sentAt ? ` · doručeno serveru ${when(d.sentAt)}` : ""}
                  </p>
                  {d.error && (
                    <p className="mt-0.5 break-words text-sm text-danger">
                      {d.status === "queued" ? "Zkouším znovu, poslední chyba: " : "Důvod: "}
                      {d.error}
                    </p>
                  )}
                </div>
                <Chip color={st.color} dot>
                  {st.label}
                </Chip>
                {d.status !== "queued" && canSendRow(row) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpen({ kind: d.kind, retryOf: d.id })}
                  >
                    <RotateCcw /> Odeslat znovu
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <DispatchDialog
        id={id}
        open={open}
        onClose={() => setOpen(null)}
        onDone={() => void q.refetch()}
      />
    </div>
  );
}

function DispatchDialog({
  id,
  open,
  onClose,
  onDone,
}: {
  id: string;
  open: { kind: Kind; retryOf?: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={!!open} onOpenChange={(o) => !o && onClose()}>
      {open && (
        <DialogContent
          title={
            open.kind === "reminder" ? "Poslat upomínku po splatnosti" : "Odeslat doklad e-mailem"
          }
        >
          <SendMailForm
            key={`${open.kind}-${open.retryOf ?? ""}`}
            id={id}
            kind={open.kind}
            {...(open.retryOf ? { retryOf: open.retryOf } : {})}
            close={onClose}
            refresh={onDone}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

/* ---------- hromadné odeslání ze seznamu ---------- */

type Preview = {
  smtpConfigured: boolean;
  settingsUrl: string;
  items: { invoiceId: string; number: string | null; to: string; blocker: string | null }[];
};
type BulkResult = {
  invoiceId: string;
  number: string | null;
  ok: boolean;
  to: string | null;
  error: string | null;
};

/** Nejvíc dokladů najednou (stejný strop hlídá server). */
const MAX_BULK = 50;

function BulkSend({
  ids,
  kind,
  close,
  refresh,
}: {
  ids: string[];
  kind: Kind;
  close: () => void;
  refresh: () => void;
}) {
  const tooMany = ids.length > MAX_BULK;
  const q = useCommandQuery<Preview>(
    "fakturace.mail.bulkPreview",
    { invoiceIds: ids, kind },
    { enabled: !tooMany },
  );
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const run = useCommandMutation<{ invoiceIds: string[]; kind: Kind }, BulkResult[]>(
    "fakturace.mail.bulk",
    {
      onSuccess: (r) => {
        setResults(r);
        refresh();
      },
    },
  );
  if (tooMany)
    return (
      <div className="space-y-3 px-5 py-4" data-testid="bulk-too-many">
        <Notice tone="warning">
          Najednou jde odeslat nejvýš {MAX_BULK} dokladů, vybráno je {ids.length}. Zúžte výběr
          (filtrem, hledáním nebo zaškrtnutím jen některých řádků) a zkuste to znovu.
        </Notice>
        <div className="flex justify-end">
          <Button variant="primary" onClick={close}>
            Zavřít
          </Button>
        </div>
      </div>
    );
  if (q.isError)
    return (
      <div className="px-5 py-4">
        <Notice tone="error">{(q.error as Error).message}</Notice>
      </div>
    );
  if (!q.data) return <Skeleton className="m-5 h-40" />;
  const p = q.data;
  const ready = p.items.filter((i) => !i.blocker);
  const skipped = p.items.length - ready.length;
  const label = kind === "reminder" ? "upomínek" : "e-mailů";

  if (results) {
    const ok = results.filter((r) => r.ok).length;
    return (
      <div className="space-y-3 px-5 py-4" data-testid="bulk-results">
        <Notice tone={ok === results.length ? "success" : ok ? "warning" : "error"}>
          Zařazeno k odeslání: {ok} z {results.length}. Stav doručení uvidíte u každé faktury na
          záložce Odeslání.
        </Notice>
        <ul className="max-h-64 divide-y divide-line overflow-auto rounded-lg border border-line">
          {results.map((r) => (
            <li key={r.invoiceId} className="flex items-start gap-3 px-3 py-2">
              <Chip color={r.ok ? "green" : "red"} dot>
                {r.ok ? "Zařazeno" : "Přeskočeno"}
              </Chip>
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{r.number ?? "Doklad"}</span>
                {r.to && <span className="text-muted"> · {r.to}</span>}
                {r.error && <span className="block break-words text-danger">{r.error}</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button variant="primary" onClick={close}>
            Zavřít
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-5 py-4">
      {!p.smtpConfigured && <SmtpNotice href={p.settingsUrl} />}
      <p className="text-muted">
        Odešle se {ready.length} z {p.items.length} vybraných dokladů, vždy s PDF a textem ze
        šablony (upravíte ji v Nastavení fakturace).
        {skipped > 0 && ` Přeskočí se ${skipped} (důvod je u každého dokladu).`}
      </p>
      <ul
        className="max-h-64 divide-y divide-line overflow-auto rounded-lg border border-line"
        data-testid="bulk-preview"
      >
        {p.items.map((i) => (
          <li key={i.invoiceId} className="flex items-start gap-3 px-3 py-2 text-sm">
            <Chip color={i.blocker ? "gray" : "green"} dot>
              {i.blocker ? "Přeskočí se" : "Odešle se"}
            </Chip>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{i.number ?? "Doklad"}</span>
              {i.to && <span className="text-muted"> · {i.to}</span>}
              {i.blocker && <span className="block break-words text-muted">{i.blocker}</span>}
            </span>
          </li>
        ))}
      </ul>
      {run.error && (
        <p role="alert" className="text-sm text-danger">
          {run.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Zrušit
        </Button>
        <Button
          variant="primary"
          loading={run.isPending}
          disabled={!p.smtpConfigured || ready.length === 0}
          onClick={() => run.mutate({ invoiceIds: ready.map((i) => i.invoiceId), kind })}
        >
          Odeslat {ready.length} {label}
        </Button>
      </div>
    </div>
  );
}

export const bulkActions: Record<string, readonly BulkAction[]> = {
  invoice: [
    {
      id: "send-email",
      label: "Odeslat e-mailem",
      permission: "fakturace.write",
      dialog: {
        title: "Odeslat vybrané doklady e-mailem",
        render: (p) => <BulkSend {...p} kind="invoice" />,
      },
    },
    {
      id: "send-reminder",
      label: "Poslat upomínky",
      permission: "fakturace.write",
      dialog: {
        title: "Poslat upomínky k vybraným dokladům",
        description: "Upomínka se pošle jen u neuhrazených dokladů po splatnosti.",
        render: (p) => <BulkSend {...p} kind="reminder" />,
      },
    },
  ],
};
