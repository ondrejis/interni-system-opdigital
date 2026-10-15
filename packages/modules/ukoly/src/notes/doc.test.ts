import { describe, expect, it } from "vitest";
import {
  NOTE_LIMITS,
  NoteDocError,
  deriveNoteTitle,
  emptyNoteDoc,
  isEmptyNoteDoc,
  nextTitle,
  noteDocText,
  notePreview,
  sameNoteDoc,
  sanitizeHref,
  sanitizeNoteDoc,
  textToNoteDoc,
  type NoteDoc,
} from "./doc";

const p = (text: string, marks?: unknown[]) => ({
  type: "paragraph",
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});
const doc = (...content: unknown[]) => ({ type: "doc", content });
const clean = (input: unknown) => sanitizeNoteDoc(input).doc;

describe("sanitizeHref", () => {
  it("povolí http, https, mailto, tel, adresy v aplikaci a kotvy", () => {
    expect(sanitizeHref("https://opdigital.cz/cenik")).toBe("https://opdigital.cz/cenik");
    expect(sanitizeHref(" http://localhost:3100/a?b=1 ")).toBe("http://localhost:3100/a?b=1");
    expect(sanitizeHref("mailto:jan@firma.cz")).toBe("mailto:jan@firma.cz");
    expect(sanitizeHref("mailto:jan@firma.cz?subject=Nabidka")).toBe(
      "mailto:jan@firma.cz?subject=Nabidka",
    );
    expect(sanitizeHref("tel:+420777123456")).toBe("tel:+420777123456");
    expect(sanitizeHref("/kontakty/firmy/abc")).toBe("/kontakty/firmy/abc");
    expect(sanitizeHref("#sekce")).toBe("#sekce");
  });

  it("doplní https u adresy bez schématu", () => {
    expect(sanitizeHref("www.firma.cz/o-nas")).toBe("https://www.firma.cz/o-nas");
    expect(sanitizeHref("firma.cz")).toBe("https://firma.cz");
  });

  it("odmítne nebezpečná a podezřelá schémata, i obfuskovaná", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      " javascript:alert(1)//",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "//evil.example/x",
      "http://",
      "https://exa mple.cz",
      'https://a.cz/"onmouseover="x',
      "https://a.cz/<script>",
      "ftp://a.cz",
      "plain text",
      "",
      "mailto:",
      "tel:abc",
    ])
      expect(sanitizeHref(bad), bad).toBeNull();
    expect(sanitizeHref(null)).toBeNull();
    expect(sanitizeHref(42)).toBeNull();
    expect(sanitizeHref("https://a.cz/" + "x".repeat(NOTE_LIMITS.maxHrefLength))).toBeNull();
  });
});

describe("sanitizeNoteDoc", () => {
  it("prázdný vstup dá prázdný dokument, jiný než dokument je chyba", () => {
    expect(clean(null)).toEqual(emptyNoteDoc());
    expect(clean({ type: "doc" })).toEqual(emptyNoteDoc());
    expect(() => sanitizeNoteDoc("<script>alert(1)</script>")).toThrow(NoteDocError);
    expect(() => sanitizeNoteDoc({ type: "paragraph" })).toThrow(NoteDocError);
    expect(() => sanitizeNoteDoc([])).toThrow(NoteDocError);
  });

  it("zachová nadpisy, seznamy, citaci, kód, odkazy a značky", () => {
    const input = doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Nabídka" }] },
      p("Tučně", [{ type: "bold" }, { type: "italic" }]),
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [p("jedna")] }, { type: "listItem", content: [p("dvě")] }],
      },
      {
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: true }, content: [p("hotovo")] },
          { type: "taskItem", attrs: { checked: false }, content: [p("otevřeno")] },
        ],
      },
      { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [p("c")] }] },
      { type: "blockquote", content: [p("citace")] },
      { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "a\nb" }] },
      { type: "horizontalRule" },
      p("odkaz", [{ type: "link", attrs: { href: "https://opdigital.cz" } }]),
    );
    const out = clean(input);
    expect(out.content.map((n) => n.type)).toEqual([
      "heading",
      "paragraph",
      "bulletList",
      "taskList",
      "orderedList",
      "blockquote",
      "codeBlock",
      "horizontalRule",
      "paragraph",
    ]);
    expect(out.content[1]!.content![0]!.marks).toEqual([{ type: "bold" }, { type: "italic" }]);
    expect(out.content[3]!.content![0]!.attrs).toEqual({ checked: true });
    expect(out.content[4]!.attrs).toEqual({ start: 3 });
    expect(out.content[6]!.content![0]!.text).toBe("a\nb");
    expect(out.content[8]!.content![0]!.marks).toEqual([
      { type: "link", attrs: { href: "https://opdigital.cz" } },
    ]);
  });

  it("je idempotentní: sanitizace sanitizovaného dokumentu nic nemění", () => {
    const once = clean(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "A" }] },
        p("x", [{ type: "link", attrs: { href: "firma.cz" } }, { type: "bold" }]),
        { type: "bulletList", content: [{ type: "listItem", content: [p("i")] }] },
      ),
    );
    expect(sameNoteDoc(clean(once), once)).toBe(true);
  });

  describe("XSS", () => {
    it("zahodí obrázky, HTML uzly, události a styly; zůstane jen text", () => {
      const out = clean(
        doc(
          { type: "image", attrs: { src: "javascript:alert(1)", onerror: "alert(1)" } },
          { type: "html", content: [{ type: "text", text: "<script>alert(1)</script>" }] },
          {
            type: "paragraph",
            attrs: { style: "background:url(javascript:alert(1))", class: "x", onclick: "alert(1)" },
            content: [
              {
                type: "text",
                text: "ahoj",
                attrs: { onmouseover: "alert(1)" },
                marks: [
                  { type: "textStyle", attrs: { color: "red" } },
                  { type: "bold", attrs: { onclick: "x" } },
                ],
              },
            ],
          },
        ),
      );
      const json = JSON.stringify(out);
      expect(json).not.toContain("image");
      expect(json).not.toContain("onerror");
      expect(json).not.toContain("onclick");
      expect(json).not.toContain("onmouseover");
      expect(json).not.toContain("style");
      expect(json).not.toContain("textStyle");
      expect(json).not.toContain("class");
      // text zůstává jako text (vykreslení ho escapuje), nikoli jako uzel
      expect(noteDocText(out)).toContain("ahoj");
      expect(out.content.every((n) => n.type === "paragraph")).toBe(true);
      expect(out.content.at(-1)!.content![0]!.marks).toEqual([{ type: "bold" }]);
    });

    it("odkaz s nebezpečným schématem ztratí značku, text zůstane", () => {
      const out = clean(
        doc(
          p("klik", [{ type: "link", attrs: { href: "javascript:alert(document.cookie)" } }]),
          p("data", [{ type: "link", attrs: { href: "data:text/html,<script>1</script>" } }]),
          p("ok", [{ type: "link", attrs: { href: "https://a.cz", target: "_self", onclick: "x" } }]),
        ),
      );
      expect(out.content[0]!.content![0]).toEqual({ type: "text", text: "klik" });
      expect(out.content[1]!.content![0]).toEqual({ type: "text", text: "data" });
      expect(out.content[2]!.content![0]!.marks).toEqual([
        { type: "link", attrs: { href: "https://a.cz" } },
      ]);
    });

    it("atributy mimo schéma a neplatné hodnoty atributů se opraví", () => {
      const out = clean(
        doc(
          { type: "heading", attrs: { level: 99, id: "x" }, content: [{ type: "text", text: "N" }] },
          { type: "codeBlock", attrs: { language: '"><img src=x onerror=alert(1)>' }, content: [{ type: "text", text: "c" }] },
          { type: "orderedList", attrs: { start: -5 }, content: [{ type: "listItem", content: [p("a")] }] },
        ),
      );
      expect(out.content[0]!.attrs).toEqual({ level: 2 });
      expect(out.content[1]!.attrs).toEqual({ language: null });
      expect(out.content[2]!.attrs).toEqual({ start: 1 });
    });

    it("řídicí znaky a přepisy směru textu se odstraní", () => {
      const out = clean(doc(p("a\u0000b‮c⁦d﻿e")));
      expect(noteDocText(out)).toBe("abcde");
    });

    it("značky na neznámém místě se neuplatní a duplicity se sloučí", () => {
      const out = clean(
        doc({
          type: "codeBlock",
          content: [{ type: "text", text: "x", marks: [{ type: "bold" }] }],
        }),
      );
      expect(out.content[0]!.content![0]).toEqual({ type: "text", text: "x" });
      const dup = clean(doc(p("t", [{ type: "bold" }, { type: "bold" }, { type: "italic" }])));
      expect(dup.content[0]!.content![0]!.marks).toEqual([{ type: "bold" }, { type: "italic" }]);
    });
  });

  describe("struktura odpovídá schématu editoru", () => {
    it("text mezi bloky se zabalí do odstavce, položka seznamu začíná odstavcem", () => {
      const out = clean(
        doc(
          { type: "text", text: "holý text" },
          { type: "bulletList", content: [{ type: "listItem", content: [{ type: "bulletList", content: [] }] }] },
          { type: "bulletList", content: [p("rovnou odstavec bez položky")] },
          { type: "bulletList", content: [] },
        ),
      );
      expect(out.content[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "holý text" }] });
      // položka s vnořeným seznamem dostane úvodní prázdný odstavec; prázdný vnořený seznam se zahodí
      expect(out.content[1]!.content![0]!.content![0]!.type).toBe("paragraph");
      expect(out.content[2]!.content![0]!.type).toBe("listItem");
      expect(out.content.length).toBe(3);
    });

    it("nový řádek v textu odstavce je zalomení řádku", () => {
      const out = clean(doc(p("a\nb")));
      expect(out.content[0]!.content!.map((n) => n.type)).toEqual(["text", "hardBreak", "text"]);
      expect(noteDocText(out)).toBe("a\nb");
    });

    it("sloučí sousední texty se stejnými značkami", () => {
      const out = clean(
        doc({
          type: "paragraph",
          content: [
            { type: "text", text: "a", marks: [{ type: "bold" }] },
            { type: "text", text: "b", marks: [{ type: "bold" }] },
            { type: "text", text: "c" },
          ],
        }),
      );
      expect(out.content[0]!.content).toEqual([
        { type: "text", text: "ab", marks: [{ type: "bold" }] },
        { type: "text", text: "c" },
      ]);
    });
  });

  describe("meze", () => {
    it("příliš mnoho textu, uzlů nebo hluboké vnoření je chyba", () => {
      expect(() => sanitizeNoteDoc(doc(p("x".repeat(NOTE_LIMITS.maxChars + 1))))).toThrow(NoteDocError);
      expect(() =>
        sanitizeNoteDoc(doc(...Array.from({ length: NOTE_LIMITS.maxNodes + 1 }, () => ({ type: "horizontalRule" })))),
      ).toThrow(NoteDocError);
      let deep: unknown = p("hluboko");
      for (let i = 0; i < NOTE_LIMITS.maxDepth + 2; i++) deep = { type: "blockquote", content: [deep] };
      expect(() => sanitizeNoteDoc(doc(deep))).toThrow(/hluboce/);
    });

    it("kruhový nebo obří vstup nezpůsobí nekonečnou smyčku", () => {
      const a: Record<string, unknown> = { type: "blockquote" };
      a.content = [a];
      expect(() => sanitizeNoteDoc(doc(a))).toThrow(NoteDocError);
    });
  });
});

describe("text, název a náhled", () => {
  const d: NoteDoc = clean(
    doc(
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Schůzka s Novákem" }] },
      p("Probrali jsme cenu."),
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [p("web")] }, { type: "listItem", content: [p("reklama")] }],
      },
    ),
  );

  it("prostý text má každý blok a položku na řádku", () => {
    expect(noteDocText(d)).toBe("Schůzka s Novákem\nProbrali jsme cenu.\nweb\nreklama");
  });

  it("název je první neprázdný řádek, dlouhý se zkrátí", () => {
    expect(sanitizeNoteDoc(d).title).toBe("Schůzka s Novákem");
    expect(deriveNoteTitle("\n\n  Ahoj  \nDruhý")).toBe("Ahoj");
    expect(deriveNoteTitle("")).toBeNull();
    const long = deriveNoteTitle("x".repeat(500))!;
    expect(long.length).toBe(NOTE_LIMITS.maxTitle);
    expect(long.endsWith("…")).toBe(true);
  });

  it("náhled je jeden zkrácený řádek", () => {
    expect(notePreview("a\n\nb   c")).toBe("a b c");
    expect(notePreview("x".repeat(300), 20).length).toBe(20);
  });

  it("prázdnost dokumentu", () => {
    expect(isEmptyNoteDoc(emptyNoteDoc())).toBe(true);
    expect(isEmptyNoteDoc(textToNoteDoc("   \n  "))).toBe(true);
    expect(isEmptyNoteDoc(d)).toBe(false);
  });

  it("text na dokument: řádky jsou odstavce", () => {
    const t = textToNoteDoc("První\n\nDruhý");
    expect(t.content.map((n) => n.type)).toEqual(["paragraph", "paragraph", "paragraph"]);
    expect(noteDocText(t)).toBe("První\n\nDruhý");
  });
});

describe("nextTitle (automatický a ručně zadaný název)", () => {
  it("automatický název sleduje text, ručně zadaný zůstane", () => {
    expect(nextTitle({ title: null, previousText: "", nextText: "Nová věc\ndetail" })).toBe("Nová věc");
    expect(nextTitle({ title: "Stará", previousText: "Stará\nx", nextText: "Nová\nx" })).toBe("Nová");
    expect(nextTitle({ title: "Můj název", previousText: "Stará", nextText: "Nová" })).toBe("Můj název");
  });

  it("zadaný název přebije; prázdný se vrátí k automatickému", () => {
    expect(nextTitle({ title: "A", previousText: "A", nextText: "B", explicit: "Ručně" })).toBe("Ručně");
    expect(nextTitle({ title: "Ručně", previousText: "A", nextText: "B", explicit: "  " })).toBe("B");
    expect(nextTitle({ title: "Ručně", previousText: "A", nextText: "", explicit: "" })).toBeNull();
  });
});
