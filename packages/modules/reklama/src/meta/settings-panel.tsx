"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Field,
  Input,
  useCommandMutation,
  useCommandQuery,
} from "@rebar/ui";
import type {
  AccountsListOutput,
  ConnectionStatus,
  ConnectionTestOutput,
  MappingsOutput,
  RecentLead,
  SyncSummary,
} from "../contract";

/*
  Panel Meta pro Nastavení → Integrace (slot `settings.integrations`, REK-04, REK-06): napojení (token Meta), ruční
  synchronizace, reklamní účty (komu patří se nastavuje v seznamu účtů `/reklama`), mapování lead formulářů na
  pipeline, fázi a vlastníka (nemapovaný formulář padá do výchozí pipeline, první fáze a vlastníka Ondřej) a poslední
  příchozí leady včetně selhaných. Token se po uložení nikdy nezobrazí.
*/

const select =
  "h-8 w-full rounded-md border border-line-strong bg-bg px-2 text-base text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)]";

const STATUS_LABEL = {
  ok: "Napojeno",
  reauth: "Vyžaduje nové přihlášení",
  error: "Chyba",
} as const;
const LEAD_LABEL = { processed: "Zpracován", failed: "Selhal", received: "Přijat" } as const;

function ConnectionCard() {
  const status = useCommandQuery<ConnectionStatus>("reklama.connection.get", {});
  const [token, setToken] = useState("");
  const save = useCommandMutation<{ accessToken: string }, void>("reklama.connection.save", {
    onSuccess: () => setToken(""),
  });
  const test = useCommandMutation<Record<string, never>, ConnectionTestOutput>(
    "reklama.connection.test",
    { invalidate: [["command", "reklama.connection.get"]] },
  );
  const remove = useCommandMutation<Record<string, never>, void>("reklama.connection.remove");
  const sync = useCommandMutation<Record<string, never>, SyncSummary>("reklama.sync");
  const s = status.data;
  const err = save.error ?? test.error ?? remove.error ?? sync.error;
  return (
    <Card data-testid="meta-connection">
      <CardHeader
        title="Meta Ads"
        action={
          s?.connected ? (
            <Chip color={s.status === "ok" ? "green" : "red"}>
              {STATUS_LABEL[s.status ?? "error"]}
            </Chip>
          ) : (
            <Chip color="gray">Nenapojeno</Chip>
          )
        }
      />
      <CardBody>
        <p className="text-sm text-muted">
          Stahuje reklamní účty, kampaně a denní výkon (každý den v 6:00, posledních 7 dní se
          přepočítává). Leady z formulářů přicházejí z n8n na adresu <code>/api/ingest/leads</code>.
        </p>
        <div className="mt-3 max-w-md">
          <Field label="Přístupový token Meta" hint="Uloží se šifrovaně a už se nezobrazí.">
            <Input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={s?.connected ? "•••••••• (uložen)" : "Vložte token"}
              data-testid="meta-token"
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={token.trim().length < 10}
            loading={save.isPending}
            onClick={() => save.mutate({ accessToken: token.trim() })}
          >
            Uložit token
          </Button>
          <Button
            size="sm"
            disabled={!s?.connected}
            loading={test.isPending}
            onClick={() => test.mutate({})}
          >
            Otestovat
          </Button>
          <Button
            size="sm"
            disabled={!s?.connected}
            loading={sync.isPending}
            onClick={() => sync.mutate({})}
          >
            Synchronizovat teď
          </Button>
          <Button
            size="sm"
            disabled={!s?.connected}
            loading={remove.isPending}
            onClick={() => remove.mutate({})}
          >
            Odpojit
          </Button>
        </div>
        {err && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {err.message}
          </p>
        )}
        {test.data && (
          <p className="mt-2 text-sm" data-testid="meta-test-result">
            {test.data.ok
              ? `Spojení funguje, nalezeno účtů: ${test.data.accounts}.`
              : test.data.message}
          </p>
        )}
        {sync.data && (
          <p className="mt-2 text-sm" data-testid="meta-sync-result">
            Načteno: účtů {sync.data.accounts}, kampaní {sync.data.campaigns}, řádků statistik{" "}
            {sync.data.insightRows}.
            {sync.data.errors.length
              ? ` Chyby: ${sync.data.errors.map((e) => e.message).join("; ")}`
              : ""}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function AccountsCard() {
  const accounts = useCommandQuery<AccountsListOutput>("reklama.accounts.list", {});
  const rows = accounts.data?.accounts ?? [];
  return (
    <Card data-testid="meta-accounts">
      <CardHeader title="Reklamní účty" />
      <CardBody>
        {!rows.length ? (
          <p className="text-sm text-muted">
            Žádné účty. Po napojení a synchronizaci se tu objeví.
          </p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {rows.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                <span>{a.name}</span>
                <span className="flex items-center gap-2 text-muted">
                  {a.ownerKind === "client" ? (a.companyName ?? "klient") : "OP Digital"}
                  {a.lastSyncError && <Chip color="red">Chyba synchronizace</Chip>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-muted">
          Komu účet patří (agentuře, nebo klientovi) se nastavuje v seznamu účtů na stránce Reklama.
        </p>
      </CardBody>
    </Card>
  );
}

type MappingDraft = {
  id?: string;
  metaFormId: string;
  name: string;
  stageId: string;
  ownerId: string;
};

function MappingsCard() {
  const data = useCommandQuery<MappingsOutput>("reklama.mappings.list", {});
  const save = useCommandMutation<
    {
      id?: string;
      metaFormId: string;
      name: string;
      pipelineId: string;
      stageId: string;
      ownerId: string;
      defaultServices: string[];
    },
    unknown
  >("reklama.mapping.save", { onSuccess: () => setDraft(null) });
  const del = useCommandMutation<{ id: string }, void>("reklama.mapping.delete");
  const [draft, setDraft] = useState<MappingDraft | null>(null);
  const m = data.data;
  const stageName = (id: string | null) => m?.stages.find((s) => s.id === id)?.name ?? "—";
  const userName = (id: string | null) => m?.users.find((u) => u.id === id)?.name ?? "—";
  const pipelineId =
    m?.fallback.pipelineId ?? m?.mappings.find((x) => x.pipelineId)?.pipelineId ?? "";
  const open = (init: Partial<MappingDraft>) =>
    setDraft({
      metaFormId: "",
      name: "",
      stageId: m?.stages[0]?.id ?? "",
      ownerId: m?.fallback.ownerId ?? m?.users[0]?.id ?? "",
      ...init,
    });
  const unmapped = (m?.seenForms ?? []).filter((f) => !f.mapped);
  return (
    <Card data-testid="meta-mappings">
      <CardHeader
        title="Lead formuláře"
        action={
          <Button size="sm" onClick={() => open({})}>
            Přidat mapování
          </Button>
        }
      />
      <CardBody>
        <p className="text-sm text-muted">
          Do které fáze pipeline Obchody lead z formuláře padne a kdo je jeho vlastník. Formulář bez
          mapování padá do první fáze výchozí pipeline a jeho vlastníkem je{" "}
          {userName(m?.fallback.ownerId ?? null)}.
        </p>
        {!!m?.mappings.length && (
          <ul className="mt-2 divide-y divide-line text-sm">
            {m.mappings.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-1.5">
                <span>
                  {x.name} <span className="text-muted">({x.metaFormId})</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-muted">
                    {stageName(x.stageId)} · {userName(x.ownerId)}
                  </span>
                  <Button
                    size="sm"
                    onClick={() =>
                      open({
                        id: x.id,
                        metaFormId: x.metaFormId,
                        name: x.name,
                        stageId: x.stageId ?? "",
                        ownerId: x.ownerId ?? "",
                      })
                    }
                  >
                    Upravit
                  </Button>
                  <Button
                    size="sm"
                    loading={del.isPending}
                    onClick={() => del.mutate({ id: x.id })}
                  >
                    Smazat
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {!!unmapped.length && (
          <div className="mt-3 text-sm">
            <p className="text-muted">Formuláře, ze kterých přišel lead, a nemají mapování:</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {unmapped.map((f) => (
                <li key={f.formId}>
                  <Button
                    size="sm"
                    onClick={() => open({ metaFormId: f.formId, name: f.name ?? f.formId })}
                  >
                    {f.name ?? f.formId} ({f.leads})
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {draft && (
          <div
            className="mt-3 max-w-md rounded-md border border-line p-3"
            data-testid="meta-mapping-form"
          >
            <Field label="ID formuláře v Meta">
              <Input
                value={draft.metaFormId}
                disabled={!!draft.id}
                onChange={(e) => setDraft({ ...draft, metaFormId: e.target.value })}
              />
            </Field>
            <Field label="Název">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Fáze obchodu" htmlFor="meta-map-stage">
              <select
                id="meta-map-stage"
                className={select}
                value={draft.stageId}
                onChange={(e) => setDraft({ ...draft, stageId: e.target.value })}
              >
                {(m?.stages ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vlastník leadů" htmlFor="meta-map-owner">
              <select
                id="meta-map-owner"
                className={select}
                value={draft.ownerId}
                onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}
              >
                {(m?.users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            {save.error && (
              <p role="alert" className="mb-2 text-sm text-danger">
                {save.error.message}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={save.isPending}
                disabled={
                  !draft.metaFormId.trim() || !draft.name.trim() || !draft.stageId || !draft.ownerId
                }
                onClick={() =>
                  save.mutate({
                    ...(draft.id ? { id: draft.id } : {}),
                    metaFormId: draft.metaFormId.trim(),
                    name: draft.name.trim(),
                    pipelineId,
                    stageId: draft.stageId,
                    ownerId: draft.ownerId,
                    defaultServices: [],
                  })
                }
              >
                Uložit
              </Button>
              <Button size="sm" onClick={() => setDraft(null)}>
                Zrušit
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function RecentLeadsCard() {
  const leads = useCommandQuery<RecentLead[]>("reklama.leads.recent", { limit: 15 });
  const rows = leads.data ?? [];
  return (
    <Card data-testid="meta-leads">
      <CardHeader title="Poslední leady" />
      <CardBody>
        {!rows.length ? (
          <p className="text-sm text-muted">Zatím nepřišel žádný lead.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {rows.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-1.5">
                <span>
                  {new Date(l.receivedAt).toLocaleString("cs-CZ")} ·{" "}
                  <span className="text-muted">{l.leadgenId}</span>
                  {l.error ? <span className="block text-danger">{l.error}</span> : null}
                </span>
                <Chip
                  color={
                    l.status === "processed" ? "green" : l.status === "failed" ? "red" : "gray"
                  }
                >
                  {LEAD_LABEL[l.status]}
                </Chip>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-muted">
          Selhané leady jde zopakovat v Nastavení → Integrace u příchozích požadavků.
        </p>
      </CardBody>
    </Card>
  );
}

/** Panel Meta (napojení, účty, mapování formulářů, poslední leady) pro slot `settings.integrations`. */
export function MetaIntegrationPanel() {
  return (
    <div className="flex flex-col gap-4" data-testid="meta-panel">
      <ConnectionCard />
      <AccountsCard />
      <MappingsCard />
      <RecentLeadsCard />
    </div>
  );
}
