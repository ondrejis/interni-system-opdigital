"use client";

import type { Labels } from "@rebar/core/shared";
import { Avatar, Chip, useEntityApi, useNav, type RecordHeader } from "@rebar/ui";
import { Building2, MapPin, User } from "lucide-react";
import type { ReactNode } from "react";
import { PHASES, isPhaseKey } from "../lifecycle/phases";
import { PhaseButton } from "../lifecycle/ui";

const labelOf = (labels: Labels, attr: string, id: unknown) =>
  typeof id === "string" ? (labels[attr]?.[id]?.label ?? null) : null;

/** Adresa pro navigaci v mapách (Mapy.cz otevře trasu i na telefonu). */
export const mapsHref = (address: string) =>
  `https://mapy.cz/zakladni?q=${encodeURIComponent(address)}`;

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-sm text-muted">
      <span className="shrink-0 text-faint [&>svg]:size-3.5">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** Hlavička zakázky: fáze, zákazník, kontakt, odpovědný, adresa s mapou a hlavní akce podle fáze. */
export const JobHeader: RecordHeader = ({ entity, id, row, labels }) => {
  const api = useEntityApi();
  const { Link } = useNav();
  const phaseKey = isPhaseKey(row.phase) ? row.phase : null;
  const phase = phaseKey ? PHASES[phaseKey] : null;
  const company = typeof row.company === "string" ? row.company : null;
  const person = typeof row.person === "string" ? row.person : null;
  const manager = labelOf(labels, "manager", row.manager);
  const address = typeof row.address === "string" && row.address.trim() ? row.address.trim() : null;
  const companyHref = company ? api.hrefFor("company", company) : null;
  const personHref = person ? api.hrefFor("person", person) : null;

  return (
    <div className="space-y-2" data-testid="job-header">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          {phase && (
            <Chip color={phase.color} dot data-testid="job-phase">
              {phase.label}
            </Chip>
          )}
          {company && (
            <Meta icon={<Building2 />}>
              {companyHref ? (
                <Link href={companyHref} className="hover:text-fg hover:underline">
                  {labelOf(labels, "company", company) ?? "Zákazník"}
                </Link>
              ) : (
                (labelOf(labels, "company", company) ?? "Zákazník")
              )}
            </Meta>
          )}
          {person && (
            <Meta icon={<User />}>
              {personHref ? (
                <Link href={personHref} className="hover:text-fg hover:underline">
                  {labelOf(labels, "person", person) ?? "Kontakt"}
                </Link>
              ) : (
                (labelOf(labels, "person", person) ?? "Kontakt")
              )}
            </Meta>
          )}
          {manager && (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <Avatar name={manager} size={18} />
              <span className="truncate">{manager}</span>
            </span>
          )}
          {address && (
            <Meta icon={<MapPin />}>
              <a
                href={mapsHref(address)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Navigovat na adresu: ${address}`}
                className="hover:text-fg hover:underline"
              >
                {address}
              </a>
            </Meta>
          )}
        </div>
        {entity.can.write && (
          <span className="w-full shrink-0 sm:w-auto" data-testid="job-primary-action">
            <PhaseButton jobId={id} row={row} />
          </span>
        )}
      </div>
    </div>
  );
};
