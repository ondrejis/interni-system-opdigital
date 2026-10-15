import { describe, expect, it } from "vitest";
import {
  GMAIL_URL_MAX,
  buildPreview,
  composeLinks,
  docToText,
  escapeLike,
  findVariables,
  gmailComposeUrl,
  mailtoComposeUrl,
  renderParts,
  searchTokens,
  snippet,
  textToDoc,
} from "./logic";

const KNOWN = new Set(["jmeno", "firma", "obchod", "odesilatel"]);

describe("proměnné v textu", () => {
  it("najde proměnné bez opakování v pořadí výskytu", () => {
    expect(findVariables("Dobrý den {jmeno}, {firma} a {jmeno}. {1x} {Velke}")).toEqual([
      "jmeno",
      "firma",
    ]);
    expect(findVariables("bez proměnných")).toEqual([]);
  });
});

describe("náhled (KNI-01): stejné vykreslení jako šablony e-mailů", () => {
  const tpl = {
    subject: "Nabídka pro {firma}",
    body: "Dobrý den {jmeno},\n\nS pozdravem\n{odesilatel}",
  };

  it("vyplní hodnoty vybraného kontaktu", () => {
    const v = buildPreview(tpl, { jmeno: "Petře", firma: "ACME", odesilatel: "Ondřej" }, KNOWN);
    expect(v.subject).toBe("Nabídka pro ACME");
    expect(v.body).toBe("Dobrý den Petře,\n\nS pozdravem\nOndřej");
    expect(v.missing).toEqual([]);
    expect(v.unknown).toEqual([]);
    expect(v.bodyParts.filter((p) => p.kind === "value").map((p) => p.key)).toEqual([
      "jmeno",
      "odesilatel",
    ]);
  });

  it("chybějící hodnota je prázdný řetězec a je označená (R-46)", () => {
    const v = buildPreview(tpl, { jmeno: "Petře" }, KNOWN);
    expect(v.subject).toBe("Nabídka pro");
    expect(v.missing).toEqual(["firma", "odesilatel"]);
    expect(v.bodyParts.some((p) => p.kind === "missing" && p.key === "odesilatel")).toBe(true);
  });

  it("neznámá proměnná zůstane v textu a je nahlášená jako překlep", () => {
    const v = buildPreview({ subject: "", body: "Ahoj {jmneo}" }, { jmeno: "A" }, KNOWN);
    expect(v.body).toBe("Ahoj {jmneo}");
    expect(v.unknown).toEqual(["jmneo"]);
  });

  it("bez vybraného kontaktu zůstanou proměnné jako zástupné symboly", () => {
    const v = buildPreview(tpl, null, KNOWN);
    expect(v.body).toBe(tpl.body);
    expect(v.subject).toBe("Nabídka pro {firma}");
    expect(v.missing).toEqual([]);
    expect(v.bodyParts.filter((p) => p.kind === "placeholder")).toHaveLength(2);
  });

  it("hodnota se nikdy nevyhodnocuje jako další proměnná ani jako HTML", () => {
    const v = buildPreview({ subject: "", body: "{jmeno}" }, { jmeno: "{firma}<b>" }, KNOWN);
    expect(v.body).toBe("{firma}<b>");
  });

  it("části složené dohromady dávají totéž co vykreslený text", () => {
    const parts = renderParts("A {jmeno} B {firma} C", { jmeno: "x", firma: "y" }, KNOWN);
    expect(parts.map((p) => p.text).join("")).toBe("A x B y C");
  });
});

describe("odkazy do Gmailu a mailto", () => {
  it("Gmail: adresát, předmět a text jsou zakódované, mezera jako %20", () => {
    const url = gmailComposeUrl({
      to: "a@b.cz",
      subject: "Dobrý den & ahoj",
      body: "řádek 1\nřádek 2",
    });
    expect(url.startsWith("https://mail.google.com/mail/?view=cm&fs=1&")).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("to")).toBe("a@b.cz");
    expect(q.get("su")).toBe("Dobrý den & ahoj");
    expect(q.get("body")).toBe("řádek 1\nřádek 2");
    expect(url).not.toContain("+");
  });

  it("mailto: konce řádků jako CRLF, zavináč zůstane", () => {
    const url = mailtoComposeUrl({ to: "a@b.cz", subject: "S", body: "a\nb" });
    expect(url).toBe("mailto:a@b.cz?subject=S&body=a%0D%0Ab");
    expect(mailtoComposeUrl({ subject: "", body: "" })).toBe("mailto:");
  });

  it("příliš dlouhý text nabídne jen kopírování (R-46)", () => {
    const ok = composeLinks({ to: null, subject: "S", body: "krátký" });
    expect(ok.tooLong).toBe(false);
    expect(ok.gmailUrl).toBeTruthy();
    const long = composeLinks({ to: null, subject: "S", body: "ž".repeat(GMAIL_URL_MAX) });
    expect(long).toEqual({ gmailUrl: null, mailtoUrl: null, tooLong: true });
  });
});

describe("text a dokument Tiptap", () => {
  it("text → dokument → text se vrátí beze změny, včetně prázdných řádků", () => {
    const text = "Dobrý den,\n\nposílám nabídku.\nS pozdravem";
    const doc = textToDoc(text);
    expect(doc.content).toHaveLength(4);
    expect(doc.content[1]).toEqual({ type: "paragraph" });
    expect(docToText(doc)).toBe(text);
    expect(docToText(textToDoc(""))).toBe("");
  });

  it("zploští seznamy, tvrdé zalomení a nadpisy; nečitelný dokument dá prázdný text", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Nadpis" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a" },
            { type: "hardBreak" },
            { type: "text", text: "b" },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "y" }] }],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "z" }] }],
            },
          ],
        },
      ],
    };
    expect(docToText(doc)).toBe("Nadpis\na\nb\n- x\n- y\n1. z");
    expect(docToText(null)).toBe("");
    expect(docToText({ type: "other" })).toBe("");
  });
});

describe("hledání", () => {
  it("slova bez diakritiky, malými písmeny, bez opakování", () => {
    expect(searchTokens("  Nabídka  ŽLUTÝ nabidka ")).toEqual(["nabidka", "zluty"]);
    expect(searchTokens("")).toEqual([]);
    expect(searchTokens(undefined)).toEqual([]);
    expect(searchTokens("a b c d e f g h i j")).toHaveLength(8);
  });

  it("zástupné znaky LIKE se berou doslova", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });

  it("úryvek je jednořádkový a zkrácený", () => {
    expect(snippet("a\n\n  b   c")).toBe("a b c");
    expect(snippet("x".repeat(300), 10)).toHaveLength(10);
    expect(snippet("x".repeat(300), 10).endsWith("…")).toBe(true);
  });
});
