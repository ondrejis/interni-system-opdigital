"use client";

import {
  Button,
  Chip,
  Field,
  Input,
  Skeleton,
  errorToast,
  successToast,
  useCan,
  useCommandMutation,
  useCommandQuery,
} from "@rebar/ui";
import { useEffect, useState } from "react";
import type { FakturoidStatus, FakturoidTestResult } from "./types";

const STATUS_LABELS = {
  ok: "Funguje",
  reauth: "Vyžaduje nové přihlášení",
  error: "Chyba spojení",
} as const;

/**
 * Panel „Fakturoid“ v Nastavení → Integrace (slot `settings.integrations`, jen vlastník): účet, Client ID, Client
 * Secret a kontaktní e-mail, test spojení a odpojení. Client Secret se nikdy nevrací do prohlížeče; prázdné pole při
 * úpravě ponechá uložený.
 */
export function FakturoidPanel() {
  const can = useCan();
  const allowed = can("muj-prostor.recurring_invoices");
  const q = useCommandQuery<FakturoidStatus>(
    "muj-prostor.fakturoid.status",
    {},
    { enabled: allowed },
  );
  const save = useCommandMutation<
    { account: string; clientId: string; clientSecret?: string; contactEmail: string },
    FakturoidStatus
  >("muj-prostor.fakturoid.save");
  const test = useCommandMutation<Record<string, never>, FakturoidTestResult>(
    "muj-prostor.fakturoid.test",
  );
  const disconnect = useCommandMutation<Record<string, never>, FakturoidStatus>(
    "muj-prostor.fakturoid.disconnect",
  );
  const [form, setForm] = useState({
    account: "",
    clientId: "",
    clientSecret: "",
    contactEmail: "",
  });
  const [result, setResult] = useState<FakturoidTestResult | null>(null);
  const status = q.data;
  useEffect(() => {
    if (status)
      setForm((f) => ({
        ...f,
        account: status.account ?? f.account,
        contactEmail: status.contactEmail ?? f.contactEmail,
      }));
  }, [status]);

  if (!allowed) return null;
  if (!status) return <Skeleton className="h-32 w-full" />;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section className="card space-y-3 p-4" data-testid="fakturoid-panel">
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        Fakturoid (opakované faktury)
        {status.configured && status.status && (
          <Chip color={status.status === "ok" ? "green" : "red"}>
            {STATUS_LABELS[status.status]}
          </Chip>
        )}
        {status.mode === "fake" && <Chip color="orange">Vývojový režim</Chip>}
      </h3>
      <p className="text-sm text-muted">
        API v3, přihlášení přes Client ID a Client Secret z Fakturoidu (Nastavení → Uživatelský
        účet). Údaje se ukládají šifrovaně a nikde se znovu nezobrazují.
      </p>
      <form
        className="grid gap-x-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            {
              account: form.account,
              clientId: form.clientId,
              contactEmail: form.contactEmail,
              ...(form.clientSecret ? { clientSecret: form.clientSecret } : {}),
            },
            {
              onSuccess: () => {
                setForm((f) => ({ ...f, clientSecret: "", clientId: "" }));
                setResult(null);
                successToast("Přístup k Fakturoidu uložen.");
              },
              onError: (err) => errorToast(err.message),
            },
          );
        }}
      >
        <Field label="Název účtu (z adresy app.fakturoid.cz/…)">
          <Input
            value={form.account}
            onChange={set("account")}
            autoComplete="off"
            data-testid="fakturoid-account"
          />
        </Field>
        <Field label="Kontaktní e-mail (do hlavičky požadavků)">
          <Input
            type="email"
            value={form.contactEmail}
            onChange={set("contactEmail")}
            autoComplete="off"
            data-testid="fakturoid-email"
          />
        </Field>
        <Field
          label={status.clientIdHint ? `Client ID (uložené ${status.clientIdHint})` : "Client ID"}
        >
          <Input
            value={form.clientId}
            onChange={set("clientId")}
            autoComplete="off"
            placeholder={
              status.clientIdHint ? "ponechat uložené nelze, zadejte znovu při změně" : ""
            }
            data-testid="fakturoid-client-id"
          />
        </Field>
        <Field label="Client Secret">
          <Input
            type="password"
            value={form.clientSecret}
            onChange={set("clientSecret")}
            autoComplete="new-password"
            placeholder={status.configured ? "ponechat uložený" : ""}
            data-testid="fakturoid-secret"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button
            type="submit"
            variant="primary"
            loading={save.isPending}
            disabled={!form.account || !form.clientId || !form.contactEmail}
            data-testid="fakturoid-save"
          >
            Uložit
          </Button>
          <Button
            loading={test.isPending}
            disabled={!status.configured}
            onClick={() =>
              test.mutate({}, { onSuccess: setResult, onError: (err) => errorToast(err.message) })
            }
            data-testid="fakturoid-test"
          >
            Otestovat spojení
          </Button>
          {status.configured && status.mode === "real" && (
            <Button
              loading={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(
                  {},
                  { onSuccess: () => setResult(null), onError: (err) => errorToast(err.message) },
                )
              }
              data-testid="fakturoid-disconnect"
            >
              Odpojit
            </Button>
          )}
          {result && (
            <span
              className={result.ok ? "text-success" : "text-danger"}
              role="status"
              data-testid="fakturoid-test-result"
            >
              {result.ok ? `Spojení funguje (účet ${result.accountName}).` : result.message}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
