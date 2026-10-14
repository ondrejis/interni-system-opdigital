"use client";

import { formatDate, formatMinor, type Labels, type RecordRow } from "@rebar/core/shared";
import {
  Icon,
  Skeleton,
  cn,
  useEntityApi,
  useEntityDescriptor,
  useEntityRecord,
  useNav,
  useUpdateAttribute,
  type RecordDialogParts,
} from "@rebar/ui";
import type { ReactNode } from "react";
import { ParticipantsCard } from "../inbox/components";
import { WorkPanel } from "../activities/components";
import { daysSince, effectiveProbabilityPct } from "../logic";
import { AttrField, FieldRow, Section } from "./fields";
import { dealAge } from "./logic";
import { useDealHistory } from "./stage-strip";

/** Odkaz na související záznam (firma, osoba): název s odkazem na jeho stránku. */
function RecordChip({
  entityType,
  id,
  labels,
  attrKey,
}: {
  entityType: string;
  id: string;
  labels: Labels;
  attrKey: string;
}) {
  const api = useEntityApi();
  const { Link } = useNav();
  const href = api.hrefFor(entityType, id);
  const label = labels[attrKey]?.[id]?.label ?? "…";
  return href ? (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex min-w-0 max-w-full items-center gap-1 text-accent hover:underline"
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      <Icon name="external-link" className="size-3 shrink-0" />
    </Link>
  ) : (
    <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
  );
}

function ContactLine({
  icon,
  children,
  href,
}: {
  icon: string;
  children: ReactNode;
  href?: string;
}) {
  const body = <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>;
  return (
    <div className="flex min-h-6 items-start gap-2 px-1 text-sm text-muted">
      <Icon name={icon} className="mt-0.5 size-3.5 shrink-0 text-faint" />
      {href ? (
        <a href={href} className="min-w-0 [overflow-wrap:anywhere] hover:text-fg hover:underline">
          {children}
        </a>
      ) : (
        body
      )}
    </div>
  );
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Kontakt přímo v detailu: telefon, e-mail a další údaje osoby nebo firmy bez prokliku. */
function ContactCard({ entityType, id }: { entityType: "company" | "person"; id: string }) {
  const q = useEntityRecord(entityType, id);
  if (q.isLoading) return <Skeleton className="mx-1 my-1 h-10" />;
  const r = q.data?.row;
  if (!r) return null;
  const lines: { icon: string; text: string; href?: string }[] = [];
  const email = str(r.email);
  const phone = str(r.phone);
  const web = str(r.web);
  if (entityType === "person" && str(r.position))
    lines.push({ icon: "user", text: str(r.position)! });
  if (entityType === "company" && str(r.ico))
    lines.push({ icon: "building-2", text: `IČO ${str(r.ico)}` });
  if (entityType === "company" && str(r.city)) lines.push({ icon: "map-pin", text: str(r.city)! });
  if (phone) lines.push({ icon: "phone", text: phone, href: `tel:${phone.replace(/\s+/g, "")}` });
  if (email) lines.push({ icon: "mail", text: email, href: `mailto:${email}` });
  if (web)
    lines.push({
      icon: "globe",
      text: web.replace(/^https?:\/\//, ""),
      href: /^https?:\/\//.test(web) ? web : `https://${web}`,
    });
  if (!lines.length) return null;
  return (
    <div className="mt-0.5 mb-1 space-y-0.5" data-testid={`contact-${entityType}`}>
      {lines.map((l) => (
        <ContactLine key={l.icon + l.text} icon={l.icon} {...(l.href ? { href: l.href } : {})}>
          {l.text}
        </ContactLine>
      ))}
    </div>
  );
}

/** Pravděpodobnost výhry: platná hodnota (stav, nebo ruční přepsání), úprava na klik a návrat k hodnotě stavu. */
function ProbabilityField({
  parts,
  stageProbability,
}: {
  parts: RecordDialogParts;
  stageProbability: number | null;
}) {
  const { entity, id, row, labels } = parts;
  const update = useUpdateAttribute(entity.key);
  const manual =
    row.crmProbabilityPct !== null && row.crmProbabilityPct !== undefined
      ? Number(row.crmProbabilityPct)
      : null;
  const effective = effectiveProbabilityPct(
    { phase: String(row.phase ?? ""), crmProbabilityPct: manual },
    { probabilityPct: stageProbability },
  );
  if (!entity.attributes.some((a) => a.key === "crmProbabilityPct")) return null;
  return (
    <AttrField
      entity={entity}
      attrKey="crmProbabilityPct"
      row={row}
      labels={labels}
      label="Pravděpodobnost"
      display={
        <span className="tabular flex items-center gap-1.5" data-testid="deal-probability">
          {effective} %
          {manual !== null && (
            <span className="rounded bg-hover px-1 text-xs text-muted">ručně</span>
          )}
        </span>
      }
      hint={
        manual !== null ? (
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() =>
              void update.mutateAsync({
                id,
                attr: "crmProbabilityPct",
                value: null,
                updatedAt: row.updatedAt,
              })
            }
          >
            Vrátit hodnotu stavu{stageProbability !== null ? ` (${stageProbability} %)` : ""}
          </button>
        ) : stageProbability !== null ? (
          "Podle stavu zakázky, klikem ji přepíšete."
        ) : undefined
      }
    />
  );
}

/** Levý sloupec: sbalitelné sekce Souhrn, Podrobnosti, Osoba a Firma, Účastníci a Přehled. */
function Sections({ parts }: { parts: RecordDialogParts }) {
  const { entity, id, row, labels } = parts;
  const full = useEntityDescriptor("job");
  const history = useDealHistory(id);
  const stage = full.data?.attributes
    .find((a) => a.key === "stage")
    ?.stages?.find((s) => s.id === row.stage);
  const stageProbability = stage?.probabilityPct ?? null;
  const contract = Number(row.value ?? 0);
  const ownValue = Number(row.value ?? 0);
  const hasValue = entity.attributes.some((a) => a.key === "value");
  const weighted = row.crmWeighted;
  const labelsAttr = entity.attributes.find(
    (a) => a.custom && a.type === "multiselect" && /štítk/i.test(a.label),
  );
  const customs = entity.attributes.filter((a) => a.custom && a.key !== labelsAttr?.key);
  const company = typeof row.company === "string" ? row.company : null;
  const person = typeof row.person === "string" ? row.person : null;
  const age = dealAge({
    createdAt: history.data?.[0]?.enteredAt ?? null,
    lastActivityAt: str(row.crmLastActivityAt),
    stageEnteredAt: str(row.crmStageEnteredAt),
  });
  const open = Number(row.crmOpenActivities ?? 0);
  const overdue = Number(row.crmOverdueActivities ?? 0);

  const filledCount = (keys: string[]) =>
    keys.filter((k) => {
      const v = row[k];
      return !(v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length));
    }).length;
  const detailKeys = ["address", "siteCity", ...customs.map((a) => a.key), "description"].filter(
    (k) => entity.attributes.some((a) => a.key === k),
  );
  const detailsFilled = filledCount(detailKeys);

  return (
    <div className="space-y-3" data-testid="deal-sections">
      <Section id="summary" title="Souhrn">
        {hasValue && (
          <AttrField
            entity={entity}
            attrKey="value"
            row={row}
            labels={labels}
            label="Hodnota"
            display={
              contract > 0 || ownValue > 0 ? (
                <span className="tabular font-medium" data-testid="deal-value">
                  {formatMinor(ownValue > 0 ? ownValue : contract)}
                </span>
              ) : (
                <span className="text-faint">Zadat hodnotu…</span>
              )
            }
            hint={
              ownValue === 0 && contract > 0
                ? "Cena nabídky z rozpočtu, klikem zadáte vlastní."
                : undefined
            }
          />
        )}
        {entity.attributes.some((a) => a.key === "crmWeighted") && (
          <FieldRow label="Vážená hodnota" testId="deal-weighted">
            <span className="tabular flex min-h-7 items-center px-1 py-0.5 pointer-coarse:min-h-11">
              {weighted === null || weighted === undefined ? "—" : formatMinor(Number(weighted))}
            </span>
          </FieldRow>
        )}
        <ProbabilityField parts={parts} stageProbability={stageProbability} />
        <AttrField
          entity={entity}
          attrKey="expectedCloseDate"
          row={row}
          labels={labels}
          label="Uzavření"
          placeholder="Nastavit datum…"
        />
        {labelsAttr && (
          <AttrField
            entity={entity}
            attrKey={labelsAttr.key}
            row={row}
            labels={labels}
            label="Štítky"
          />
        )}
      </Section>

      <Section id="contacts" title="Osoba a Firma" collapseOnPhone>
        <AttrField
          entity={entity}
          attrKey="company"
          row={row}
          labels={labels}
          label="Firma"
          {...(company
            ? {
                display: (
                  <RecordChip entityType="company" id={company} labels={labels} attrKey="company" />
                ),
                below: <ContactCard entityType="company" id={company} />,
              }
            : {})}
        />
        <AttrField
          entity={entity}
          attrKey="person"
          row={row}
          labels={labels}
          label="Osoba"
          {...(person
            ? {
                display: (
                  <RecordChip entityType="person" id={person} labels={labels} attrKey="person" />
                ),
                below: <ContactCard entityType="person" id={person} />,
              }
            : {})}
        />
      </Section>

      <Section
        id="details"
        title="Podrobnosti"
        collapseOnPhone
        summary={detailKeys.length ? `${detailsFilled} z ${detailKeys.length}` : undefined}
      >
        <AttrField
          entity={entity}
          attrKey="address"
          row={row}
          labels={labels}
          label="Adresa stavby"
        />
        <AttrField
          entity={entity}
          attrKey="siteCity"
          row={row}
          labels={labels}
          label="Obec stavby"
        />
        {customs.map((a) => (
          <AttrField key={a.key} entity={entity} attrKey={a.key} row={row} labels={labels} />
        ))}
        <AttrField entity={entity} attrKey="description" row={row} labels={labels} label="Popis" />
      </Section>

      <div data-testid="deal-section-participants">
        <ParticipantsCard jobId={id} />
      </div>

      <Section id="origin" title="Původ">
        <AttrField entity={entity} attrKey="crmSource" row={row} labels={labels} label="Zdroj" />
        {str(row.crmSourceChannel) && (
          <AttrField
            entity={entity}
            attrKey="crmSourceChannel"
            row={row}
            labels={labels}
            label="Kanál"
          />
        )}
        {str(row.crmCampaign) && (
          <AttrField
            entity={entity}
            attrKey="crmCampaign"
            row={row}
            labels={labels}
            label="Kampaň"
          />
        )}
      </Section>

      <Section id="overview" title="Přehled" defaultOpen={false}>
        <FieldRow label="Stáří" testId="deal-age">
          <span className="tabular flex min-h-7 items-center px-1 py-0.5 pointer-coarse:min-h-11">
            {days(age.ageDays)}
          </span>
        </FieldRow>
        <FieldRow label="Neaktivní" testId="deal-inactive">
          <span
            className={cn(
              "tabular flex min-h-7 items-center px-1 py-0.5 pointer-coarse:min-h-11",
              !!row.crmRotting && "text-danger",
            )}
          >
            {days(age.inactiveDays)}
          </span>
        </FieldRow>
        <FieldRow label="Aktivity">
          <span className="tabular flex min-h-7 items-center px-1 py-0.5 pointer-coarse:min-h-11">
            {open === 0 ? "Žádná otevřená" : `${open} otevřených`}
            {overdue > 0 && <span className="ml-1.5 text-danger">({overdue} po termínu)</span>}
          </span>
        </FieldRow>
        <FieldRow label="Ve stavu od">
          <span className="tabular flex min-h-7 items-center px-1 py-0.5 pointer-coarse:min-h-11">
            {row.crmStageEnteredAt ? formatDate(String(row.crmStageEnteredAt).slice(0, 10)) : "—"}
          </span>
        </FieldRow>
        <FieldRow label="Poslední aktivita">
          <span className="tabular flex min-h-7 items-center px-1 py-0.5 pointer-coarse:min-h-11">
            {row.crmLastActivityAt
              ? `${formatDate(String(row.crmLastActivityAt).slice(0, 10))} (před ${days(daysSince(String(row.crmLastActivityAt)))})`
              : "—"}
          </span>
        </FieldRow>
      </Section>
    </div>
  );
}

/** „3 dny“ s českým skloňováním. */
function days(n: number): string {
  if (n === 1) return "1 den";
  if (n >= 2 && n <= 4) return `${n} dny`;
  return `${n} dní`;
}

/**
 * Přehled zakázky v pop-upu: vlevo sbalitelné sekce s údaji (upravují se na místě), vpravo pracovní plocha (psací panel,
 * Další kroky, Historie). Každý sloupec se posouvá zvlášť; na úzkém displeji jsou sloupce pod sebou.
 */
export function DealOverview(parts: RecordDialogParts) {
  const { id } = parts;
  return (
    <div
      className="grid min-h-0 grid-cols-1 @[52rem]:h-full @[52rem]:grid-cols-[clamp(24rem,36%,30rem)_minmax(0,1fr)] @[52rem]:grid-rows-[minmax(0,1fr)]"
      data-testid="deal-overview"
    >
      <aside
        aria-label="Údaje zakázky"
        className="scrollbar-thin min-w-0 p-3 sm:p-4 @[52rem]:overflow-y-auto @[52rem]:border-r @[52rem]:border-line @[52rem]:pr-3"
      >
        <Sections parts={parts} />
      </aside>
      <section
        aria-label="Práce na zakázce"
        className="scrollbar-thin min-w-0 p-3 pt-0 sm:p-4 sm:pt-0 @[52rem]:overflow-y-auto @[52rem]:pt-4"
        data-testid="deal-work"
      >
        <WorkPanel jobId={id} />
      </section>
    </div>
  );
}

export type { RecordRow };
