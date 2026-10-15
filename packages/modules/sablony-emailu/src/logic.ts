import { renderEmailTemplate } from "@rebar/core/contracts";

/*
  Čistá logika šablon e-mailů (SAB-02, SAB-03): proměnné v textu, náhled vyplněný hodnotami, odkazy do Gmailu a převod
  mezi prostým textem a dokumentem Tiptap. Bez databáze a bez Reactu, aby ji mohlo importovat UI, server i testy.
  Dosazování hodnot dělá `renderEmailTemplate` z jádra (jediná pravda o syntaxi `{klic}`).
*/

/** Nejdelší adresa pro napsání zprávy v Gmailu (R-46). Delší e-mail jde jen zkopírovat (Gmail i prohlížeče krátí kolem 8 000 znaků). */
export const GMAIL_URL_MAX = 7500;

/** Zápis proměnné v textu: `{jmeno}` (stejný jako `renderEmailTemplate` v jádře). */
const VARIABLE = /\{([a-z_]+)\}/g;

/** Rozlišení částí náhledu: běžný text, dosazená hodnota, chybějící hodnota, neznámá proměnná a zástupný symbol. */
export type PreviewPartKind = "text" | "value" | "missing" | "unknown" | "placeholder";

/** Část textu náhledu (pro zvýraznění proměnných v UI); `key` je název proměnné u částí, které nejsou běžný text. */
export type PreviewPart = { text: string; kind: PreviewPartKind; key?: string };

/** Náhled předmětu a textu vyplněný hodnotami proměnných. */
export type RenderedPreview = {
  /** Předmět po dosazení (jednořádkový, `renderEmailTemplate`). */
  subject: string;
  /** Text po dosazení (`renderEmailTemplate`). */
  body: string;
  subjectParts: PreviewPart[];
  bodyParts: PreviewPart[];
  /** Známé proměnné, které se nepodařilo vyplnit (prázdná hodnota, R-46). */
  missing: string[];
  /** Proměnné, které v katalogu nejsou (překlep). */
  unknown: string[];
};

/** Proměnné použité v textu (bez opakování, v pořadí prvního výskytu). */
export function findVariables(text: string): string[] {
  return [...new Set([...text.matchAll(VARIABLE)].map((m) => m[1]!))];
}

/**
 * Rozloží text na části podle proměnných. `values = null` (není vybraný žádný záznam) nechá známé proměnné jako
 * zástupné symboly `{klic}`; jinak je známá proměnná s neprázdnou hodnotou „value“ a s prázdnou „missing“ (v textu
 * se z ní stane prázdný řetězec, UI ji zvýrazní). Neznámá proměnná zůstane v textu beze změny.
 */
export function renderParts(
  text: string,
  values: Readonly<Record<string, string>> | null,
  known: ReadonlySet<string>,
): PreviewPart[] {
  const parts: PreviewPart[] = [];
  let last = 0;
  for (const m of text.matchAll(VARIABLE)) {
    const key = m[1]!;
    const at = m.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at), kind: "text" });
    last = at + m[0].length;
    if (!known.has(key)) parts.push({ text: m[0], kind: "unknown", key });
    else if (values === null) parts.push({ text: m[0], kind: "placeholder", key });
    else if (values[key]) parts.push({ text: values[key]!, kind: "value", key });
    else parts.push({ text: "", kind: "missing", key });
  }
  if (last < text.length) parts.push({ text: text.slice(last), kind: "text" });
  return parts;
}

/**
 * Náhled šablony: předmět a text po dosazení hodnot (`renderEmailTemplate` z jádra) a části pro zvýraznění.
 * `values = null` = bez vybraného záznamu, proměnné zůstanou v textu jako `{klic}`. Chybějící hodnota (R-46) se
 * dosadí jako prázdný řetězec a ohlásí v `missing`; neznámá proměnná (překlep) zůstane v textu a ohlásí se v `unknown`.
 */
export function buildPreview(
  tpl: { subject: string; body: string },
  values: Readonly<Record<string, string>> | null,
  known: ReadonlySet<string>,
): RenderedPreview {
  const filled: Record<string, string> = {};
  if (values) for (const k of known) filled[k] = values[k] ?? "";
  const rendered = values ? renderEmailTemplate(tpl, filled) : renderEmailTemplate(tpl, {});
  const subjectParts = renderParts(tpl.subject, values, known);
  const bodyParts = renderParts(tpl.body, values, known);
  const all = [...subjectParts, ...bodyParts];
  return {
    subject: rendered.subject,
    body: rendered.body,
    subjectParts,
    bodyParts,
    missing: [...new Set(all.filter((p) => p.kind === "missing").map((p) => p.key!))],
    unknown: [...new Set(all.filter((p) => p.kind === "unknown").map((p) => p.key!))],
  };
}

/** Odkazy pro odeslání z poštovního klienta. */
export type ComposeLinks = {
  /** Adresa pro napsání zprávy v Gmailu; `null`, když je text příliš dlouhý (jen kopírování). */
  gmailUrl: string | null;
  /** Odkaz `mailto:` pro jiný poštovní program; `null` z téhož důvodu. */
  mailtoUrl: string | null;
  /** Text je příliš dlouhý pro odkaz (R-46). */
  tooLong: boolean;
};

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Je řetězec použitelná e-mailová adresa (jedna, bez jména a mezer)? Do odkazu se jinak adresát nedává. */
export function isEmailAddress(v: string | null | undefined): v is string {
  return !!v && EMAIL.test(v.trim());
}

/**
 * Adresa pro napsání nové zprávy v Gmailu: `view=cm` (compose), adresát, předmět a text. Diakritika i konce řádků se
 * kódují jako UTF-8 (`%C5%A0`, `%0A`), mezera jako `%20` (ne `+`), aby ji Gmail i jiné programy četly stejně.
 */
export function gmailComposeUrl(msg: {
  to?: string | null;
  subject: string;
  body: string;
}): string {
  const q = new URLSearchParams({ view: "cm", fs: "1" });
  if (isEmailAddress(msg.to)) q.set("to", msg.to.trim());
  if (msg.subject) q.set("su", msg.subject);
  if (msg.body) q.set("body", msg.body.replace(/\r\n?/g, "\n"));
  return `https://mail.google.com/mail/?${q.toString().replace(/\+/g, "%20")}`;
}

/** Odkaz `mailto:` s předmětem a textem (konce řádků jako CRLF podle RFC 6068). */
export function mailtoComposeUrl(msg: {
  to?: string | null;
  subject: string;
  body: string;
}): string {
  const parts: string[] = [];
  if (msg.subject) parts.push(`subject=${encodeURIComponent(msg.subject)}`);
  if (msg.body) parts.push(`body=${encodeURIComponent(msg.body.replace(/\r\n?|\n/g, "\r\n"))}`);
  const to = isEmailAddress(msg.to) ? encodeURIComponent(msg.to.trim()).replace(/%40/g, "@") : "";
  return `mailto:${to}${parts.length ? `?${parts.join("&")}` : ""}`;
}

/** Odkazy do Gmailu a `mailto:`; přesáhne-li adresa `GMAIL_URL_MAX`, nenabídne se ani jedna (R-46: jen Kopírovat). */
export function composeLinks(
  msg: { to?: string | null; subject: string; body: string },
  max = GMAIL_URL_MAX,
): ComposeLinks {
  const gmail = gmailComposeUrl(msg);
  if (gmail.length > max) return { gmailUrl: null, mailtoUrl: null, tooLong: true };
  return { gmailUrl: gmail, mailtoUrl: mailtoComposeUrl(msg), tooLong: false };
}

type DocNode = { type: string; content?: DocNode[]; text?: string };

/** Prostý text jako dokument Tiptap (jeden řádek = jeden odstavec, prázdný řádek = prázdný odstavec). */
export function textToDoc(text: string): { type: "doc"; content: DocNode[] } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return {
    type: "doc",
    content: lines.map((line) =>
      line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
    ),
  };
}

const BLOCKS = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "listItem",
  "taskItem",
  "bulletList",
  "orderedList",
  "taskList",
]);

function nodeText(node: DocNode, list: { kind: "bullet" | "ordered" | null; n: number }): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const kids = node.content ?? [];
  if (node.type === "bulletList" || node.type === "orderedList" || node.type === "taskList") {
    const kind = node.type === "orderedList" ? "ordered" : "bullet";
    return kids.map((k, i) => nodeText(k, { kind, n: i + 1 })).join("\n");
  }
  const inner = kids
    .map((k) => nodeText(k, { kind: null, n: 0 }))
    .join(BLOCKS.has(kids[0]?.type ?? "") ? "\n" : "");
  if (node.type === "listItem" || node.type === "taskItem")
    return `${list.kind === "ordered" ? `${list.n}. ` : "- "}${inner}`;
  return inner;
}

/** Prostý text z dokumentu Tiptap (odstavce oddělené řádkem, seznamy s odrážkou); nečitelný dokument dá prázdný text. */
export function docToText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const root = doc as DocNode;
  if (root.type !== "doc" || !Array.isArray(root.content)) return "";
  return root.content.map((n) => nodeText(n, { kind: null, n: 0 })).join("\n");
}

/** Úryvek textu pro seznam: jednořádkový, zkrácený na `max` znaků. */
export function snippet(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Text pro hledání a porovnání: bez diakritiky a malými písmeny. */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Výchozí kategorie nabízené v editoru (kategorie je volný text, tohle jsou jen návrhy; SAB-01). */
export const CATEGORY_SUGGESTIONS = [
  "Follow-up",
  "Nabídka",
  "Onboarding",
  "Připomínka platby",
  "Poděkování",
  "Schůzka",
] as const;
