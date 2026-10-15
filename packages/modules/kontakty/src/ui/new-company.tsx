"use client";

import { Button, Chip, Field, Input, useEntityApi, useNav } from "@rebar/ui";
import { useRef, useState } from "react";
import type { AresCommandResult, AresField, CompanyDuplicateCheck } from "../contract";
import { isValidIco, normalizeIco } from "../normalize";
import { AresChangeList, useAresSelection } from "./ares";

type Form = {
  name: string;
  ico: string;
  dic: string;
  legalForm: string;
  officialName: string;
  street: string;
  city: string;
  zip: string;
  web: string;
  email: string;
  phone: string;
};
const EMPTY: Form = {
  name: "",
  ico: "",
  dic: "",
  legalForm: "",
  officialName: "",
  street: "",
  city: "",
  zip: "",
  web: "",
  email: "",
  phone: "",
};

/**
 * Stránka `/kontakty/firmy/nova` (ORG-02, ORG-03, ORG-05, ORG-06): nová organizace jen s názvem, nebo podle IČO.
 * Platné IČO (8 číslic, kontrola mod 11) vyvolá ARES (do 2 s), ukáže navrhované údaje a po potvrzení je doplní do
 * formuláře. Výpadek ARES nebrání uložení. Stejné IČO uložení zakáže a odkáže na existující organizaci; podobný
 * název nebo stejná doména webu je „Možná duplicita“ a jde pokračovat.
 */
export function NewCompanyPage() {
  const api = useEntityApi();
  const nav = useNav();
  const [f, setF] = useState<Form>(EMPTY);
  const [ares, setAres] = useState<AresCommandResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [dups, setDups] = useState<CompanyDuplicateCheck | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastIco = useRef("");
  const set = (k: keyof Form, v: string) => setF((s) => ({ ...s, [k]: v }));
  const { selected, toggle } = useAresSelection(ares?.ok ? ares.changes : undefined);

  async function lookup(raw: string) {
    const ico = normalizeIco(raw);
    if (!ico || !isValidIco(ico) || ico === lastIco.current) return;
    lastIco.current = ico;
    setLoading(true);
    setAres(null);
    try {
      setAres(await api.command<unknown, AresCommandResult>("kontakty.ares", { ico }));
    } catch (e) {
      setAres({ ok: false, reason: "unavailable", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  function takeAres() {
    if (!ares?.ok) return;
    const patch: Partial<Form> = {};
    for (const c of ares.changes)
      if (selected.has(c.field as AresField) && c.incoming)
        patch[c.field as keyof Form] = c.incoming;
    patch.ico = ares.company.ico;
    setF((s) => ({ ...s, ...patch }));
    setAres(null);
  }

  async function submit(force: boolean) {
    setError(null);
    if (!f.name.trim() && !f.ico.trim()) return setError("Vyplňte název organizace.");
    const check = await api.command<unknown, CompanyDuplicateCheck>(
      "kontakty.company.checkDuplicates",
      {
        ...(f.name.trim() ? { name: f.name.trim() } : {}),
        ...(f.ico.trim() ? { ico: f.ico.trim() } : {}),
        ...(f.web.trim() ? { web: f.web.trim() } : {}),
      },
    );
    setDups(check);
    if (check.icoMatch) return;
    if (check.similar.length && !force) return;
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) if (v.trim()) values[k] = v.trim();
    if (!values.name) values.name = values.officialName ?? `Organizace ${values.ico}`;
    try {
      const res = await api.create("company", values);
      // čas synchronizace, když údaje přišly z ARES (zápis přes příkaz, který ARES znovu neposílá)
      if (confirmed && values.ico)
        await api
          .command("kontakty.ares", { companyId: res.row.id, apply: true, fields: [] })
          .catch(() => undefined);
      nav.push(`/kontakty/firmy/${res.row.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <form
      className="mx-auto w-full max-w-2xl space-y-3 p-4"
      data-testid="new-company"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <Field label="IČO" hint="Po zadání platného IČO se údaje doplní z ARES." htmlFor="nc-ico">
        <div className="flex gap-2">
          <Input
            id="nc-ico"
            autoFocus
            inputMode="numeric"
            value={f.ico}
            onChange={(e) => {
              set("ico", e.target.value);
              if (
                normalizeIco(e.target.value)?.length === 8 &&
                e.target.value.replace(/\D/g, "").length === 8
              )
                void lookup(e.target.value);
            }}
            onBlur={() => void lookup(f.ico)}
          />
          <Button onClick={() => void lookup(f.ico)} loading={loading}>
            Načíst z ARES
          </Button>
        </div>
      </Field>
      {f.ico.replace(/\D/g, "").length === 8 && !isValidIco(normalizeIco(f.ico) ?? "") && (
        <p className="text-sm text-warning">IČO nemá správný kontrolní součet (chybně opsané?).</p>
      )}
      {ares && !ares.ok && (
        <p role="status" className="text-sm text-warning" data-testid="ares-unavailable">
          {ares.message}
        </p>
      )}
      {ares?.ok && (
        <div className="rounded-lg border border-line p-3" data-testid="ares-preview">
          <p className="mb-2 text-sm">
            ARES nabízí: <strong>{ares.company.name}</strong>
            {ares.stale && <Chip color="yellow">starší uložená odpověď</Chip>}
          </p>
          {ares.duplicate && (
            <p role="alert" className="mb-2 text-sm text-danger">
              Organizace s tímto IČO už existuje{ares.duplicate.visible ? `: ` : "."}
              {ares.duplicate.visible && (
                <a className="underline" href={`/kontakty/firmy/${ares.duplicate.id}`}>
                  {ares.duplicate.name}
                </a>
              )}
            </p>
          )}
          <AresChangeList
            changes={ares.changes.filter((c) => c.field !== "ico")}
            selected={selected}
            onToggle={toggle}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAres(null)}>
              Zahodit
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmed(true);
                takeAres();
              }}
            >
              Použít údaje
            </Button>
          </div>
        </div>
      )}
      <Field label="Název *" htmlFor="nc-name">
        <Input id="nc-name" value={f.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Oficiální název" htmlFor="nc-off">
          <Input
            id="nc-off"
            value={f.officialName}
            onChange={(e) => set("officialName", e.target.value)}
          />
        </Field>
        <Field label="DIČ" htmlFor="nc-dic">
          <Input id="nc-dic" value={f.dic} onChange={(e) => set("dic", e.target.value)} />
        </Field>
        <Field label="Právní forma" htmlFor="nc-lf">
          <Input
            id="nc-lf"
            value={f.legalForm}
            onChange={(e) => set("legalForm", e.target.value)}
          />
        </Field>
        <Field label="Web" htmlFor="nc-web">
          <Input id="nc-web" value={f.web} onChange={(e) => set("web", e.target.value)} />
        </Field>
        <Field label="Ulice" htmlFor="nc-st">
          <Input id="nc-st" value={f.street} onChange={(e) => set("street", e.target.value)} />
        </Field>
        <Field label="Město" htmlFor="nc-city">
          <Input id="nc-city" value={f.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="PSČ" htmlFor="nc-zip">
          <Input id="nc-zip" value={f.zip} onChange={(e) => set("zip", e.target.value)} />
        </Field>
        <Field label="E-mail" htmlFor="nc-mail">
          <Input id="nc-mail" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Telefon" htmlFor="nc-phone">
          <Input id="nc-phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
      </div>
      {dups?.icoMatch && (
        <p
          role="alert"
          className="rounded-lg border border-danger p-3 text-sm text-danger"
          data-testid="ico-duplicate"
        >
          {dups.icoMatch.visible ? (
            <>
              Organizace s tímto IČO už existuje:{" "}
              <a className="underline" href={`/kontakty/firmy/${dups.icoMatch.id}`}>
                {dups.icoMatch.name}
              </a>
              . Otevřete ji místo zakládání nové.
            </>
          ) : (
            "Organizace s tímto IČO už v evidenci je (nemáte k ní přístup)."
          )}
        </p>
      )}
      {!dups?.icoMatch && dups && dups.similar.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-warning p-3 text-sm"
          data-testid="company-duplicates"
        >
          <p className="mb-1 font-medium">Možná duplicita</p>
          <ul className="list-disc pl-5">
            {dups.similar.map((d) => (
              <li key={d.id}>
                <a className="underline" href={`/kontakty/firmy/${d.id}`}>
                  {d.name}
                </a>{" "}
                ({d.reason === "name" ? "podobný název" : "stejná doména webu"})
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-end">
            <Button variant="primary" onClick={() => void submit(true)}>
              Založit přesto
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="ghost" onClick={() => nav.push("/kontakty/firmy")}>
          Zrušit
        </Button>
        <Button type="submit" variant="primary">
          Založit organizaci
        </Button>
      </div>
    </form>
  );
}
