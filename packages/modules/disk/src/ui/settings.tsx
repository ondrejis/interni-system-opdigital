"use client";

import {
  Button,
  Chip,
  EmptyState,
  FormSection,
  IconButton,
  Input,
  Notice,
  SegmentedControl,
  SettingsPage,
  errorToast,
  successToast,
  useCommandMutation,
  useCommandQuery,
  Icon,
} from "@rebar/ui";
import { useEffect, useMemo, useState } from "react";
import {
  SERVICE_LABEL,
  addNode,
  folderNameProblem,
  indentNode,
  moveNode,
  outdentNode,
  removeNode,
  renameNode,
  validateStructure,
  isProtected,
} from "../tree";
import type {
  DiskStatus,
  DiskTestResult,
  DriveRequestState,
  DriveStructure,
  FolderNode,
} from "../types";

type StructureResponse = { structure: DriveStructure; isDefault: boolean; enabled: boolean };
type TreeKey = "client" | "web" | "marketing" | "systemy";

const TREE_LABEL: Record<TreeKey, string> = {
  client: "Klient",
  web: SERVICE_LABEL.web,
  marketing: SERVICE_LABEL.marketing,
  systemy: SERVICE_LABEL.systemy,
};

const STATE_LABEL: Record<DriveRequestState, string> = {
  pending: "Čeká",
  sent: "Odesláno",
  done: "Hotovo",
  error: "Chyba",
  timeout: "Bez odpovědi",
};
const STATE_COLOR: Record<DriveRequestState, string> = {
  pending: "blue",
  sent: "blue",
  done: "green",
  error: "red",
  timeout: "orange",
};
const EVENT_LABEL: Record<string, string> = {
  "client.create": "Složka klienta",
  "client.add_service": "Složka služby",
  "client.rename": "Přejmenování",
  "client.archive": "Přesun do Archivu",
  "client.restore": "Návrat z Archivu",
  "project.create": "Složka zakázky",
};

const newId = () => `n-${crypto.randomUUID().slice(0, 8)}`;

function NodeRow({
  node,
  depth,
  first,
  last,
  onChange,
  list,
}: {
  node: FolderNode;
  depth: number;
  first: boolean;
  last: boolean;
  list: (fn: (nodes: FolderNode[]) => FolderNode[]) => void;
  onChange: (nodes: FolderNode[]) => void;
}) {
  const problem = folderNameProblem(node.name);
  const locked = isProtected(node);
  return (
    <li>
      <div
        className="flex items-center gap-1 py-0.5"
        style={{ paddingLeft: depth * 20 }}
        data-testid="tree-node"
      >
        <Icon
          name={node.children.length ? "folder" : "folder"}
          className="size-4 shrink-0 text-muted"
        />
        <Input
          aria-label={`Název složky ${node.name}`}
          aria-invalid={!!problem}
          value={node.name}
          maxLength={80}
          className="h-8 max-w-xs"
          onChange={(e) => list((n) => renameNode(n, node.id, e.target.value))}
        />
        {node.service && <Chip color="blue">{SERVICE_LABEL[node.service]}</Chip>}
        <div className="hidden items-center md:flex">
          <IconButton
            label="Posunout nahoru"
            variant="ghost"
            disabled={first}
            onClick={() => list((n) => moveNode(n, node.id, "up"))}
          >
            <Icon name="chevron-down" className="rotate-180" />
          </IconButton>
          <IconButton
            label="Posunout dolů"
            variant="ghost"
            disabled={last}
            onClick={() => list((n) => moveNode(n, node.id, "down"))}
          >
            <Icon name="chevron-down" />
          </IconButton>
          <IconButton
            label="Zanořit pod předchozí"
            variant="ghost"
            disabled={first || locked}
            onClick={() => list((n) => indentNode(n, node.id))}
          >
            <Icon name="chevron-right" />
          </IconButton>
          <IconButton
            label="Vynořit o úroveň"
            variant="ghost"
            disabled={depth === 0 || locked}
            onClick={() => list((n) => outdentNode(n, node.id))}
          >
            <Icon name="chevron-left" />
          </IconButton>
          <IconButton
            label="Přidat podsložku"
            variant="ghost"
            onClick={() => list((n) => addNode(n, node.id, "Nová složka", newId()))}
          >
            <Icon name="plus" />
          </IconButton>
          <IconButton
            label="Smazat složku"
            variant="ghost"
            disabled={locked}
            onClick={() => list((n) => removeNode(n, node.id))}
          >
            <Icon name="trash" />
          </IconButton>
        </div>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c, i) => (
            <NodeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              first={i === 0}
              last={i === node.children.length - 1}
              list={list}
              onChange={onChange}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function TreeEditor({
  nodes,
  onChange,
}: {
  nodes: FolderNode[];
  onChange: (nodes: FolderNode[]) => void;
}) {
  const list = (fn: (n: FolderNode[]) => FolderNode[]) => onChange(fn(nodes));
  return (
    <div>
      <ul data-testid="tree-editor">
        {nodes.map((n, i) => (
          <NodeRow
            key={n.id}
            node={n}
            depth={0}
            first={i === 0}
            last={i === nodes.length - 1}
            list={list}
            onChange={onChange}
          />
        ))}
      </ul>
      <Button
        className="mt-3 hidden md:inline-flex"
        variant="secondary"
        size="sm"
        onClick={() => onChange(addNode(nodes, null, "Nová složka", newId()))}
      >
        <Icon name="plus" /> Přidat složku
      </Button>
    </div>
  );
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }) : "";

/**
 * Obsah Nastavení → Google Disk: stav napojení a test, zapnutí, editor stromu složek pro klienta a každý typ
 * zakázky (přidat, přejmenovat, smazat, přeskládat) a výpis posledních požadavků. Na mobilu je strom jen ke čtení.
 */
export function DriveSettings() {
  const structure = useCommandQuery<StructureResponse>("disk.structure.get", {});
  const status = useCommandQuery<DiskStatus>("disk.status", {}, { refetchInterval: 15_000 });
  const [draft, setDraft] = useState<DriveStructure | null>(null);
  const [tab, setTab] = useState<TreeKey>("client");
  const [test, setTest] = useState<DiskTestResult | null>(null);

  useEffect(() => {
    if (structure.data && !draft) setDraft(structure.data.structure);
  }, [structure.data, draft]);

  const save = useCommandMutation<{ structure: DriveStructure }, { ok: true }>(
    "disk.structure.set",
    {
      onSuccess: () => successToast("Strom složek uložen. Platí pro nově zakládané složky."),
    },
  );
  const toggle = useCommandMutation<{ enabled: boolean }, { ok: true }>("disk.enabled.set");
  const runTest = useCommandMutation<object, DiskTestResult>("disk.test", {
    onSuccess: (r) => setTest(r),
  });

  const problems = useMemo(() => (draft ? validateStructure(draft) : []), [draft]);
  const dirty =
    !!draft &&
    !!structure.data &&
    JSON.stringify(draft) !== JSON.stringify(structure.data.structure);

  const nodes = draft ? (tab === "client" ? draft.client : draft.job[tab]) : [];
  const setNodes = (next: FolderNode[]) =>
    draft &&
    setDraft(
      tab === "client"
        ? { ...draft, client: next }
        : { ...draft, job: { ...draft.job, [tab]: next } },
    );

  const s = status.data;
  return (
    <SettingsPage
      width="lg"
      title="Google Disk"
      description="Složky klientů a zakázek zakládá automatizace v n8n. OPSYS jí říká kdy a jakou strukturu; smazání čehokoli v OPSYS nikdy nesmaže nic na Disku."
      icon={<Icon name="google-drive" />}
      actions={
        <Button variant="secondary" loading={runTest.isPending} onClick={() => runTest.mutate({})}>
          <Icon name="check" /> Otestovat napojení
        </Button>
      }
    >
      <FormSection
        title="Napojení"
        description="Události Disku odcházejí jako webhooky (Nastavení → Integrace), n8n odpovídá na adresu níže."
        badge={
          s && (
            <Chip color={s.enabled ? (s.endpoints.length ? "green" : "orange") : "gray"} dot>
              {!s.enabled ? "Vypnuto" : s.endpoints.length ? "Napojeno" : "Chybí webhook"}
            </Chip>
          )
        }
      >
        {s ? (
          <div className="space-y-3 text-base">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) =>
                  toggle.mutate(
                    { enabled: e.target.checked },
                    { onError: (err) => errorToast(String(err.message)) },
                  )
                }
              />
              Zakládat složky automaticky
            </label>
            <div>
              <span className="text-muted">Adresa pro odpověď n8n: </span>
              <code className="break-all">{s.callbackUrl}</code>
            </div>
            <div>
              <span className="text-muted">Webhooky: </span>
              {s.endpoints.length
                ? s.endpoints.map((e) => e.name).join(", ")
                : "žádný nebere události Disku"}
            </div>
            <div className="text-muted">
              Za 7 dní: hotovo {s.counts7d.done}, čeká {s.counts7d.pending + s.counts7d.sent}, chyba{" "}
              {s.counts7d.error}, bez odpovědi {s.counts7d.timeout}.
              {s.lastDoneAt && ` Poslední odpověď n8n ${fmt(s.lastDoneAt)}.`}
            </div>
          </div>
        ) : (
          <p className="text-muted">Načítání…</p>
        )}
        {test && (
          <ul className="mt-4 space-y-2" data-testid="disk-test-result">
            {test.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-sm">
                <Chip color={c.status === "ok" ? "green" : c.status === "warn" ? "orange" : "red"}>
                  {c.status === "ok" ? "OK" : c.status === "warn" ? "Pozor" : "Chyba"}
                </Chip>
                <span>
                  <strong>{c.label}.</strong> {c.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <FormSection
        title="Strom složek"
        description="Zvlášť pro klienta a pro každý typ zakázky. Změna platí jen pro nově zakládané složky, už založené se nemění."
        footer={
          <div className="hidden w-full items-center justify-end gap-2 md:flex">
            <Button
              variant="ghost"
              disabled={!dirty}
              onClick={() => setDraft(structure.data?.structure ?? null)}
            >
              Zahodit změny
            </Button>
            <Button
              variant="primary"
              disabled={!dirty || problems.length > 0}
              loading={save.isPending}
              onClick={() =>
                draft &&
                save.mutate({ structure: draft }, { onError: (e) => errorToast(e.message) })
              }
            >
              Uložit strom
            </Button>
          </div>
        }
      >
        <Notice tone="info" className="mb-3 md:hidden">
          Strom složek se upravuje na větší obrazovce, tady je jen ke čtení.
        </Notice>
        {draft ? (
          <>
            <SegmentedControl
              label="Strom složek pro"
              value={tab}
              onChange={(v) => setTab(v as TreeKey)}
              options={(Object.keys(TREE_LABEL) as TreeKey[]).map((k) => ({
                value: k,
                label: TREE_LABEL[k],
              }))}
            />
            <p className="my-3 text-sm text-muted">
              {tab === "client"
                ? `Pod složkou „${draft.clientsRoot}/Název klienta“. Složky služeb (Web, Marketing, Systémy) vzniknou jen klientovi, který službu má, a jsou v nich složky zakázek.`
                : `Podsložky složky zakázky „${draft.jobFolderName}“ typu ${TREE_LABEL[tab]}.`}
            </p>
            <TreeEditor nodes={nodes} onChange={setNodes} />
            {problems.length > 0 && (
              <Notice tone="error" className="mt-3" title="Strom není platný">
                {problems.slice(0, 4).map((p) => (
                  <div key={p}>{p}</div>
                ))}
              </Notice>
            )}
          </>
        ) : (
          <p className="text-muted">Načítání…</p>
        )}
      </FormSection>

      <FormSection title="Poslední požadavky" flush>
        {s && s.recent.length ? (
          <table className="w-full text-sm" data-testid="disk-requests">
            <tbody>
              {s.recent.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-muted">{fmt(r.requestedAt)}</td>
                  <td className="px-2 py-2">
                    {EVENT_LABEL[r.event] ?? r.event}
                    {r.label ? `: ${r.label}` : ""}
                    {r.isPrivate && (
                      <Icon name="lock" className="ml-1 inline size-3.5 text-muted" />
                    )}
                    {r.error && <div className="text-danger">{r.error}</div>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Chip color={STATE_COLOR[r.state]}>{STATE_LABEL[r.state]}</Chip>
                    {r.attempts > 1 && <span className="ml-1 text-muted">pokus {r.attempts}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            title="Zatím žádné požadavky"
            description="Objeví se po založení klienta se stavem Lead nebo Aktivní."
          />
        )}
      </FormSection>
    </SettingsPage>
  );
}
