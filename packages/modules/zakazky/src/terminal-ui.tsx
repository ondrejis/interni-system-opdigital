"use client";

import { formatDate } from "@rebar/core/shared";
import {
  ButtonLink,
  Chip,
  Skeleton,
  TerminalCard,
  TerminalEmpty,
  useCommandQuery,
  useModuleUi,
  type TerminalWidgetProps,
} from "@rebar/ui";
import { MapPin, Phone } from "lucide-react";
import type { TerminalSite } from "./terminal-shared";

type Phase = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  milestone: boolean;
  mine: boolean;
  running: boolean;
  note: string | null;
};
type Today = { today: string; jobs: { jobId: string; diaryWritten: boolean; phases: Phase[] }[] };

/** Odkaz do mapy: souřadnice stavby, jinak adresa. */
const mapHref = (s: TerminalSite) =>
  `https://mapy.cz/zakladni?q=${encodeURIComponent(
    s.lat !== null && s.lng !== null ? `${s.lat},${s.lng}` : (s.address ?? s.title),
  )}`;
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Lidé na místě: kontaktní osoba zákazníka, vedoucí a kolegové z týmu, každý s tlačítkem „Zavolat“. */
function People({ site: s }: { site: TerminalSite }) {
  const people = [
    ...(s.contact
      ? [
          {
            name: s.contact.name,
            role: ["Kontakt na místě", s.contact.position].filter(Boolean).join(" · "),
            phone: s.contact.phone,
          },
        ]
      : []),
    ...(s.manager
      ? [{ name: s.manager.name, role: "Vedoucí zakázky", phone: s.manager.phone }]
      : []),
    ...s.team.map((m) => ({ name: m.name, role: m.role || "Tým", phone: m.phone })),
  ];
  if (!people.length) return null;
  return (
    <ul className="mt-3 space-y-2 border-t border-line pt-3" aria-label="Lidé na místě">
      {people.map((p) => (
        <li key={`${p.role}-${p.name}`} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-medium leading-snug">{p.name}</div>
            <div className="text-base text-muted">{p.role}</div>
          </div>
          {p.phone && (
            <ButtonLink
              href={telHref(p.phone)}
              className="shrink-0"
              aria-label={`Zavolat: ${p.name}`}
            >
              <Phone /> Zavolat
            </ButtonLink>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Dnes na stavbě: zakázky, na kterých se pracuje, s navigací, kontakty na místě a dnešní prací z harmonogramu. */
export function TodayTerminalWidget({ label, variant, pageHref }: TerminalWidgetProps) {
  const detailed = variant === "page";
  const hasRealizace = useModuleUi().has("realizace");
  const sites = useCommandQuery<{ sites: TerminalSite[] }>("zakazky.terminal.sites", {});
  const today = useCommandQuery<Today>("realizace.terminal.today", {}, { enabled: hasRealizace });
  const list = sites.data?.sites ?? [];
  const shown = detailed ? list : list.slice(0, 3);
  const phasesOf = (id: string) => today.data?.jobs.find((j) => j.jobId === id);

  return (
    <TerminalCard
      title={label}
      icon="map-pin"
      href={variant === "card" ? pageHref : null}
      testId="tile-zakazky.today"
      bare={variant === "page"}
    >
      {sites.isLoading ? (
        <Skeleton className="h-24" />
      ) : sites.isError && !sites.data ? (
        <TerminalEmpty>Zakázky se nepodařilo načíst. Zkontrolujte připojení.</TerminalEmpty>
      ) : shown.length === 0 ? (
        <TerminalEmpty>Teď nemáte přidělenou žádnou zakázku v realizaci.</TerminalEmpty>
      ) : (
        <ul className="space-y-3">
          {shown.map((s) => {
            const info = phasesOf(s.id);
            const phases = (info?.phases ?? [])
              .filter((p) => detailed || p.running)
              .slice(0, detailed ? 12 : 2);
            return (
              <li
                key={s.id}
                data-testid="site"
                className="rounded-xl border border-line bg-subtle p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[17px] font-semibold leading-snug">{s.title}</div>
                    <div className="text-base text-muted">{s.number}</div>
                  </div>
                  {s.phase === "handover" && <Chip color="orange">Předání</Chip>}
                </div>

                {s.address && (
                  <p className="mt-2 flex items-start gap-1.5 text-base">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
                    <span>{s.address}</span>
                  </p>
                )}

                {phases.length > 0 && (
                  <ul className="mt-2 space-y-1.5" aria-label="Dnešní práce">
                    {phases.map((p) => (
                      <li key={p.id} className="rounded-lg bg-bg px-3 py-2 text-base">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted">
                          {p.running
                            ? ` · do ${formatDate(p.endDate)} · ${p.progress} %`
                            : ` · začíná ${formatDate(p.startDate)}`}
                        </span>
                        {p.mine && (
                          <span className="ml-2 inline-block align-middle">
                            <Chip color="blue">Moje</Chip>
                          </span>
                        )}
                        {detailed && p.note && <span className="block text-muted">{p.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 grid gap-2">
                  {s.address && (
                    <ButtonLink href={mapHref(s)} external variant="primary">
                      <MapPin /> Navigovat
                    </ButtonLink>
                  )}
                  {!detailed && s.contact?.phone && (
                    <ButtonLink href={telHref(s.contact.phone)}>
                      <Phone /> {s.contact.name}
                    </ButtonLink>
                  )}
                </div>

                {detailed && <People site={s} />}
              </li>
            );
          })}
        </ul>
      )}
      {!detailed && list.length > shown.length && (
        <p className="mt-2 text-base text-muted">A dalších {list.length - shown.length} zakázek.</p>
      )}
    </TerminalCard>
  );
}
