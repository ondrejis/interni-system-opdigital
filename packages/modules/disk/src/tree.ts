/*
  Strom složek: výchozí struktura ze spec 00 („Google Disk“), čisté operace editoru (přidat, přejmenovat, smazat,
  přeskládat), kontrola platnosti a převod na tvar, který se posílá n8n. Žádné závislosti na serveru ani databázi,
  takže ho používá server i editor v prohlížeči.
*/
import type { ServiceType } from "@rebar/core/contracts";
import { DRIVE_SERVICES, type DriveStructure, type FolderNode, type ResolvedNode } from "./types";

/** Nejvíc úrovní stromu (složka klienta nebo zakázky je úroveň 0, její podsložky úroveň 1…). */
export const MAX_TREE_DEPTH = 5;
/** Nejvíc složek v jednom stromu. */
export const MAX_TREE_NODES = 150;
/** Nejdelší název složky. */
export const MAX_FOLDER_NAME = 80;

const node = (id: string, name: string, children: FolderNode[] = []): FolderNode => ({
  id,
  name,
  children,
});

/** Výchozí struktura složek podle specifikace (D §1.2, DRV-01). Vrací novou kopii. */
export function defaultStructure(): DriveStructure {
  return {
    version: 1,
    clientsRoot: "Klienti",
    archiveRoot: "Archiv",
    jobFolderName: "{RRRR-MM} {Název zakázky}",
    client: [
      node("client-00", "00 Klient", [
        node("client-00-smlouvy", "Smlouvy a objednávky"),
        node("client-00-brand", "Brand a loga"),
        node("client-00-podklady", "Podklady od klienta"),
      ]),
      { ...node("client-web", "10 Web"), service: "web" },
      { ...node("client-marketing", "20 Marketing"), service: "marketing" },
      { ...node("client-systemy", "30 Systémy"), service: "systemy" },
    ],
    job: {
      web: [
        node("web-01", "01 Podklady"),
        node("web-02", "02 Návrh"),
        node("web-03", "03 Texty a obsah"),
        node("web-04", "04 Fotky a média"),
        node("web-05", "05 Předání"),
      ],
      marketing: [
        node("mkt-01", "01 Strategie a podklady"),
        node("mkt-02", "02 Kreativy", [
          node("mkt-02-foto", "Foto"),
          node("mkt-02-video", "Video"),
          node("mkt-02-texty", "Texty a scénáře"),
        ]),
        node("mkt-03", "03 Finální exporty"),
        node("mkt-04", "04 Reporty"),
      ],
      systemy: [
        node("sys-01", "01 Analýza a specifikace"),
        node("sys-02", "02 Podklady a data"),
        node("sys-03", "03 Design"),
        node("sys-04", "04 Dokumentace"),
        node("sys-05", "05 Předání"),
      ],
    },
  };
}

/** Názvy typů zakázek ve stromu (pro editor a chybové hlášky). */
export const SERVICE_LABEL: Record<ServiceType, string> = {
  web: "Web",
  marketing: "Marketing",
  systemy: "Systémy",
};

/** Hluboká kopie stromu (operace editoru nikdy nemění vstup). */
export function cloneNodes(nodes: readonly FolderNode[]): FolderNode[] {
  return nodes.map((n) => ({ ...n, children: cloneNodes(n.children) }));
}

/** Složka služby klienta (`10 Web`…) se nesmí smazat ani přesunout z první úrovně: pod ní vznikají složky zakázek. */
export function isProtected(n: FolderNode): boolean {
  return n.service !== undefined;
}

/** Počet uzlů ve stromu včetně všech podúrovní. */
export function countNodes(nodes: readonly FolderNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

/** Největší hloubka: seznam bez podsložek má hloubku 1. */
export function depthOf(nodes: readonly FolderNode[]): number {
  return nodes.reduce((max, n) => Math.max(max, 1 + depthOf(n.children)), 0);
}

type Found = { list: FolderNode[]; index: number; parent: FolderNode | null };

function find(nodes: FolderNode[], id: string, parent: FolderNode | null = null): Found | null {
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]!;
    if (n.id === id) return { list: nodes, index: i, parent };
    const inner = find(n.children, id, n);
    if (inner) return inner;
  }
  return null;
}

/** Uzel podle ID (kdekoli ve stromu), nebo `null`. */
export function findNode(nodes: readonly FolderNode[], id: string): FolderNode | null {
  const hit = find(nodes as FolderNode[], id);
  return hit ? hit.list[hit.index]! : null;
}

/**
 * Přidá složku: pod uzel `parentId`, nebo na první úroveň (`null`). `id` dodá volající (v prohlížeči
 * `crypto.randomUUID()`, v testech pevné). Název se jen ořízne; platnost řeší `validateTree`.
 */
export function addNode(
  nodes: readonly FolderNode[],
  parentId: string | null,
  name: string,
  id: string,
): FolderNode[] {
  const next = cloneNodes(nodes);
  const fresh: FolderNode = { id, name: name.trim(), children: [] };
  if (parentId === null) next.push(fresh);
  else {
    const hit = find(next, parentId);
    if (!hit) return next;
    hit.list[hit.index]!.children.push(fresh);
  }
  return next;
}

/** Přejmenuje složku (ID se nemění). */
export function renameNode(nodes: readonly FolderNode[], id: string, name: string): FolderNode[] {
  const next = cloneNodes(nodes);
  const hit = find(next, id);
  if (hit) hit.list[hit.index]!.name = name;
  return next;
}

/** Smaže složku i s podsložkami; složka služby se nesmaže (vrátí se beze změny). */
export function removeNode(nodes: readonly FolderNode[], id: string): FolderNode[] {
  const next = cloneNodes(nodes);
  const hit = find(next, id);
  if (!hit || isProtected(hit.list[hit.index]!)) return next;
  hit.list.splice(hit.index, 1);
  return next;
}

/** Posune složku mezi sourozenci o jednu pozici nahoru nebo dolů. */
export function moveNode(
  nodes: readonly FolderNode[],
  id: string,
  direction: "up" | "down",
): FolderNode[] {
  const next = cloneNodes(nodes);
  const hit = find(next, id);
  if (!hit) return next;
  const target = direction === "up" ? hit.index - 1 : hit.index + 1;
  if (target < 0 || target >= hit.list.length) return next;
  const [moved] = hit.list.splice(hit.index, 1);
  hit.list.splice(target, 0, moved!);
  return next;
}

/** Zanoří složku: stane se poslední podsložkou předchozího sourozence. Složka služby se nezanořuje. */
export function indentNode(nodes: readonly FolderNode[], id: string): FolderNode[] {
  const next = cloneNodes(nodes);
  const hit = find(next, id);
  if (!hit || hit.index === 0 || isProtected(hit.list[hit.index]!)) return next;
  const [moved] = hit.list.splice(hit.index, 1);
  hit.list[hit.index - 1]!.children.push(moved!);
  return next;
}

/** Vynoří složku o úroveň výš: stane se sourozencem svého rodiče (hned za ním). */
export function outdentNode(nodes: readonly FolderNode[], id: string): FolderNode[] {
  const next = cloneNodes(nodes);
  const hit = find(next, id);
  if (!hit || !hit.parent || isProtected(hit.list[hit.index]!)) return next;
  const parentHit = find(next, hit.parent.id);
  if (!parentHit) return next;
  const [moved] = hit.list.splice(hit.index, 1);
  parentHit.list.splice(parentHit.index + 1, 0, moved!);
  return next;
}

/**
 * Upraví název složky pro Disk: lomítka (oddělovače cesty) nahradí pomlčkou, bílé znaky sjednotí, ořízne a zkrátí.
 * Prázdný název se nahradí zástupným, aby se složka vždy mohla založit.
 */
export function sanitizeFolderName(raw: string, fallback = "Bez názvu"): string {
  const cleaned = raw
    .replace(/[\\/]+/g, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cut = cleaned.length > 120 ? cleaned.slice(0, 120).trimEnd() : cleaned;
  return cut || fallback;
}

/** Název je platný pro složku ve stromu (bez lomítek, neprázdný, ne příliš dlouhý). */
export function folderNameProblem(name: string): string | null {
  const t = name.trim();
  if (!t) return "Název složky nesmí být prázdný.";
  if (t.length > MAX_FOLDER_NAME) return `Název složky je delší než ${MAX_FOLDER_NAME} znaků.`;
  if (/[\\/]/.test(t)) return "Název složky nesmí obsahovat lomítko.";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(t)) return "Název složky obsahuje nepovolený znak.";
  return null;
}

function validateList(
  nodes: readonly FolderNode[],
  path: string,
  depth: number,
  seenIds: Set<string>,
  errors: string[],
  allowService: boolean,
) {
  const names = new Set<string>();
  for (const n of nodes) {
    const where = path ? `${path} / ${n.name || "(bez názvu)"}` : n.name || "(bez názvu)";
    const problem = folderNameProblem(n.name);
    if (problem) errors.push(`${where}: ${problem}`);
    const key = n.name.trim().toLocaleLowerCase("cs");
    if (key && names.has(key)) errors.push(`${where}: složka se stejným názvem už tu je.`);
    names.add(key);
    if (!n.id) errors.push(`${where}: chybí identifikátor složky.`);
    else if (seenIds.has(n.id)) errors.push(`${where}: identifikátor složky se opakuje.`);
    seenIds.add(n.id);
    if (n.service && !allowService)
      errors.push(`${where}: složka služby je jen ve stromu klienta.`);
    if (n.service && depth > 0) errors.push(`${where}: složka služby musí být na první úrovni.`);
    if (depth + 1 >= MAX_TREE_DEPTH && n.children.length)
      errors.push(`${where}: strom je příliš hluboký (nejvýš ${MAX_TREE_DEPTH} úrovní).`);
    validateList(n.children, where, depth + 1, seenIds, errors, allowService);
  }
}

/** Co je v celé struktuře špatně (prázdné pole = platná). Zpráva je česky, pro uživatele v editoru. */
export function validateStructure(s: DriveStructure): string[] {
  const errors: string[] = [];
  for (const [label, value] of [
    ["Složka klientů", s.clientsRoot],
    ["Složka archivu", s.archiveRoot],
  ] as const) {
    const problem = folderNameProblem(value);
    if (problem) errors.push(`${label}: ${problem}`);
  }
  if (!s.jobFolderName.includes("{Název zakázky}"))
    errors.push("Název složky zakázky musí obsahovat {Název zakázky}.");

  const ids = new Set<string>();
  validateList(s.client, "Klient", 0, ids, errors, true);
  for (const service of DRIVE_SERVICES) {
    const count = s.client.filter((n) => n.service === service).length;
    if (count !== 1)
      errors.push(
        `Klient: musí existovat právě jedna složka služby ${SERVICE_LABEL[service]} (je jich ${count}).`,
      );
  }
  if (countNodes(s.client) > MAX_TREE_NODES)
    errors.push(`Klient: nejvýš ${MAX_TREE_NODES} složek.`);
  for (const service of DRIVE_SERVICES) {
    const list = s.job[service];
    validateList(list, SERVICE_LABEL[service], 0, new Set<string>(), errors, false);
    if (countNodes(list) > MAX_TREE_NODES)
      errors.push(`${SERVICE_LABEL[service]}: nejvýš ${MAX_TREE_NODES} složek.`);
  }
  return errors;
}

/**
 * Strom pro n8n: jen názvy a pořadí (bez interních ID). U stromu klienta se složky služeb, které klient nemá,
 * vynechají (`services`); u stromu zakázky se nevynechává nic.
 */
export function resolveNodes(
  nodes: readonly FolderNode[],
  services?: ReadonlySet<ServiceType> | readonly ServiceType[],
): ResolvedNode[] {
  const has = services ? new Set<ServiceType>(services) : null;
  return nodes
    .filter((n) => !n.service || !has || has.has(n.service))
    .map((n) => ({
      name: sanitizeFolderName(n.name),
      ...(n.service ? { service: n.service } : {}),
      children: resolveNodes(n.children),
    }));
}

/** Složka služby ve stromu klienta (`10 Web`), nebo `null`, když ji někdo ze stromu odstranil. */
export function serviceNode(s: DriveStructure, service: ServiceType): FolderNode | null {
  return s.client.find((n) => n.service === service) ?? null;
}

/**
 * Nahradí chybějící nebo poškozenou část uloženého nastavení výchozí hodnotou (strom z Nastavení nikdy nesmí
 * zablokovat zakládání složek). Vrací platnou strukturu.
 */
export function ensureValidStructure(candidate: DriveStructure | null | undefined): DriveStructure {
  if (candidate && validateStructure(candidate).length === 0) return candidate;
  return defaultStructure();
}
