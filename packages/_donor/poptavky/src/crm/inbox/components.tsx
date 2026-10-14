"use client";

import {
  Button,
  Combobox,
  DatePicker,
  Dialog,
  DialogContent,
  Field,
  Input,
  Kbd,
  MoneyInput,
  Textarea,
  modKey,
  successToast,
  useCommandMutation,
  useEntityApi,
} from "@rebar/ui";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  ContactCombobox,
  FirstActivityFields,
  IcoField,
  Section,
  defaultFirstActivity,
  isDuplicateMessage,
  toFirstActivity,
  useInboxOptions,
  type AresCompany,
  type ContactHit,
  type FirstActivityState,
} from "./forms";
import { ParticipantsCardBody } from "./participants";

/**
 * Veřejné komponenty oblasti Poptávky a kontakty pro ostatní oblasti CRM (docs/CRM.md → Oblast F).
 * Názvy a tvar props jsou smlouva s nástěnkou (oblast D); props jde jen volitelně rozšiřovat.
 */

type DuplicateMatch = {
  companies: { id: string; name: string; matchedBy: string[]; ico: string | null }[];
  persons: { id: string; name: string; matchedBy: string[]; companyId: string | null }[];
};
const BY: Record<string, string> = { ico: "IČO", email: "e-mail", phone: "telefon" };
const byText = (m: string[]) => m.map((x) => BY[x] ?? x).join(" a ");

type QuickAddProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Stav nástěnky, do kterého se zakázka zařadí (jinak první stav fáze Poptávka). */
  defaultStageId?: string | undefined;
  onCreated?: ((jobId: string) => void) | undefined;
  /** Předvyplněná firma (zakázka založená z detailu firmy). */
  defaultCompany?: { id: string; name: string } | undefined;
  /** Předvyplněná kontaktní osoba (zakázka založená z detailu osoby). */
  defaultPerson?: { id: string; name: string } | undefined;
};

type FormState = {
  person: ContactHit | null;
  contactName: string;
  phone: string;
  email: string;
  company: ContactHit | null;
  companyName: string;
  ico: string;
  companyType: string | null;
  ares: Pick<AresCompany, "dic" | "street" | "city" | "zip"> | null;
  title: string;
  address: string;
  siteCity: string;
  jobType: string | null;
  value: number | null;
  source: string | null;
  ownerId: string | null;
  expectedClose: string | null;
  stageId: string | null;
  note: string;
  activity: FirstActivityState;
};

const blank = (p: QuickAddProps, me: string): FormState => ({
  person: p.defaultPerson ? { id: p.defaultPerson.id, label: p.defaultPerson.name } : null,
  contactName: "",
  phone: "",
  email: "",
  company: p.defaultCompany ? { id: p.defaultCompany.id, label: p.defaultCompany.name } : null,
  companyName: "",
  ico: "",
  companyType: null,
  ares: null,
  title: "",
  address: "",
  siteCity: "",
  jobType: null,
  value: null,
  source: "phone",
  ownerId: me,
  expectedClose: null,
  stageId: p.defaultStageId ?? null,
  note: "",
  activity: defaultFirstActivity(),
});

/** Odstraní prázdné hodnoty z objektu (server je u nepovinných polí nechce prázdné). */
function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as Partial<T>;
}

/**
 * Rychlé zadání poptávky v jednom okně: kontakt (vyhledání existujícího nebo nový), firma (název nebo IČO s doplněním z ARES,
 * typ firmy), adresa stavby a město, typ zakázky, odhad hodnoty, zdroj, vlastník, předpokládané uzavření, stav a první
 * aktivita („Zavolat zítra v 9:00“). Jedním příkazem `crm.deal.quickAdd` vznikne firma, osoba i zakázka v jedné transakci
 * s kontrolou duplicit. `Cmd+Enter` uloží; uložení bez aktivity je jen záměrné tlačítko.
 */
export const QuickAddDealDialog: ComponentType<QuickAddProps> = (props) => {
  const { open, onOpenChange, onCreated } = props;
  const api = useEntityApi();
  const options = useInboxOptions(open);
  const [f, setF] = useState<FormState>(() => blank(props, api.me.id));
  const [error, setError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<DuplicateMatch | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  const sending = useRef(false);
  const set = (patch: Partial<FormState>) => setF((s) => ({ ...s, ...patch }));

  // formulář se vyprázdní při otevření (ve vykreslování, ne v efektu, aby nesmazal to, co už uživatel napsal)
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setF(blank(props, api.me.id));
      setError(null);
      setDupes(null);
    }
  }

  // živá kontrola duplicit podle telefonu, e-mailu a IČO (jen když kontakt ještě není vybraný)
  useEffect(() => {
    if (!open) return;
    const q = {
      ...(!f.person && f.phone.replace(/\D/g, "").length >= 9 ? { phone: f.phone } : {}),
      ...(!f.person && f.email.includes("@") ? { email: f.email } : {}),
      ...(!f.company && f.ico.replace(/\D/g, "").length >= 6 ? { ico: f.ico } : {}),
    };
    if (!Object.keys(q).length) {
      setDupes(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .command<unknown, DuplicateMatch>("kontakty.duplicates", q)
        .then((r) => !cancelled && setDupes(r.companies.length || r.persons.length ? r : null))
        .catch(() => !cancelled && setDupes(null));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, f.phone, f.email, f.ico, f.person, f.company, api]);

  const create = useCommandMutation<Record<string, unknown>, { jobId: string }>(
    "crm.deal.quickAdd",
  );
  const [dupAsk, setDupAsk] = useState<string | null>(null);

  async function submit(opts: { skipActivity: boolean; duplicates?: "ask" | "use" | "create" }) {
    if (sending.current) return;
    setError(null);
    setDupAsk(null);
    const activity = opts.skipActivity ? null : toFirstActivity(f.activity);
    if (!opts.skipActivity && !activity)
      return setError(
        "Naplánujte první aktivitu (předmět a termín), nebo zvolte „Uložit bez aktivity“.",
      );
    if (!f.person && !f.company && !f.contactName.trim() && !f.companyName.trim())
      return setError("Vyplňte kontakt (jméno, telefon nebo e-mail) nebo firmu.");
    sending.current = true;
    try {
      const data = f.company
        ? undefined
        : compact({
            ...(f.ares ?? {}),
            ...(f.companyName.trim() ? { name: f.companyName.trim() } : {}),
            type: f.companyType,
          });
      const res = await create.mutateAsync({
        contact: f.person
          ? { personId: f.person.id }
          : compact({ name: f.contactName.trim(), phone: f.phone.trim(), email: f.email.trim() }),
        company: f.company
          ? { companyId: f.company.id }
          : compact({
              name: f.companyName.trim(),
              ico: f.ico.trim(),
              ...(data && Object.keys(data).length ? { data } : {}),
            }),
        duplicates: opts.duplicates ?? "ask",
        ...compact({
          title: f.title.trim(),
          address: f.address.trim(),
          siteCity: f.siteCity.trim(),
          jobType: f.jobType,
          valueMinor: f.value ?? undefined,
          source: f.source,
          ownerId: f.ownerId,
          expectedCloseDate: f.expectedClose,
          stageId: f.stageId,
          description: f.note.trim(),
        }),
        ...(activity ? { firstActivity: activity } : { skipFirstActivity: true }),
      });
      successToast("Poptávka je založená.");
      onOpenChange(false);
      onCreated?.(res.jobId);
    } catch (e) {
      const m = (e as Error).message;
      if (isDuplicateMessage(m)) setDupAsk(m);
      else setError(m);
    } finally {
      sending.current = false;
    }
  }

  const types = options.data?.activityTypes ?? [];
  const usePerson = (m: DuplicateMatch["persons"][number]) => {
    set({ person: { id: m.id, label: m.name } });
    setDupes(null);
  };
  const useCompany = (m: DuplicateMatch["companies"][number]) => {
    set({ company: { id: m.id, label: m.name } });
    setDupes(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Nová poptávka"
        description="Rychlé zadání: kontakt, firma, stavba a první aktivita v jednom kroku."
        className="w-[min(46rem,calc(100vw-2rem))]"
      >
        <form
          data-testid="quick-add"
          className="px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ skipActivity: false });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit({ skipActivity: false });
            }
          }}
        >
          <Section title="Kontakt">
            {f.person ? (
              <Field label="Kontaktní osoba">
                <div className="flex h-8 items-center justify-between gap-2 rounded-md border border-line-strong px-2.5">
                  <span className="truncate">{f.person.label}</span>
                  <button
                    type="button"
                    className="text-sm text-accent hover:underline"
                    onClick={() => set({ person: null })}
                  >
                    Změnit
                  </button>
                </div>
              </Field>
            ) : (
              <>
                <Field label="Existující osoba">
                  <ContactCombobox
                    kind="person"
                    value={null}
                    onChange={(hit) => hit && set({ person: hit })}
                    placeholder="Hledat podle jména, telefonu nebo e-mailu…"
                    ariaLabel="Existující osoba"
                  />
                </Field>
                <div className="grid gap-x-3 sm:grid-cols-3">
                  <Field label="Jméno a příjmení">
                    <Input
                      autoFocus
                      value={f.contactName}
                      onChange={(e) => set({ contactName: e.target.value })}
                      maxLength={200}
                    />
                  </Field>
                  <Field label="Telefon">
                    <Input
                      value={f.phone}
                      onChange={(e) => set({ phone: e.target.value })}
                      inputMode="tel"
                      maxLength={40}
                    />
                  </Field>
                  <Field label="E-mail">
                    <Input
                      type="email"
                      value={f.email}
                      onChange={(e) => set({ email: e.target.value })}
                      maxLength={200}
                    />
                  </Field>
                </div>
              </>
            )}
            {dupes && dupes.persons.length > 0 && !f.person && (
              <div
                role="status"
                className="mb-3 space-y-1.5 rounded-md border border-accent-line bg-accent-soft p-3"
              >
                <p className="font-medium">Tuhle osobu už máte v kontaktech:</p>
                {dupes.persons.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {m.name} <span className="text-muted">({byText(m.matchedBy)})</span>
                    </span>
                    <Button size="sm" onClick={() => usePerson(m)}>
                      Použít
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Firma">
            {f.company ? (
              <Field label="Firma">
                <div className="flex h-8 items-center justify-between gap-2 rounded-md border border-line-strong px-2.5">
                  <span className="truncate">{f.company.label}</span>
                  <button
                    type="button"
                    className="text-sm text-accent hover:underline"
                    onClick={() => set({ company: null })}
                  >
                    Změnit
                  </button>
                </div>
              </Field>
            ) : (
              <>
                <Field label="Existující firma">
                  <ContactCombobox
                    kind="company"
                    value={null}
                    onChange={(hit) => hit && set({ company: hit })}
                    placeholder="Hledat podle názvu nebo IČO…"
                    ariaLabel="Existující firma"
                  />
                </Field>
                <div className="grid gap-x-3 sm:grid-cols-2">
                  <Field label="Název nové firmy" hint="Bez firmy se založí podle jména kontaktu.">
                    <Input
                      value={f.companyName}
                      onChange={(e) => set({ companyName: e.target.value })}
                      maxLength={200}
                    />
                  </Field>
                  <Field label="Typ firmy">
                    <Combobox
                      aria-label="Typ firmy"
                      options={options.data?.companyTypes ?? []}
                      value={f.companyType}
                      onChange={(v) => set({ companyType: v as string | null })}
                      placeholder="Vybrat typ"
                      clearable
                    />
                  </Field>
                </div>
                <IcoField
                  value={f.ico}
                  onChange={(ico) => set({ ico })}
                  onFound={(c) =>
                    set({
                      ico: c.ico,
                      companyName: c.name,
                      ares: { dic: c.dic, street: c.street, city: c.city, zip: c.zip },
                      siteCity: f.siteCity || c.city || "",
                    })
                  }
                />
              </>
            )}
            {dupes && dupes.companies.length > 0 && !f.company && (
              <div
                role="status"
                className="mb-3 space-y-1.5 rounded-md border border-accent-line bg-accent-soft p-3"
              >
                <p className="font-medium">Tuhle firmu už máte v kontaktech:</p>
                {dupes.companies.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {m.name} <span className="text-muted">({byText(m.matchedBy)})</span>
                    </span>
                    <Button size="sm" onClick={() => useCompany(m)}>
                      Použít
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Zakázka">
            <Field label="Název" hint="Nevyplníte-li, složí se z firmy a adresy.">
              <Input
                value={f.title}
                onChange={(e) => set({ title: e.target.value })}
                maxLength={200}
              />
            </Field>
            <div className="grid gap-x-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Field label="Adresa stavby">
                  <Input
                    value={f.address}
                    onChange={(e) => set({ address: e.target.value })}
                    maxLength={300}
                  />
                </Field>
              </div>
              <Field label="Obec">
                <Input
                  value={f.siteCity}
                  onChange={(e) => set({ siteCity: e.target.value })}
                  maxLength={120}
                />
              </Field>
            </div>
            <div className="grid gap-x-3 sm:grid-cols-2">
              {(options.data?.jobTypes.length ?? 0) > 0 && (
                <Field label="Typ zakázky">
                  <Combobox
                    aria-label="Typ zakázky"
                    options={options.data?.jobTypes ?? []}
                    value={f.jobType}
                    onChange={(v) => set({ jobType: v as string | null })}
                    placeholder="Vybrat typ"
                    clearable
                  />
                </Field>
              )}
              <Field label="Odhad hodnoty (Kč)">
                <MoneyInput
                  aria-label="Odhad hodnoty"
                  value={f.value}
                  onChange={(value) => set({ value })}
                />
              </Field>
              <Field label="Zdroj">
                <Combobox
                  aria-label="Zdroj"
                  options={options.data?.sources ?? []}
                  value={f.source}
                  onChange={(v) => set({ source: v as string | null })}
                  placeholder="Vybrat zdroj"
                  clearable
                />
              </Field>
              <Field label="Vlastník">
                <Combobox
                  aria-label="Vlastník"
                  load={api.lookups.users}
                  value={f.ownerId}
                  selectedLabels={f.ownerId === api.me.id ? { [api.me.id]: api.me.name } : {}}
                  onChange={(v) => set({ ownerId: v as string | null })}
                  placeholder="Vybrat uživatele"
                />
              </Field>
              <Field label="Předpokládané uzavření">
                <DatePicker
                  value={f.expectedClose}
                  onChange={(d) => set({ expectedClose: d })}
                  placeholder="Vybrat datum"
                />
              </Field>
              <Field label="Stav">
                <Combobox
                  aria-label="Stav"
                  options={(options.data?.stages ?? []).map((s) => ({
                    value: s.id,
                    label: s.name,
                    color: s.color,
                  }))}
                  value={f.stageId ?? options.data?.stages[0]?.id ?? null}
                  onChange={(v) => set({ stageId: v as string | null })}
                />
              </Field>
            </div>
            <Field label="Poznámka">
              <Textarea
                value={f.note}
                onChange={(e) => set({ note: e.target.value })}
                maxLength={5000}
                rows={2}
              />
            </Field>
          </Section>

          <Section title="První aktivita">
            <FirstActivityFields
              value={f.activity}
              onChange={(activity) => set({ activity })}
              types={types}
            />
          </Section>

          {dupAsk && (
            <div
              role="alert"
              className="mb-3 space-y-2 rounded-md border border-warning bg-warning-soft p-3"
            >
              <p>{dupAsk}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void submit({ skipActivity: false, duplicates: "use" })}
                >
                  Použít nalezený záznam
                </Button>
                <Button
                  size="sm"
                  onClick={() => void submit({ skipActivity: false, duplicates: "create" })}
                >
                  Založit nový
                </Button>
              </div>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <span className="hidden items-center gap-1 text-sm text-faint sm:flex">
              <Kbd>{modKey()}</Kbd>
              <Kbd>Enter</Kbd> uloží
            </span>
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Zrušit
              </Button>
              <Button
                onClick={() => void submit({ skipActivity: true })}
                disabled={create.isPending}
                data-testid="quick-add-no-activity"
              >
                Uložit bez aktivity
              </Button>
              <Button type="submit" variant="primary" loading={create.isPending}>
                Uložit
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** Karta „Účastníci“ zakázky (osoba + role: investor, TDI, projektant…) s přidáním, změnou role a odebráním. */
export const ParticipantsCard: ComponentType<{ jobId: string }> = ({ jobId }) => (
  <ParticipantsCardBody jobId={jobId} />
);
