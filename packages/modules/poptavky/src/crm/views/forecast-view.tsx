"use client";

import { formatDate, formatMinor } from "@rebar/core/shared";
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  PipelineStepper,
  RecordDialog,
  Skeleton,
  cn,
  useCommandQuery,
  useEntityDescriptor,
  useRecordParam,
} from "@rebar/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { nextActivityLook } from "../activities/next-label";
import { RottingChip } from "../board/deal-card";
import { daysInStage } from "../logic";
import {
  currentMonth,
  monthLabel,
  shiftMonth,
  sumColumns,
  type ForecastColumn,
  type ForecastDeal,
  type ForecastResult,
  type OwnerFilter,
} from "./logic";

/** Kolik měsíců prognózy je vidět najednou; další se posouvají šipkami. */
const MONTHS = 4;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Částka sloupce nebo pomlčka, když ji aktér nesmí vidět. */
const money = (minor: number | null) => (minor === null ? "–" : formatMinor(minor));

/**
 * Prognóza obchodů: sloupce po měsících podle předpokládaného uzavření (vlevo „Dřívější“ po termínu, vpravo „Bez data“).
 * V hlavičce sloupce je otevřeno, vyhráno a celkem a vážená hodnota; na kartě pruh pozice ve fázích. Šipkami se posouvá
 * po měsících, „Dnes“ skočí na aktuální měsíc. Agregace běží na serveru (`crm.forecast`); částky vidí jen ten, kdo má
 * `zakazky.finance`. Karta otevře detail zakázky v pop-upu (`?record=`), který si pohled sám obsluhuje.
 */
export function ForecastView({ owner }: { owner: OwnerFilter }) {
  const [from, setFrom] = useState(() => currentMonth());
  const query = useCommandQuery<ForecastResult>("crm.forecast", { owner, from, months: MONTHS });
  // při posunu měsíců zůstanou předchozí sloupce vidět, dokud se nenačtou nové
  const last = useRef<ForecastResult | null>(null);
  useEffect(() => {
    if (query.data) last.current = query.data;
  }, [query.data]);
  const data = query.data ?? last.current;

  const descriptor = useEntityDescriptor("job");
  const record = useRecordParam(true);
  const scroller = useRef<HTMLDivElement>(null);
  const today = currentMonth();

  const go = (to: string) => {
    setFrom(to);
    scroller.current?.scrollTo({ left: 0 });
  };

  const visible = useMemo(
    () => (data ? data.columns.filter((c) => c.kind !== "earlier" || c.total.count > 0) : []),
    [data],
  );
  const empty = !!data && data.columns.every((c) => c.total.count === 0);
  const sum = data ? sumColumns(data.columns) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="forecast-view">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <div className="flex items-center gap-1.5" role="group" aria-label="Měsíce prognózy">
          <IconButton
            label="Předchozí měsíc"
            variant="ghost"
            onClick={() => go(shiftMonth(from, -1))}
          >
            <Icon name="chevron-left" />
          </IconButton>
          <Button
            variant={from === today ? "secondary" : "ghost"}
            onClick={() => go(today)}
            data-testid="forecast-today"
          >
            <Icon name="calendar-days" /> Dnes
          </Button>
          <IconButton label="Další měsíc" variant="ghost" onClick={() => go(shiftMonth(from, 1))}>
            <Icon name="chevron-right" />
          </IconButton>
        </div>
        <h2 className="text-base font-semibold" data-testid="forecast-range">
          {cap(monthLabel(from))} – {monthLabel(shiftMonth(from, MONTHS - 1))}
        </h2>
        {sum && sum.count > 0 && (
          <p className="tabular ml-auto text-sm text-muted" data-testid="forecast-sum">
            {sum.count} {plural(sum.count)}
            {sum.valueMinor !== null && (
              <>
                {" "}
                · {formatMinor(sum.valueMinor)} · vážená {formatMinor(sum.weightedMinor ?? 0)}
              </>
            )}
          </p>
        )}
      </div>

      {query.isError && !data ? (
        <EmptyState
          title="Prognózu se nepodařilo načíst"
          description={query.error.message || "Zkontrolujte připojení a zkuste to znovu."}
          action={
            <Button variant="primary" onClick={() => void query.refetch()}>
              Zkusit znovu
            </Button>
          }
        />
      ) : !data ? (
        <div className="flex gap-3 px-4 pb-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 w-72 shrink-0" />
          ))}
        </div>
      ) : (
        <div
          ref={scroller}
          className={cn(
            "scrollbar-thin flex min-h-0 flex-1 snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-4 transition-opacity",
            query.isFetching && "opacity-70",
          )}
        >
          {empty && (
            <div className="w-full">
              <EmptyState
                icon={<Icon name="calendar-days" />}
                title="V tomto období zatím nejsou žádné obchody"
                description="Obchodům nastavte předpokládané uzavření, objeví se tady v příslušném měsíci. Posuňte se šipkami na jiné měsíce."
                action={
                  from !== today ? (
                    <Button onClick={() => go(today)}>Zpět na dnešek</Button>
                  ) : undefined
                }
              />
            </div>
          )}
          {!empty &&
            visible.map((c) => (
              <Column
                key={c.key}
                column={c}
                data={data}
                isToday={c.key === today}
                onOpen={record.open}
              />
            ))}
        </div>
      )}

      {descriptor.data && (
        <RecordDialog entity={descriptor.data} id={record.id} onClose={record.close} />
      )}
    </div>
  );
}

const plural = (n: number) => (n === 1 ? "obchod" : n >= 2 && n <= 4 ? "obchody" : "obchodů");

function title(c: ForecastColumn): { name: string; hint?: string } {
  if (c.kind === "earlier") return { name: "Dřívější", hint: "Předpokládané uzavření už uplynulo" };
  if (c.kind === "none") return { name: "Bez data", hint: "Chybí předpokládané uzavření" };
  return { name: cap(monthLabel(c.key)) };
}

function Column({
  column: c,
  data,
  isToday,
  onOpen,
}: {
  column: ForecastColumn;
  data: ForecastResult;
  isToday: boolean;
  onOpen: (id: string) => void;
}) {
  const t = title(c);
  const showMoney = data.money;
  return (
    <section
      aria-label={t.name}
      data-testid={`forecast-column-${c.key}`}
      className="flex w-[84vw] max-w-80 shrink-0 snap-start flex-col rounded-lg border border-line bg-subtle sm:w-72"
    >
      <header
        className={cn(
          "rounded-t-lg border-t-2 p-3",
          isToday ? "border-accent" : "border-transparent",
        )}
      >
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">{t.name}</h3>
          {isToday && <Chip color="blue">tento měsíc</Chip>}
        </div>
        {t.hint && <p className="text-xs text-faint">{t.hint}</p>}
        <dl className="tabular mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-muted">Otevřeno</dt>
          <dd className="text-right" data-testid="forecast-open">
            {c.open.count}
            {showMoney && <> · {money(c.open.valueMinor)}</>}
          </dd>
          {c.kind !== "none" && (
            <>
              <dt className="text-muted">Vyhráno</dt>
              <dd className="text-right" data-testid="forecast-won">
                {c.won.count}
                {showMoney && <> · {money(c.won.valueMinor)}</>}
              </dd>
              <dt className="text-muted">Celkem</dt>
              <dd className="text-right font-medium" data-testid="forecast-total">
                {c.total.count}
                {showMoney && <> · {money(c.total.valueMinor)}</>}
              </dd>
            </>
          )}
          {showMoney && (
            <>
              <dt className="text-muted">Vážená</dt>
              <dd className="text-right" data-testid="forecast-weighted">
                {money(c.total.weightedMinor)}
              </dd>
            </>
          )}
        </dl>
      </header>
      <div className="flex flex-col gap-2 p-2 pt-0">
        {c.deals.length === 0 ? (
          <p className="px-1 py-3 text-center text-sm text-faint">Žádné obchody</p>
        ) : (
          c.deals.map((d) => (
            <DealCard key={d.id} deal={d} data={data} onOpen={() => onOpen(d.id)} />
          ))
        )}
        {c.hidden > 0 && (
          <p className="px-1 pb-1 text-center text-sm text-muted">
            … a dalších {c.hidden} {plural(c.hidden)}
          </p>
        )}
      </div>
    </section>
  );
}

function DealCard({
  deal: d,
  data,
  onOpen,
}: {
  deal: ForecastDeal;
  data: ForecastResult;
  onOpen: () => void;
}) {
  // na úzké kartě se názvy stavů nevejdou: segmenty nesou pořadí, název aktuálního stavu je pod nimi
  const stages = useMemo(
    () =>
      data.stages.map((s, i) => ({
        id: s.id,
        name: String(i + 1),
        color: s.color,
        kind: "open" as const,
      })),
    [data.stages],
  );
  const at = data.stages.findIndex((s) => s.id === d.stageId);
  const stageName = at >= 0 ? data.stages[at]!.name : null;
  const days = daysInStage(d.stageEnteredAt);
  // jeden signál na kartě: aktivita po termínu přebíjí hnití (stejný jazyk jako karta na nástěnce)
  const overdue = !d.won ? nextActivityLook(d.nextActivityAt, d.openActivities) : null;
  const signal = overdue?.state === "overdue" ? overdue : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="forecast-card"
      data-deal={d.id}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-md border border-line bg-bg p-2.5 text-left shadow-sm hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent",
      )}
    >
      <span className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 font-medium leading-snug [overflow-wrap:anywhere]">
          {d.title}
        </span>
      </span>
      {d.companyName && <span className="truncate text-sm text-muted">{d.companyName}</span>}
      {d.won ? (
        <span>
          <Chip color="green" dot>
            Vyhráno
          </Chip>
        </span>
      ) : (
        <>
          <PipelineStepper
            stages={stages}
            currentId={d.stageId}
            size="mini"
            label={
              stageName
                ? `Pozice obchodu ve fázích: ${stageName} (${at + 1}. z ${stages.length})`
                : "Pozice obchodu ve fázích"
            }
            className="my-0.5"
          />
          {stageName && (
            <span className="tabular -mt-0.5 flex items-baseline gap-1.5 text-xs text-muted">
              <span className="truncate">{stageName}</span>
              <span className="shrink-0 text-faint">{days} d</span>
            </span>
          )}
        </>
      )}
      <span className="tabular flex items-center gap-2 whitespace-nowrap text-sm">
        {d.valueMinor !== null && <span className="font-medium">{formatMinor(d.valueMinor)}</span>}
        {!d.won && d.probabilityPct !== null && (
          <span className="text-muted">{Math.round(d.probabilityPct)}&nbsp;%</span>
        )}
        {d.managerName && <Avatar name={d.managerName} size={20} className="ml-auto" />}
      </span>
      {d.closeDate && (
        <span className="tabular text-xs text-faint">
          {d.won ? "Výhra" : "Uzavření"} {formatDate(d.closeDate)}
        </span>
      )}
      {!d.won &&
        (signal ? (
          <span
            data-testid="forecast-overdue"
            title={signal.hint}
            className="inline-flex h-5 items-center gap-1.5 text-xs font-medium text-danger"
          >
            <Icon name={signal.icon} className="size-3.5 shrink-0" />
            {signal.text}
          </span>
        ) : (
          d.rotting && (
            <span className="flex">
              <RottingChip
                row={{
                  id: d.id,
                  crmRotting: true,
                  crmLastActivityAt: d.lastActivityAt,
                  crmStageEnteredAt: d.stageEnteredAt,
                  crmNextActivityAt: d.nextActivityAt,
                  crmOpenActivities: d.openActivities,
                  updatedAt: "",
                }}
              />
            </span>
          )
        ))}
    </button>
  );
}
