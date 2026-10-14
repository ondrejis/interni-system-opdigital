import { beforeEach, describe, expect, it } from "vitest";
import { aresLookup, clearAresCache, isValidIco, mapAres, normalizeIcoInput } from "./ares";

const ALZA = {
  ico: "27082440",
  obchodniJmeno: "Alza.cz a.s.",
  dic: "CZ27082440",
  sidlo: {
    nazevObce: "Praha",
    nazevUlice: "Jankovcova",
    cisloDomovni: 1522,
    cisloOrientacni: 53,
    nazevCastiObce: "Holešovice",
    psc: 17000,
  },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => clearAresCache());

describe("IČO", () => {
  it("kontrolní součet pozná platné a chybně opsané IČO", () => {
    expect(isValidIco("27082440")).toBe(true);
    expect(isValidIco("27082441")).toBe(false);
    expect(isValidIco("1234")).toBe(false);
  });
  it("normalizace doplní nuly a odmítne nesmysl", () => {
    expect(normalizeIcoInput("2 70 82 440")).toBe("27082440");
    expect(normalizeIcoInput("45274649")).toBe("45274649");
    expect(normalizeIcoInput("123456789")).toBeNull();
    expect(normalizeIcoInput("")).toBeNull();
  });
});

describe("mapování odpovědi ARES", () => {
  it("složí ulici s čísly, PSČ s mezerou a město", () => {
    expect(mapAres(ALZA)).toEqual({
      ico: "27082440",
      name: "Alza.cz a.s.",
      dic: "CZ27082440",
      street: "Jankovcova 1522/53",
      city: "Praha",
      zip: "170 00",
    });
  });
  it("obec bez ulic: adresa je část obce a číslo popisné", () => {
    const r = mapAres({
      ico: "00000019",
      obchodniJmeno: "Obec Test",
      sidlo: { nazevObce: "Lhota", nazevCastiObce: "Horní Lhota", cisloDomovni: 12, psc: 33001 },
    });
    expect(r).toMatchObject({ street: "Horní Lhota 12", city: "Lhota", zip: "330 01", dic: null });
  });
  it("neočekávaný tvar vrátí null", () => {
    expect(mapAres({ foo: 1 })).toBeNull();
  });
});

describe("dotaz na ARES", () => {
  it("volá jen pevnou adresu ARES a bez přesměrování; druhý dotaz jde z paměti", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) });
      return json(ALZA);
    }) as unknown as typeof fetch;
    const a = await aresLookup("27082440", fetchImpl);
    const b = await aresLookup("27082440", fetchImpl);
    expect(a).toMatchObject({ ok: true, cached: false });
    expect(b).toMatchObject({ ok: true, cached: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/27082440",
    );
    expect(calls[0]!.init?.redirect).toBe("error");
  });

  it("neplatné IČO se do sítě vůbec nepošle", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return json({});
    }) as unknown as typeof fetch;
    const r = await aresLookup("../../etc/passwd", fetchImpl);
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
    expect(called).toBe(false);
  });

  it("chyby sítě, 404 a vadná odpověď vrací české věty, ne výjimky", async () => {
    expect(
      await aresLookup("27082440", (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch),
    ).toMatchObject({ ok: false, reason: "unavailable" });
    clearAresCache();
    expect(
      await aresLookup("27082440", (async () =>
        json({ kod: "NENALEZENO" }, 404)) as unknown as typeof fetch),
    ).toMatchObject({ ok: false, reason: "not_found" });
    expect(
      await aresLookup("27082440", (async () => json({ nic: 1 })) as unknown as typeof fetch),
    ).toMatchObject({ ok: false, reason: "unavailable" });
    expect(
      await aresLookup("27082440", (async () => json({}, 503)) as unknown as typeof fetch),
    ).toMatchObject({ ok: false, reason: "unavailable" });
  });
});
