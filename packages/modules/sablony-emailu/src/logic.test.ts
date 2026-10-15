import { describe, expect, it } from "vitest";
import {
  GMAIL_URL_MAX,
  buildPreview,
  composeLinks,
  docToText,
  findVariables,
  gmailComposeUrl,
  isEmailAddress,
  mailtoComposeUrl,
  renderParts,
  snippet,
  textToDoc,
} from "./logic";

const KNOWN = new Set(["jmeno", "firma", "obchod", "zakazka", "odesilatel"]);

describe("proměnné a náhled (SAB-02)", () => {
  it("najde proměnné bez opakování v pořadí výskytu", () => {
    expect(findVariables("Dobrý den {jmeno}, {firma} a znovu {jmeno}. {Velke} {x1}")).toEqual([
      "jmeno",
      "firma",
    ]);
  });

  it("dosadí hodnoty do předmětu i textu přes renderEmailTemplate", () => {
    const v = buildPreview(
      { subject: "Nabídka pro {firma}", body: "Dobrý den {jmeno},\n\nS pozdravem\n{odesilatel}" },
      { jmeno: "Jano", firma: "Novák s.r.o.", odesilatel: "Ondřej Dvořák" },
      KNOWN,
    );
    expect(v.subject).toBe("Nabídka pro Novák s.r.o.");
    expect(v.body).toBe("Dobrý den Jano,\n\nS pozdravem\nOndřej Dvořák");
    expect(v.missing).toEqual([]);
    expect(v.unknown).toEqual([]);
  });

  it("chybějící hodnota je prázdný řetězec a je ohlášena (R-46)", () => {
    const v = buildPreview(
      { subject: "Zakázka {zakazka}", body: "Dobrý den {jmeno}, {firma}." },
      { jmeno: "Jano" },
      KNOWN,
    );
    expect(v.subject).toBe("Zakázka");
    expect(v.body).toBe("Dobrý den Jano, .");
    expect(v.missing.sort()).toEqual(["firma", "zakazka"]);
    expect(v.bodyParts.filter((p) => p.kind === "missing").map((p) => p.key)).toEqual(["firma"]);
  });

  it("neznámá proměnná (překlep) zůstane v textu a je ohlášena", () => {
    const v = buildPreview({ subject: "A", body: "Ahoj {jmeo}" }, { jmeno: "Jan" }, KNOWN);
    expect(v.body).toBe("Ahoj {jmeo}");
    expect(v.unknown).toEqual(["jmeo"]);
    expect(v.missing).toEqual([]);
  });

  it("bez vybraného záznamu zůstanou proměnné jako zástupné symboly", () => {
    const v = buildPreview({ subject: "Pro {firma}", body: "Ahoj {jmeno}" }, null, KNOWN);
    expect(v.subject).toBe("Pro {firma}");
    expect(v.body).toBe("Ahoj {jmeno}");
    expect(v.bodyParts.map((p) => p.kind)).toEqual(["text", "placeholder"]);
    expect(v.missing).toEqual([]);
  });

  it("předmět je jednořádkový, hodnota se vkládá jako text a ne jako HTML", () => {
    const v = buildPreview(
      { subject: "A\nB {firma}", body: "{firma}" },
      { firma: "<b>Firma</b>\r\nDruhý řádek" },
      KNOWN,
    );
    expect(v.subject).toBe("A B <b>Firma</b> Druhý řádek");
    expect(v.body).toBe("<b>Firma</b>\nDruhý řádek");
  });

  it("části sedí na text: spojením vznikne vyrenderovaný řetězec", () => {
    const parts = renderParts("Ahoj {jmeno} z {firma}!", { jmeno: "Jan", firma: "" }, KNOWN);
    expect(parts.map((p) => p.text).join("")).toBe("Ahoj Jan z !");
  });
});

describe("Gmail compose URL (SAB-03, R-46)", () => {
  const msg = { to: "jana@example.cz", subject: "Nabídka webu", body: "Dobrý den,\nděkuji." };

  it("obsahuje adresáta, předmět a text a je to compose (view=cm)", () => {
    const u = new URL(gmailComposeUrl(msg));
    expect(u.origin + u.pathname).toBe("https://mail.google.com/mail/");
    expect(u.searchParams.get("view")).toBe("cm");
    expect(u.searchParams.get("to")).toBe("jana@example.cz");
    expect(u.searchParams.get("su")).toBe("Nabídka webu");
    expect(u.searchParams.get("body")).toBe("Dobrý den,\nděkuji.");
  });

  it("kóduje českou diakritiku jako UTF-8, mezeru jako %20 a konec řádku jako %0A", () => {
    const url = gmailComposeUrl({ to: null, subject: "Žluťoučký kůň", body: "řádek 1\nřádek 2" });
    expect(url).toContain("su=%C5%BDlu%C5%A5ou%C4%8Dk%C3%BD%20k%C5%AF%C5%88");
    expect(url).toContain("body=%C5%99%C3%A1dek%201%0A%C5%99%C3%A1dek%202");
    expect(url).not.toContain("+");
  });

  it("znaky, které mají v URL význam, se zakódují (& = # ? %)", () => {
    const url = gmailComposeUrl({ to: null, subject: "A&B=C#D?E%F", body: "x" });
    const u = new URL(url);
    expect(u.searchParams.get("su")).toBe("A&B=C#D?E%F");
    expect(url).toContain("su=A%26B%3DC%23D%3FE%25F");
  });

  it("sjednotí konce řádků CRLF na LF", () => {
    expect(new URL(gmailComposeUrl({ subject: "", body: "a\r\nb" })).searchParams.get("body")).toBe(
      "a\nb",
    );
  });

  it("neplatného adresáta do odkazu nedává (a prázdné části vynechá)", () => {
    expect(gmailComposeUrl({ to: "Jana <jana@example.cz>", subject: "", body: "" })).not.toContain(
      "to=",
    );
    expect(gmailComposeUrl({ to: null, subject: "", body: "" })).toBe(
      "https://mail.google.com/mail/?view=cm&fs=1",
    );
    expect(isEmailAddress("a@b.cz")).toBe(true);
    expect(isEmailAddress("a@b")).toBe(false);
    expect(isEmailAddress("")).toBe(false);
  });

  it("přesáhne-li adresa limit, nabídne se jen kopírování", () => {
    const short = composeLinks(msg);
    expect(short.tooLong).toBe(false);
    expect(short.gmailUrl).toMatch(/^https:\/\/mail\.google\.com\//);
    expect(short.mailtoUrl).toMatch(/^mailto:jana@example\.cz\?subject=/);

    const long = composeLinks({ ...msg, body: "Žluťoučký kůň. ".repeat(400) });
    expect(long).toEqual({ gmailUrl: null, mailtoUrl: null, tooLong: true });
  });

  it("limit se počítá z délky zakódované adresy (diakritika zabírá šest znaků)", () => {
    // ASCII text 7 000 znaků se vejde, stejně dlouhý český text s diakritikou ne
    expect(composeLinks({ subject: "a", body: "a".repeat(7000) }).tooLong).toBe(false);
    expect(composeLinks({ subject: "a", body: "ř".repeat(2000) }).tooLong).toBe(true);
    expect(GMAIL_URL_MAX).toBeGreaterThan(2000);
  });

  it("mailto má CRLF a zakódovaný předmět", () => {
    const u = mailtoComposeUrl(msg);
    expect(u).toContain("subject=Nab%C3%ADdka%20webu");
    expect(u).toContain("body=Dobr%C3%BD%20den%2C%0D%0Ad%C4%9Bkuji.");
  });
});

describe("text a dokument Tiptap", () => {
  it("textToDoc a docToText jsou si inverzní pro prostý text", () => {
    const text = "Dobrý den,\n\nděkuji za zájem.\n- jedna\n- dvě";
    expect(docToText(textToDoc(text))).toBe(text);
  });

  it("docToText převede seznamy a odstavce a nečitelný dokument dá prázdný text", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Body:" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }],
            },
          ],
        },
      ],
    };
    expect(docToText(doc)).toBe("Body:\n- A\n- B");
    expect(docToText(null)).toBe("");
    expect(docToText({ type: "x" })).toBe("");
  });

  it("úryvek je jednořádkový a zkrácený", () => {
    expect(snippet("a\n\n b   c")).toBe("a b c");
    expect(snippet("x".repeat(300), 20)).toHaveLength(20);
    expect(snippet("x".repeat(300), 20).endsWith("…")).toBe(true);
  });
});
