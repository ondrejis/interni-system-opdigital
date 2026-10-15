import { describe, expect, it } from "vitest";
import {
  addNode,
  countNodes,
  defaultStructure,
  depthOf,
  ensureValidStructure,
  findNode,
  folderNameProblem,
  indentNode,
  moveNode,
  outdentNode,
  removeNode,
  renameNode,
  resolveNodes,
  sanitizeFolderName,
  validateStructure,
} from "./tree";

describe("výchozí struktura (spec 00, DRV-01)", () => {
  const s = defaultStructure();

  it("je platná a odpovídá stromu ze specifikace", () => {
    expect(validateStructure(s)).toEqual([]);
    expect(s.client.map((n) => n.name)).toEqual([
      "00 Klient",
      "10 Web",
      "20 Marketing",
      "30 Systémy",
    ]);
    expect(s.client[0]!.children.map((n) => n.name)).toEqual([
      "Smlouvy a objednávky",
      "Brand a loga",
      "Podklady od klienta",
    ]);
    expect(s.job.web.map((n) => n.name)).toEqual([
      "01 Podklady",
      "02 Návrh",
      "03 Texty a obsah",
      "04 Fotky a média",
      "05 Předání",
    ]);
    expect(s.job.marketing.map((n) => n.name)).toEqual([
      "01 Strategie a podklady",
      "02 Kreativy",
      "03 Finální exporty",
      "04 Reporty",
    ]);
    expect(s.job.marketing[1]!.children.map((n) => n.name)).toEqual([
      "Foto",
      "Video",
      "Texty a scénáře",
    ]);
    expect(s.job.systemy).toHaveLength(5);
    expect(s.clientsRoot).toBe("Klienti");
    expect(s.archiveRoot).toBe("Archiv");
  });

  it("každé volání vrací novou kopii", () => {
    const a = defaultStructure();
    a.client[0]!.name = "Změněno";
    expect(defaultStructure().client[0]!.name).toBe("00 Klient");
  });

  it("složky služeb mají značku služby", () => {
    expect(s.client.filter((n) => n.service).map((n) => n.service)).toEqual([
      "web",
      "marketing",
      "systemy",
    ]);
  });
});

describe("operace editoru", () => {
  const base = defaultStructure().job.web;

  it("přidá složku na první úroveň i pod uzel, vstup nemění", () => {
    const a = addNode(base, null, "  06 Archiv  ", "x1");
    expect(a.at(-1)).toMatchObject({ id: "x1", name: "06 Archiv", children: [] });
    expect(base).toHaveLength(5);
    const b = addNode(base, "web-02", "Varianty", "x2");
    expect(findNode(b, "web-02")!.children.map((n) => n.name)).toEqual(["Varianty"]);
    expect(findNode(base, "web-02")!.children).toHaveLength(0);
  });

  it("přejmenuje složku a zachová její ID", () => {
    const a = renameNode(base, "web-03", "03 Obsah");
    expect(findNode(a, "web-03")!.name).toBe("03 Obsah");
  });

  it("smaže složku i s podsložkami, složku služby nesmaže", () => {
    const s = defaultStructure();
    const a = removeNode(s.job.marketing, "mkt-02");
    expect(findNode(a, "mkt-02")).toBeNull();
    expect(findNode(a, "mkt-02-foto")).toBeNull();
    expect(removeNode(s.client, "client-web")).toEqual(s.client);
  });

  it("přeskládá sourozence nahoru a dolů, na okrajích nic", () => {
    const up = moveNode(base, "web-03", "up");
    expect(up.map((n) => n.id).slice(0, 3)).toEqual(["web-01", "web-03", "web-02"]);
    const down = moveNode(base, "web-03", "down");
    expect(down.map((n) => n.id).slice(2, 4)).toEqual(["web-04", "web-03"]);
    expect(moveNode(base, "web-01", "up")).toEqual(base);
    expect(moveNode(base, "web-05", "down")).toEqual(base);
  });

  it("zanoří do předchozího sourozence a vynoří za rodiče", () => {
    const a = indentNode(base, "web-03");
    expect(findNode(a, "web-02")!.children.map((n) => n.id)).toEqual(["web-03"]);
    expect(a.map((n) => n.id)).toEqual(["web-01", "web-02", "web-04", "web-05"]);
    const b = outdentNode(a, "web-03");
    expect(b.map((n) => n.id)).toEqual(["web-01", "web-02", "web-03", "web-04", "web-05"]);
    // první sourozenec se zanořit nedá, kořenový se vynořit nedá
    expect(indentNode(base, "web-01")).toEqual(base);
    expect(outdentNode(base, "web-02")).toEqual(base);
  });

  it("složka služby se nezanořuje ani nevynořuje", () => {
    const s = defaultStructure();
    expect(indentNode(s.client, "client-marketing")).toEqual(s.client);
  });

  it("počítá uzly a hloubku", () => {
    const s = defaultStructure();
    expect(countNodes(s.job.web)).toBe(5);
    expect(countNodes(s.job.marketing)).toBe(7);
    expect(depthOf(s.job.marketing)).toBe(2);
    expect(depthOf([])).toBe(0);
  });
});

describe("kontrola platnosti", () => {
  it("odmítne prázdný název, lomítko, příliš dlouhý název", () => {
    expect(folderNameProblem("")).toMatch(/prázdný/);
    expect(folderNameProblem("a/b")).toMatch(/lomítko/);
    expect(folderNameProblem("x".repeat(81))).toMatch(/delší/);
    expect(folderNameProblem("02 Návrh")).toBeNull();
  });

  it("odmítne duplicitní názvy sourozenců bez ohledu na velikost písmen", () => {
    const s = defaultStructure();
    s.job.web = addNode(s.job.web, null, "01 PODKLADY", "dup");
    expect(validateStructure(s).join("\n")).toMatch(/stejným názvem/);
  });

  it("stejný název na různých úrovních je v pořádku", () => {
    const s = defaultStructure();
    s.job.web = addNode(s.job.web, "web-02", "01 Podklady", "ok");
    expect(validateStructure(s)).toEqual([]);
  });

  it("vyžaduje právě jednu složku každé služby u klienta a zakazuje je u zakázky", () => {
    const s = defaultStructure();
    s.client = s.client.filter((n) => n.service !== "web");
    expect(validateStructure(s).join("\n")).toMatch(/Web/);
    const t = defaultStructure();
    t.job.web = [{ id: "svc", name: "10 Web", service: "web", children: [] }];
    expect(validateStructure(t).join("\n")).toMatch(/jen ve stromu klienta/);
  });

  it("složka služby musí být na první úrovni", () => {
    const s = defaultStructure();
    s.client[0]!.children.push({ id: "deep", name: "Moc", service: "web", children: [] });
    expect(validateStructure(s).join("\n")).toMatch(/první úrovni/);
  });

  it("hlídá hloubku, počet složek, opakující se ID a název složky zakázky", () => {
    const s = defaultStructure();
    let list = s.job.web;
    let parent = "web-01";
    for (let i = 0; i < 5; i += 1) {
      list = addNode(list, parent, `L${i}`, `deep-${i}`);
      parent = `deep-${i}`;
    }
    s.job.web = list;
    expect(validateStructure(s).join("\n")).toMatch(/příliš hluboký/);

    const many = defaultStructure();
    for (let i = 0; i < 150; i += 1) many.job.web = addNode(many.job.web, null, `S${i}`, `m${i}`);
    expect(validateStructure(many).join("\n")).toMatch(/nejvýš 150/);

    const ids = defaultStructure();
    ids.job.systemy[1]!.id = ids.job.systemy[0]!.id;
    expect(validateStructure(ids).join("\n")).toMatch(/identifikátor/);

    const pattern = defaultStructure();
    pattern.jobFolderName = "{RRRR-MM}";
    expect(validateStructure(pattern).join("\n")).toMatch(/Název zakázky/);
  });

  it("ensureValidStructure nahradí poškozenou strukturu výchozí", () => {
    const bad = defaultStructure();
    bad.client = [];
    expect(ensureValidStructure(bad)).toEqual(defaultStructure());
    expect(ensureValidStructure(null)).toEqual(defaultStructure());
    const good = defaultStructure();
    good.job.web = addNode(good.job.web, null, "06 Navíc", "n");
    expect(ensureValidStructure(good)).toBe(good);
  });
});

describe("převod pro n8n", () => {
  it("vynechá složky služeb, které klient nemá, a zahodí ID", () => {
    const s = defaultStructure();
    const out = resolveNodes(s.client, ["web"]);
    expect(out.map((n) => n.name)).toEqual(["00 Klient", "10 Web"]);
    expect(out[1]).toEqual({ name: "10 Web", service: "web", children: [] });
    expect(JSON.stringify(out)).not.toContain("client-00");
  });

  it("bez seznamu služeb nic nevynechá (strom zakázky)", () => {
    const out = resolveNodes(defaultStructure().job.marketing);
    expect(out).toHaveLength(4);
    expect(out[1]!.children.map((n) => n.name)).toEqual(["Foto", "Video", "Texty a scénáře"]);
  });

  it("zpracuje názvy pro Disk", () => {
    expect(sanitizeFolderName(" A/B \\ C  ")).toBe("A-B - C");
    expect(sanitizeFolderName("   ")).toBe("Bez názvu");
    expect(sanitizeFolderName("x".repeat(300))).toHaveLength(120);
    expect(sanitizeFolderName("řádek\nnový\tznak")).toBe("řádek nový znak");
  });
});
