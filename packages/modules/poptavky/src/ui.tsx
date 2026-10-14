"use client";

import { mergeModuleUi } from "./crm/merge-ui";
import { areaUi as activitiesUi } from "./crm/activities/ui";
import { areaUi as boardUi } from "./crm/board/ui";
import { areaUi as viewsUi } from "./crm/views/ui";
import { areaUi as inboxUi } from "./crm/inbox/ui";
import { areaUi as todayUi } from "./crm/today/ui";
import { formatInstant } from "@rebar/core/time";
import {
  Button,
  Chip,
  Input,
  Skeleton,
  RelatedRecords,
  defineModuleUi,
  successToast,
  useCommandMutation,
  useCommandQuery,
} from "@rebar/ui";
import { useEffect, useState } from "react";

type IntakeData = {
  keys: {
    id: string;
    name: string;
    prefix: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
  }[];
  log: {
    id: string;
    receivedAt: string;
    outcome: string;
    inquiryId: string | null;
    error: string | null;
  }[];
};

const when = (iso: string | null) => (iso ? formatInstant(iso, { year: true }) : "nikdy");

const OUTCOMES: Record<string, { label: string; color: string }> = {
  ok: { label: "Přijato", color: "green" },
  invalid: { label: "Neplatná data", color: "orange" },
  invalid_key: { label: "Neplatný klíč", color: "red" },
  spam: { label: "Zahozeno (spam)", color: "gray" },
  duplicate: { label: "Dvojité odeslání", color: "gray" },
};

/** Správa klíčů pro příjem poptávek z webu a přehled příchozích požadavků. */
function IntakePage() {
  const data = useCommandQuery<IntakeData>("poptavky.intakeKeys", {});
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const create = useCommandMutation<{ name: string }, { id: string; secret: string }>(
    "poptavky.createIntakeKey",
    {
      onSuccess: (r) => {
        setSecret(r.secret);
        setName("");
      },
    },
  );
  const revoke = useCommandMutation<{ id: string }>("poptavky.revokeIntakeKey", {
    onSuccess: () => successToast("Klíč je zrušený."),
  });
  // adresa se zjistí až v prohlížeči (jinak se HTML ze serveru liší od prvního vykreslení a React hlásí chybu hydratace)
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="max-w-3xl space-y-6">
        <section>
          <h2 className="mb-1 text-lg font-semibold">Klíče pro příjem poptávek</h2>
          <p className="mb-3 text-muted">
            Formulář nebo služba na vašem webu pošle poptávku na adresu{" "}
            <code className="rounded bg-hover px-1 font-mono text-sm">
              {origin}/api/intake/poptavky
            </code>{" "}
            s klíčem v hlavičce{" "}
            <code className="rounded bg-hover px-1 font-mono text-sm">Authorization: Bearer …</code>
            . Celý klíč se zobrazí jen jednou při vytvoření.
          </p>
          <form
            className="mb-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length >= 2) create.mutate({ name });
            }}
          >
            <Input
              aria-label="Název klíče"
              placeholder="např. Formulář na webu"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-xs"
            />
            <Button
              type="submit"
              variant="primary"
              loading={create.isPending}
              disabled={name.trim().length < 2}
            >
              Vytvořit klíč
            </Button>
          </form>
          {create.error && (
            <p role="alert" className="mb-3 text-sm text-danger">
              {create.error.message}
            </p>
          )}
          {secret && (
            <div
              className="mb-3 rounded-md border border-accent-line bg-accent-soft p-3"
              role="status"
            >
              <p className="mb-1 font-medium">Zkopírujte si klíč, znovu se už nezobrazí:</p>
              <code
                data-testid="intake-secret"
                className="block break-all rounded bg-bg p-2 font-mono text-sm"
              >
                {secret}
              </code>
              <pre className="mt-2 overflow-x-auto rounded bg-bg p-2 font-mono text-xs">{`curl -X POST ${origin}/api/intake/poptavky \\\n  -H "Authorization: Bearer ${secret}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"Jan Novák","email":"jan@example.cz","phone":"777 123 456","message":"Dobrý den, poptávám…"}'`}</pre>
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setSecret(null)}>
                Skrýt
              </Button>
            </div>
          )}
          {data.isLoading ? (
            <Skeleton className="h-16" />
          ) : !data.data?.keys.length ? (
            <p className="text-muted">Zatím žádný klíč.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {data.data.keys.map((k) => (
                <li key={k.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{k.name}</div>
                    <div className="text-sm text-muted">
                      <code className="font-mono">{k.prefix}…</code> · naposledy{" "}
                      {when(k.lastUsedAt)}
                    </div>
                  </div>
                  {k.revokedAt ? (
                    <Chip color="red">Zrušený</Chip>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => revoke.mutate({ id: k.id })}>
                      Zrušit
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Poslední příchozí požadavky</h2>
          {!data.data?.log.length ? (
            <p className="text-muted">Zatím nic nepřišlo.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 font-medium">Kdy</th>
                  <th className="py-1 font-medium">Výsledek</th>
                  <th className="py-1 font-medium">Poznámka</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.data.log.map((l) => {
                  const o = OUTCOMES[l.outcome] ?? { label: l.outcome, color: "gray" };
                  return (
                    <tr key={l.id}>
                      <td className="py-1.5 tabular">{when(l.receivedAt)}</td>
                      <td className="py-1.5">
                        <Chip color={o.color}>{o.label}</Chip>
                      </td>
                      <td className="py-1.5 text-muted">{l.error ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

const related = (parentAttribute: "company" | "person") => ({
  id: "poptavky",
  label: "Poptávky",
  permission: "poptavky.read",
  render: ({ id }: { id: string }) => (
    <RelatedRecords entity="inquiry" parentAttribute={parentAttribute} parentId={id} />
  ),
});

const baseUi = defineModuleUi({
  recordTabs: { company: [related("company")], person: [related("person")] },
  pages: [{ path: "/poptavky/prijem", render: () => <IntakePage /> }],
});

/** Základ modulu a UI oblastí CRM (docs/CRM.md), každá ve své složce `crm/<oblast>/ui.tsx`. */
export const ui = mergeModuleUi(baseUi, activitiesUi, boardUi, viewsUi, inboxUi, todayUi);
