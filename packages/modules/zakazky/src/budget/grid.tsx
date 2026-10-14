"use client";

import { parseMinor } from "@rebar/core/shared";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  errorToast,
  Tooltip,
  useVatRates,
  vatBpChoices,
} from "@rebar/ui";
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  Copy,
  FileStack,
  FolderInput,
  MoreHorizontal,
  MoveDown,
  MoveUp,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CellInput, KindIcon, KindPicker, type CellMove } from "./cells";
import { itemKindLabel, normalizeQuantity, type Amounts } from "./math";
import type { BudgetTreeView, ItemView } from "./types";
import type { ItemNode, ObjectNode, SectionNode } from "./math";
import type { ObjectView, SectionView } from "./types";
import { amount, moneyInput, parseVat, pct, qty, qtyInput, vat, vatInput } from "./ui-format";
import { useCmd } from "./use-cmd";

type Obj = ObjectNode<ObjectView, SectionView, ItemView>;
type Sec = SectionNode<SectionView, ItemView>;
type Itm = ItemNode<ItemView>;

type Col = "code" | "title" | "kind" | "unit" | "qty" | "cost" | "price" | "vat";
const COL_ORDER: Col[] = ["code", "title", "kind", "unit", "qty", "cost", "price", "vat"];

/** Sloupce: výběr, kód, název, druh, MJ, množství, nákl. j. c., prodej j. c., DPH, náklad, prodej, marže, menu. */
const TEMPLATE = "28px 64px minmax(240px,1fr) 44px 60px 88px 96px 96px 60px 104px 112px 72px 36px";

type Row =
  | { kind: "object"; key: string; node: Obj; open: boolean }
  | {
      kind: "section";
      key: string;
      node: Sec;
      depth: number;
      open: boolean;
      sibIndex: number;
      sibCount: number;
    }
  | {
      kind: "item";
      key: string;
      node: Itm;
      depth: number;
      sectionId: string;
      sibIndex: number;
      sibCount: number;
    }
  | { kind: "add-item"; key: string; sectionId: string; depth: number }
  | { kind: "add-section"; key: string; objectId: string; depth: number };

function editableCols(r: Row, readOnly: boolean): Col[] {
  if (r.kind === "item") return readOnly ? ["title"] : COL_ORDER;
  if (r.kind === "section" || r.kind === "object") return readOnly ? [] : ["code", "title"];
  return readOnly ? [] : ["title"];
}
/** Sloupce, na které se dá nastavit výběr (i v zamčené verzi, kvůli procházení šipkami a výkazu výměr). */
function navCols(r: Row, readOnly: boolean): Col[] {
  if (r.kind === "item" && readOnly) return ["title", "qty"];
  return editableCols(r, readOnly);
}

function buildRows(tree: BudgetTreeView, collapsed: ReadonlySet<string>, readOnly: boolean): Row[] {
  const rows: Row[] = [];
  const showObjects = !tree.singleObject;
  for (const o of tree.objects as unknown as Obj[]) {
    const open = !collapsed.has(o.id);
    if (showObjects) rows.push({ kind: "object", key: `o:${o.id}`, node: o, open });
    if (showObjects && !open) continue;
    const base = showObjects ? 1 : 0;
    const walk = (s: Sec, depth: number, sibIndex: number, sibCount: number): void => {
      const isOpen = !collapsed.has(s.id);
      rows.push({
        kind: "section",
        key: `s:${s.id}`,
        node: s,
        depth,
        open: isOpen,
        sibIndex,
        sibCount,
      });
      if (!isOpen) return;
      s.items.forEach((i, n) =>
        rows.push({
          kind: "item",
          key: `i:${i.id}`,
          node: i,
          depth: depth + 1,
          sectionId: s.id,
          sibIndex: n,
          sibCount: s.items.length,
        }),
      );
      s.children.forEach((c, n) => walk(c, depth + 1, n, s.children.length));
      if (!readOnly)
        rows.push({ kind: "add-item", key: `ai:${s.id}`, sectionId: s.id, depth: depth + 1 });
    };
    o.sections.forEach((s, n) => walk(s, base, n, o.sections.length));
    if (!readOnly)
      rows.push({ kind: "add-section", key: `as:${o.id}`, objectId: o.id, depth: base });
  }
  return rows;
}

const COLLAPSE_KEY = (jobId: string) => `budget-collapsed:${jobId}`;
function loadCollapsed(jobId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY(jobId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveCollapsed(jobId: string, set: ReadonlySet<string>) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY(jobId), JSON.stringify([...set]));
  } catch {
    /* paměť prohlížeče není dostupná, stav se jen nezapamatuje */
  }
}

export type GridApi = {
  expandAll: () => void;
  collapseAll: () => void;
  addFirstSection: () => void;
};

type Props = {
  tree: BudgetTreeView;
  readOnly: boolean;
  /** Menu položky nabízí „Nová změna z řádku“ (realizační verze, hotová záložka Změny). */
  canChange: boolean;
  onCalc: (item: ItemView) => void;
  onMoveItems: (ids: string[]) => void;
  onPriceItems: (ids: string[]) => void;
  onNewChange: (item: ItemView) => void;
  apiRef?: { current: GridApi | null };
  /** Oddíl, jehož název se má po vzniku rovnou začít psát. */
  autoEditSection?: string | null;
  onAutoEditDone?: () => void;
};

/**
 * Stromová tabulka rozpočtu: objekt → oddíl (víc úrovní) → položka, s inline editací jako ve zbytku aplikace
 * (šipky se pohybují, Enter nebo psaní upravuje, Enter ukládá a jde dolů, Tab doprava, Esc ruší),
 * součty na každé úrovni a „původně → nyní“ u změněných položek.
 */
export function BudgetGrid({
  tree,
  readOnly,
  canChange,
  onCalc,
  onMoveItems,
  onPriceItems,
  onNewChange,
  apiRef,
  autoEditSection,
  onAutoEditDone,
}: Props) {
  const jobId = tree.job.id;
  const versionId = tree.version!.id;
  const vatRates = useVatRates();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  useEffect(() => setCollapsed(loadCollapsed(jobId)), [jobId]);
  const rows = useMemo(() => buildRows(tree, collapsed, readOnly), [tree, collapsed, readOnly]);
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  const [active, setActive] = useState<{ row: string; col: Col } | null>(null);
  const [edit, setEdit] = useState<{ row: string; col: Col; seed?: string } | null>(null);
  const [kindFor, setKindFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pend, setPend] = useState<Record<string, string>>({});
  const [del, setDel] = useState<{
    kind: "item" | "section" | "object";
    id: string;
    title: string;
    count: number;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  /** Akce z nabídky řádku, která otevře editaci buňky: nabídka po zavření nesmí vrátit fokus na své tlačítko. */
  const editFromMenu = useRef(false);

  useEffect(() => {
    if (!autoEditSection || !byKey.has(`s:${autoEditSection}`)) return;
    setActive({ row: `s:${autoEditSection}`, col: "title" });
    setEdit({ row: `s:${autoEditSection}`, col: "title" });
    onAutoEditDone?.();
  }, [autoEditSection, byKey, onAutoEditDone]);

  // po skončení úpravy se fokus vrací na tabulku, aby šlo pokračovat klávesnicí (neukradne ho dialogu ani menu)
  useEffect(() => {
    if (edit || kindFor || !active) return;
    const ae = document.activeElement;
    if (!ae || ae === document.body || gridRef.current?.contains(ae))
      gridRef.current?.focus({ preventScroll: true });
  }, [edit, kindFor, active]);

  // hodnoty, které čekají na potvrzení ze serveru, se ukazují hned; po načtení stromu se zahodí
  useEffect(() => setPend({}), [tree]);

  const itemSave = useCmd<Record<string, unknown>, { id: string }>("zakazky.budget.item.save");
  const sectionSave = useCmd<Record<string, unknown>, { id: string }>(
    "zakazky.budget.section.save",
  );
  const objectSave = useCmd<Record<string, unknown>, { id: string }>("zakazky.budget.object.save");
  const itemDelete = useCmd("zakazky.budget.item.delete");
  const sectionDelete = useCmd("zakazky.budget.section.delete");
  const objectDelete = useCmd("zakazky.budget.object.delete");
  const itemMove = useCmd("zakazky.budget.item.move");
  const sectionMove = useCmd("zakazky.budget.section.move");
  const itemDuplicate = useCmd("zakazky.budget.item.duplicate");

  const persist = (next: Set<string>) => {
    setCollapsed(next);
    saveCollapsed(jobId, next);
  };
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persist(next);
  };

  if (apiRef)
    apiRef.current = {
      expandAll: () => persist(new Set()),
      collapseAll: () => {
        const all = new Set<string>();
        for (const r of rows) if (r.kind === "section") all.add(r.node.id);
        persist(all);
      },
      addFirstSection: () => void addSection(tree.objects[0]!.id, null, "Nový oddíl", true),
    };

  /* ---------- pohyb ---------- */

  const navRows = rows.filter((r) => navCols(r, readOnly).length > 0);
  const focusCell = (row: string, col: Col) => {
    setActive({ row, col });
    setEdit(null);
  };

  function stepVertical(dir: 1 | -1) {
    if (!active) return;
    const i = navRows.findIndex((r) => r.key === active.row);
    const target = navRows[i + dir];
    if (!target) return;
    const cols = navCols(target, readOnly);
    focusCell(target.key, cols.includes(active.col) ? active.col : cols[cols.length > 1 ? 1 : 0]!);
  }
  function stepHorizontal(dir: 1 | -1) {
    if (!active) return;
    const row = byKey.get(active.row);
    if (!row) return;
    const cols = navCols(row, readOnly);
    const j = cols.indexOf(active.col);
    const next = cols[j + dir];
    if (next) focusCell(row.key, next);
  }
  function afterCommit(rowKey: string, col: Col, move?: CellMove) {
    if (!move) return setEdit(null);
    if (move === "down") {
      const i = navRows.findIndex((r) => r.key === rowKey);
      const t = navRows[i + 1];
      if (!t) return focusCell(rowKey, col);
      const cols = navCols(t, readOnly);
      return focusCell(t.key, cols.includes(col) ? col : cols[0]!);
    }
    const row = byKey.get(rowKey);
    if (!row) return setEdit(null);
    const cols = navCols(row, readOnly);
    const j = cols.indexOf(col);
    const dir = move === "next" ? 1 : -1;
    if (cols[j + dir]) return focusCell(rowKey, cols[j + dir]!);
    const i = navRows.findIndex((r) => r.key === rowKey);
    const t = navRows[i + dir];
    if (!t) return focusCell(rowKey, col);
    const tc = navCols(t, readOnly);
    focusCell(t.key, dir === 1 ? tc[0]! : tc[tc.length - 1]!);
  }

  useEffect(() => {
    if (!active) return;
    document.getElementById(`bc-${active.row}-${active.col}`)?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [active]);

  /* ---------- zápis ---------- */

  async function addSection(
    objectId: string,
    parentId: string | null,
    title: string,
    editTitle = false,
  ) {
    const r = await sectionSave.run({ versionId, objectId, parentId, title });
    if (r) {
      if (parentId && collapsed.has(parentId)) {
        const next = new Set(collapsed);
        next.delete(parentId);
        persist(next);
      }
      if (editTitle) setEdit({ row: `s:${r.id}`, col: "title" });
      setActive({ row: `s:${r.id}`, col: "title" });
    }
    return r;
  }

  /** Uložení běží na pozadí, tabulka se hned posune dál; při chybě se vrátí původní hodnota a ukáže se důvod. */
  function saveInBackground(p: Promise<{ data: unknown } | { error: string }>, pendKey: string) {
    void p.then((res) => {
      if ("error" in res) {
        setPend(({ [pendKey]: _drop, ...rest }) => rest);
        errorToast(res.error);
      }
    });
  }

  async function commit(row: Row, col: Col, text: string, move?: CellMove): Promise<string | null> {
    const t = text.trim();
    const pendKey = `${row.key}:${col}`;
    if (row.kind === "add-item") {
      if (!t) {
        afterCommit(row.key, col, move);
        return null;
      }
      const res = await itemSave.attempt({ sectionId: row.sectionId, title: t });
      if ("error" in res) return res.error;
      if (move === "next") {
        setEdit(null);
        setActive({ row: `i:${res.data.id}`, col: "qty" });
      } else setEdit({ row: row.key, col: "title" }); // další položka rovnou
      return null;
    }
    if (row.kind === "add-section") {
      if (!t) {
        afterCommit(row.key, col, move);
        return null;
      }
      const res = await sectionSave.attempt({
        versionId,
        objectId: row.objectId,
        parentId: null,
        title: t,
      });
      if ("error" in res) return res.error;
      setEdit({ row: row.key, col: "title" });
      return null;
    }
    if (row.kind === "section" || row.kind === "object") {
      const field = col === "code" ? "code" : "title";
      if (field === "title" && !t)
        return row.kind === "section" ? "Vyplňte název oddílu." : "Vyplňte název objektu.";
      const cmd = row.kind === "section" ? sectionSave : objectSave;
      setPend((p) => ({ ...p, [pendKey]: t }));
      saveInBackground(
        cmd.attempt({ id: row.node.id, [field]: field === "code" ? t || null : t }),
        pendKey,
      );
      afterCommit(row.key, col, move);
      return null;
    }
    // položka
    const it = row.node;
    const patch: Record<string, unknown> = {};
    let shown = t;
    switch (col) {
      case "code":
        patch.code = t || null;
        break;
      case "title":
        if (!t) return "Vyplňte název položky.";
        patch.title = t;
        break;
      case "unit":
        if (!t) return "Vyplňte měrnou jednotku.";
        patch.unit = t;
        break;
      case "qty": {
        const n = normalizeQuantity(t);
        if (n === null) return "Zadejte číslo (nejvýš 3 desetinná místa).";
        patch.quantity = n;
        shown = qty(n);
        break;
      }
      case "cost":
      case "price": {
        const m = t === "" ? 0 : parseMinor(t);
        if (m === null) return "Zadejte částku, např. 125 000 nebo 1 250,50.";
        patch[col === "cost" ? "unitCostMinor" : "unitPriceMinor"] = m;
        shown = amount(m);
        break;
      }
      case "vat": {
        const bp = parseVat(t);
        if (bp === null) return "Zadejte sazbu DPH v procentech, např. 21.";
        patch.vatRateBp = bp;
        shown = vat(bp);
        break;
      }
      default:
        return null;
    }
    setPend((p) => ({ ...p, [pendKey]: shown }));
    saveInBackground(itemSave.attempt({ id: it.id, ...patch }), pendKey);
    afterCommit(row.key, col, move);
    return null;
  }

  function initialText(row: Row, col: Col): string {
    if (row.kind === "item") {
      const i = row.node;
      switch (col) {
        case "code":
          return i.code ?? "";
        case "title":
          return i.title;
        case "unit":
          return i.unit;
        case "qty":
          return qtyInput(i.quantity);
        case "cost":
          return moneyInput(i.unitCostMinor);
        case "price":
          return moneyInput(i.unitPriceMinor);
        case "vat":
          return vatInput(i.vatRateBp);
        default:
          return "";
      }
    }
    if (row.kind === "section" || row.kind === "object")
      return col === "code" ? (row.node.code ?? "") : row.node.title;
    return "";
  }

  function startEdit(row: Row, col: Col, seed?: string) {
    if (readOnly) {
      if (row.kind === "item" && col === "qty" && row.node.calcCount > 0) onCalc(row.node);
      return;
    }
    if (!editableCols(row, readOnly).includes(col)) return;
    setActive({ row: row.key, col });
    if (row.kind === "item" && col === "kind") return setKindFor(row.key);
    if (row.kind === "item" && col === "qty" && row.node.calcCount > 0) return onCalc(row.node);
    setEdit({ row: row.key, col, ...(seed !== undefined ? { seed } : {}) });
  }

  function reorder(row: Row, dir: -1 | 1) {
    if (readOnly) return;
    if (row.kind === "item") {
      const to = row.sibIndex + dir;
      if (to < 0 || to >= row.sibCount) return;
      void itemMove.run({ id: row.node.id, index: to });
    } else if (row.kind === "section") {
      const to = row.sibIndex + dir;
      if (to < 0 || to >= row.sibCount) return;
      void sectionMove.run({ id: row.node.id, parentId: row.node.parentId, index: to });
    }
  }

  function askDelete(row: Row) {
    if (readOnly) return;
    if (row.kind === "item")
      setDel({ kind: "item", id: row.node.id, title: row.node.title, count: 0 });
    else if (row.kind === "section")
      setDel({
        kind: "section",
        id: row.node.id,
        title: row.node.title,
        count: row.node.itemCount,
      });
    else if (row.kind === "object" && !row.node.isDefault)
      setDel({ kind: "object", id: row.node.id, title: row.node.title, count: 0 });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (edit || kindFor) return;
    if (
      (e.target as HTMLElement).closest("button, [role=menu], input, [role=checkbox]") &&
      e.target !== e.currentTarget
    )
      return;
    const mod = e.metaKey || e.ctrlKey;
    if (!active) {
      if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key) && navRows[0]) {
        e.preventDefault();
        const r = navRows[0];
        focusCell(r.key, navCols(r, readOnly)[0]!);
      }
      return;
    }
    const row = byKey.get(active.row);
    if (!row) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (e.altKey) reorder(row, 1);
        else stepVertical(1);
        return;
      case "ArrowUp":
        e.preventDefault();
        if (e.altKey) reorder(row, -1);
        else stepVertical(-1);
        return;
      case "ArrowRight":
        e.preventDefault();
        stepHorizontal(1);
        return;
      case "ArrowLeft":
        e.preventDefault();
        stepHorizontal(-1);
        return;
      case "Tab": {
        e.preventDefault();
        afterCommit(row.key, active.col, e.shiftKey ? "prev" : "next");
        return;
      }
      case "Enter":
      case "F2":
        e.preventDefault();
        startEdit(row, active.col);
        return;
      case "Escape":
        setActive(null);
        setSelected(new Set());
        return;
      case " ":
        if (row.kind === "section" || row.kind === "object") {
          e.preventDefault();
          toggle(row.node.id);
        } else if (row.kind === "item") {
          e.preventDefault();
          toggleSelect(row.node.id);
        }
        return;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        askDelete(row);
        return;
      case "d":
        if (mod && row.kind === "item" && !readOnly) {
          e.preventDefault();
          void itemDuplicate.run({ id: row.node.id });
        }
        return;
      default:
        if (e.key.length === 1 && !mod && !e.altKey) {
          if (active.col === "kind") return;
          e.preventDefault();
          startEdit(row, active.col, e.key);
        }
    }
  }

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const visibleItemIds = rows
    .filter((r) => r.kind === "item")
    .map((r) => (r as Extract<Row, { kind: "item" }>).node.id);
  const allSelected = visibleItemIds.length > 0 && visibleItemIds.every((id) => selected.has(id));
  const selIds = [...selected].filter((id) => visibleItemIds.includes(id));

  const bulk = useCmd("zakazky.budget.item.bulk");

  /* ---------- vykreslení ---------- */

  function cellEditor(row: Row, col: Col, align: "left" | "right" = "left"): ReactNode {
    return (
      <CellInput
        initial={initialText(row, col)}
        seed={edit?.seed}
        align={align}
        inputMode={align === "right" ? "decimal" : "text"}
        {...(col === "unit" ? { list: "budget-units" } : {})}
        label={COL_LABEL[col]}
        onCommit={(text, move) => commit(row, col, text, move)}
        onCancel={() => setEdit(null)}
      />
    );
  }

  const cell = (
    row: Row,
    col: Col,
    display: ReactNode,
    opts: { align?: "left" | "right"; className?: string } = {},
  ) => {
    const isActive = active?.row === row.key && active.col === col;
    const isEditing = edit?.row === row.key && edit.col === col;
    return (
      <div
        id={`bc-${row.key}-${col}`}
        role="gridcell"
        aria-selected={isActive}
        onClick={() => {
          if (isActive && !isEditing) startEdit(row, col);
          else if (!isEditing) {
            if (navCols(row, readOnly).includes(col)) focusCell(row.key, col);
            else setActive(null);
          }
        }}
        onDoubleClick={() => startEdit(row, col)}
        className={`relative flex h-9 min-w-0 items-center ${opts.align === "right" ? "justify-end" : ""} ${
          isActive && !isEditing ? "shadow-[inset_0_0_0_2px_var(--accent)]" : ""
        } ${opts.className ?? ""}`}
      >
        {isEditing ? (
          cellEditor(row, col, opts.align)
        ) : kindFor === row.key && col === "kind" && row.kind === "item" ? (
          <KindPicker
            value={row.node.kind}
            onClose={() => setKindFor(null)}
            onPick={async (kind) => {
              setKindFor(null);
              await itemSave.run({ id: row.node.id, kind });
            }}
          >
            <div className="flex size-full items-center justify-center">{display}</div>
          </KindPicker>
        ) : (
          display
        )}
      </div>
    );
  };

  const text = (row: Row, col: Col, value: string, cls = "") => (
    <span className={`block min-w-0 truncate px-2 ${cls}`}>
      {pend[`${row.key}:${col}`] ?? value}
    </span>
  );
  const num = (row: Row, col: Col, value: string, cls = "") => (
    <span className={`tabular block min-w-0 truncate px-2 text-right ${cls}`}>
      {pend[`${row.key}:${col}`] ?? value}
    </span>
  );

  /** Součet s řádkem „pův. …“, když se liší od původní hodnoty. */
  const withOriginal = (now: string, original: string | null, bold = false) => (
    <span className="tabular flex min-w-0 flex-col items-end px-2 leading-tight">
      <span className={`block max-w-full truncate ${bold ? "font-semibold" : ""}`}>{now}</span>
      {original !== null && (
        <span
          className="block max-w-full truncate text-xs text-faint"
          title={`Původně ${original}`}
        >
          pův. {original}
        </span>
      )}
    </span>
  );
  const totalsCells = (a: Amounts, bold: boolean) => {
    const sellChanged = a.originalSellMinor !== a.sellMinor;
    const costChanged = a.originalCostMinor !== a.costMinor;
    return (
      <>
        <div role="gridcell" className="flex h-9 min-w-0 items-center justify-end">
          {withOriginal(
            amount(a.costMinor),
            costChanged ? amount(a.originalCostMinor) : null,
            bold,
          )}
        </div>
        <div role="gridcell" className="flex h-9 min-w-0 items-center justify-end">
          {withOriginal(
            amount(a.sellMinor),
            sellChanged ? amount(a.originalSellMinor) : null,
            bold,
          )}
        </div>
        <div
          role="gridcell"
          className={`tabular flex h-9 min-w-0 items-center justify-end px-2 ${
            a.marginMinor < 0 ? "text-danger" : "text-muted"
          } ${bold ? "font-medium" : ""}`}
          title={`Marže ${amount(a.marginMinor)} Kč`}
        >
          {pct(a.marginPct)}
        </div>
      </>
    );
  };

  const menu = (row: Row) => {
    if (row.kind === "add-item" || row.kind === "add-section") return <div role="gridcell" />;
    const item = row.kind === "item" ? row.node : null;
    const canStructure = !readOnly;
    return (
      <div role="gridcell" className="flex h-9 items-center justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              label="Další akce"
              size="sm"
              className="opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
            >
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            onCloseAutoFocus={(e) => {
              if (!editFromMenu.current) return;
              editFromMenu.current = false;
              e.preventDefault();
              // editor se otevřel (a zaostřil) ještě za otevřené nabídky, která fokus udržela u sebe; teď ho dostane editor
              gridRef.current?.querySelector<HTMLInputElement>("input")?.focus();
            }}
          >
            {item && (
              <DropdownMenuItem onSelect={() => onCalc(item)}>
                <Calculator />{" "}
                {readOnly || item.calcCount === 0 ? "Výkaz výměr…" : "Upravit výkaz výměr…"}
              </DropdownMenuItem>
            )}
            {item && canChange && (
              <DropdownMenuItem onSelect={() => onNewChange(item)}>
                <FileStack /> Nová změna z řádku
              </DropdownMenuItem>
            )}
            {row.kind === "section" && canStructure && (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    editFromMenu.current = true;
                    if (collapsed.has(row.node.id)) toggle(row.node.id);
                    setActive({ row: `ai:${row.node.id}`, col: "title" });
                    setEdit({ row: `ai:${row.node.id}`, col: "title" });
                  }}
                >
                  <Plus /> Přidat položku
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    void addSection(row.node.objectId, row.node.id, "Nový pododdíl", true)
                  }
                >
                  <Plus /> Přidat pododdíl
                </DropdownMenuItem>
              </>
            )}
            {canStructure && row.kind === "item" && (
              <>
                <DropdownMenuItem onSelect={() => void itemDuplicate.run({ id: row.node.id })}>
                  <Copy /> Duplikovat
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onMoveItems([row.node.id])}>
                  <FolderInput /> Přesunout do oddílu…
                </DropdownMenuItem>
              </>
            )}
            {canStructure && (row.kind === "item" || row.kind === "section") && (
              <>
                <DropdownMenuItem disabled={row.sibIndex === 0} onSelect={() => reorder(row, -1)}>
                  <MoveUp /> Posunout nahoru
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={row.sibIndex >= row.sibCount - 1}
                  onSelect={() => reorder(row, 1)}
                >
                  <MoveDown /> Posunout dolů
                </DropdownMenuItem>
              </>
            )}
            {canStructure && !(row.kind === "object" && row.node.isDefault) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem danger onSelect={() => askDelete(row)}>
                  <Trash2 />{" "}
                  {row.kind === "item"
                    ? "Smazat položku"
                    : row.kind === "section"
                      ? "Smazat oddíl"
                      : "Smazat objekt"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const rowView = (row: Row) => {
    const indent = {
      paddingLeft: `${row.kind === "object" ? 8 : 8 + ("depth" in row ? row.depth : 0) * 16}px`,
    };
    if (row.kind === "object") {
      const o = row.node;
      return (
        <div
          key={row.key}
          role="row"
          className="group/row grid border-b border-line bg-subtle"
          style={{ gridTemplateColumns: TEMPLATE }}
        >
          <div role="gridcell" />
          {cell(row, "code", text(row, "code", o.code ?? "", "text-faint"), {
            className: "font-medium",
          })}
          {cell(
            row,
            "title",
            <span className="flex min-w-0 items-center gap-1 px-2 font-semibold">
              <button
                type="button"
                aria-label={row.open ? "Sbalit objekt" : "Rozbalit objekt"}
                aria-expanded={row.open}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(o.id);
                }}
                className="-ml-1 rounded p-0.5 text-muted hover:bg-hover"
              >
                {row.open ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
              <span className="truncate">{pend[`${row.key}:title`] ?? o.title}</span>
            </span>,
          )}
          <div role="gridcell" className="col-span-6" />
          {totalsCells(o.totals, true)}
          {menu(row)}
        </div>
      );
    }
    if (row.kind === "section") {
      const s = row.node;
      return (
        <div
          key={row.key}
          role="row"
          className={`group/row grid border-b border-line ${row.depth <= (tree.singleObject ? 0 : 1) ? "bg-subtle" : "bg-bg"}`}
          style={{ gridTemplateColumns: TEMPLATE }}
        >
          <div role="gridcell" />
          {cell(row, "code", text(row, "code", s.code ?? "", "text-faint"))}
          {cell(
            row,
            "title",
            <span className="flex min-w-0 items-center gap-1 pr-2 font-medium" style={indent}>
              <button
                type="button"
                aria-label={row.open ? `Sbalit oddíl ${s.title}` : `Rozbalit oddíl ${s.title}`}
                aria-expanded={row.open}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(s.id);
                }}
                className="-ml-1 shrink-0 rounded p-0.5 text-muted hover:bg-hover"
              >
                {row.open ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </button>
              <span className="truncate">{pend[`${row.key}:title`] ?? s.title}</span>
              <span className="shrink-0 text-sm font-normal text-faint">{s.itemCount}</span>
            </span>,
          )}
          <div role="gridcell" className="col-span-6" />
          {totalsCells(s.totals, true)}
          {menu(row)}
        </div>
      );
    }
    if (row.kind === "add-item" || row.kind === "add-section") {
      const isItem = row.kind === "add-item";
      return (
        <div
          key={row.key}
          role="row"
          className="grid border-b border-line"
          style={{ gridTemplateColumns: TEMPLATE }}
        >
          <div role="gridcell" />
          <div role="gridcell" />
          {cell(
            row,
            "title",
            <span className="flex items-center gap-1 text-faint" style={indent}>
              <Plus className="size-3.5" aria-hidden />
              {isItem ? "Položka" : "Oddíl"}
            </span>,
            { className: "cursor-text text-faint hover:text-muted" },
          )}
          <div role="gridcell" className="col-span-10" />
        </div>
      );
    }
    // položka
    const it = row.node;
    const isSel = selected.has(it.id);
    const sellChanged = it.amounts.originalSellMinor !== it.amounts.sellMinor;
    const qtyChanged =
      it.originalQuantity !== null && Number(it.originalQuantity) !== Number(it.quantity);
    const priceChanged =
      it.originalUnitPriceMinor !== null && it.originalUnitPriceMinor !== it.unitPriceMinor;
    const costChanged =
      it.originalUnitCostMinor !== null && it.originalUnitCostMinor !== it.unitCostMinor;
    const costTotalChanged = it.amounts.originalCostMinor !== it.amounts.costMinor;
    return (
      <div
        key={row.key}
        role="row"
        aria-selected={isSel}
        className={`group/row grid border-b border-line hover:bg-hover ${isSel ? "bg-accent-soft" : ""} ${it.quantity === "0.000" && !readOnly ? "text-muted" : ""}`}
        style={{ gridTemplateColumns: TEMPLATE }}
      >
        <div role="gridcell" className="flex h-9 items-center justify-center">
          {!readOnly && (
            <Checkbox
              aria-label={`Vybrat položku ${it.title}`}
              checked={isSel}
              onCheckedChange={() => toggleSelect(it.id)}
              className={
                isSel
                  ? ""
                  : "opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100"
              }
            />
          )}
        </div>
        {cell(row, "code", text(row, "code", it.code ?? "", "text-faint"))}
        {cell(
          row,
          "title",
          <span className="flex min-w-0 items-center gap-1.5 pr-2" style={indent}>
            <span className="truncate">{pend[`${row.key}:title`] ?? it.title}</span>
            {it.changeId && (
              <Tooltip label="Přidáno schválenou změnou (ZBV)">
                <span className="chip shrink-0" data-color="purple">
                  ZBV
                </span>
              </Tooltip>
            )}
          </span>,
        )}
        {cell(
          row,
          "kind",
          <Tooltip label={itemKindLabel(it.kind)}>
            <span className="flex size-full items-center justify-center text-muted">
              <KindIcon kind={it.kind} />
            </span>
          </Tooltip>,
        )}
        {cell(row, "unit", text(row, "unit", it.unit, "text-muted"))}
        {cell(
          row,
          "qty",
          <span className="tabular flex min-w-0 flex-col items-end px-2 leading-tight">
            <span className="flex max-w-full items-center gap-1">
              {it.calcCount > 0 && (
                <Tooltip label="Množství z výkazu výměr">
                  <Calculator className="size-3.5 shrink-0 text-faint" aria-label="Výkaz výměr" />
                </Tooltip>
              )}
              <span className="truncate">{pend[`${row.key}:qty`] ?? qty(it.quantity)}</span>
            </span>
            {qtyChanged && (
              <span className="max-w-full truncate text-xs text-faint">
                pův. {qty(it.originalQuantity!)}
              </span>
            )}
          </span>,
          { align: "right" },
        )}
        {cell(
          row,
          "cost",
          <span className="tabular flex min-w-0 flex-col items-end px-2 leading-tight">
            <span className="max-w-full truncate">
              {pend[`${row.key}:cost`] ?? amount(it.unitCostMinor)}
            </span>
            {costChanged && (
              <span className="max-w-full truncate text-xs text-faint">
                pův. {amount(it.originalUnitCostMinor!)}
              </span>
            )}
          </span>,
          { align: "right" },
        )}
        {cell(
          row,
          "price",
          <span className="tabular flex min-w-0 flex-col items-end px-2 leading-tight">
            <span className="max-w-full truncate">
              {pend[`${row.key}:price`] ?? amount(it.unitPriceMinor)}
            </span>
            {priceChanged && (
              <span className="max-w-full truncate text-xs text-faint">
                pův. {amount(it.originalUnitPriceMinor!)}
              </span>
            )}
          </span>,
          { align: "right" },
        )}
        {cell(row, "vat", num(row, "vat", vat(it.vatRateBp), "text-muted"), { align: "right" })}
        <div role="gridcell" className="flex h-9 min-w-0 items-center justify-end">
          {withOriginal(
            amount(it.amounts.costMinor),
            costTotalChanged ? amount(it.amounts.originalCostMinor) : null,
          )}
        </div>
        <div role="gridcell" className="flex h-9 min-w-0 items-center justify-end">
          {withOriginal(
            amount(it.amounts.sellMinor),
            sellChanged ? amount(it.amounts.originalSellMinor) : null,
          )}
        </div>
        <div
          role="gridcell"
          className={`tabular flex h-9 min-w-0 items-center justify-end px-2 ${it.amounts.marginMinor < 0 ? "text-danger" : "text-muted"}`}
          title={`Marže ${amount(it.amounts.marginMinor)} Kč`}
        >
          {pct(it.amounts.marginPct)}
        </div>
        {menu(row)}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {selIds.length > 0 && !readOnly && (
        <div
          role="toolbar"
          aria-label="Hromadné úpravy"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-subtle px-3 py-2"
        >
          <span className="text-base font-medium">Vybráno {selIds.length}</span>
          <Button size="sm" onClick={() => onPriceItems(selIds)}>
            Cena o procento…
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">DPH</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {vatBpChoices(vatRates)
                .reverse()
                .map((bp) => (
                  <DropdownMenuItem
                    key={bp}
                    onSelect={() => void bulk.run({ ids: selIds, patch: { vatRateBp: bp } })}
                  >
                    {vat(bp)}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">Druh</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(["labour", "material", "subcontract", "machines", "other"] as const).map((k) => (
                <DropdownMenuItem
                  key={k}
                  onSelect={() => void bulk.run({ ids: selIds, patch: { kind: k } })}
                >
                  <KindIcon kind={k} /> {itemKindLabel(k)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => onMoveItems(selIds)}>
            Přesunout…
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            onClick={() =>
              setDel({
                kind: "item",
                id: "",
                title: `${selIds.length} položek`,
                count: selIds.length,
              })
            }
          >
            Smazat
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            Zrušit výběr
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <div
          ref={gridRef}
          role="grid"
          aria-label="Rozpočet zakázky"
          aria-rowcount={rows.length}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !edit && !kindFor)
              setActive(null);
          }}
          className="min-w-[1040px] text-base outline-none"
          data-testid="budget-grid"
        >
          <div
            role="row"
            className="grid h-9 items-center border-b border-line bg-subtle text-sm font-medium text-muted"
            style={{ gridTemplateColumns: TEMPLATE }}
          >
            <div role="columnheader" className="flex justify-center">
              {!readOnly && visibleItemIds.length > 0 && (
                <Checkbox
                  aria-label="Vybrat všechny položky"
                  checked={allSelected ? true : selIds.length ? "indeterminate" : false}
                  onCheckedChange={() =>
                    setSelected(allSelected ? new Set() : new Set(visibleItemIds))
                  }
                />
              )}
            </div>
            <div role="columnheader" className="px-2">
              Kód
            </div>
            <div role="columnheader" className="px-2">
              Název
            </div>
            <div role="columnheader" className="px-1 text-center">
              Druh
            </div>
            <div role="columnheader" className="px-2">
              MJ
            </div>
            <div role="columnheader" className="px-2 text-right">
              Množství
            </div>
            <div role="columnheader" className="px-2 text-right">
              Nákl. j. c.
            </div>
            <div role="columnheader" className="px-2 text-right">
              Prodej j. c.
            </div>
            <div role="columnheader" className="px-2 text-right">
              DPH
            </div>
            <div role="columnheader" className="px-2 text-right">
              Náklad
            </div>
            <div role="columnheader" className="px-2 text-right">
              Prodej
            </div>
            <div role="columnheader" className="px-2 text-right">
              Marže
            </div>
            <div role="columnheader" />
          </div>
          {rows.map(rowView)}
          <div
            role="row"
            className="grid border-t border-line-strong bg-subtle font-semibold"
            style={{ gridTemplateColumns: TEMPLATE }}
          >
            <div role="gridcell" />
            <div role="gridcell" className="col-span-8 flex h-9 items-center px-2">
              Celkem bez DPH
            </div>
            {totalsCells(tree.totals, true)}
            <div role="gridcell" />
          </div>
        </div>
      </div>
      <datalist id="budget-units">
        {["ks", "m", "m2", "m3", "bm", "kg", "t", "h", "den", "kpl", "sada"].map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={
          del?.kind === "section"
            ? `Smazat oddíl „${del.title}“?`
            : del?.kind === "object"
              ? `Smazat objekt „${del.title}“?`
              : del?.id
                ? `Smazat položku „${del.title}“?`
                : `Smazat ${del?.title}?`
        }
        description={
          del?.kind === "section" && del.count > 0
            ? `Smaže se i všechno uvnitř (položek: ${del.count}).`
            : undefined
        }
        confirmLabel="Smazat"
        danger
        onConfirm={async () => {
          if (!del) return;
          const r =
            del.kind === "section"
              ? await sectionDelete.run({ id: del.id, cascade: true })
              : del.kind === "object"
                ? await objectDelete.run({ id: del.id })
                : await itemDelete.run({ ids: del.id ? [del.id] : selIds });
          if (!r) return false;
          setSelected(new Set());
          setActive(null);
          return undefined;
        }}
      />
    </div>
  );
}

const COL_LABEL: Record<Col, string> = {
  code: "Kód",
  title: "Název",
  kind: "Druh",
  unit: "Měrná jednotka",
  qty: "Množství",
  cost: "Nákladová jednotková cena",
  price: "Prodejní jednotková cena",
  vat: "Sazba DPH",
};
