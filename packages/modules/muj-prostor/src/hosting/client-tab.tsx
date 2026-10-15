"use client";

import { formatMinor } from "@rebar/core/shared";
import {
  Button,
  Chip,
  CreateDialog,
  EmptyState,
  Icon,
  Skeleton,
  useCommandQuery,
  useEntityDescriptor,
  useNav,
} from "@rebar/ui";
import { useState } from "react";
import {
  RECURRING_KIND_LABELS,
  RECURRING_PERIOD_LABELS,
  RECURRING_STATUS_COLORS,
  RECURRING_STATUS_LABELS,
} from "../labels";
import { ClientInvoicesSection } from "../invoices/client-section";
import { ExpiryChip, RenewalCell, useMarkRenewed } from "../shared-ui";
import type { ClientHostingOverview, ServiceRow } from "../types";

function ServiceLine({ row }: { row: ServiceRow }) {
  const { Link } = useNav();
  const { mark, pending } = useMarkRenewed();
  return (
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-3 py-2 first:border-t-0"
      data-testid="client-service"
    >
      <Link
        href={`/muj-prostor/hosting/vse/${row.id}`}
        className="min-w-0 flex-1 truncate font-medium hover:underline"
      >
        {row.name}
      </Link>
      <Chip color="gray">{RECURRING_KIND_LABELS[row.kind]}</Chip>
      <Chip color={RECURRING_STATUS_COLORS[row.status]}>{RECURRING_STATUS_LABELS[row.status]}</Chip>
      <span className="tabular text-muted">
        {row.priceMinor === null
          ? ""
          : `${formatMinor(row.priceMinor)} ${RECURRING_PERIOD_LABELS[row.period].toLowerCase()}`}
      </span>
      <RenewalCell row={row} />
      {row.status === "active" && row.nextRenewal && (
        <Button
          size="sm"
          loading={pending}
          onClick={() => mark({ id: row.id, nextRenewal: row.nextRenewal! })}
        >
          <Icon name="check" /> Označit obnovu
        </Button>
      )}
    </li>
  );
}

/**
 * Záložka „Hosting a domény“ na kartě klienta (KLI-09, jen vlastník): služby hostingu a údržby s obnovou a domény
 * klienta s barvou expirace; přidání služby nebo domény rovnou pro tohoto klienta.
 */
export function ClientHostingTab({ companyId }: { companyId: string }) {
  const { Link } = useNav();
  const q = useCommandQuery<ClientHostingOverview>("muj-prostor.client.overview", { companyId });
  const serviceDescriptor = useEntityDescriptor("recurring_service");
  const domainDescriptor = useEntityDescriptor("web_domain");
  const [create, setCreate] = useState<"service" | "domain" | null>(null);
  const data = q.data;

  if (q.isError && !data)
    return (
      <EmptyState
        title="Hosting a domény se nepodařilo načíst"
        description={q.error.message}
        action={<Button onClick={() => void q.refetch()}>Zkusit znovu</Button>}
      />
    );
  if (!data) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4" data-testid="client-hosting-tab">
      <section className="card overflow-hidden">
        <h3 className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
          <Icon name="vault" className="size-4 text-faint" /> Hosting a údržba
          <span className="tabular rounded-full bg-hover px-1.5 text-xs font-medium text-muted">
            {data.services.length}
          </span>
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setCreate("service")}
            data-testid="client-add-service"
          >
            <Icon name="plus" /> Přidat službu
          </Button>
        </h3>
        {data.services.length === 0 ? (
          <p className="border-t border-line-soft px-3 py-3 text-muted">
            Klient nemá evidovaný hosting ani údržbu.
          </p>
        ) : (
          <ul className="border-t border-line-soft">
            {data.services.map((s) => (
              <ServiceLine key={s.id} row={s} />
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <h3 className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
          <Icon name="globe" className="size-4 text-faint" /> Domény
          <span className="tabular rounded-full bg-hover px-1.5 text-xs font-medium text-muted">
            {data.domains.length}
          </span>
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setCreate("domain")}
            data-testid="client-add-domain"
          >
            <Icon name="plus" /> Přidat doménu
          </Button>
        </h3>
        {data.domains.length === 0 ? (
          <p className="border-t border-line-soft px-3 py-3 text-muted">
            Klient nemá evidovanou doménu.
          </p>
        ) : (
          <ul className="border-t border-line-soft">
            {data.domains.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-3 py-2 first:border-t-0"
                data-testid="client-domain"
              >
                <Link
                  href={`/muj-prostor/domeny/vse/${d.id}`}
                  className="min-w-0 flex-1 truncate font-medium hover:underline"
                >
                  {d.domain}
                </Link>
                {d.registrar && <span className="text-muted">{d.registrar}</span>}
                <ExpiryChip expiresOn={d.expiresOn} warnDays={d.warnDays} today={data.today} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ClientInvoicesSection companyId={companyId} />

      {serviceDescriptor.data && (
        <CreateDialog
          entity={serviceDescriptor.data}
          open={create === "service"}
          onOpenChange={(o) => !o && setCreate(null)}
          defaults={{ company: companyId }}
          onCreated={() => {
            setCreate(null);
            void q.refetch();
          }}
        />
      )}
      {domainDescriptor.data && (
        <CreateDialog
          entity={domainDescriptor.data}
          open={create === "domain"}
          onOpenChange={(o) => !o && setCreate(null)}
          defaults={{ company: companyId }}
          onCreated={() => {
            setCreate(null);
            void q.refetch();
          }}
        />
      )}
    </div>
  );
}
