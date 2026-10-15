"use client";

import {
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  Dialog,
  DialogContent,
  FormSection,
  Notice,
  errorToast,
  successToast,
} from "@rebar/ui";
import type { InboundEventRow } from "@rebar/core/ingest";
import { Inbox, KeyRound, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { runAction } from "@/lib/run-action";
import { SettingsTable } from "../_shared/settings-table";
import { formatDateTime } from "../_shared/format";
import { reprocessInboundAction, rotateIngestSecretAction } from "./actions";
import { SecretReveal } from "./webhooks-section";

/** Co stránka ví o příchozích požadavcích (bez tajemství). */
export type IngestInfo = {
  configured: boolean;
  previousValidUntil: string | null;
  /** Veřejná adresa aplikace bez lomítka na konci. */
  baseUrl: string;
  /** Zdroje, které zapnuté moduly přijímají (`drive`, `leads`). */
  sources: string[];
};

function InboundStatus({ s }: { s: InboundEventRow["status"] }) {
  return s === "processed" ? (
    <Chip color="green" dot>
      Zpracováno
    </Chip>
  ) : s === "failed" ? (
    <Chip color="red" dot>
      Selhalo
    </Chip>
  ) : (
    <Chip color="orange" dot>
      Přijato
    </Chip>
  );
}

/** Příchozí požadavky z n8n: tajemství podpisu (zobrazí se jednou), adresy zdrojů a protokol s možností zpracovat znovu. */
export function IngestSection({
  ingest,
  inbound,
}: {
  ingest: IngestInfo;
  inbound: InboundEventRow[];
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [revokeOld, setRevokeOld] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function rotate(revoke: boolean) {
    const r = await runAction(rotateIngestSecretAction({ revokeOld: revoke }));
    if (!r) return false;
    setSecret(r.data.secret);
    router.refresh();
  }

  async function reprocess(e: InboundEventRow) {
    setBusy(e.id);
    const r = await runAction(reprocessInboundAction({ id: e.id }));
    setBusy(null);
    if (r) {
      if (r.data.ok) successToast("Událost je zpracovaná.");
      else errorToast("Zpracování znovu selhalo, důvod je v protokolu.");
      router.refresh();
    }
  }

  return (
    <FormSection
      title="Příchozí požadavky z n8n"
      description="n8n volá OPSYS na adresy níže (složky z Disku, leady z Meta). Každý požadavek musí být podepsaný tajemstvím; opakovaný požadavek se nezpracuje podruhé."
      icon={<Inbox />}
      flush
      badge={
        ingest.configured ? (
          <Chip color="green" dot>
            Tajemství nastaveno
          </Chip>
        ) : (
          <Chip color="orange" dot>
            Tajemství není nastaveno
          </Chip>
        )
      }
    >
      <div className="space-y-4 border-b border-line px-5 py-4">
        {!ingest.configured && (
          <Notice tone="warning" title="Příchozí požadavky se zatím odmítají">
            Vygenerujte tajemství a vložte ho do n8n, jinak OPSYS nepřijme žádný požadavek.
          </Notice>
        )}
        {ingest.previousValidUntil && (
          <Notice tone="info">
            Předchozí tajemství platí ještě do {formatDateTime(ingest.previousValidUntil)}, aby se
            nic neztratilo, než ho v n8n vyměníte.
          </Notice>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={ingest.configured ? "secondary" : "primary"}
            data-testid="rotate-ingest-secret"
            onClick={() => (ingest.configured ? setConfirm(true) : void rotate(false))}
          >
            <KeyRound /> {ingest.configured ? "Vyměnit tajemství" : "Vygenerovat tajemství"}
          </Button>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Adresy (metoda POST, tělo JSON)</p>
          {ingest.sources.length === 0 ? (
            <p className="text-muted">Žádný zapnutý modul zatím nepřijímá příchozí požadavky.</p>
          ) : (
            <ul className="space-y-1">
              {ingest.sources.map((s) => (
                <li key={s}>
                  <code className="break-all rounded bg-subtle px-2 py-1 font-mono text-sm">
                    {ingest.baseUrl}/api/ingest/{s}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {inbound.length === 0 ? (
        <p className="px-5 py-5 text-muted" data-testid="inbound-empty">
          Zatím nepřišel žádný požadavek.
        </p>
      ) : (
        <SettingsTable
          label="Příchozí požadavky"
          testId="inbound-table"
          rows={inbound}
          rowKey={(e) => e.id}
          columns={[
            {
              key: "when",
              header: "Přijato",
              primary: true,
              cell: (e) => <span className="tabular">{formatDateTime(e.receivedAt)}</span>,
            },
            { key: "source", header: "Zdroj", cell: (e) => e.source },
            {
              key: "id",
              header: "ID události",
              cell: (e) => (
                <span
                  className="block max-w-56 truncate font-mono text-xs text-muted"
                  title={e.externalId}
                >
                  {e.externalId}
                </span>
              ),
            },
            { key: "status", header: "Stav", cell: (e) => <InboundStatus s={e.status} /> },
            {
              key: "error",
              header: "Důvod",
              cell: (e) =>
                e.error ? (
                  <span className="block max-w-80 break-words text-sm text-danger">{e.error}</span>
                ) : (
                  <span className="text-faint">—</span>
                ),
            },
          ]}
          actions={(e) =>
            e.status === "failed" &&
            !e.externalId.startsWith("rejected:") &&
            !e.externalId.startsWith("invalid:") ? (
              <Button size="sm" loading={busy === e.id} onClick={() => void reprocess(e)}>
                <RotateCcw /> Zpracovat znovu
              </Button>
            ) : null
          }
        />
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Vyměnit tajemství?"
        confirmLabel="Vyměnit tajemství"
        onConfirm={() => rotate(revokeOld)}
      >
        <p>
          Vygeneruje se nové tajemství, které musíte vložit do n8n. Staré bude platit ještě 24
          hodin, aby se mezi výměnou a úpravou n8n neztratily požadavky.
        </p>
        <label className="mt-3 flex cursor-pointer items-center gap-2">
          <Checkbox
            aria-label="Staré tajemství zneplatnit hned"
            checked={revokeOld}
            onCheckedChange={(v) => setRevokeOld(!!v)}
          />
          Staré tajemství zneplatnit hned (při podezření na únik)
        </label>
      </ConfirmDialog>

      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent title="Tajemství příchozích požadavků">
          <div className="space-y-3 px-5 py-4">
            {secret && (
              <SecretReveal secret={secret} label="Tajemství pro podepisování požadavků z n8n" />
            )}
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setSecret(null)}>
                Uložil(a) jsem si ho
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </FormSection>
  );
}
