"use client";

import {
  Button,
  Combobox,
  Field,
  Input,
  Kbd,
  Skeleton,
  modKey,
  successToast,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  type RecordAction,
} from "@rebar/ui";
import type { EntityDescriptor, RecordRow } from "@rebar/core/shared";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FirstActivityFields,
  IcoField,
  Section,
  defaultFirstActivity,
  toFirstActivity,
  useInboxOptions,
  type AresCompany,
  type FirstActivityState,
} from "./forms";

type Match = { id: string; name: string; matchedBy: string[] };
type Duplicates = { companies: (Match & { ico: string | null })[]; persons: Match[] };
type Preview = {
  inquiry: {
    id: string;
    title: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    companyName: string | null;
    message: string | null;
    source: string | null;
    convertedJobId: string | null;
    companyId: string | null;
    personId: string | null;
    linked: { company: string | null; person: string | null };
  };
  duplicates: Duplicates;
};
const BY: Record<string, string> = { ico: "IČO", email: "e-mail", phone: "telefon" };
const byText = (m: string[]) => m.map((x) => BY[x] ?? x).join(" a ");
const NEW = "__new";

/** Volba mezi nalezenými záznamy a založením nového (přepínače). */
function Choice({
  name,
  value,
  current,
  onSelect,
  children,
}: {
  name: string;
  value: string;
  current: string;
  onSelect: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-line px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
      <input
        type="radio"
        name={name}
        value={value}
        checked={current === value}
        onChange={() => onSelect(value)}
        className="mt-1 accent-[var(--accent)]"
      />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

/**
 * Kvalifikace poptávky: nabídne nalezené existující firmy a osoby (IČO, e-mail, telefon) k použití nebo založení nové,
 * doplnění nové firmy z ARES, první aktivitu a po úspěchu otevře novou zakázku na nástěnce. „Uložit bez aktivity“ je
 * záměrné tlačítko, ne výchozí.
 */
function QualifyForm({
  id,
  close,
  push,
}: {
  id: string;
  close: () => void;
  push: (href: string) => void;
}) {
  const api = useEntityApi();
  const preview = useCommandQuery<Preview>("crm.inbox.qualifyPreview", { id });
  const options = useInboxOptions();
  const [title, setTitle] = useState<string | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [ico, setIco] = useState("");
  const [companyType, setCompanyType] = useState<string | null>(null);
  const [ares, setAres] = useState<Omit<AresCompany, "ico" | "name"> | null>(null);
  const [activity, setActivity] = useState<FirstActivityState>(defaultFirstActivity);
  const [dupes, setDupes] = useState<Duplicates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  const inq = preview.data?.inquiry;
  const found = dupes ?? preview.data?.duplicates ?? { companies: [], persons: [] };

  // změna IČO přinese další shody (firma se stejným IČO je jednoznačná shoda)
  useEffect(() => {
    if (!inq || ico.replace(/\D/g, "").length < 6) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .command<unknown, Duplicates>("crm.contact.duplicates", {
          ico,
          ...(inq.contactEmail ? { email: inq.contactEmail } : {}),
          ...(inq.contactPhone ? { phone: inq.contactPhone } : {}),
        })
        .then((r) => !cancelled && setDupes(r))
        .catch(() => undefined);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [ico, inq, api]);

  // výchozí volba: nalezená firma / osoba, jinak nová
  const companyChoice =
    company ?? (inq?.companyId ? inq.companyId : (found.companies[0]?.id ?? NEW));
  const personChoice = person ?? (inq?.personId ? inq.personId : (found.persons[0]?.id ?? NEW));

  const convert = useCommandMutation<Record<string, unknown>, { jobId: string }>(
    "poptavky.convert",
  );

  async function submit(skipActivity: boolean) {
    if (sending.current || !inq) return;
    setError(null);
    const first = skipActivity ? null : toFirstActivity(activity);
    if (!skipActivity && !first)
      return setError(
        "Naplánujte první aktivitu (předmět a termín), nebo zvolte „Uložit bez aktivity“.",
      );
    sending.current = true;
    try {
      const newCompany = !inq.companyId && companyChoice === NEW;
      const res = await convert.mutateAsync({
        id,
        ...(title?.trim() ? { title: title.trim() } : {}),
        ...(!inq.companyId && companyChoice !== NEW ? { companyId: companyChoice } : {}),
        ...(!inq.personId && personChoice !== NEW ? { personId: personChoice } : {}),
        ...(ico.trim() ? { ico: ico.trim() } : {}),
        ...(newCompany
          ? {
              companyData: {
                ...(name?.trim() ? { name: name.trim() } : {}),
                ...(ares ? Object.fromEntries(Object.entries(ares).filter(([, v]) => v)) : {}),
                ...(companyType ? { type: companyType } : {}),
              },
            }
          : {}),
        // výběr uživatel udělal sám: nalezené duplicity se už neřeší ptaním
        duplicates: "create",
        ...(first ? { firstActivity: first } : {}),
      });
      successToast("Poptávka je kvalifikovaná, zakázka založená.");
      close();
      push(`/crm?record=${res.jobId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
    }
  }

  if (preview.isLoading) return <Skeleton className="m-5 h-40" />;
  if (preview.error || !inq)
    return (
      <p role="alert" className="px-5 py-4 text-danger">
        {preview.error?.message ?? "Poptávku se nepodařilo načíst."}
      </p>
    );
  if (inq.convertedJobId)
    return <p className="px-5 py-4 text-muted">Tato poptávka už je převedená na zakázku.</p>;

  const contactLine = [inq.contactName, inq.contactPhone, inq.contactEmail]
    .filter(Boolean)
    .join(" · ");

  return (
    <form
      data-testid="qualify-form"
      className="px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void submit(false);
        }
      }}
    >
      <div className="mb-3 rounded-md bg-subtle p-3 text-sm">
        <div className="font-medium">{inq.title}</div>
        {(contactLine || inq.companyName) && (
          <div className="text-muted">
            {[inq.companyName, contactLine].filter(Boolean).join(" · ")}
          </div>
        )}
        {inq.message && <div className="mt-1 line-clamp-3 text-muted">{inq.message}</div>}
      </div>

      <Section title="Zakázka">
        <Field label="Název zakázky">
          <Input
            value={title ?? inq.title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </Field>
      </Section>

      <Section title="Firma">
        {inq.companyId ? (
          <p className="mb-3">
            Firma z poptávky: <strong>{inq.linked.company ?? "vybraná firma"}</strong>
          </p>
        ) : (
          <div className="mb-3 space-y-1.5">
            {found.companies.map((m) => (
              <Choice
                key={m.id}
                name="company"
                value={m.id}
                current={companyChoice}
                onSelect={setCompany}
              >
                <span className="font-medium">Použít existující firmu: {m.name}</span>
                <span className="block text-sm text-muted">shoda: {byText(m.matchedBy)}</span>
              </Choice>
            ))}
            <Choice name="company" value={NEW} current={companyChoice} onSelect={setCompany}>
              <span className="font-medium">
                Založit novou firmu{found.companies.length ? " (i přes nalezenou shodu)" : ""}
              </span>
            </Choice>
          </div>
        )}
        {!inq.companyId && companyChoice === NEW && (
          <>
            <div className="grid gap-x-3 sm:grid-cols-2">
              <Field label="Název firmy">
                <Input
                  value={name ?? inq.companyName ?? inq.contactName ?? ""}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                />
              </Field>
              <Field label="Typ firmy">
                <Combobox
                  aria-label="Typ firmy"
                  options={options.data?.companyTypes ?? []}
                  value={companyType}
                  onChange={(v) => setCompanyType(v as string | null)}
                  placeholder="Vybrat typ"
                  clearable
                />
              </Field>
            </div>
            <IcoField
              value={ico}
              onChange={setIco}
              onFound={(c) => {
                setIco(c.ico);
                setName(c.name);
                setAres({ dic: c.dic, street: c.street, city: c.city, zip: c.zip });
              }}
            />
          </>
        )}
      </Section>

      {(inq.contactName || found.persons.length > 0 || inq.personId) && (
        <Section title="Kontaktní osoba">
          {inq.personId ? (
            <p className="mb-3">
              Osoba z poptávky: <strong>{inq.linked.person ?? "vybraná osoba"}</strong>
            </p>
          ) : (
            <div className="mb-3 space-y-1.5">
              {found.persons.map((m) => (
                <Choice
                  key={m.id}
                  name="person"
                  value={m.id}
                  current={personChoice}
                  onSelect={setPerson}
                >
                  <span className="font-medium">Použít existující osobu: {m.name}</span>
                  <span className="block text-sm text-muted">shoda: {byText(m.matchedBy)}</span>
                </Choice>
              ))}
              {inq.contactName && (
                <Choice name="person" value={NEW} current={personChoice} onSelect={setPerson}>
                  <span className="font-medium">Založit novou osobu: {inq.contactName}</span>
                </Choice>
              )}
            </div>
          )}
        </Section>
      )}

      <Section title="První aktivita">
        <FirstActivityFields
          value={activity}
          onChange={setActivity}
          types={options.data?.activityTypes ?? []}
        />
      </Section>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <span className="hidden items-center gap-1 text-sm text-faint sm:flex">
          <Kbd>{modKey()}</Kbd>
          <Kbd>Enter</Kbd> kvalifikuje
        </span>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Zrušit
          </Button>
          <Button
            onClick={() => void submit(true)}
            disabled={convert.isPending}
            data-testid="qualify-no-activity"
          >
            Uložit bez aktivity
          </Button>
          <Button type="submit" variant="primary" loading={convert.isPending}>
            Kvalifikovat
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Zamítnutí poptávky s důvodem z číselníku. */
function RejectForm({ id, close }: { id: string; close: () => void }) {
  const options = useInboxOptions();
  const [reason, setReason] = useState<string | null>(null);
  const lost = useCommandMutation<{ id: string; reason: string }>("poptavky.markLost", {
    onSuccess: () => {
      successToast("Poptávka je zamítnutá.");
      close();
    },
  });
  return (
    <form
      className="px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason) lost.mutate({ id, reason });
      }}
    >
      <p className="mb-3 text-muted">
        Zamítnutá poptávka zůstane ve schránce ve stavu „Zamítnutá“ a nejde ji kvalifikovat.
      </p>
      <Field label="Důvod zamítnutí">
        <Combobox
          aria-label="Důvod zamítnutí"
          options={options.data?.inquiryLostReasons ?? []}
          value={reason}
          onChange={(v) => setReason(v as string | null)}
          placeholder="Vyberte důvod…"
        />
      </Field>
      {lost.error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {lost.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Zrušit
        </Button>
        <Button type="submit" variant="danger" disabled={!reason} loading={lost.isPending}>
          Zamítnout
        </Button>
      </div>
    </form>
  );
}

const kindOf = (entity: EntityDescriptor, row: RecordRow) =>
  entity.attributes.find((a) => a.key === "stage")?.stages?.find((st) => st.id === row.stage)?.kind;

/** Akce záznamu poptávky: Kvalifikovat (dialog), Otevřít zakázku, Zamítnout (dialog). */
export const inquiryActions: RecordAction[] = [
  {
    id: "convert",
    label: "Kvalifikovat",
    primary: true,
    permission: "poptavky.convert",
    visible: (row) => !row.convertedJob,
    dialog: {
      title: "Kvalifikovat poptávku",
      render: ({ id, entity, row, close, push }) =>
        kindOf(entity, row) === "lost" ? (
          <p className="px-5 py-4 text-muted">Zamítnutou poptávku nejde kvalifikovat.</p>
        ) : (
          <QualifyForm id={id} close={close} push={push} />
        ),
    },
  },
  {
    id: "open-job",
    label: "Otevřít zakázku",
    primary: true,
    visible: (row) => !!row.convertedJob,
    run(p) {
      p.push(`/crm?record=${String(p.row.convertedJob)}`);
    },
  },
  {
    id: "mark-lost",
    label: "Zamítnout",
    permission: "poptavky.write",
    visible: (row) => !row.convertedJob,
    dialog: {
      title: "Zamítnout poptávku",
      render: ({ id, entity, row, close }) =>
        kindOf(entity, row) === "lost" ? (
          <p className="px-5 py-4 text-muted">Poptávka už je zamítnutá.</p>
        ) : (
          <RejectForm id={id} close={close} />
        ),
    },
  },
];
