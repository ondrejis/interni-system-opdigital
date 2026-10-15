"use client";

import { formatDate } from "@rebar/core/shared";
import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Icon,
  errorToast,
  useCan,
  useCommandMutation,
  useNav,
  type RecordHeader,
} from "@rebar/ui";
import { useState } from "react";
import type { ClientStatus, ServiceType } from "@rebar/core/contracts";
import {
  CLIENT_STATUS_COLORS,
  CLIENT_STATUS_LABELS,
  SERVICES,
  SERVICE_LABELS,
  addressLine,
  isClientStatus,
  mapsHref,
  newDealHref,
  newJobHref,
  telHref,
  webHref,
} from "../shared";
import { HideEmptyTabs } from "./hide-tabs";
import { linkButton } from "./link-button";
import { useClientSummary, useClientTabs } from "./hooks";
import { StatusDialog } from "./status-dialog";

const asServices = (v: unknown): ServiceType[] =>
  Array.isArray(v)
    ? v.filter((s): s is ServiceType => (SERVICES as readonly string[]).includes(s))
    : [];

/** Výběr služeb klienta (rozbalovací nabídka se zaškrtávátky; změna se ukládá hned). */
function ServicesMenu({
  companyId,
  value,
  canEdit,
}: {
  companyId: string;
  value: ServiceType[];
  canEdit: boolean;
}) {
  const save = useCommandMutation<{ companyId: string; services: ServiceType[] }>(
    "klienti.setServices",
  );
  const toggle = (s: ServiceType, on: boolean) =>
    save.mutate(
      { companyId, services: SERVICES.filter((x) => (x === s ? on : value.includes(x))) },
      { onError: (e) => errorToast(e.message) },
    );
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="client-services">
      {value.length === 0 && <span className="text-sm text-faint">Bez služby</span>}
      {value.map((s) => (
        <Chip key={s} color="blue" data-testid={`service-${s}`}>
          {SERVICE_LABELS[s]}
        </Chip>
      ))}
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Upravit služby"
              data-testid="services-edit"
            >
              <Icon name="pencil" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SERVICES.map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={value.includes(s)}
                onCheckedChange={(on) => toggle(s, on === true)}
                onSelect={(e) => e.preventDefault()}
              >
                {SERVICE_LABELS[s]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/**
 * Hlavička karty klienta (KLI-04), pás pod názvem organizace: stav (klik otevře změnu stavu), služby, vlastník, štítky,
 * „klient od“ a tlačítka Zavolat (hlavní kontakt), Web, Navigovat, Nová zakázka a Nový obchod. Zámek, Otevřít Disk,
 * E-mail ze šablony, Nový úkol a Nová poznámka dodávají moduly Disk, Šablony e-mailů a Úkoly do lišty akcí hostitele.
 * Pás zároveň skrývá záložky bez dat (`klienti.tabCounts`). Organizace bez stavu klienta nabídne „Označit jako klienta“.
 */
export const ClientHeaderBand: RecordHeader = ({ id, row, labels, entity }) => {
  const can = useCan();
  const { Link } = useNav();
  const [dialog, setDialog] = useState(false);
  const status: ClientStatus | null = isClientStatus(row.clientStatus) ? row.clientStatus : null;
  const tabs = useClientTabs(id, status !== null);
  const summary = useClientSummary(id, status !== null);
  const toLead = useCommandMutation<{ companyId: string; status: ClientStatus }>(
    "klienti.setStatus",
  );
  const canWrite = can("klienti.write") && entity.can.write;
  const primary = summary.data?.summary.contacts.primary ?? null;
  const phone = telHref(primary?.phone ?? (typeof row.phone === "string" ? row.phone : null));
  const web = webHref(row.web);
  const address = addressLine({
    street: row.street,
    city: row.city,
    zip: row.zip,
    country: row.country,
  });
  const owner = labels.owner?.[String(row.owner ?? "")]?.label ?? null;
  const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];

  if (!status) {
    return (
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="client-header-band"
        data-client="no"
      >
        <Chip color="gray">Není klient</Chip>
        <span className="text-sm text-muted">Organizace nemá stav klienta.</span>
        {canWrite && (
          <Button
            size="sm"
            loading={toLead.isPending}
            onClick={() =>
              toLead.mutate(
                { companyId: id, status: "lead" },
                { onError: (e) => errorToast(e.message) },
              )
            }
            data-testid="client-mark"
          >
            <Icon name="handshake" /> Označit jako klienta (Lead)
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className="space-y-2"
      data-testid="client-header-band"
      data-client="yes"
      data-status={status}
    >
      <HideEmptyTabs hidden={tabs.data?.hidden ?? []} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          disabled={!canWrite}
          onClick={() => setDialog(true)}
          aria-label="Změnit stav klienta"
          className="rounded-full"
          data-testid="client-status"
        >
          <Chip color={CLIENT_STATUS_COLORS[status]} dot>
            {CLIENT_STATUS_LABELS[status]}
          </Chip>
        </button>
        <ServicesMenu companyId={id} value={asServices(row.services)} canEdit={canWrite} />
        {owner && (
          <span className="text-sm text-muted" data-testid="client-owner">
            <Icon name="user" className="mr-1 inline size-3.5" />
            {owner}
          </span>
        )}
        {typeof row.clientSince === "string" && row.clientSince && (
          <span className="text-sm text-muted" data-testid="client-since">
            Klient od {formatDate(row.clientSince)}
          </span>
        )}
        {status === "former" && typeof row.clientUntil === "string" && row.clientUntil && (
          <span className="text-sm text-muted">do {formatDate(row.clientUntil)}</span>
        )}
        {tags.length > 0 && (
          <span className="flex flex-wrap gap-1" data-testid="client-tags">
            {tags.map((t) => (
              <Chip key={t} color="gray">
                {t}
              </Chip>
            ))}
          </span>
        )}
      </div>
      {status === "former" && typeof row.clientEndReason === "string" && row.clientEndReason && (
        <p className="text-sm text-muted" data-testid="client-end-reason">
          Spolupráce skončila: {row.clientEndReason}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 max-sm:hidden" data-testid="client-actions">
        {phone && (
          <a
            href={phone}
            className={linkButton()}
            data-testid="client-call"
            title={primary ? `Zavolat: ${primary.name}` : "Zavolat"}
          >
            <Icon name="phone" /> Zavolat{primary ? ` (${primary.name})` : ""}
          </a>
        )}
        {web && (
          <a
            href={web}
            target="_blank"
            rel="noopener noreferrer"
            className={linkButton()}
            data-testid="client-web"
          >
            <Icon name="globe" /> Web
          </a>
        )}
        {address && (
          <a
            href={mapsHref(address)}
            target="_blank"
            rel="noopener noreferrer"
            className={linkButton()}
            data-testid="client-navigate"
          >
            <Icon name="map-pin" /> Navigovat
          </a>
        )}
        {can("zakazky.create") && (
          <Link href={newJobHref(id)} className={linkButton()} data-testid="client-new-job">
            <Icon name="briefcase" /> Nová zakázka
          </Link>
        )}
        {can("obchody.create") && (
          <Link href={newDealHref(id)} className={linkButton()} data-testid="client-new-deal">
            <Icon name="target" /> Nový obchod
          </Link>
        )}
      </div>
      <StatusDialog companyId={id} current={status} open={dialog} onOpenChange={setDialog} />
    </div>
  );
};
