"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Combobox,
  Input,
  Skeleton,
  successToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
  useEntityApi,
  useNav,
} from "@rebar/ui";
import { useState } from "react";
import type {
  CompanyContact,
  CompanyHit,
  CompanyDuplicateCheck,
  PersonCompanies,
  SetCompaniesInput,
} from "../contract";
import { ContactLinks } from "./contact-links";
import { QuickContactDialog, CompanyPicker } from "./quick-contact";

/** Seznam kontaktů organizace s voláním, psaním a kopírováním; rozhodující nahoře (KON-02, KON-04). */
export function CompanyContacts({ companyId, limit }: { companyId: string; limit?: number }) {
  const can = useCan();
  const nav = useNav();
  const q = useCommandQuery<CompanyContact[]>("kontakty.company.contacts", { companyId });
  const [adding, setAdding] = useState(false);
  const rows = (q.data ?? []).slice(0, limit ?? 1000);
  return (
    <Card aria-label="Kontakty" data-testid="company-contacts">
      <CardHeader
        title="Kontakty"
        count={q.data?.length}
        action={
          can("kontakty.create") ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              Přidat kontakt
            </Button>
          ) : undefined
        }
      />
      <CardBody flush>
        {q.isLoading ? (
          <Skeleton className="m-4 h-12" />
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted">Organizace zatím nemá žádný kontakt.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
              >
                <div className="min-w-0">
                  <a className="font-medium hover:underline" href={`/kontakty/osoby/${c.id}`}>
                    {c.name}
                  </a>
                  <div className="flex flex-wrap items-center gap-1 text-sm text-muted">
                    {c.position && <span>{c.position}</span>}
                    {c.role && <Chip>{c.role}</Chip>}
                    {c.isDecisionMaker && <Chip color="green">Rozhoduje</Chip>}
                    {!c.isPrimaryCompany && <Chip color="gray">další organizace</Chip>}
                  </div>
                </div>
                <ContactLinks phone={c.phone} email={c.email} />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      <QuickContactDialog
        open={adding}
        onOpenChange={setAdding}
        companyId={companyId}
        onCreated={(p) => {
          successToast(p.existing ? "Kontakt otevřen." : "Kontakt je přidaný.");
          if (p.existing) nav.push(`/kontakty/osoby/${p.personId}`);
        }}
      />
    </Card>
  );
}

/** „Možná duplicita“ u organizace: stejná doména webu nebo podobný název (ORG-06); sloučení je v akcích. */
export function CompanyDuplicatesCard({
  companyId,
  name,
  web,
}: {
  companyId: string;
  name: string;
  web?: string | null;
}) {
  const q = useCommandQuery<CompanyDuplicateCheck>("kontakty.company.checkDuplicates", {
    name,
    ...(web ? { web } : {}),
    excludeId: companyId,
  });
  const similar = q.data?.similar ?? [];
  if (!similar.length) return null;
  return (
    <Card data-testid="company-duplicates">
      <CardHeader title="Možná duplicita" count={similar.length} />
      <CardBody>
        <ul className="space-y-1 text-sm">
          {similar.map((d) => (
            <li key={d.id}>
              <a className="font-medium underline" href={`/kontakty/firmy/${d.id}`}>
                {d.name}
              </a>{" "}
              <span className="text-muted">
                {d.reason === "name" ? "podobný název" : "stejná doména webu"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted">
          Duplicitu sloučí vlastník akcí „Sloučit duplicitu“.
        </p>
      </CardBody>
    </Card>
  );
}

/** Karta „Organizace“ na detailu osoby: hlavní a další organizace s rolí (KON-01). */
export function PersonCompaniesCard({ personId }: { personId: string }) {
  const can = useCan();
  const q = useCommandQuery<PersonCompanies>("kontakty.person.companies", { personId });
  type Draft = {
    primary: string | null;
    primaryName: string;
    others: { companyId: string; name: string; role: string; position: string }[];
  };
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = useCommandMutation<SetCompaniesInput, PersonCompanies>(
    "kontakty.person.setCompanies",
    {
      onSuccess: () => {
        setDraft(null);
        successToast("Organizace jsou uložené.");
      },
      invalidate: [["command"], ["entity"]],
    },
  );
  const data = q.data;
  return (
    <Card aria-label="Organizace osoby" data-testid="person-companies">
      <CardHeader
        title="Organizace"
        action={
          can("kontakty.write") && data && !draft ? (
            <Button
              size="sm"
              onClick={() =>
                setDraft({
                  primary: data.primary?.companyId ?? null,
                  primaryName: data.primary?.name ?? "",
                  others: data.others.map((o) => ({
                    companyId: o.companyId,
                    name: o.name,
                    role: o.role ?? "",
                    position: o.position ?? "",
                  })),
                })
              }
            >
              Upravit
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        {q.isLoading || !data ? (
          <Skeleton className="h-10" />
        ) : draft ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({
                personId,
                primaryCompanyId: draft.primary,
                others: draft.others.map((o) => ({
                  companyId: o.companyId,
                  role: o.role.trim() || null,
                  position: o.position.trim() || null,
                })),
              });
            }}
          >
            <div className="text-sm text-muted">Hlavní organizace</div>
            <CompanyPicker
              value={draft.primary}
              label={draft.primaryName}
              onChange={(id) => setDraft({ ...draft, primary: id })}
            />
            <div className="text-sm text-muted">Další organizace</div>
            {draft.others.map((o, i) => (
              <div
                key={o.companyId}
                className="grid grid-cols-[minmax(0,1fr)_9rem_9rem_auto] items-center gap-2"
              >
                <span className="truncate">{o.name}</span>
                <Input
                  aria-label="Role"
                  placeholder="Role"
                  value={o.role}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      others: draft.others.map((x, j) =>
                        j === i ? { ...x, role: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Input
                  aria-label="Pozice"
                  placeholder="Pozice"
                  value={o.position}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      others: draft.others.map((x, j) =>
                        j === i ? { ...x, position: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({ ...draft, others: draft.others.filter((_, j) => j !== i) })
                  }
                >
                  Odebrat
                </Button>
              </div>
            ))}
            <AddOther
              onPick={(id, name) =>
                !draft.others.some((o) => o.companyId === id) &&
                setDraft({
                  ...draft,
                  others: [...draft.others, { companyId: id, name, role: "", position: "" }],
                })
              }
            />
            {save.error && (
              <p role="alert" className="text-sm text-danger">
                {save.error.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Zrušit
              </Button>
              <Button type="submit" variant="primary" loading={save.isPending}>
                Uložit
              </Button>
            </div>
          </form>
        ) : !data.primary && data.others.length === 0 ? (
          <p className="text-sm text-muted">Osoba nemá žádnou organizaci.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {data.primary && (
              <li className="flex items-center justify-between gap-2 py-1.5">
                <a
                  className="font-medium hover:underline"
                  href={`/kontakty/firmy/${data.primary.companyId}`}
                >
                  {data.primary.name}
                </a>
                <span className="flex items-center gap-1 text-sm text-muted">
                  {data.primary.position}
                  <Chip color="green">Hlavní</Chip>
                </span>
              </li>
            )}
            {data.others.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-1.5">
                <a className="hover:underline" href={`/kontakty/firmy/${o.companyId}`}>
                  {o.name}
                </a>
                <span className="flex items-center gap-1 text-sm text-muted">
                  {o.position}
                  {o.role && <Chip>{o.role}</Chip>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function AddOther({ onPick }: { onPick: (id: string, name: string) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <CompanyPickerAdd
          value={value}
          onChange={(id, name) => {
            if (id) onPick(id, name);
            setValue(null);
          }}
        />
      </div>
    </div>
  );
}

/** Výběr organizace, který vrací i název (pro přidání mezi další organizace). */
function CompanyPickerAdd({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null, name: string) => void;
}) {
  const [names] = useState(() => new Map<string, string>());
  const api = useEntityApiLoad(names);
  return (
    <Combobox
      aria-label="Přidat další organizaci"
      load={api}
      value={value}
      onChange={(v) => onChange((v as string | null) ?? null, names.get(v as string) ?? "")}
      placeholder="Přidat další organizaci…"
      searchPlaceholder="Název, IČO nebo město…"
    />
  );
}

function useEntityApiLoad(names: Map<string, string>) {
  const api = useEntityApi();
  return async (q: string) => {
    const r = await api.command<unknown, { companies: CompanyHit[] }>("kontakty.search", {
      q,
      kinds: ["company"],
      limit: 10,
    });
    for (const c of r.companies) names.set(c.id, c.name);
    return r.companies.map((c) => ({
      value: c.id,
      label: c.name,
      hint: [c.ico, c.city].filter(Boolean).join(" · "),
    }));
  };
}
