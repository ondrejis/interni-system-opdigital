"use client";

import { formatDate } from "@rebar/core/shared";
import { todayIso } from "@rebar/core/time";
import {
  Button,
  Checkbox,
  Chip,
  DatePicker,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  RelatedRecords,
  SignaturePad,
  Skeleton,
  Textarea,
  defineModuleUi,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useNav,
  type RecordTab,
} from "@rebar/ui";
import { Plus } from "lucide-react";
import { useState } from "react";
import { fromExecution, fromPreparation } from "@rebar/zakazky";
import { DiaryTab } from "./diary-tab";
import { overviewCards } from "./overview-cards";
import { ScheduleTab } from "./schedule-tab";
import { DiaryTerminalWidget, ReportTerminalWidget } from "./terminal-ui";

function Err({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="mt-2 text-sm text-danger">
      {error.message}
    </p>
  ) : null;
}

/* ---------- Předání ---------- */

type Protocol = {
  id: string;
  number: string;
  date: string;
  note: string | null;
  acceptedBy: string | null;
  status: string;
  signatureFileId: string | null;
  signedAt: string | null;
  items: { text: string; ok: boolean; note: string | null }[];
};
const DEFAULT_ITEMS = [
  "Dílo je dokončeno podle smlouvy",
  "Staveniště je uklizeno",
  "Předána dokumentace a návody",
  "Zákazník byl seznámen s užíváním",
  "Předány klíče a příslušenství",
];

function SignDialog({
  protocol,
  jobId,
  onClose,
}: {
  protocol: Protocol | null;
  jobId: string;
  onClose: () => void;
}) {
  const api = useEntityApi();
  const [png, setPng] = useState<Blob | null>(null);
  const [name, setName] = useState(protocol?.acceptedBy ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const sign = useCommandMutation<{ id: string; signatureFileId: string; acceptedBy: string }>(
    "realizace.handover.sign",
    {
      onSuccess: () => {
        successToast("Protokol je podepsaný.");
        onClose();
      },
    },
  );
  async function submit() {
    if (!protocol || !png) return;
    setBusy(true);
    setError(null);
    try {
      const file = new File([png], `podpis-${protocol.number}.png`, { type: "image/png" });
      const up = await api.uploadFile("job", jobId, file, { kind: "signature" });
      await sign.mutateAsync({ id: protocol.id, signatureFileId: up.id, acceptedBy: name });
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!protocol} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Podpis protokolu ${protocol?.number ?? ""}`}
        description="Zákazník se podepíše prstem nebo myší. Podepsaný protokol už nejde měnit."
      >
        <div className="space-y-3 px-5 py-4">
          <Field label="Za zákazníka přebírá" htmlFor="sg-name">
            <Input id="sg-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <SignaturePad onChange={setPng} />
          <Err error={error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!png || name.trim().length < 2}
              onClick={() => void submit()}
            >
              Podepsat a uzavřít
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HandoverTab({ id }: { id: string }) {
  const q = useCommandQuery<Protocol[]>("realizace.handover.list", { jobId: id });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: todayIso() as string | null,
    acceptedBy: "",
    note: "",
    items: DEFAULT_ITEMS.map((text) => ({ text, ok: true, note: "" })),
  });
  const [signing, setSigning] = useState<Protocol | null>(null);
  const save = useCommandMutation<Record<string, unknown>>("realizace.handover.save", {
    onSuccess: () => {
      successToast("Protokol uložen.");
      setOpen(false);
    },
  });
  const del = useCommandMutation<{ id: string }>("realizace.handover.delete");

  return (
    <div className="space-y-4">
      {!open && (
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus /> Nový předávací protokol
        </Button>
      )}
      {open && (
        <form
          className="rounded-lg border border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              jobId: id,
              date: form.date,
              acceptedBy: form.acceptedBy || null,
              note: form.note || null,
              items: form.items
                .filter((i) => i.text.trim())
                .map((i) => ({ text: i.text, ok: i.ok, note: i.note || null })),
            });
          }}
        >
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Datum předání">
              <DatePicker
                value={form.date}
                onChange={(v) => setForm((f) => ({ ...f, date: v }))}
                clearable={false}
              />
            </Field>
            <Field label="Přebírá za zákazníka" htmlFor="ho-by">
              <Input
                id="ho-by"
                value={form.acceptedBy}
                onChange={(e) => setForm((f) => ({ ...f, acceptedBy: e.target.value }))}
              />
            </Field>
          </div>
          <fieldset className="mb-3 space-y-2">
            <legend className="mb-1 text-sm font-medium text-muted">Kontrolní body</legend>
            {form.items.map((it, n) => (
              <div key={n} className="flex items-center gap-2">
                <Checkbox
                  aria-label={`V pořádku: ${it.text}`}
                  checked={it.ok}
                  onCheckedChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      items: f.items.map((x, j) => (j === n ? { ...x, ok: !!v } : x)),
                    }))
                  }
                />
                <Input
                  aria-label={`Kontrolní bod ${n + 1}`}
                  value={it.text}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      items: f.items.map((x, j) => (j === n ? { ...x, text: e.target.value } : x)),
                    }))
                  }
                />
                <Input
                  aria-label={`Poznámka ${n + 1}`}
                  placeholder="Poznámka"
                  className="max-w-56"
                  value={it.note}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      items: f.items.map((x, j) => (j === n ? { ...x, note: e.target.value } : x)),
                    }))
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setForm((f) => ({ ...f, items: [...f.items, { text: "", ok: true, note: "" }] }))
              }
            >
              <Plus /> Další bod
            </Button>
          </fieldset>
          <Field label="Poznámka (vady, dohody)">
            <Textarea
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="min-h-16"
            />
          </Field>
          <Err error={save.error as Error | null} />
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              Uložit protokol
            </Button>
          </div>
        </form>
      )}
      {q.isLoading ? (
        <Skeleton className="h-16" />
      ) : !q.data?.length ? (
        <EmptyState
          title="Zatím žádný předávací protokol"
          description="Protokol shrnuje, co se předává zákazníkovi, a podepisuje se prstem nebo myší. Podepsaný už nejde měnit."
        />
      ) : (
        <ul className="space-y-3" data-testid="handover-list">
          {q.data.map((p) => (
            <li key={p.id} className="rounded-lg border border-line p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <b className="font-semibold">{p.number}</b>
                <span className="text-muted">{formatDate(p.date)}</span>
                {p.status === "signed" ? (
                  <Chip color="green" dot>
                    Podepsáno {p.signedAt ? formatDate(p.signedAt) : ""}
                    {p.acceptedBy ? `, ${p.acceptedBy}` : ""}
                  </Chip>
                ) : (
                  <Chip color="orange" dot>
                    Koncept
                  </Chip>
                )}
                {p.status !== "signed" && (
                  <span className="ml-auto flex gap-2">
                    <Button size="sm" variant="primary" onClick={() => setSigning(p)}>
                      Podepsat
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => del.mutate({ id: p.id })}>
                      Smazat
                    </Button>
                  </span>
                )}
              </div>
              <ul className="space-y-0.5 text-sm">
                {p.items.map((it, n) => (
                  <li key={n} className="flex gap-2">
                    <span className={it.ok ? "text-success" : "text-danger"}>
                      {it.ok ? "✓" : "✗"}
                    </span>
                    <span>
                      {it.text}
                      {it.note && <span className="text-muted"> — {it.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {p.note && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{p.note}</p>}
              {p.signatureFileId && (
                <img
                  src={`/api/files/${p.signatureFileId}`}
                  alt={`Podpis ${p.acceptedBy ?? ""}`}
                  className="mt-2 h-16 rounded border border-line bg-white p-1"
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <Err error={del.error as Error | null} />
      {signing && <SignDialog protocol={signing} jobId={id} onClose={() => setSigning(null)} />}
    </div>
  );
}

/* ---------- Přehled realizace ---------- */

type Overview = {
  id: string;
  number: string;
  title: string;
  startDate: string;
  endDate: string;
  progress: number;
  delay: number;
  next: { name: string; startDate: string; endDate: string } | null;
  phases: number;
  done: boolean;
}[];

function OverviewPage() {
  const q = useCommandQuery<Overview>("realizace.overview", {});
  const { Link } = useNav();
  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : !q.data?.length ? (
        <EmptyState
          title="Zatím žádná zakázka nemá harmonogram"
          description="Fáze přidáte na detailu zakázky v záložce Harmonogram. Tady pak uvidíte průběh a zpoždění všech zakázek."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[44rem] text-left" data-testid="overview-table">
            <thead className="bg-subtle text-sm text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Zakázka</th>
                <th className="px-3 py-2 font-medium">Termín</th>
                <th className="px-3 py-2 font-medium">Průběh</th>
                <th className="px-3 py-2 font-medium">Zpoždění</th>
                <th className="px-3 py-2 font-medium">Nejbližší fáze</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.map((j) => (
                <tr key={j.id} className={j.done ? "opacity-60" : ""}>
                  <td className="px-3 py-2">
                    <Link href={`/zakazky/${j.id}`} className="font-medium hover:underline">
                      {j.number} {j.title}
                    </Link>
                  </td>
                  <td className="tabular whitespace-nowrap px-3 py-2 text-muted">
                    {formatDate(j.startDate)} – {formatDate(j.endDate)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-hover">
                        <div
                          className={j.done ? "h-full bg-success" : "h-full bg-accent"}
                          style={{ width: `${j.progress}%` }}
                        />
                      </div>
                      <span className="tabular text-sm">{j.progress} %</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {j.delay > 0 ? (
                      <Chip color="red" dot>
                        {j.delay} pracovních dnů
                      </Chip>
                    ) : (
                      <span className="text-muted">včas</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-muted">
                    {j.next ? `${j.next.name} (${formatDate(j.next.startDate)})` : "vše hotovo"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const tab = (
  id: string,
  label: string,
  Component: (p: { id: string; canWrite: boolean }) => React.ReactNode,
  permission?: string,
): RecordTab => ({
  id,
  label,
  ...(permission ? { permission } : {}),
  render: ({ id: recordId, entity }) => <Component id={recordId} canWrite={entity.can.write} />,
});

export const ui = defineModuleUi({
  terminalWidgets: {
    "realizace.diary": { Widget: DiaryTerminalWidget },
    "realizace.report": { Widget: ReportTerminalWidget },
  },
  recordTabs: {
    job: [
      {
        ...tab("harmonogram", "Harmonogram", ScheduleTab, "realizace.read"),
        group: "realizace",
        order: 10,
        visible: fromPreparation,
      },
      {
        id: "denik",
        label: "Deník",
        permission: "realizace.read",
        render: ({ id }) => <DiaryTab id={id} />,
        group: "realizace",
        order: 20,
        visible: fromExecution,
      },
      {
        ...tab("predani", "Předání", HandoverTab, "realizace.read"),
        group: "realizace",
        order: 30,
        visible: fromExecution,
      },
      {
        ...tab(
          "vady",
          "Vady",
          ({ id }) => <RelatedRecords entity="defect" parentAttribute="job" parentId={id} />,
          "realizace.read",
        ),
        group: "realizace",
        order: 40,
        visible: fromExecution,
      },
    ],
  },
  recordOverview: { job: overviewCards },
  pages: [{ path: "/realizace", render: () => <OverviewPage /> }],
});
