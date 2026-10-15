import { describe, expect, it } from "vitest";
import {
  ARES_BASE,
  buildAresDiff,
  createFakeAres,
  createFetchAresClient,
  createMemoryAresCache,
  FAKE_ARES_COMPANIES,
  lookupAres,
  mapAres,
  type AresCompany,
} from "./index";

const ALZA_RAW = {
  ico: "27082440",
  obchodniJmeno: "Alza.cz a.s.",
  dic: "CZ27082440",
  pravniForma: "121",
  sidlo: {
    nazevObce: "Praha",
    nazevUlice: "Jankovcova",
    cisloDomovni: 1522,
    cisloOrientacni: 53,
    nazevCastiObce: "Holešovice",
    psc: 17000,
  },
};
const ALZA: AresCompany = FAKE_ARES_COMPANIES[0]!;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const asFetch = (f: (url: string, init?: RequestInit) => Promise<Response>) =>
  f as unknown as typeof fetch;

describe("mapování odpovědi ARES (ORG-03)", () => {
  it("složí ulici s čísly, PSČ s mezerou, město, DIČ i právní formu", () => {
    expect(mapAres(ALZA_RAW)).toEqual({
      ico: "27082440",
      name: "Alza.cz a.s.",
      dic: "CZ27082440",
      legalForm: "Akciová společnost",
      street: "Jankovcova 1522/53",
      city: "Praha",
      zip: "170 00",
    });
  });

  it("obec bez ulic: adresa je část obce a číslo popisné; neznámý kód formy se nepíše", () => {
    const r = mapAres({
      ico: "00000019",
      obchodniJmeno: "Obec Test",
      pravniForma: "999",
      sidlo: { nazevObce: "Lhota", nazevCastiObce: "Horní Lhota", cisloDomovni: 12, psc: 33001 },
    });
    expect(r).toMatchObject({
      street: "Horní Lhota 12",
      city: "Lhota",
      zip: "330 01",
      dic: null,
      legalForm: null,
    });
  });

  it("IČO se doplní nulami zleva; neočekávaný tvar vrátí null", () => {
    expect(mapAres({ ico: "6947", obchodniJmeno: "MF" })?.ico).toBe("00006947");
    expect(mapAres({ foo: 1 })).toBeNull();
    expect(mapAres({ ico: "1", obchodniJmeno: "" })).toBeNull();
  });
});

describe("adaptér přes fetch", () => {
  it("volá jen pevnou adresu ARES, bez přesměrování a s časovým limitem", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const client = createFetchAresClient({
      fetch: asFetch(async (url, init) => {
        calls.push({ url, ...(init ? { init } : {}) });
        return json(ALZA_RAW);
      }),
    });
    const r = await client.lookup("27082440");
    expect(r).toMatchObject({ ok: true, company: { name: "Alza.cz a.s." } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${ARES_BASE}27082440`);
    expect(calls[0]!.init?.redirect).toBe("error");
    expect(calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("do sítě nepustí nic, co není osm číslic (SSRF)", async () => {
    let called = false;
    const client = createFetchAresClient({
      fetch: asFetch(async () => {
        called = true;
        return json({});
      }),
    });
    expect(await client.lookup("../../etc/passwd")).toMatchObject({ ok: false });
    expect(called).toBe(false);
  });

  it("chyby sítě, 404, 503 a vadná odpověď vrací české věty, ne výjimky", async () => {
    const lookup = (f: (url: string) => Promise<Response>) =>
      createFetchAresClient({ fetch: asFetch(f) }).lookup("27082440");
    expect(
      await lookup(async () => {
        throw new Error("ECONNREFUSED");
      }),
    ).toMatchObject({ ok: false, reason: "unavailable" });
    expect(await lookup(async () => json({ kod: "NENALEZENO" }, 404))).toMatchObject({
      ok: false,
      reason: "not_found",
    });
    expect(await lookup(async () => json({ nic: 1 }))).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
    expect(await lookup(async () => json({}, 503))).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
  });

  it("pomalý ARES se po časovém limitu vzdá a pustí ruční vyplnění (NFR-04)", async () => {
    const client = createFetchAresClient({
      timeoutMs: 30,
      fetch: asFetch(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("timeout")));
          }),
      ),
    });
    const started = Date.now();
    const r = await client.lookup("27082440");
    expect(r).toMatchObject({ ok: false, reason: "unavailable" });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("dotaz s cache 24 h (ORG-04)", () => {
  it("neplatné IČO (tvar i kontrolní součet) se do sítě nepošle", async () => {
    const ares = createFakeAres();
    const cache = createMemoryAresCache();
    for (const bad of ["1234", "27082441", "abc", ""])
      expect(await lookupAres(bad, { cache, client: ares })).toMatchObject({
        ok: false,
        reason: "invalid",
      });
    expect(ares.calls).toEqual([]);
  });

  it("druhý dotaz do 24 h jde z cache, po 24 h znovu do ARES; `fresh` cache obejde", async () => {
    const ares = createFakeAres();
    const cache = createMemoryAresCache();
    const t0 = new Date("2026-10-14T10:00:00Z");
    expect(await lookupAres("27082440", { cache, client: ares, now: t0 })).toMatchObject({
      ok: true,
      cached: false,
    });
    const soon = new Date(t0.getTime() + 23 * 3600_000);
    expect(await lookupAres("27082440", { cache, client: ares, now: soon })).toMatchObject({
      ok: true,
      cached: true,
      stale: false,
    });
    expect(ares.calls).toHaveLength(1);
    const later = new Date(t0.getTime() + 25 * 3600_000);
    expect(await lookupAres("27082440", { cache, client: ares, now: later })).toMatchObject({
      ok: true,
      cached: false,
    });
    expect(await lookupAres("27082440", { cache, client: ares, now: later, fresh: true })).toMatchObject({
      cached: false,
    });
    expect(ares.calls).toHaveLength(3);
  });

  it("výpadek ARES: bez cache věta pro uživatele, se starou cache vrátí starší údaje s příznakem", async () => {
    const ares = createFakeAres();
    const cache = createMemoryAresCache();
    ares.setDown(true);
    expect(await lookupAres("27082440", { cache, client: ares })).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
    ares.setDown(false);
    const t0 = new Date("2026-10-14T10:00:00Z");
    await lookupAres("27082440", { cache, client: ares, now: t0 });
    ares.setDown(true);
    const r = await lookupAres("27082440", {
      cache,
      client: ares,
      now: new Date(t0.getTime() + 48 * 3600_000),
    });
    expect(r).toMatchObject({ ok: true, cached: true, stale: true });
  });

  it("neznámé IČO je not_found a do cache se nezapisuje", async () => {
    const ares = createFakeAres([]);
    const cache = createMemoryAresCache();
    expect(await lookupAres("27082440", { cache, client: ares })).toMatchObject({
      ok: false,
      reason: "not_found",
    });
    expect(await cache.get("27082440")).toBeNull();
  });
});

describe("náhled změn (ORG-03)", () => {
  it("nová organizace: vše se doplní a je zaškrtnuté", () => {
    const diff = buildAresDiff(null, ALZA);
    expect(diff.map((d) => d.field)).toEqual([
      "name",
      "officialName",
      "ico",
      "dic",
      "legalForm",
      "street",
      "city",
      "zip",
    ]);
    expect(diff.every((d) => d.kind === "fill" && d.selected)).toBe(true);
  });

  it("existující organizace: stejné hodnoty se vynechají, přepisy jsou „change“", () => {
    const diff = buildAresDiff(
      {
        name: "Alza",
        officialName: "Alza.cz a.s.",
        ico: "27082440",
        dic: null,
        legalForm: "Akciová společnost",
        street: "Stará 1",
        city: "Praha",
        zip: "170 00",
      },
      ALZA,
    );
    expect(diff.map((d) => [d.field, d.kind])).toEqual([
      ["name", "change"],
      ["dic", "fill"],
      ["street", "change"],
    ]);
  });

  it("vlastní zkrácený název se nepřepisuje (nezaškrtnuto), zrcadlo oficiálního názvu ano", () => {
    const custom = buildAresDiff({ name: "Alza", officialName: "Alza a.s." }, ALZA);
    expect(custom.find((d) => d.field === "name")).toMatchObject({ selected: false });
    const mirror = buildAresDiff({ name: "Alza a.s.", officialName: "Alza a.s." }, ALZA);
    expect(mirror.find((d) => d.field === "name")).toMatchObject({ selected: true });
  });

  it("údaj, který ARES nemá, nic nepřepíše", () => {
    const diff = buildAresDiff({ dic: "CZ1" }, { ...ALZA, dic: null });
    expect(diff.find((d) => d.field === "dic")).toBeUndefined();
  });
});
