import { describe, expect, it } from "vitest";
import { renderEmailTemplate, renderTemplate, unknownVariables } from "./email-vars";

describe("renderTemplate", () => {
  it("dosadí známé proměnné, neznámé nechá beze změny", () => {
    expect(renderTemplate("Dobrý den {jmeno}, {neznama}", { jmeno: "Petře" })).toBe(
      "Dobrý den Petře, {neznama}",
    );
  });

  it("prázdná hodnota se dosadí jako prázdný text a hodnota se nikdy nevyhodnocuje jako HTML nebo šablona", () => {
    expect(renderTemplate("A{x}B", { x: "" })).toBe("AB");
    expect(renderTemplate("{a}", { a: "{b}", b: "ne" })).toBe("{b}");
    expect(renderTemplate("{a}", { a: "<b>tučně</b>" })).toBe("<b>tučně</b>");
  });
});

describe("unknownVariables", () => {
  it("najde překlepy vůči seznamu známých proměnných", () => {
    expect(unknownVariables("{jmeno} {castak} {castak}", ["jmeno", "firma"])).toEqual(["castak"]);
    expect(unknownVariables("bez proměnných", [])).toEqual([]);
  });
});

describe("renderEmailTemplate", () => {
  it("předmět je jednořádkový, tělo má sjednocené konce řádků a ořezané okraje", () => {
    const out = renderEmailTemplate(
      { subject: "Nabídka\r\n{firma}", body: "\r\nDobrý den,\r\n\r\n{jmeno}\r\n" },
      { firma: "ACME", jmeno: "Petr" },
    );
    expect(out.subject).toBe("Nabídka ACME");
    expect(out.body).toBe("Dobrý den,\n\nPetr");
  });
});
