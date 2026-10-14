"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import {
  Button,
  Chip,
  Combobox,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Icon,
  RecordDialog,
  Skeleton,
  cn,
  errorToast,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useEntityDescriptor,
  useNav,
  useRecordParam,
} from "@rebar/ui";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityComposer, ActivityList } from "../activities/components";
import { QuickAddDealDialog } from "../inbox/components";
import { pragueDay } from "../logic";
import { waitingLabel, type TodayData, type TodayDeal, type TodayInquiry } from "./logic";

const todayFmt = new Intl.DateTimeFormat("cs-CZ", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Prague",
});

/**
 * Moje dnešní práce: domovská obrazovka obchodníka. Nahoře dnešní a zpožděné aktivity (`ActivityList`), pod nimi moje
 * otevřené obchody bez další aktivity (naplánování rovnou z řádku) a nové poptávky ve schránce (kvalifikovat, zamítnout,
 * otevřít). Seznamy čte příkaz `crm.today`; na telefonu jsou sekce pod sebou ve stejném pořadí důležitosti.
 */
export function TodayPage() {
  const api = useEntityApi();
  const today = useCommandQuery<TodayData>("crm.today", {});
  const descriptor = useEntityDescriptor("job");
  const record = useRecordParam(true);
  const [date, setDate] = useState("");
  const [quickAdd, setQuickAdd] = useState(false);
  const [plan, setPlan] = useState<TodayDeal | null>(null);
  useEffect(() => setDate(todayFmt.format(new Date())), []);
  const first = api.me.name.trim().split(/\s+/)[0] ?? "";

  return (
    <div
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6"
      data-testid="today-page"
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">
              {first ? `Dobrý den, ${first}` : "Dobrý den"}
            </h1>
            <p className="text-muted first-letter:uppercase" data-testid="today-date">
              {date || " "}
            </p>
          </div>
          <Button variant="primary" onClick={() => setQuickAdd(true)} data-testid="today-quick-add">
            <Icon name="plus" /> Nová poptávka
          </Button>
        </header>

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="space-y-6">
            <Section title="Po termínu" icon="alarm-clock" testId="today-overdue">
              <ActivityList scope="mine" range="overdue" limit={25} />
            </Section>
            <Section title="Dnes" icon="calendar-check" testId="today-today">
              <ActivityList scope="mine" range="today" limit={25} />
            </Section>
          </div>
          <div className="space-y-6">
            {today.isError && !today.data ? (
              <EmptyState
                title="Dnešní práci se nepodařilo načíst"
                description={today.error.message || "Zkontrolujte připojení a zkuste to znovu."}
                action={
                  <Button variant="primary" onClick={() => void today.refetch()}>
                    Zkusit znovu
                  </Button>
                }
              />
            ) : !today.data ? (
              <>
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </>
            ) : (
              <>
                {today.data.noActivity && (
                  <NoActivity data={today.data.noActivity} onOpen={record.open} onPlan={setPlan} />
                )}
                {today.data.inbox && <Inbox data={today.data.inbox} />}
              </>
            )}
          </div>
        </div>
      </div>

      {descriptor.data && (
        <RecordDialog entity={descriptor.data} id={record.id} onClose={record.close} />
      )}
      <QuickAddDealDialog
        open={quickAdd}
        onOpenChange={setQuickAdd}
        onCreated={(jobId) => record.open(jobId)}
      />
      <Dialog open={!!plan} onOpenChange={(o) => !o && setPlan(null)}>
        {plan && (
          <DialogContent title="Naplánovat aktivitu" description={`${plan.number} ${plan.title}`}>
            <div className="px-5 py-4">
              <ActivityComposer
                jobId={plan.id}
                onCreated={() => {
                  setPlan(null);
                  successToast("Aktivita je naplánovaná.");
                }}
              />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Section({
  title,
  icon,
  count,
  testId,
  children,
}: {
  title: string;
  icon: string;
  count?: number;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={testId}>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-faint">
        <Icon name={icon} className="size-4" />
        {title}
        {count !== undefined && count > 0 && (
          <Chip color="gray" data-testid={`${testId}-count`}>
            {count}
          </Chip>
        )}
      </h2>
      {children}
    </section>
  );
}

const card = "overflow-hidden rounded-lg border border-line bg-bg";

function More({ total, shown }: { total: number; shown: number }) {
  const nav = useNav();
  if (total <= shown) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-sm text-muted">
      <span>
        Zobrazeno {shown} z {total}
      </span>
      <Button size="sm" variant="ghost" onClick={() => nav.push("/crm")}>
        Otevřít v CRM
      </Button>
    </div>
  );
}

/* ---------- obchody bez další aktivity ---------- */

function NoActivity({
  data,
  onOpen,
  onPlan,
}: {
  data: NonNullable<TodayData["noActivity"]>;
  onOpen: (id: string) => void;
  onPlan: (d: TodayDeal) => void;
}) {
  return (
    <Section
      title="Obchody bez další aktivity"
      icon="target"
      count={data.total}
      testId="today-no-activity"
    >
      <div className={card}>
        {data.rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="circle-check" />}
            title="Každý obchod má další krok"
            description="Všechny vaše otevřené zakázky mají naplánovanou aktivitu. Takhle to má vypadat."
          />
        ) : (
          <ul className="divide-y divide-line">
            {data.rows.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
                data-testid="today-deal"
                data-deal={d.id}
              >
                <button
                  type="button"
                  onClick={() => onOpen(d.id)}
                  className="min-w-0 flex-1 basis-48 text-left focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="block font-medium [overflow-wrap:anywhere]">
                    <span className="mr-1.5 text-faint">{d.number}</span>
                    {d.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
                    {d.companyName && <span className="truncate">{d.companyName}</span>}
                    {d.stageName && <Chip color={d.stageColor ?? "gray"}>{d.stageName}</Chip>}
                    <span className={cn("tabular", d.rotting && "text-danger")}>
                      {d.daysInStage} d ve stavu{d.rotting ? ", hnije" : ""}
                    </span>
                  </span>
                </button>
                {d.valueMinor !== null && (
                  <span className="tabular text-sm font-medium">{formatMinor(d.valueMinor)}</span>
                )}
                <Button size="sm" onClick={() => onPlan(d)} data-testid="today-plan">
                  <Icon name="calendar-clock" /> Naplánovat
                </Button>
              </li>
            ))}
          </ul>
        )}
        <More total={data.total} shown={data.rows.length} />
      </div>
    </Section>
  );
}

/* ---------- schránka poptávek ---------- */

function Inbox({ data }: { data: NonNullable<TodayData["inbox"]> }) {
  const [lost, setLost] = useState<TodayInquiry | null>(null);
  return (
    <Section title="Nové poptávky ve schránce" icon="inbox" count={data.total} testId="today-inbox">
      <div className={card}>
        {data.rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="inbox" />}
            title="Schránka je prázdná"
            description="Žádná nová poptávka nečeká na vyřízení. Až nějaká přijde, objeví se tady."
          />
        ) : (
          <ul className="divide-y divide-line">
            {data.rows.map((i) => (
              <InquiryRow key={i.id} inquiry={i} data={data} onLost={() => setLost(i)} />
            ))}
          </ul>
        )}
        <More total={data.total} shown={data.rows.length} />
      </div>
      <Dialog open={!!lost} onOpenChange={(o) => !o && setLost(null)}>
        {lost && (
          <DialogContent title="Zamítnout poptávku" description={lost.title}>
            <LostForm inquiry={lost} reasons={data.lostReasons} close={() => setLost(null)} />
          </DialogContent>
        )}
      </Dialog>
    </Section>
  );
}

function InquiryRow({
  inquiry: i,
  data,
  onLost,
}: {
  inquiry: TodayInquiry;
  data: NonNullable<TodayData["inbox"]>;
  onLost: () => void;
}) {
  const nav = useNav();
  const qualify = useCommandMutation<{ id: string; duplicates?: "use" }, { jobId: string }>(
    "poptavky.convert",
  );
  const done = () => successToast("Zakázka byla založena. Naplánujte k ní první aktivitu.");
  const run = () =>
    qualify.mutate(
      { id: i.id },
      {
        onSuccess: done,
        onError: (e) => {
          // existující firma nebo osoba se stejným e-mailem či telefonem: nabídne se použití existujícího záznamu
          if (/^(Firma|Osoba) „.*už existuje/.test(e.message)) {
            if (window.confirm(`${e.message}\n\nPoužít existující záznam?`))
              qualify.mutate(
                { id: i.id, duplicates: "use" },
                { onSuccess: done, onError: (x) => errorToast(x.message) },
              );
            return;
          }
          errorToast(e.message);
        },
      },
    );
  const who = [i.contactName, i.companyName].filter(Boolean).join(" · ");
  const overdue = !!i.nextStepAt && i.nextStepAt < pragueDay(new Date());
  return (
    <li className="space-y-1.5 px-3 py-2.5" data-testid="today-inquiry" data-inquiry={i.id}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <button
          type="button"
          onClick={() => nav.push(`/poptavky/${i.id}`)}
          className="min-w-0 text-left font-medium [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {i.title}
        </button>
        <span className="text-sm text-faint">{waitingLabel(i.createdAt)}</span>
      </div>
      {(who || i.phone || i.email) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
          {who && <span>{who}</span>}
          {i.phone && (
            <a href={`tel:${i.phone.replace(/\s+/g, "")}`} className="hover:underline">
              {i.phone}
            </a>
          )}
          {i.email && (
            <a href={`mailto:${i.email}`} className="hover:underline [overflow-wrap:anywhere]">
              {i.email}
            </a>
          )}
        </p>
      )}
      {i.message && <p className="line-clamp-2 text-sm text-muted">{i.message}</p>}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {i.source && <Chip color="gray">{i.source}</Chip>}
        {i.valueMinor > 0 && <Chip color="gray">odhad {formatMinor(i.valueMinor)}</Chip>}
        {i.nextStepAt && (
          <Chip color={overdue ? "red" : "gray"}>krok do {formatDate(i.nextStepAt)}</Chip>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          {data.canWrite && (
            <Button size="sm" variant="ghost" onClick={onLost} data-testid="today-reject">
              Zamítnout
            </Button>
          )}
          {data.canConvert && (
            <Button
              size="sm"
              variant="primary"
              loading={qualify.isPending}
              onClick={run}
              data-testid="today-qualify"
            >
              Kvalifikovat
            </Button>
          )}
        </span>
      </div>
    </li>
  );
}

function LostForm({
  inquiry,
  reasons,
  close,
}: {
  inquiry: TodayInquiry;
  reasons: { value: string; label: string }[];
  close: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const lost = useCommandMutation<{ id: string; reason: string }>("poptavky.markLost", {
    onSuccess: () => {
      successToast("Poptávka je označená jako zamítnutá.");
      close();
    },
  });
  return (
    <div className="space-y-3 px-5 py-4">
      <Field label="Důvod zamítnutí">
        <Combobox
          options={reasons}
          value={reason}
          onChange={(v) => setReason(v as string | null)}
          placeholder="Vyberte důvod…"
        />
      </Field>
      {lost.error && (
        <p role="alert" className="text-sm text-danger">
          {lost.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Zrušit
        </Button>
        <Button
          variant="danger"
          disabled={!reason}
          loading={lost.isPending}
          onClick={() => reason && lost.mutate({ id: inquiry.id, reason })}
        >
          Zamítnout poptávku
        </Button>
      </div>
    </div>
  );
}
