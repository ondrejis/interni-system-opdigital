import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

/*
  Service worker (`public/sw.js`), část pro čtení bez spojení (MOB-10): co se ukládá a co nikdy, záloha při výpadku
  sítě, mazání při odhlášení. Zápisy (POST, server actions, /api) se neukládají a neopakují.
*/
const source = fs.readFileSync(path.resolve(import.meta.dirname, "../public/sw.js"), "utf8");

type Handler = (event: Record<string, unknown>) => void;

function setup(fetchImpl: (req: Request) => Promise<Response>) {
  const handlers: Record<string, Handler[]> = {};
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (r: Request | string) =>
    typeof r === "string" ? new URL(r, "https://opsys.test").href : r.url;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      add: async (u: string) => void m.set(keyOf(u), new Response("offline-page")),
      put: async (r: Request, res: Response) => void m.set(keyOf(r), res),
      match: async (r: Request) => m.get(keyOf(r))?.clone(),
    };
  };
  const self = {
    addEventListener: (n: string, fn: Handler) => void (handlers[n] ??= []).push(fn),
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
    location: { origin: "https://opsys.test" },
  };
  const ctx = vm.createContext({
    self,
    fetch: vi.fn(fetchImpl),
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (n: string) => stores.delete(n),
      match: async (r: string) => {
        for (const m of stores.values()) {
          const hit = m.get(keyOf(r));
          if (hit) return hit.clone();
        }
        return undefined;
      },
    },
    Response,
    URL,
    Promise,
    setTimeout,
    clearTimeout,
    console,
  });
  vm.runInContext(source, ctx);
  const fetchEvent = async (request: Request) => {
    let responded: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    for (const h of handlers.fetch ?? [])
      h({
        request,
        respondWith: (p: Promise<Response>) => void (responded = p),
        waitUntil: (p: Promise<unknown>) => void waits.push(p),
      });
    await Promise.all(waits);
    return responded;
  };
  const install = async () => {
    const waits: Promise<unknown>[] = [];
    for (const h of handlers.install ?? [])
      h({ waitUntil: (p: Promise<unknown>) => void waits.push(p) });
    await Promise.all(waits);
  };
  return { fetchEvent, install, stores };
}

const get = (p: string, init: RequestInit = {}) => new Request(`https://opsys.test${p}`, init);
const html = (body = "stránka") =>
  new Response(body, { status: 200, headers: { "content-type": "text/html" } });

describe("service worker: čtení bez spojení", () => {
  it("zápisy a /api nikdy nezpracuje (nechá je jít rovnou na server)", async () => {
    const sw = setup(async () => html());
    expect(await sw.fetchEvent(get("/klienti", { method: "POST" }))).toBeUndefined();
    expect(await sw.fetchEvent(get("/api/realtime"))).toBeUndefined();
    expect(await sw.fetchEvent(get("/api/auth/get-session"))).toBeUndefined();
    expect(
      await sw.fetchEvent(get("/prihlaseni", { headers: { accept: "text/html" } })),
    ).toBeUndefined();
  });

  it("stránka: síť a uložení kopie; bez sítě se vrátí uložená kopie", async () => {
    let online = true;
    const sw = setup(async () => {
      if (!online) throw new TypeError("Failed to fetch");
      return html("čerstvá");
    });
    const nav = () => get("/klienti", { headers: { accept: "text/html" } });
    const first = await (await sw.fetchEvent(nav()))!;
    expect(await first.text()).toBe("čerstvá");
    online = false;
    const offline = await (await sw.fetchEvent(nav()))!;
    expect(await offline.text()).toBe("čerstvá");
  });

  it("neznámá stránka bez sítě ukáže offline stránku, RSC dotaz bez kopie selže", async () => {
    const sw = setup(async () => {
      throw new TypeError("Failed to fetch");
    });
    await sw.install();
    const nav = get("/obchody", { headers: { accept: "text/html" } });
    Object.defineProperty(nav, "mode", { value: "navigate" });
    const res = await (await sw.fetchEvent(nav))!;
    expect(await res.text()).toBe("offline-page");
    await expect(
      sw.fetchEvent(get("/obchody?_rsc=abc", { headers: { rsc: "1" } })),
    ).rejects.toThrow();
  });

  it("přesměrování a chyby se neukládají", async () => {
    const redirected = Object.defineProperty(html(), "redirected", { value: true });
    const sw = setup(async () => redirected);
    await sw.fetchEvent(get("/prehled", { headers: { accept: "text/html" } }));
    expect(sw.stores.get("opsys-pages-v1")?.size ?? 0).toBe(0);
  });

  it("hašované soubory aplikace se berou z mezipaměti", async () => {
    const f = vi.fn(async () => new Response("js", { status: 200 }));
    const sw = setup(f);
    await sw.fetchEvent(get("/_next/static/chunks/a.js"));
    await sw.fetchEvent(get("/_next/static/chunks/a.js"));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("odhlášení smaže všechny mezipaměti OPSYS", async () => {
    const sw = setup(async () => html());
    await sw.fetchEvent(get("/klienti", { headers: { accept: "text/html" } }));
    expect(sw.stores.size).toBeGreaterThan(0);
    await sw.fetchEvent(get("/api/auth/sign-out", { method: "POST" }));
    expect(sw.stores.size).toBe(0);
  });
});
