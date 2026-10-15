/*
  Obsah poznámky: Tiptap (ProseMirror) JSON a jeho sanitizace. Čistý a klientsky bezpečný soubor (žádné importy
  serveru ani databáze): čte ho server při každém zápisu, editor a testy.

  Server NIKDY nevěří JSON z klienta. `sanitizeNoteDoc` ho projde jako seznam povolených uzlů a značek, zahodí vše
  ostatní (obrázky, `style`, `class`, události, neznámé atributy), ověří odkazy (jen http, https, mailto, tel a adresy
  v aplikaci), omezí velikost a hloubku a vrátí kanonický dokument, který odpovídá schématu editoru. Z něj se také
  odvozuje prostý text (`body_text`) pro hledání a název. Obrázky a soubory do poznámky nepatří (jdou na Disk).
*/

/** Značka textu (tučné, kurzíva, odkaz…). */
export type NoteMark =
  | { type: "bold" | "italic" | "strike" | "underline" | "code" }
  | { type: "link"; attrs: { href: string } };

/** Uzel dokumentu poznámky (podmnožina schématu Tiptap StarterKit + seznam úkolů). */
export type NoteNode = {
  type: string;
  attrs?: Record<string, string | number | boolean | null>;
  content?: NoteNode[];
  marks?: NoteMark[];
  text?: string;
};

/** Dokument poznámky (kořen Tiptap JSON). */
export type NoteDoc = { type: "doc"; content: NoteNode[] };

/** Chyba neplatného obsahu (příliš velký, nebo nejde o dokument). Server ji převede na hlášku uživateli. */
export class NoteDocError extends Error {
  /** Vytvoří chybu s českou větou pro uživatele. */
  constructor(message: string) {
    super(message);
    this.name = "NoteDocError";
  }
}

/** Meze obsahu poznámky (ochrana databáze i prohlížeče před obřím nebo zlomyslným dokumentem). */
export const NOTE_LIMITS = {
  /** Nejvíc uzlů v dokumentu (součet všech úrovní). */
  maxNodes: 40_000,
  /** Nejvíc znaků textu v dokumentu. */
  maxChars: 200_000,
  /** Nejvíc úrovní vnoření (seznam v seznamu v citaci…). */
  maxDepth: 16,
  /** Nejdelší odkaz. */
  maxHrefLength: 2048,
  /** Nejdelší název poznámky. */
  maxTitle: 200,
} as const;

/** Přípustné úrovně nadpisů (editor nabízí 1 až 3). */
export const HEADING_LEVELS = [1, 2, 3, 4] as const;

const TEXT_MARKS = ["link", "bold", "italic", "underline", "strike", "code"] as const;
const MARK_ORDER = new Map<string, number>(TEXT_MARKS.map((m, i) => [m, i]));

const BLOCKS = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "codeBlock",
  "horizontalRule",
]);

/** Řídicí znaky (bez tabulátoru a nového řádku), úprava směru textu a znak BOM: do poznámky nepatří. */
const BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩﻿]/g;

/** Prázdný dokument (jeden prázdný odstavec). */
export function emptyNoteDoc(): NoteDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Prostý text jako dokument: každý neprázdný řádek je odstavec, prázdné řádky oddělují (jako nová poznámka z textu). */
export function textToNoteDoc(text: string): NoteDoc {
  const lines = text.replace(/\r\n?/g, "\n").replace(BAD_CHARS, "").split("\n");
  const content = lines.map((l): NoteNode => (l ? { type: "paragraph", content: [{ type: "text", text: l }] } : { type: "paragraph" }));
  return sanitizeNoteDoc({ type: "doc", content }).doc;
}

type Ctx = { nodes: number; chars: number };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Ověří a upraví odkaz. Vrací text odkazu, nebo `null`, když odkaz není bezpečný: povolené jsou `http:`, `https:`,
 * `mailto:`, `tel:`, adresy v aplikaci (`/kontakty/firmy/…`) a kotvy; bez schématu a s tečkou (`firma.cz`) se doplní
 * `https://`. `javascript:`, `data:`, `vbscript:` i obfuskované zápisy (tabulátor, nový řádek, entity) vždy odpadnou.
 */
export function sanitizeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const href = raw.trim();
  if (!href || href.length > NOTE_LIMITS.maxHrefLength) return null;
  // mezera, řídicí znak nebo znak, který v odkazu nemá co dělat: odkaz se zahodí (text zůstane)
  if (/[\s\u0000-\u001F\u007F-\u009F<>"'`\\‪-‮⁦-⁩]/.test(href)) return null;
  if (href.startsWith("#")) return href.length > 1 ? href : null;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(href);
  if (scheme) {
    const s = scheme[1]!.toLowerCase();
    if (s === "http" || s === "https") {
      try {
        const url = new URL(href);
        return url.hostname ? href : null;
      } catch {
        return null;
      }
    }
    if (s === "mailto") return /^mailto:[^@\s?]+@[^@\s?]+(\?.*)?$/i.test(href) ? href : null;
    if (s === "tel") return /^tel:\+?[0-9().\-;,#*]+$/i.test(href) ? href : null;
    return null;
  }
  // bez schématu: `firma.cz`, `www.firma.cz/cesta`; `host:port` už odchytilo „scheme“ výše
  if (/^[^/?#:@]+\.[^/?#:@]+/.test(href) && !href.startsWith("//")) {
    try {
      const url = new URL(`https://${href}`);
      return url.hostname.includes(".") ? `https://${href}` : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Značky textového uzlu: jen povolené, bez duplicit, v pevném pořadí (kanonický tvar), odkaz jen s bezpečným `href`. */
function cleanMarks(raw: unknown, allowed: boolean): NoteMark[] | undefined {
  if (!allowed || !Array.isArray(raw)) return undefined;
  const found = new Map<string, NoteMark>();
  for (const m of raw) {
    if (!isRecord(m) || typeof m.type !== "string" || !MARK_ORDER.has(m.type)) continue;
    if (m.type === "link") {
      const href = sanitizeHref(isRecord(m.attrs) ? m.attrs.href : null);
      if (href) found.set("link", { type: "link", attrs: { href } });
    } else {
      found.set(m.type, { type: m.type as "bold" } as NoteMark);
    }
  }
  if (!found.size) return undefined;
  return [...found.values()].sort((a, b) => MARK_ORDER.get(a.type)! - MARK_ORDER.get(b.type)!);
}

const sameMarks = (a: NoteMark[] | undefined, b: NoteMark[] | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Sloučí sousední textové uzly se stejnými značkami (kanonický tvar, který vydává editor). */
function mergeText(nodes: NoteNode[]): NoteNode[] {
  const out: NoteNode[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (last && last.type === "text" && n.type === "text" && sameMarks(last.marks, n.marks))
      last.text = (last.text ?? "") + (n.text ?? "");
    else out.push(n);
  }
  return out;
}

function checkBudget(ctx: Ctx, depth: number, chars = 0) {
  ctx.nodes += 1;
  ctx.chars += chars;
  if (depth > NOTE_LIMITS.maxDepth)
    throw new NoteDocError("Poznámka je příliš hluboce vnořená (seznamy a citace).");
  if (ctx.nodes > NOTE_LIMITS.maxNodes) throw new NoteDocError("Poznámka je příliš dlouhá.");
  if (ctx.chars > NOTE_LIMITS.maxChars)
    throw new NoteDocError(`Poznámka je příliš dlouhá (nejvíc ${NOTE_LIMITS.maxChars} znaků).`);
}

/** Vložený obsah (odstavec, nadpis): jen text a zalomení; cizí uzly se rozbalí na jejich text. */
function inlineOf(raw: unknown, ctx: Ctx, depth: number, marksAllowed: boolean, keepNewlines: boolean): NoteNode[] {
  if (!Array.isArray(raw)) return [];
  const out: NoteNode[] = [];
  const pushText = (text: string, marks: NoteMark[] | undefined) => {
    const clean = text.replace(BAD_CHARS, "");
    if (!clean) return;
    checkBudget(ctx, depth, clean.length);
    out.push({ type: "text", text: clean, ...(marks ? { marks } : {}) });
  };
  for (const n of raw) {
    if (!isRecord(n)) continue;
    if (n.type === "text" && typeof n.text === "string") {
      const marks = cleanMarks(n.marks, marksAllowed);
      if (keepNewlines) {
        pushText(n.text.replace(/\r\n?/g, "\n"), marks);
        continue;
      }
      const parts = n.text.replace(/\r\n?/g, "\n").split("\n");
      parts.forEach((part, i) => {
        if (i > 0) {
          checkBudget(ctx, depth);
          out.push({ type: "hardBreak" });
        }
        pushText(part, marks);
      });
    } else if (n.type === "hardBreak") {
      checkBudget(ctx, depth);
      out.push({ type: keepNewlines ? "text" : "hardBreak", ...(keepNewlines ? { text: "\n" } : {}) });
    } else if (Array.isArray(n.content)) {
      checkBudget(ctx, depth);
      // neznámý nebo blokový uzel uvnitř odstavce: zůstane jeho text
      out.push(...inlineOf(n.content, ctx, depth + 1, marksAllowed, keepNewlines));
    }
  }
  return mergeText(out);
}

const intIn = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

function itemsOf(raw: unknown, itemType: "listItem" | "taskItem", ctx: Ctx, depth: number): NoteNode[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: NoteNode[] = [];
  const makeItem = (children: unknown, attrs: NoteNode["attrs"] | undefined) => {
    checkBudget(ctx, depth + 1);
    let content = blocksOf(children, ctx, depth + 2);
    // položka seznamu začíná odstavcem (schéma editoru)
    if (!content.length || content[0]!.type !== "paragraph")
      content = [{ type: "paragraph" }, ...content];
    out.push({ type: itemType, ...(attrs ? { attrs } : {}), content });
  };
  for (const it of list) {
    if (!isRecord(it)) continue;
    const attrs =
      itemType === "taskItem"
        ? { checked: isRecord(it.attrs) && it.attrs.checked === true }
        : undefined;
    if (it.type === "listItem" || it.type === "taskItem") makeItem(it.content, attrs);
    else makeItem([it], attrs); // cokoli jiného v seznamu se zabalí do položky
  }
  return out;
}

/** Blokový obsah: odstavce, nadpisy, seznamy, citace, kód a dělicí čára; vše ostatní se rozbalí nebo zahodí. */
function blocksOf(raw: unknown, ctx: Ctx, depth: number): NoteNode[] {
  if (!Array.isArray(raw)) return [];
  const out: NoteNode[] = [];
  for (const n of raw) {
    if (!isRecord(n) || typeof n.type !== "string") continue;
    checkBudget(ctx, depth);
    switch (n.type) {
      case "paragraph": {
        const content = inlineOf(n.content, ctx, depth + 1, true, false);
        out.push(content.length ? { type: "paragraph", content } : { type: "paragraph" });
        break;
      }
      case "heading": {
        const level = intIn(isRecord(n.attrs) ? n.attrs.level : null, 1, HEADING_LEVELS.length) ?? 2;
        const content = inlineOf(n.content, ctx, depth + 1, true, false);
        out.push({ type: "heading", attrs: { level }, ...(content.length ? { content } : {}) });
        break;
      }
      case "bulletList":
      case "orderedList":
      case "taskList": {
        const itemType = n.type === "taskList" ? "taskItem" : "listItem";
        const content = itemsOf(n.content, itemType, ctx, depth + 1);
        if (!content.length) break;
        if (n.type === "orderedList") {
          const start = intIn(isRecord(n.attrs) ? n.attrs.start : null, 1, 9999) ?? 1;
          out.push({ type: "orderedList", attrs: { start }, content });
        } else out.push({ type: n.type, content });
        break;
      }
      case "listItem":
      case "taskItem": // položka bez seznamu: její obsah jde do dokumentu
        out.push(...blocksOf(n.content, ctx, depth + 1));
        break;
      case "blockquote": {
        const content = blocksOf(n.content, ctx, depth + 1);
        out.push({ type: "blockquote", content: content.length ? content : [{ type: "paragraph" }] });
        break;
      }
      case "codeBlock": {
        const text = inlineOf(n.content, ctx, depth + 1, false, true);
        const lang = isRecord(n.attrs) && typeof n.attrs.language === "string" ? n.attrs.language : "";
        const language = /^[A-Za-z0-9_+#.-]{1,30}$/.test(lang) ? lang : null;
        out.push({
          type: "codeBlock",
          attrs: { language },
          ...(text.length ? { content: text } : {}),
        });
        break;
      }
      case "horizontalRule":
        out.push({ type: "horizontalRule" });
        break;
      case "text": // holý text mezi bloky: stane se odstavcem
        out.push(...blocksOf([{ type: "paragraph", content: [n] }], ctx, depth));
        break;
      default: {
        // neznámý uzel (obrázek, tabulka, vložené HTML…): zůstane jen jeho text
        if (Array.isArray(n.content)) {
          const inner = blocksOf(n.content, ctx, depth + 1);
          out.push(...inner);
        }
      }
    }
  }
  return out;
}

/** Výsledek sanitizace: kanonický dokument, prostý text a název odvozený z prvního řádku. */
export type SanitizedNote = {
  doc: NoteDoc;
  /** Prostý text pro hledání (`body_text`): odstavce a položky na samostatných řádcích. */
  text: string;
  /** Název z prvního neprázdného řádku (nejvýš `NOTE_LIMITS.maxTitle` znaků), nebo `null`, když text nemá žádný řádek. */
  title: string | null;
};

/**
 * Projde dokument z klienta a vrátí bezpečný kanonický dokument. Vstup, který není dokumentem, je chyba; cokoli
 * nepovoleného uvnitř se tiše zahodí nebo rozbalí na text. Nikdy nevrací nic, co by editor nebo vykreslení neuměly.
 */
export function sanitizeNoteDoc(input: unknown): SanitizedNote {
  if (input === null || input === undefined) {
    const doc = emptyNoteDoc();
    return { doc, text: "", title: null };
  }
  if (!isRecord(input) || input.type !== "doc")
    throw new NoteDocError("Obsah poznámky nemá platný tvar.");
  const ctx: Ctx = { nodes: 0, chars: 0 };
  const content = blocksOf(input.content, ctx, 1);
  const doc: NoteDoc = { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
  const text = noteDocText(doc);
  return { doc, text, title: deriveNoteTitle(text) };
}

function nodeText(n: NoteNode): string {
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  return (n.content ?? []).map(nodeText).join("");
}

function blockLines(n: NoteNode, out: string[]) {
  switch (n.type) {
    case "bulletList":
    case "orderedList":
    case "taskList":
    case "blockquote":
      for (const c of n.content ?? []) blockLines(c, out);
      break;
    case "listItem":
    case "taskItem":
      for (const c of n.content ?? []) blockLines(c, out);
      break;
    case "horizontalRule":
      break;
    default:
      out.push(nodeText(n));
  }
}

/** Prostý text dokumentu: každý odstavec, nadpis, položka seznamu a řádek kódu na samostatném řádku. */
export function noteDocText(doc: NoteDoc): string {
  const lines: string[] = [];
  for (const n of doc.content) blockLines(n, lines);
  return lines
    .flatMap((l) => l.split("\n"))
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Název poznámky z textu: první neprázdný řádek, zkrácený na `NOTE_LIMITS.maxTitle` znaků; prázdný text = `null`. */
export function deriveNoteTitle(text: string): string | null {
  const first = text
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!first) return null;
  const max = NOTE_LIMITS.maxTitle;
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

/** Krátký náhled textu pro seznamy a historii (jeden řádek, zkrácený). */
export function notePreview(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Je dokument prázdný (žádný text ani dělicí čára)? */
export function isEmptyNoteDoc(doc: NoteDoc): boolean {
  return noteDocText(doc) === "" && !doc.content.some((n) => n.type === "horizontalRule");
}

/** Jsou dva (už sanitizované) dokumenty stejné? */
export function sameNoteDoc(a: NoteDoc | null | undefined, b: NoteDoc | null | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Pravidlo názvu: název je „automatický“, dokud odpovídá názvu odvozenému z dosavadního textu (nebo chybí). Změna
 * textu pak název přepíše, ručně zadaný název zůstane. Vrací název, který se má po uložení nového textu uložit.
 */
export function nextTitle(args: {
  /** Uložený název. */
  title: string | null;
  /** Text před změnou. */
  previousText: string;
  /** Text po změně. */
  nextText: string;
  /** Název zadaný uživatelem v téže změně (`undefined` = beze změny). */
  explicit?: string | null | undefined;
}): string | null {
  const explicit = args.explicit === undefined ? undefined : (args.explicit?.trim() || null);
  if (explicit !== undefined) {
    return explicit ? explicit.slice(0, NOTE_LIMITS.maxTitle) : deriveNoteTitle(args.nextText);
  }
  const auto = !args.title || args.title === deriveNoteTitle(args.previousText);
  return auto ? deriveNoteTitle(args.nextText) : args.title;
}
