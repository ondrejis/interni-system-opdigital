"use client";

import {
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Field,
  FormSection,
  IconButton,
  Input,
  Notice,
  errorToast,
  successToast,
} from "@rebar/ui";
import type { EndpointRow, WebhookEventGroup } from "@rebar/core/webhooks";
import { Check, Copy, KeyRound, Pencil, Plus, Send, Trash2, Webhook } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { runAction } from "@/lib/run-action";
import { SettingsTable } from "../_shared/settings-table";
import { formatDateTime } from "../_shared/format";
import {
  createEndpointAction,
  deleteEndpointAction,
  rotateEndpointSecretAction,
  testEndpointAction,
  updateEndpointAction,
} from "./actions";

/** Tajemství se ukáže jednou: tlačítko kopírování a upozornění, že už nepůjde zobrazit. */
export function SecretReveal({ secret, label }: { secret: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <div className="flex items-stretch gap-2">
        <code
          data-testid="revealed-secret"
          className="min-w-0 flex-1 select-all break-all rounded-md border border-line bg-subtle px-3 py-2 font-mono text-sm"
        >
          {secret}
        </code>
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(secret);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              errorToast("Kopírování se nepovedlo, označte text a zkopírujte ho ručně.");
            }
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Zkopírováno" : "Kopírovat"}
        </Button>
      </div>
      <p className="mt-1.5 text-sm text-muted">
        Zobrazí se jen teď. Uložte ho do n8n (např. do přihlašovacích údajů); potom už ho z OPSYS
        zjistit nejde, jen vyměnit za nové.
      </p>
    </div>
  );
}

type FormState = {
  name: string;
  url: string;
  events: string[];
  includePrivate: boolean;
  active: boolean;
};

const EMPTY: FormState = { name: "", url: "", events: [], includePrivate: false, active: true };

/** Výběr událostí: skupina (`deal.*`) nebo jednotlivé události. */
function EventPicker({
  groups,
  value,
  onChange,
}: {
  groups: WebhookEventGroup[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggleGroup = (g: WebhookEventGroup, on: boolean) => {
    const rest = value.filter((e) => e !== `${g.prefix}.*` && !g.events.some((x) => x.name === e));
    onChange(on ? [...rest, `${g.prefix}.*`] : rest);
  };
  const toggleEvent = (name: string, on: boolean) =>
    onChange(on ? [...value, name] : value.filter((e) => e !== name));
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1.5 text-sm font-medium">Události</legend>
      {groups.map((g) => {
        const whole = value.includes(`${g.prefix}.*`);
        return (
          <div key={g.prefix} className="rounded-lg border border-line p-3">
            <label className="flex cursor-pointer items-center gap-2 font-medium">
              <Checkbox
                aria-label={`${g.label}: všechny události`}
                checked={whole}
                onCheckedChange={(v) => toggleGroup(g, !!v)}
              />
              {g.label}
              <span className="text-sm font-normal text-muted">(všechny)</span>
            </label>
            {g.description && <p className="mt-1 text-sm text-muted">{g.description}</p>}
            <ul className="mt-2 grid gap-1.5 @lg:grid-cols-2">
              {g.events.map((e) => (
                <li key={e.name}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      aria-label={e.label}
                      checked={whole || value.includes(e.name)}
                      disabled={whole}
                      onCheckedChange={(v) => toggleEvent(e.name, !!v)}
                    />
                    <span>{e.label}</span>
                    <code className="text-xs text-faint">{e.name}</code>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </fieldset>
  );
}

function EndpointDialog({
  open,
  onOpenChange,
  groups,
  canSeePrivate,
  editing,
  onSecret,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  groups: WebhookEventGroup[];
  canSeePrivate: boolean;
  editing: EndpointRow | null;
  /** Po vytvoření: ukáže tajemství. */
  onSecret: (s: { name: string; secret: string }) => void;
}) {
  const router = useRouter();
  const [f, setF] = useState<FormState>(
    editing
      ? {
          name: editing.name,
          url: editing.url,
          events: editing.events,
          includePrivate: editing.includePrivate,
          active: editing.active,
        }
      : EMPTY,
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const base = { name: f.name, url: f.url, events: f.events, includePrivate: f.includePrivate };
    if (editing) {
      const r = await runAction(
        updateEndpointAction({ ...base, id: editing.id, active: f.active }),
        "Webhook uložen.",
      );
      setBusy(false);
      if (r) {
        onOpenChange(false);
        router.refresh();
      }
      return;
    }
    const r = await runAction(createEndpointAction(base));
    setBusy(false);
    if (r) {
      onOpenChange(false);
      onSecret({ name: f.name, secret: r.data.secret });
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? "Upravit webhook" : "Přidat webhook"}
        description="OPSYS na adresu pošle zvolené události jako podepsaný požadavek POST (JSON)."
        className="w-[min(40rem,calc(100vw-2rem))]"
      >
        <form onSubmit={submit} className="@container px-5 py-4">
          <Field label="Název" htmlFor="wh-name" hint="Jen pro vás, např. „n8n: složky na Disku“.">
            <Input
              id="wh-name"
              autoFocus
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>
          <Field
            label="Adresa (URL)"
            htmlFor="wh-url"
            hint="Production URL uzlu Webhook v n8n. Veřejná adresa musí být https://."
          >
            <Input
              id="wh-url"
              inputMode="url"
              autoComplete="off"
              value={f.url}
              onChange={(e) => setF({ ...f, url: e.target.value })}
              placeholder="https://n8n.firma.cz/webhook/opsys"
            />
          </Field>
          <EventPicker
            groups={groups}
            value={f.events}
            onChange={(events) => setF({ ...f, events })}
          />
          <label
            className={`mt-3 flex items-start gap-3 rounded-lg border border-line bg-subtle px-3 py-3 ${
              canSeePrivate ? "cursor-pointer" : "cursor-not-allowed opacity-60"
            }`}
          >
            <Checkbox
              className="mt-0.5"
              aria-label="Posílat i soukromé záznamy"
              checked={f.includePrivate}
              disabled={!canSeePrivate}
              onCheckedChange={(v) => setF({ ...f, includePrivate: !!v })}
            />
            <span>
              <span className="block font-medium">Posílat i soukromé záznamy</span>
              <span className="block text-sm text-muted">
                Jen pro vaše vlastní automatizace. Bez zaškrtnutí se události soukromých záznamů na
                tuto adresu nikdy neodešlou. Ostatní uživatelé tento webhook neuvidí.
              </span>
            </span>
          </label>
          {editing && (
            <label className="mt-3 flex cursor-pointer items-center gap-2">
              <Checkbox
                aria-label="Webhook je zapnutý"
                checked={f.active}
                onCheckedChange={(v) => setF({ ...f, active: !!v })}
              />
              Webhook je zapnutý
            </label>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={f.name.trim().length < 2 || !f.url.trim() || f.events.length === 0}
            >
              {editing ? "Uložit" : "Přidat webhook"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Webhooky do n8n: seznam, přidání a úprava, výběr událostí, tajemství (jednou), zkušební odeslání a smazání. */
export function WebhooksSection({
  endpoints,
  eventGroups,
  canSeePrivate,
}: {
  endpoints: EndpointRow[];
  eventGroups: WebhookEventGroup[];
  canSeePrivate: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ editing: EndpointRow | null } | null>(null);
  const [secret, setSecret] = useState<{ name: string; secret: string } | null>(null);
  const [removing, setRemoving] = useState<EndpointRow | null>(null);
  const [rotating, setRotating] = useState<EndpointRow | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  async function test(e: EndpointRow) {
    setTesting(e.id);
    const r = await runAction(testEndpointAction({ id: e.id }));
    setTesting(null);
    if (r) {
      if (r.data.outcome === "delivered")
        successToast(`Test doručen: „${e.name}“ odpověděl úspěšně.`);
      else errorToast(`Test se nepovedl. ${r.data.error ?? ""}`.trim());
      router.refresh();
    }
  }

  return (
    <FormSection
      title="Webhooky do n8n"
      description="OPSYS pošle zvolené události (nový obchod, výhra, nový úkol, platba…) na adresu v n8n. Co se s nimi stane, určuje workflow v n8n."
      icon={<Webhook />}
      flush
      badge={
        <Button
          variant="primary"
          onClick={() => setDialog({ editing: null })}
          data-testid="add-webhook"
        >
          <Plus /> Přidat webhook
        </Button>
      }
    >
      {endpoints.length === 0 ? (
        <p className="px-5 pb-5 pt-4 text-muted" data-testid="webhooks-empty">
          Zatím žádný webhook. Přidejte adresu z n8n a vyberte události, které se mají posílat.
        </p>
      ) : (
        <SettingsTable
          label="Webhooky"
          testId="webhooks-table"
          rows={endpoints}
          rowKey={(e) => e.id}
          columns={[
            {
              key: "name",
              header: "Název",
              primary: true,
              cell: (e) => (
                <span className="flex flex-wrap items-center gap-2">
                  {e.name}
                  {e.includePrivate && <Chip color="purple">I soukromé</Chip>}
                  {!e.active && <Chip>Vypnutý</Chip>}
                </span>
              ),
            },
            {
              key: "url",
              header: "Adresa",
              cell: (e) => (
                <span className="block max-w-72 truncate text-muted" title={e.url}>
                  {e.url}
                </span>
              ),
            },
            {
              key: "events",
              header: "Události",
              cell: (e) => (
                <span className="text-muted">
                  {e.events.length === 1 ? e.events[0] : `${e.events.length} vybraných`}
                </span>
              ),
            },
            {
              key: "state",
              header: "Doručení",
              cell: (e) => (
                <span className="tabular text-muted">
                  {e.counts.delivered} ok · {e.counts.pending} čeká
                  {e.counts.failed > 0 && (
                    <span className="text-danger"> · {e.counts.failed} chyb</span>
                  )}
                  {e.lastDeliveredAt && (
                    <span className="block text-xs text-faint">
                      naposledy {formatDateTime(e.lastDeliveredAt)}
                    </span>
                  )}
                </span>
              ),
            },
          ]}
          actions={(e) => (
            <span className="flex items-center gap-1">
              <Button
                size="sm"
                loading={testing === e.id}
                disabled={!e.active}
                onClick={() => void test(e)}
                aria-label={`Odeslat test: ${e.name}`}
              >
                <Send /> Odeslat test
              </Button>
              <IconButton label={`Upravit ${e.name}`} onClick={() => setDialog({ editing: e })}>
                <Pencil />
              </IconButton>
              <IconButton label={`Vyměnit tajemství ${e.name}`} onClick={() => setRotating(e)}>
                <KeyRound />
              </IconButton>
              <IconButton label={`Smazat ${e.name}`} onClick={() => setRemoving(e)}>
                <Trash2 />
              </IconButton>
            </span>
          )}
        />
      )}

      {dialog && (
        <EndpointDialog
          key={dialog.editing?.id ?? "new"}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          groups={eventGroups}
          canSeePrivate={canSeePrivate}
          editing={dialog.editing}
          onSecret={setSecret}
        />
      )}

      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent
          title="Tajemství podpisu"
          description={secret ? `Webhook „${secret.name}“ je připravený.` : undefined}
        >
          <div className="space-y-3 px-5 py-4">
            {secret && (
              <SecretReveal secret={secret.secret} label="Tajemství pro ověření podpisu" />
            )}
            <Notice tone="warning">
              Každý požadavek nese hlavičku X-Opsys-Signature. Postup ověření je níže v části „Jak
              to propojit s n8n“.
            </Notice>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setSecret(null)}>
                Uložil(a) jsem si ho
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!rotating}
        onOpenChange={(o) => !o && setRotating(null)}
        title="Vyměnit tajemství?"
        confirmLabel="Vyměnit tajemství"
        onConfirm={async () => {
          if (!rotating) return false;
          const r = await runAction(rotateEndpointSecretAction({ id: rotating.id }));
          if (!r) return false;
          setSecret({ name: rotating.name, secret: r.data.secret });
          router.refresh();
        }}
      >
        <p>
          Dosavadní tajemství webhooku „<strong className="text-fg">{rotating?.name}</strong>“
          přestane platit hned. Nové tajemství musíte vložit do n8n, jinak workflow bude požadavky
          odmítat.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Smazat webhook?"
        confirmLabel="Smazat webhook"
        danger
        onConfirm={async () => {
          if (!removing) return false;
          const r = await runAction(deleteEndpointAction({ id: removing.id }), "Webhook smazán.");
          if (!r) return false;
          router.refresh();
        }}
      >
        <p>
          Webhook „<strong className="text-fg">{removing?.name}</strong>“ se přestane volat.
          Čekající doručení skončí jako chybná.
        </p>
      </ConfirmDialog>
    </FormSection>
  );
}
