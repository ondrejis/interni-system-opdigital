"use client";

import { Icon, Skeleton, useCan, useCommandQuery, type RecordOverviewCard } from "@rebar/ui";
import { addressLine, mapsHref, telHref } from "../shared";
import { useClientSummary } from "./hooks";
import { linkButton } from "./link-button";

type FolderInfo = { state: "none" | "pending" | "ready" | "error" | "timeout"; url: string | null };

/**
 * Mobilní karta klienta (MOB-03): čtyři velká tlačítka Zavolat (hlavní kontakt), E-mail, Navigovat (adresa v mapách)
 * a Disk. Viditelná jen na telefonu (`sm:hidden`); pod ní následují karty kontaktů, zakázek, obchodů, úkolů a poznámek
 * z Přehledu ve stejném pořadí jako na počítači. Chybí-li údaj (telefon, adresa), tlačítko se nezobrazí.
 */
export function MobileClientCard({ id, row }: { id: string; row: Record<string, unknown> }) {
  const can = useCan();
  const summary = useClientSummary(id);
  const disk = useCommandQuery<FolderInfo, { entityType: "company"; id: string }>(
    "disk.folderState",
    { entityType: "company", id },
    { enabled: can("disk.read") },
  );
  if (summary.isLoading) return <Skeleton className="h-12 sm:hidden" />;
  const primary = summary.data?.summary.contacts.primary ?? null;
  const phone = telHref(primary?.phone ?? (typeof row.phone === "string" ? row.phone : null));
  const email = primary?.email ?? (typeof row.email === "string" && row.email ? row.email : null);
  const address = addressLine({
    street: row.street,
    city: row.city,
    zip: row.zip,
    country: row.country,
  });
  const folder = disk.data;
  return (
    <div className="space-y-2 sm:hidden" data-testid="mobile-client-card">
      {primary && (
        <p className="text-sm text-muted">
          <Icon name="user" className="mr-1 inline size-3.5" />
          {primary.name}
        </p>
      )}
      <div className="flex gap-2">
        {phone && (
          <a href={phone} className={linkButton(true)} data-testid="mobile-call">
            <Icon name="phone" /> Zavolat
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className={linkButton(true)} data-testid="mobile-mail">
            <Icon name="mail" /> E-mail
          </a>
        )}
      </div>
      <div className="flex gap-2">
        {address && (
          <a
            href={mapsHref(address)}
            target="_blank"
            rel="noopener noreferrer"
            className={linkButton(true)}
            data-testid="mobile-navigate"
          >
            <Icon name="map-pin" /> Navigovat
          </a>
        )}
        {folder?.state === "ready" && folder.url && (
          <a
            href={folder.url}
            target="_blank"
            rel="noopener noreferrer"
            className={linkButton(true)}
            data-testid="mobile-disk"
          >
            <Icon name="folder" /> Disk
          </a>
        )}
        {folder && folder.state !== "ready" && folder.state !== "none" && (
          <span className={`${linkButton(true)} opacity-60`} data-testid="mobile-disk-wait">
            <Icon name="folder" /> {folder.state === "pending" ? "Disk se vytváří" : "Disk: chyba"}
          </span>
        )}
      </div>
    </div>
  );
}

/** Karta Přehledu s mobilními tlačítky (pořadí před kartou kontaktů). */
export const mobileCard: RecordOverviewCard = {
  id: "klient-mobil",
  column: "main",
  order: 1,
  permission: "klienti.read",
  visible: (row) => typeof row.clientStatus === "string" && row.clientStatus !== "",
  render: ({ id, row }) => <MobileClientCard id={id} row={row} />,
};
