"use client";

import {
  Button,
  Chip,
  FormSection,
  Notice,
  SettingsPage,
  errorToast,
  successToast,
} from "@rebar/ui";
import type { DeliveryRow } from "@rebar/core/webhooks";
import type { InboundEventRow } from "@rebar/core/ingest";
import {
  Activity,
  DatabaseBackup,
  HardDrive,
  Plug,
  RefreshCw,
  RotateCcw,
  Send,
  Server,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { runAction } from "@/lib/run-action";
import { formatDateTime } from "../_shared/format";
import { SettingsTable } from "../_shared/settings-table";
import {
  reprocessSystemInboundAction,
  retryAllSystemDeliveriesAction,
  retrySystemDeliveryAction,
} from "./actions";
import type { SystemStatus } from "./system-status";

const STATUS_CHIP = {
  ok: { color: "green", label: "V pořádku" },
  degraded: { color: "orange", label: "Vyžaduje pozornost" },
  fail: { color: "red", label: "Nefunguje" },
} as const;

/** „1,4 GB“, „820 kB“ (české desetinné čárky). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  const units = ["B", "kB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const text = i === 0 || v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(".", ",");
  return `${text} ${units[i]}`;
}

/** „před 3 h“, „před 2 dny“: stáří pro rychlý odhad, přesný čas je vedle. */
function ago(iso: string | null, now: string): string {
  if (!iso) return "nikdy";
  const min = Math.max(0, Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 2) return "právě teď";
  if (min < 120) return `před ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `před ${h} h`;
  return `před ${Math.round(h / 24)} dny`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-base">{children}</dd>
    </div>
  );
}

function StateChip({ ok, good, bad }: { ok: boolean; good: string; bad: string }) {
  return ok ? (
    <Chip color="green" dot>
      {good}
    </Chip>
  ) : (
    <Chip color="red" dot>
      {bad}
    </Chip>
  );
}

/** Stránka Nastavení → Systém (viz `page.tsx`). */
export function SystemAdmin({ status }: { status: SystemStatus }) {
  const router = useRouter();
  const { health, backup, queue, database, heartbeat, integrations } = status;
  const now = status.generatedAt;
  const chip = STATUS_CHIP[health.status];
  const [busy, setBusy] = useState<string | null>(null);

  async function retryDelivery(d: DeliveryRow) {
    setBusy(d.id);
    const r = await runAction(retrySystemDeliveryAction({ id: d.id }));
    setBusy(null);
    if (!r) return;
    if (r.data?.outcome === "delivered") successToast("Znovu odesláno a doručeno.");
    else if (r.data) errorToast(`Odeslání se znovu nepovedlo. ${r.data.error ?? ""}`.trim());
    router.refresh();
  }

  async function retryAll() {
    setBusy("all");
    const r = await runAction(retryAllSystemDeliveriesAction({}));
    setBusy(null);
    if (r) {
      successToast(
        r.data.count
          ? `Vráceno do fronty: ${r.data.count}. Odešle je worker do minuty.`
          : "Žádné chybné doručení.",
      );
      router.refresh();
    }
  }

  async function reprocess(e: InboundEventRow) {
    setBusy(e.id);
    const r = await runAction(reprocessSystemInboundAction({ id: e.id }));
    setBusy(null);
    if (r) {
      if (r.data.ok) successToast("Událost se zpracovala.");
      else errorToast("Zpracování se znovu nepovedlo, důvod je u události.");
      router.refresh();
    }
  }

  return (
    <SettingsPage
      width="xl"
      title="Systém"
      description="Stav systému, zálohy, chyby integrací a chybná doručení webhooků."
      icon={<Server />}
    >
      <FormSection
        title="Stav systému"
        description={`Zjištěno ${formatDateTime(status.generatedAt)}. Stránka nic neposílá; stav se čte při otevření.`}
        icon={<Activity />}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <Chip color={chip.color} dot>
              {chip.label}
            </Chip>
            <Button onClick={() => router.refresh()} aria-label="Obnovit stav systému">
              <RefreshCw /> Obnovit
            </Button>
          </div>
        }
      >
        <dl data-testid="system-health" className="grid gap-x-6 gap-y-3 @lg:grid-cols-3">
          <Row label="Verze">
            <span className="tabular" data-testid="system-version">
              {status.version}
            </span>
          </Row>
          <Row label="Databáze">
            <StateChip ok={health.db.ok} good="Odpovídá" bad="Neodpovídá" />
            {health.db.latencyMs != null && (
              <span className="ml-2 text-sm text-muted tabular">{health.db.latencyMs} ms</span>
            )}
          </Row>
          <Row label="Volné místo na disku">
            {health.disk ? (
              <span className="tabular">
                {health.disk.freePercent} % ({formatBytes(health.disk.freeBytes)} z{" "}
                {formatBytes(health.disk.totalBytes)})
              </span>
            ) : (
              <span className="text-muted">Nelze zjistit</span>
            )}
          </Row>
          <Row label="Heartbeat (hlášení agentuře)">
            {heartbeat.configured ? (
              <span>
                {heartbeat.lastRunAt ? (
                  <>
                    poslední {formatDateTime(heartbeat.lastRunAt)}{" "}
                    <span className="text-sm text-muted">({ago(heartbeat.lastRunAt, now)})</span>
                  </>
                ) : (
                  <span className="text-muted">zatím neproběhl</span>
                )}
                {heartbeat.lastFailedAt && (
                  <span className="block text-sm text-danger">
                    Poslední selhání {formatDateTime(heartbeat.lastFailedAt)}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted">Nenastavený (HEARTBEAT_URL)</span>
            )}
          </Row>
          <Row label="Fronta úloh">
            {queue.available ? (
              <span className="tabular">
                {queue.ready} čeká · {queue.active} běží
                {queue.oldestReadySeconds != null && queue.oldestReadySeconds > 60 && (
                  <span className="block text-sm text-muted">
                    nejstarší čeká {Math.round(queue.oldestReadySeconds / 60)} min
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted">Nelze zjistit</span>
            )}
          </Row>
          <Row label="Velikost databáze">
            <span className="tabular" data-testid="system-db-size">
              {formatBytes(database.sizeBytes)}
            </span>
          </Row>
        </dl>
        {health.problems.length > 0 && (
          <Notice tone="warning" title="Co je potřeba řešit" className="mt-4">
            <ul className="list-disc pl-5" data-testid="system-problems">
              {health.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Notice>
        )}
      </FormSection>

      <FormSection
        title="Zálohy"
        description="Každou noc se vytvoří šifrovaný dump databáze a souborů (restic) mimo server. Uchovává se 30 denních a 12 měsíčních záloh; jednou měsíčně se poslední záloha zkusmo obnoví do dočasné databáze."
        icon={<DatabaseBackup />}
        badge={
          backup.configured && backup.readable && !backup.lastError ? (
            <Chip color="green" dot>
              Zálohuje se
            </Chip>
          ) : (
            <Chip color="red" dot>
              Vyžaduje pozornost
            </Chip>
          )
        }
      >
        {!backup.configured ? (
          <Notice tone="error" title="Zálohy nejsou nastavené">
            Chybí <code>BACKUP_STATUS_FILE</code>. Postup je v <code>docs/DEPLOYMENT.md</code>{" "}
            (RESTIC_REPOSITORY a RESTIC_PASSWORD v .env).
          </Notice>
        ) : !backup.readable ? (
          <Notice tone="warning" title="Zatím není záznam o záloze">
            Stavový soubor ještě nevznikl. První záloha proběhne v nastavený čas (výchozí 02:30)
            nebo ručně příkazem <code>scripts/backup.sh</code>.
          </Notice>
        ) : null}
        {backup.lastError && (
          <Notice tone="error" title="Poslední záloha selhala" className="mb-4">
            {formatDateTime(backup.lastFailureAt)} · {backup.lastError}
          </Notice>
        )}
        <dl data-testid="system-backup" className="grid gap-x-6 gap-y-3 @lg:grid-cols-3">
          <Row label="Poslední úspěšná záloha">
            {backup.lastSuccessAt ? (
              <span>
                {formatDateTime(backup.lastSuccessAt)}{" "}
                <span className="text-sm text-muted">({ago(backup.lastSuccessAt, now)})</span>
              </span>
            ) : (
              <span className="text-muted">Žádná</span>
            )}
          </Row>
          <Row label="Snapshot a velikost dumpu">
            <span className="tabular">
              {backup.lastSnapshot ?? "—"} · {formatBytes(backup.dumpBytes)}
              {backup.snapshots != null && (
                <span className="block text-sm text-muted">{backup.snapshots} uložených záloh</span>
              )}
            </span>
          </Row>
          <Row label="Zkouška obnovy">
            {backup.restoreTest ? (
              <span>
                <StateChip ok={backup.restoreTest.ok} good="Prošla" bad="Selhala" />{" "}
                <span className="text-sm text-muted">
                  {formatDateTime(backup.restoreTest.at)} ({ago(backup.restoreTest.at, now)})
                </span>
                {backup.restoreTest.detail && (
                  <span className="block text-sm text-muted">{backup.restoreTest.detail}</span>
                )}
              </span>
            ) : (
              <span className="text-muted">Zatím neproběhla (běží měsíčně)</span>
            )}
          </Row>
        </dl>
        <p className="mt-3 text-sm text-muted">
          Obnova je ruční a jen na serveru: <code>scripts/restore.sh</code> (postup v{" "}
          <code>docs/RUNBOOK.md</code>). Klíče AUTH_SECRET a APP_ENCRYPTION_KEY nejsou v záloze,
          uložte je ve správci hesel.
        </p>
      </FormSection>

      <FormSection
        title="Databáze a fronty"
        description="Velikost databáze, největší tabulky a úlohy na pozadí (n8n webhooky, synchronizace, úklid)."
        icon={<HardDrive />}
      >
        <div className="grid gap-6 @lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-medium text-muted">Největší tabulky</h3>
            {database.tables.length === 0 ? (
              <p className="text-muted">Nelze zjistit.</p>
            ) : (
              <table className="w-full text-left text-base" aria-label="Největší tabulky">
                <tbody>
                  {database.tables.map((t) => (
                    <tr key={t.name} className="border-b border-line last:border-0">
                      <td className="py-1 pr-2">{t.name}</td>
                      <td className="py-1 text-right text-muted tabular">≈ {t.rows} řádků</td>
                      <td className="py-1 pl-3 text-right tabular">{formatBytes(t.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div data-testid="system-queue">
            <h3 className="mb-1 text-sm font-medium text-muted">Úlohy na pozadí</h3>
            {!queue.available ? (
              <p className="text-muted">Fronta není dostupná.</p>
            ) : (
              <>
                <p className="tabular">
                  {queue.ready} čeká · {queue.active} běží · {queue.retry} k opakování ·{" "}
                  <span className={queue.failed24h > 0 ? "text-danger" : ""}>
                    {queue.failed24h} selhalo za 24 h
                  </span>
                </p>
                {queue.failedByName.length > 0 && (
                  <ul className="mt-2 text-sm">
                    {queue.failedByName.map((f) => (
                      <li key={f.name} className="flex justify-between gap-3">
                        <span>{f.name}</span>
                        <span className="text-muted tabular">
                          {f.count}× · {formatDateTime(f.lastAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Chyby integrací"
        description="Příchozí požadavky z n8n (Google Disk, Meta leady) a uložené přístupy ke službám. Nastavení a protokol jsou v Integracích."
        icon={<Plug />}
        badge={
          integrations.problems > 0 ? (
            <Chip color="red" dot>
              {integrations.problems} vyžaduje pozornost
            </Chip>
          ) : (
            <Chip color="green" dot>
              Bez chyb
            </Chip>
          )
        }
      >
        <dl data-testid="system-integrations" className="grid gap-x-6 gap-y-3 @lg:grid-cols-3">
          <Row label="Příchozí zdroje">
            {integrations.inbound.length === 0 ? (
              <span className="text-muted">Zatím nic nepřišlo.</span>
            ) : (
              integrations.inbound.map((s) => (
                <span key={s.source} className="block">
                  <span className="font-medium">{s.source}</span>
                  <span className="text-sm text-muted tabular">
                    {" "}
                    · poslední {formatDateTime(s.lastReceivedAt)}
                    {s.failed24h > 0 ? ` · ${s.failed24h} selhání za 24 h` : ""}
                  </span>
                </span>
              ))
            )}
          </Row>
          <Row label="Uložené přístupy">
            {integrations.credentials.length === 0 ? (
              <span className="text-muted">Žádné.</span>
            ) : (
              integrations.credentials.map((c) => (
                <span key={c.id} className="flex items-center gap-2">
                  {c.provider}
                  {c.status === "ok" ? (
                    <Chip color="green">Funguje</Chip>
                  ) : c.status === "reauth" ? (
                    <Chip color="orange">Vyžaduje nové přihlášení</Chip>
                  ) : (
                    <Chip color="red">Chyba</Chip>
                  )}
                </span>
              ))
            )}
          </Row>
          <Row label="Odchozí webhooky">
            <span className="tabular">
              {integrations.webhooks.endpointsActive} z {integrations.webhooks.endpointsTotal}{" "}
              aktivních
              <span className="block text-sm text-muted">
                {integrations.webhooks.pending} čeká · {integrations.webhooks.failed} chybných ·{" "}
                {integrations.webhooks.delivered24h} doručeno za 24 h
              </span>
            </span>
          </Row>
        </dl>
        {status.failedInbound.length > 0 && (
          <div className="mt-4" data-testid="system-failed-inbound">
            <SettingsTable
              label="Selhané příchozí události"
              rows={status.failedInbound}
              rowKey={(e) => e.id}
              columns={[
                {
                  key: "when",
                  header: "Čas",
                  primary: true,
                  cell: (e) => <span className="tabular">{formatDateTime(e.receivedAt)}</span>,
                },
                { key: "source", header: "Zdroj", cell: (e) => e.source },
                {
                  key: "error",
                  header: "Chyba",
                  cell: (e) => (
                    <span className="block max-w-96 break-words text-sm text-danger">
                      {e.error ?? "—"}
                    </span>
                  ),
                },
              ]}
              actions={(e) => (
                <Button size="sm" loading={busy === e.id} onClick={() => void reprocess(e)}>
                  <RotateCcw /> Zpracovat znovu
                </Button>
              )}
            />
          </div>
        )}
        <p className="mt-3 text-sm">
          <Link href="/nastaveni/integrace" className="text-accent underline">
            Otevřít Integrace
          </Link>
        </p>
      </FormSection>

      <FormSection
        title="Chybná doručení webhooků"
        description="Doručení do n8n, která se po všech pokusech nepovedla (1 min, 5 min, 15 min, 30 min, 1 h). Po opravě n8n je jde poslat znovu."
        icon={<Send />}
        flush
        badge={
          <Button
            disabled={status.failedDeliveries.length === 0}
            loading={busy === "all"}
            onClick={() => void retryAll()}
            data-testid="system-retry-all"
          >
            <RotateCcw /> Opakovat všechna
            {status.failedDeliveries.length ? ` (${status.failedDeliveries.length})` : ""}
          </Button>
        }
      >
        {status.failedDeliveries.length === 0 ? (
          <p className="px-5 py-5 text-muted" data-testid="system-no-failed-deliveries">
            Žádné chybné doručení.
          </p>
        ) : (
          <SettingsTable
            label="Chybná doručení webhooků"
            testId="system-failed-deliveries"
            rows={status.failedDeliveries}
            rowKey={(d) => d.id}
            columns={[
              {
                key: "when",
                header: "Čas",
                primary: true,
                cell: (d) => <span className="tabular">{formatDateTime(d.createdAt)}</span>,
              },
              { key: "event", header: "Událost", cell: (d) => d.event },
              {
                key: "ep",
                header: "Webhook",
                cell: (d) => <span className="text-muted">{d.endpointName}</span>,
              },
              {
                key: "attempts",
                header: "Pokusy",
                cell: (d) => <span className="tabular text-muted">{d.attempts}</span>,
              },
              {
                key: "error",
                header: "Poslední chyba",
                cell: (d) => (
                  <span
                    className="block max-w-80 break-words text-sm text-danger"
                    title={d.lastError ?? ""}
                  >
                    {d.lastError?.replace(/^\S+ · /, "") ?? "—"}
                  </span>
                ),
              },
            ]}
            actions={(d) => (
              <Button size="sm" loading={busy === d.id} onClick={() => void retryDelivery(d)}>
                <RotateCcw /> Opakovat
              </Button>
            )}
          />
        )}
      </FormSection>

      <FormSection
        title="Koš"
        description="Smazané záznamy se drží 30 dní a jdou obnovit i s tím, co pod ně patřilo. Pak se smažou trvale."
        icon={<Trash2 />}
      >
        <Link href="/kos" className="text-accent underline" data-testid="system-trash-link">
          Otevřít Koš
        </Link>
      </FormSection>
    </SettingsPage>
  );
}
