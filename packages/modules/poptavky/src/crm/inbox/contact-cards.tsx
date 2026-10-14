"use client";

import { formatMinor } from "@rebar/core/shared";
import { PHASES, isPhaseKey } from "@rebar/zakazky/phases";
import {
  Button,
  Card as UiCard,
  CardBody,
  CardHeader,
  Chip,
  PipelineStepper,
  Skeleton,
  useCan,
  useCommandQuery,
  useEntityApi,
  useNav,
  type PipelineStage,
} from "@rebar/ui";
import { useState, type ReactNode } from "react";
import { WorkPanel } from "../activities/components";
import { QuickAddDealDialog } from "./components";

type Deal = {
  id: string;
  number: string;
  title: string;
  phase: string;
  stageId: string;
  stageName: string;
  isOpen: boolean;
  expectedCloseDate: string | null;
  daysInStage: number | null;
  nextActivityAt: string | null;
  openActivities: number;
  overdueActivities: number;
  rotting: boolean;
  participantRole: string | null;
  valueMinor?: number;
  weightedMinor?: number;
};
type Overview = {
  deals: Deal[];
  summary: {
    open: number;
    won: number;
    lost: number;
    openValueMinor?: number;
    weightedMinor?: number;
    turnoverMinor?: number;
  };
  stages: { id: string; name: string; color: string; kind: string | null; phase: string | null }[];
  money: boolean;
  people: {
    id: string;
    name: string;
    position: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
  }[];
  company: { id: string; name: string } | null;
  parent: { id: string; name: string } | null;
  children: { id: string; name: string }[];
};

/** Typ kontaktu, u kterého se obchod ukazuje. */
export type ContactEntity = "company" | "person";

/** Přehled obchodu firmy nebo osoby (`crm.contact.overview`), sdílený všemi kartami detailu. */
export function useContactOverview(entity: ContactEntity, id: string) {
  return useCommandQuery<Overview>("crm.contact.overview", { entity, id });
}

/** Dlaždice souhrnu (číslo a popisek). */
function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-lg border border-line-soft bg-subtle p-3" data-testid={testId}>
      <div className="text-sm text-muted">{label}</div>
      <div className="text-lg font-semibold tabular">{value}</div>
    </div>
  );
}

/** Kartu doprovodí nadpis a prázdný stav; stejný rámeček jako ostatní karty detailu. */
function Card({
  title,
  testId,
  action,
  children,
}: {
  title: string;
  testId: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <UiCard aria-label={title} data-testid={testId}>
      <CardHeader title={title} action={action} />
      <CardBody>{children}</CardBody>
    </UiCard>
  );
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" }) : null;

/** Mini pás stavů zakázky (otevřený obchod), nebo štítek fáze u vyhrané a prohrané. */
function DealStatus({ deal, stages }: { deal: Deal; stages: Overview["stages"] }) {
  if (deal.isOpen) {
    const list: PipelineStage[] = stages
      .filter((s) => s.kind === "open")
      .map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        kind: "open",
        ...(s.id === deal.stageId ? { daysInStage: deal.daysInStage } : {}),
      }));
    return (
      <PipelineStepper
        stages={list}
        currentId={deal.stageId}
        size="compact"
        label={`Stavy zakázky ${deal.title}`}
      />
    );
  }
  const phase = isPhaseKey(deal.phase) ? PHASES[deal.phase] : null;
  return <Chip color={phase?.color ?? "gray"}>{phase?.label ?? deal.phase}</Chip>;
}

/**
 * Karta „Obchody“ u firmy a osoby: souhrn otevřených a vyhraných obchodů (částky jen s oprávněním), seznam zakázek s mini
 * pásem stavů a tlačítko pro novou poptávku s předvyplněným kontaktem.
 */
export function ContactDealsCard({
  entity,
  id,
  name,
}: {
  entity: ContactEntity;
  id: string;
  name: string;
}) {
  const q = useContactOverview(entity, id);
  const { Link, push } = useNav();
  const can = useCan();
  const [adding, setAdding] = useState(false);
  const d = q.data;
  return (
    <Card
      title="Obchody"
      testId="contact-deals"
      action={
        can("zakazky.write") && (
          <Button size="sm" onClick={() => setAdding(true)}>
            Nová poptávka
          </Button>
        )
      }
    >
      {q.isLoading || !d ? (
        <Skeleton className="h-24" />
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Otevřené" value={String(d.summary.open)} testId="stat-open" />
            {d.money && d.summary.openValueMinor !== undefined && (
              <Stat label="Hodnota otevřených" value={formatMinor(d.summary.openValueMinor)} />
            )}
            {d.money && d.summary.weightedMinor !== undefined && (
              <Stat label="Vážená hodnota" value={formatMinor(d.summary.weightedMinor)} />
            )}
            <Stat label="Vyhrané" value={String(d.summary.won)} />
            {d.money && d.summary.turnoverMinor !== undefined && (
              <Stat
                label="Obrat"
                value={formatMinor(d.summary.turnoverMinor)}
                testId="stat-turnover"
              />
            )}
          </div>
          {d.deals.length === 0 ? (
            <p className="text-sm text-muted">
              Zatím žádná zakázka. Založte poptávku tlačítkem nahoře.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {d.deals.map((deal) => (
                <li
                  key={deal.id}
                  className="grid gap-1.5 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] sm:items-center sm:gap-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={deal.isOpen ? `/crm?record=${deal.id}` : `/zakazky/${deal.id}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {deal.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                      <span>{deal.number}</span>
                      {deal.participantRole !== null && (
                        <span>
                          · účastník{deal.participantRole ? ` (${deal.participantRole})` : ""}
                        </span>
                      )}
                      {d.money && deal.valueMinor ? (
                        <span>· {formatMinor(deal.valueMinor)}</span>
                      ) : null}
                      {deal.isOpen && deal.nextActivityAt && (
                        <span className={deal.overdueActivities ? "text-danger" : ""}>
                          · další aktivita {when(deal.nextActivityAt)}
                        </span>
                      )}
                      {deal.isOpen && !deal.nextActivityAt && (
                        <span className="text-warning">· bez další aktivity</span>
                      )}
                    </div>
                  </div>
                  <DealStatus deal={deal} stages={d.stages} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <QuickAddDealDialog
        open={adding}
        onOpenChange={setAdding}
        {...(entity === "company"
          ? { defaultCompany: { id, name } }
          : { defaultPerson: { id, name } })}
        onCreated={(jobId) => {
          void q.refetch();
          push(`/crm?record=${jobId}`);
        }}
      />
    </Card>
  );
}

/** Karta s časovou osou ze všech zakázek a osob firmy (nebo zakázek osoby): psací panel, další kroky a historie. */
export function ContactTimelineCard({ entity, id }: { entity: ContactEntity; id: string }) {
  return (
    <div data-testid="contact-timeline">
      <WorkPanel {...(entity === "company" ? { companyId: id } : { personId: id })} aggregate />
    </div>
  );
}

/** Kontaktní osoby firmy (jméno, funkce nebo role, telefon, e-mail). */
export function CompanyPeopleCard({ id }: { id: string }) {
  const q = useContactOverview("company", id);
  const api = useEntityApi();
  const { Link } = useNav();
  const people = q.data?.people ?? [];
  return (
    <Card title={`Osoby${people.length ? ` (${people.length})` : ""}`} testId="contact-people">
      {q.isLoading ? (
        <Skeleton className="h-12" />
      ) : people.length === 0 ? (
        <p className="text-sm text-muted">Firma zatím nemá kontaktní osobu.</p>
      ) : (
        <ul className="divide-y divide-line">
          {people.map((p) => (
            <li key={p.id} className="py-1.5">
              <Link
                href={api.hrefFor("person", p.id) ?? "#"}
                className="font-medium hover:underline"
              >
                {p.name}
              </Link>
              <div className="truncate text-sm text-muted">
                {[p.position, p.phone, p.email].filter(Boolean).join(" · ") || "Bez kontaktu"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Související firmy: mateřská a dceřiné firmy. */
export function RelatedCompaniesCard({ id }: { id: string }) {
  const q = useContactOverview("company", id);
  const api = useEntityApi();
  const { Link } = useNav();
  const d = q.data;
  if (!d || (!d.parent && d.children.length === 0)) return null;
  const link = (c: { id: string; name: string }) => (
    <Link key={c.id} href={api.hrefFor("company", c.id) ?? "#"} className="hover:underline">
      {c.name}
    </Link>
  );
  return (
    <Card title="Související firmy" testId="contact-related">
      <div className="space-y-2 text-base">
        {d.parent && (
          <div>
            <div className="text-sm text-muted">Mateřská firma</div>
            {link(d.parent)}
          </div>
        )}
        {d.children.length > 0 && (
          <div>
            <div className="text-sm text-muted">Dceřiné firmy</div>
            <div className="flex flex-col">{d.children.map(link)}</div>
          </div>
        )}
      </div>
    </Card>
  );
}
