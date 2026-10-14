"use client";

import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Skeleton,
  Textarea,
  Combobox,
  IconButton,
  successToast,
  useCan,
  useCommandQuery,
  useNav,
} from "@rebar/ui";
import {
  FileDown,
  FilePlus2,
  LayoutTemplate,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Table2,
} from "lucide-react";
import { useRef, useState } from "react";
import { CalcDialog } from "./calc-dialog";
import { MoveItemsDialog, PriceAdjustDialog, TemplatePickerDialog } from "./dialogs";
import { BudgetGrid, type GridApi } from "./grid";
import { VERSION_KIND_LABEL, VERSION_STATUS_LABEL } from "./math";
import type { BudgetTreeView, ItemView, VersionSummary, VersionView } from "./types";
import { amount, money, pct } from "./ui-format";
import { useCmd } from "./use-cmd";

const STATUS_COLOR: Record<string, string> = { draft: "gray", sent: "blue", locked: "orange" };

const versionLabel = (v: VersionSummary) =>
  `${VERSION_KIND_LABEL[v.kind] ?? v.kind} ${v.number}${v.title ? ` – ${v.title}` : ""}`;

/** Záložka Rozpočet na detailu zakázky: verze (nabídka / realizace), stromová tabulka, součty, PDF nabídky. */
export function BudgetTab({
  jobId,
  openTab,
}: {
  jobId: string;
  /** Přepnutí záložky detailu bez navigace (předává detail zakázky). */
  openTab?: (tab: string, sub?: string) => void;
}) {
  const nav = useNav();
  const can = useCan();
  const [versionId, setVersionId] = useState<string | null>(null);
  const q = useCommandQuery<BudgetTreeView>("zakazky.budget.tree", { jobId, versionId });
  const gridApi = useRef<GridApi | null>(null);

  const [calc, setCalc] = useState<ItemView | null>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [priceIds, setPriceIds] = useState<string[] | null>(null);
  const [picker, setPicker] = useState(false);
  const [objectDlg, setObjectDlg] = useState(false);
  const [metaDlg, setMetaDlg] = useState(false);
  const [autoEdit, setAutoEdit] = useState<string | null>(null);

  const createVersion = useCmd<Record<string, unknown>, { id: string }>(
    "zakazky.budget.version.create",
  );
  const setStatus = useCmd("zakazky.budget.version.setStatus");
  const lock = useCmd("zakazky.budget.version.lock");
  const copyOffer = useCmd("zakazky.budget.copyOffer");
  const newChange = useCmd<Record<string, unknown>, { id: string }>("zakazky.changes.createDraft");
  const sectionSave = useCmd<Record<string, unknown>, { id: string }>(
    "zakazky.budget.section.save",
  );

  const tree = q.data;
  if (q.isLoading || !tree) return <Skeleton className="h-48" data-testid="budget-loading" />;

  const v = tree.version;
  const canWrite = can("zakazky.budget");
  const locked = !!v?.lockReason;
  const readOnly = !canWrite || locked;
  const realization = tree.versions.find((x) => x.kind === "realization") ?? null;
  const offers = tree.versions.filter((x) => x.kind === "offer");
  const hasContent = !!v && tree.objects.some((o) => o.sections.length > 0);
  const hasItems = tree.objects.some((o) => o.sections.some((s) => s.itemCount > 0));
  const select = (id: string | null) => setVersionId(id);

  /** První krok v prázdné zakázce: založí verzi podle fáze, pak provede navazující akci. */
  async function ensureVersion(): Promise<string | null> {
    if (v) return v.id;
    const r = await createVersion.run({ jobId });
    return r?.id ?? null;
  }

  async function addFirstSection() {
    const id = await ensureVersion();
    if (!id) return;
    const r = await sectionSave.run({ versionId: id, title: "Nový oddíl" });
    if (r) setAutoEdit(r.id);
  }

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      {tree.versions.length > 0 && realization && offers.length > 0 && (
        <SegmentedControl
          label="Verze rozpočtu"
          value={v?.kind === "realization" ? "realization" : "offer"}
          onChange={(k) =>
            select(k === "realization" ? realization.id : (offers[offers.length - 1]?.id ?? null))
          }
          options={[
            { value: "offer", label: "Nabídka" },
            { value: "realization", label: "Realizace" },
          ]}
        />
      )}
      {v?.kind === "offer" && offers.length > 1 && (
        <div className="w-44">
          <Combobox
            aria-label="Revize nabídky"
            options={offers.map((o) => ({ value: o.id, label: versionLabel(o) }))}
            value={v.id}
            onChange={(x) => x && select(x as string)}
          />
        </div>
      )}
      {v && (
        <Chip color={STATUS_COLOR[v.status] ?? "gray"} data-testid="budget-status">
          {VERSION_STATUS_LABEL[v.status] ?? v.status}
        </Chip>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {v?.kind === "offer" && v.status === "draft" && canWrite && hasItems && (
          <Button
            variant="primary"
            loading={setStatus.pending}
            onClick={async () => {
              const r = await setStatus.run({ versionId: v.id, status: "sent" });
              if (r) successToast("Nabídka je označená jako odeslaná zákazníkovi.");
            }}
          >
            <Send /> Odeslat nabídku
          </Button>
        )}
        {v?.kind === "offer" && hasItems && (
          <Button
            onClick={() =>
              window.open(`/api/zakazky/${jobId}/nabidka/pdf?version=${v.id}&download=1`, "_blank")
            }
          >
            <FileDown /> Stáhnout PDF
          </Button>
        )}
        {v && canWrite && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Další akce rozpočtu" variant="secondary">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onCloseAutoFocus={(e) => {
                // akce „Přidat oddíl“ otevře editor názvu v tabulce; nabídka mu po zavření nesmí vzít fokus
                const editor = document.querySelector<HTMLInputElement>(
                  '[data-testid="budget-grid"] input',
                );
                if (!editor) return;
                e.preventDefault();
                editor.focus();
              }}
            >
              {!locked && (
                <DropdownMenuItem onSelect={() => setObjectDlg(true)}>
                  <Plus /> Přidat stavební objekt
                </DropdownMenuItem>
              )}
              {!locked && (
                <DropdownMenuItem onSelect={() => gridApi.current?.addFirstSection()}>
                  <Plus /> Přidat oddíl
                </DropdownMenuItem>
              )}
              {!locked && !hasContent && (
                <DropdownMenuItem onSelect={() => setPicker(true)}>
                  <LayoutTemplate /> Použít šablonu…
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => gridApi.current?.expandAll()}>
                <Table2 /> Rozbalit vše
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => gridApi.current?.collapseAll()}>
                <Table2 /> Sbalit vše
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {v.kind === "offer" && (
                <DropdownMenuItem
                  onSelect={async () => {
                    const r = await createVersion.run({
                      jobId,
                      kind: "offer",
                      copyFromVersionId: v.id,
                    });
                    if (r) select(r.id);
                  }}
                >
                  <FilePlus2 /> Nová revize nabídky
                </DropdownMenuItem>
              )}
              {v.kind === "offer" && !locked && (
                <DropdownMenuItem onSelect={() => setMetaDlg(true)}>
                  <Pencil /> Název a poznámka nabídky…
                </DropdownMenuItem>
              )}
              {v.kind === "offer" && !realization && (
                <DropdownMenuItem onSelect={() => void copyOffer.run({ jobId })}>
                  <FilePlus2 /> Zkopírovat nabídku do realizace
                </DropdownMenuItem>
              )}
              {v.kind === "offer" && v.status === "sent" && (
                <DropdownMenuItem
                  onSelect={() => void setStatus.run({ versionId: v.id, status: "draft" })}
                >
                  Vrátit do rozpracovaných
                </DropdownMenuItem>
              )}
              {!locked && (
                <DropdownMenuItem onSelect={() => void lock.run({ versionId: v.id })}>
                  <Lock /> Zamknout {v.kind === "offer" ? "nabídku" : "rozpočet"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="budget-tab">
      {header}

      {v && locked && (
        <div
          role="status"
          data-testid="budget-lock"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-subtle p-3"
        >
          <Lock className="size-4 shrink-0 text-muted" aria-hidden />
          <p className="min-w-0 flex-1 text-base">{v.lockReason}</p>
          {can("zakazky.approve_all") && (
            <Button
              size="sm"
              loading={setStatus.pending}
              onClick={() => void setStatus.run({ versionId: v.id, status: "draft" })}
            >
              <LockOpen /> Odemknout
            </Button>
          )}
        </div>
      )}

      {v && hasItems && <Stats tree={tree} />}

      {!v || !hasContent ? (
        <div className="rounded-lg border border-dashed border-line-strong">
          <EmptyState
            icon={<Table2 />}
            title={v?.kind === "offer" ? "Nabídka zatím nemá žádné položky" : "Rozpočet je prázdný"}
            description="Rozpočet má oddíly a v nich položky s nákladovou i prodejní cenou, takže je hned vidět marže. Začněte šablonou, nebo si vytvořte první oddíl."
            action={
              canWrite && (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="primary" onClick={() => setPicker(true)}>
                    <LayoutTemplate /> Použít šablonu
                  </Button>
                  <Button onClick={() => void addFirstSection()}>
                    <Plus /> Přidat první oddíl
                  </Button>
                </div>
              )
            }
          />
        </div>
      ) : (
        <BudgetGrid
          tree={tree}
          readOnly={readOnly}
          canChange={v?.kind === "realization" && canWrite}
          apiRef={gridApi}
          autoEditSection={autoEdit}
          onAutoEditDone={() => setAutoEdit(null)}
          onCalc={setCalc}
          onMoveItems={setMoveIds}
          onPriceItems={setPriceIds}
          onNewChange={async (item) => {
            const r = await newChange.run({ jobId, itemId: item.id });
            if (!r) return;
            if (openTab) {
              // záložka Změny si otevřenou změnu přečte z adresy (`?change=`); navigace na stejnou stránku by
              // záložku nepřepnula (stav záložky se z adresy čte jen při otevření stránky)
              const url = new URL(window.location.href);
              url.searchParams.set("change", r.id);
              window.history.replaceState(window.history.state, "", url);
              openTab("zmeny");
            } else nav.push(`/zakazky/${jobId}?tab=zmeny&change=${r.id}`);
          }}
        />
      )}

      {v && hasItems && <VatSummary tree={tree} />}

      {calc && (
        <CalcDialog
          itemId={calc.id}
          title={calc.title}
          unit={calc.unit}
          readOnly={readOnly}
          onClose={() => setCalc(null)}
        />
      )}
      {moveIds && <MoveItemsDialog tree={tree} ids={moveIds} onClose={() => setMoveIds(null)} />}
      {priceIds && <PriceAdjustDialog ids={priceIds} onClose={() => setPriceIds(null)} />}
      {picker && (
        <TemplatePickerDialog
          jobId={jobId}
          versionId={v?.id ?? null}
          onClose={() => setPicker(false)}
        />
      )}
      {metaDlg && v && <MetaDialog version={v} onClose={() => setMetaDlg(false)} />}
      {objectDlg && v && <ObjectDialog versionId={v.id} onClose={() => setObjectDlg(false)} />}
    </div>
  );
}

/** Čtyři čísla rozpočtu: prodej, náklad, marže, celkem s DPH; při změně proti původní dohodě i původní hodnota. */
function Stats({ tree }: { tree: BudgetTreeView }) {
  const t = tree.totals;
  const diff = t.sellMinor !== t.originalSellMinor;
  const stat = (label: string, value: string, hint?: string, tone?: "danger") => (
    <div className="rounded-lg border border-line p-3">
      <div className="text-sm text-muted">{label}</div>
      <div
        className={`tabular mt-0.5 text-xl font-semibold ${tone === "danger" ? "text-danger" : ""}`}
      >
        {value}
      </div>
      {hint && <div className="text-sm text-faint">{hint}</div>}
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="budget-stats">
      {stat(
        "Prodej bez DPH",
        money(t.sellMinor),
        diff ? `původně ${money(t.originalSellMinor)}` : undefined,
      )}
      {stat(
        "Plánovaný náklad",
        money(t.costMinor),
        t.costMinor !== t.originalCostMinor ? `původně ${money(t.originalCostMinor)}` : undefined,
      )}
      {stat(
        "Marže",
        money(t.marginMinor),
        t.marginPct === null ? undefined : pct(t.marginPct),
        t.marginMinor < 0 ? "danger" : undefined,
      )}
      {stat(
        "Prodej s DPH",
        money(tree.vat.grossMinor),
        tree.job.vatMode === "reverse_charge" ? "přenesená daňová povinnost" : undefined,
      )}
    </div>
  );
}

function VatSummary({ tree }: { tree: BudgetTreeView }) {
  if (!tree.vat.groups.length) return null;
  const rc = tree.job.vatMode === "reverse_charge";
  return (
    <div className="flex justify-end">
      <table className="text-base" data-testid="budget-vat">
        <thead className="text-sm text-muted">
          <tr>
            <th className="px-3 py-1 text-right font-medium">Sazba DPH</th>
            <th className="px-3 py-1 text-right font-medium">Základ</th>
            <th className="px-3 py-1 text-right font-medium">DPH</th>
            <th className="px-3 py-1 text-right font-medium">Celkem</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {tree.vat.groups.map((g) => (
            <tr key={g.vatRateBp}>
              <td className="px-3 py-0.5 text-right">
                {(g.vatRateBp / 100).toLocaleString("cs-CZ")} %
              </td>
              <td className="px-3 py-0.5 text-right">{amount(g.netMinor)} Kč</td>
              <td className="px-3 py-0.5 text-right">{rc ? "—" : `${amount(g.vatMinor)} Kč`}</td>
              <td className="px-3 py-0.5 text-right">{amount(g.grossMinor)} Kč</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ObjectDialog({ versionId, onClose }: { versionId: string; onClose: () => void }) {
  const save = useCmd("zakazky.budget.object.save");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const submit = async () => {
    const r = await save.run({ versionId, code: code.trim() || null, title: title.trim() });
    if (r) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Nový stavební objekt"
        description="Například SO 01 Hlavní budova. Oddíly pak řadíte pod objekty."
        className="top-[18vh] w-[min(28rem,calc(100vw-2rem))]"
      >
        <form
          className="px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim().length > 0) void submit();
          }}
        >
          <div className="grid grid-cols-[7rem_1fr] gap-x-3">
            <Field label="Kód">
              <Input value={code} placeholder="SO 01" onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Field label="Název">
              <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={save.pending} disabled={!title.trim()}>
              Přidat objekt
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Název a poznámka nabídky (např. platnost nabídky); jdou do PDF. */
function MetaDialog({ version, onClose }: { version: VersionView; onClose: () => void }) {
  const save = useCmd("zakazky.budget.version.setStatus");
  const [title, setTitle] = useState(version.title ?? "");
  const [note, setNote] = useState(version.note ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Název a poznámka nabídky"
        description="Poznámka se vytiskne pod hlavičkou nabídky, např. platnost nabídky nebo platební podmínky."
        className="top-[14vh] w-[min(32rem,calc(100vw-2rem))]"
      >
        <form
          className="px-5 py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await save.run({ versionId: version.id, title, note });
            if (r) onClose();
          }}
        >
          <Field label="Název nabídky (výchozí je název zakázky)">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Poznámka">
            <Textarea
              value={note}
              placeholder="Nabídka platí 30 dní od data vystavení."
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" variant="primary" loading={save.pending}>
              Uložit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
