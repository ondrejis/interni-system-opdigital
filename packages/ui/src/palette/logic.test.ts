import { describe, expect, it } from "vitest";
import {
  coveredByModuleAction,
  createCommand,
  groupHits,
  hitActions,
  hitSubtitle,
  telHref,
  topCommands,
  type PaletteHit,
} from "./logic";

const hit = (p: Partial<PaletteHit>): PaletteHit => ({
  entityType: "person",
  id: "1",
  title: "Jan Novák",
  subtitle: "ředitel",
  url: "/kontakty/osoby/1",
  label: "Osoba",
  labelMany: "Osoby",
  phone: null,
  email: null,
  driveFolderId: null,
  isPrivate: false,
  ...p,
});

describe("paleta: nálezy", () => {
  it("podtitulek nese i telefon", () => {
    expect(hitSubtitle(hit({ phone: "+420 777 123 456" }))).toBe("ředitel · +420 777 123 456");
    expect(hitSubtitle(hit({ subtitle: null }))).toBe("");
  });
  it("akce bez otevření záznamu: zavolat, kopírovat, e-mail, Disk", () => {
    const a = hitActions(
      hit({ phone: "+420 777 123 456", email: "jan@firma.cz", driveFolderId: "abc123" }),
    );
    expect(a.map((x) => x.kind)).toEqual(["call", "copy", "mail", "drive"]);
    expect(a[0]).toMatchObject({ href: "tel:+420777123456" });
    expect(a[2]).toMatchObject({ href: "mailto:jan@firma.cz" });
    expect(a[3]).toMatchObject({ href: "https://drive.google.com/drive/folders/abc123" });
    expect(hitActions(hit({}))).toEqual([]);
  });
  it("telefon do tel: bez mezer", () => expect(telHref("777 123-456")).toBe("tel:777123456"));
  it("seskupení podle typu v pořadí prvního nálezu", () => {
    const g = groupHits([
      hit({ id: "1" }),
      hit({ entityType: "company", labelMany: "Firmy", id: "2" }),
      hit({ id: "3" }),
    ]);
    expect(g.map((x) => [x.heading, x.hits.length])).toEqual([
      ["Osoby", 2],
      ["Firmy", 1],
    ]);
  });
});

describe("paleta: příkazy", () => {
  it("pojmenování „Nový …“ podle entity", () => {
    expect(createCommand("deal", "Obchod")?.label).toBe("Nový obchod");
    expect(createCommand("note", "Poznámka")?.label).toBe("Nová poznámka");
    // platbu a hodiny zakládají moduly sami, obecný příkaz by selhal (platba se obecným formulářem nezakládá)
    expect(createCommand("payment", "Platba")).toBeNull();
    expect(createCommand("neznama", "Věc")).toBeNull();
  });
  it("modulová akce pokrývá entitu podle adresy seznamu", () => {
    expect(coveredByModuleAction("/zakazky", ["/zakazky?novy=1"])).toBe(true);
    expect(coveredByModuleAction("/ukoly", ["/zakazky?novy=1", undefined])).toBe(false);
    expect(coveredByModuleAction("/kontakty/osoby", ["/kontakty/osoby/novy"])).toBe(true);
  });
  it("nejčastější příkazy: podle použití, pak výchozí pořadí", () => {
    const items = ["a", "b", "c", "d"].map((id) => ({ id }));
    expect(topCommands(items, { c: 5, b: 1 }, 3).map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(topCommands(items, {}, 2).map((x) => x.id)).toEqual(["a", "b"]);
  });
});
