import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

/*
  Service worker (`public/sw.js`) v jednoduchém prostředí: skutečné události push, klepnutí a obnovy odběru
  s napodobeným `self`. Skutečný příjem v prohlížeči pokrývá procházecí test `notifikace-sw`.
*/
const source = fs.readFileSync(path.resolve(import.meta.dirname, "../public/sw.js"), "utf8");

type Handler = (event: Record<string, unknown>) => void;
type Client = {
  focused?: boolean;
  visibilityState?: string;
  focus: () => Promise<unknown>;
  postMessage: (m: unknown, t: MessagePort[]) => void;
  navigate?: (u: string) => Promise<unknown>;
};

function setup(
  opts: {
    clients?: Client[];
    fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
    subscribe?: () => Promise<unknown>;
  } = {},
) {
  const handlers: Record<string, Handler> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const badge = vi.fn(async () => undefined);
  const clearBadge = vi.fn(async () => undefined);
  const fetchMock = vi.fn(
    opts.fetchImpl ??
      (async () => new Response(JSON.stringify({ publicKey: "BPublicKey" }), { status: 200 })),
  );
  const self = {
    addEventListener: (name: string, fn: Handler) => {
      // service worker může mít k jedné události víc posluchačů (terminál také poslouchá `install`)
      const prev = handlers[name];
      handlers[name] = prev ? (e) => (prev(e), fn(e)) : fn;
    },
    skipWaiting: () => undefined,
    clients: {
      claim: async () => undefined,
      matchAll: async () => opts.clients ?? [],
      openWindow: async (u: string) => void opened.push(u),
    },
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) =>
        void shown.push({ title, options }),
      pushManager: {
        subscribe:
          opts.subscribe ??
          (async () => ({
            endpoint: "https://new",
            toJSON: () => ({ endpoint: "https://new", keys: { p256dh: "a", auth: "b" } }),
          })),
      },
    },
    navigator: { setAppBadge: badge, clearAppBadge: clearBadge },
  };
  const ctx = vm.createContext({
    self,
    fetch: fetchMock,
    caches: {
      open: async () => ({ add: async () => undefined }),
      keys: async () => [],
      match: async () => undefined,
      delete: async () => true,
    },
    Response,
    MessageChannel,
    setTimeout,
    clearTimeout,
    atob,
    Uint8Array,
    console,
    URL,
    JSON,
    Promise,
  });
  vm.runInContext(source, ctx);
  const waits: Promise<unknown>[] = [];
  const dispatch = async (name: string, event: Record<string, unknown>) => {
    handlers[name]!({ ...event, waitUntil: (p: Promise<unknown>) => void waits.push(p) });
    await Promise.all(waits.splice(0));
  };
  const pushEvent = (data: unknown) => ({
    data:
      data === undefined
        ? null
        : { json: () => (typeof data === "string" ? JSON.parse(data) : data) },
  });
  return { dispatch, shown, opened, badge, clearBadge, fetchMock, pushEvent, handlers };
}

const notification = (data: Record<string, unknown>) => ({ data, close: vi.fn() });

describe("service worker: push", () => {
  it("zobrazí upozornění s tagem, odkazem, akcemi a odznakem", async () => {
    const t = setup();
    await t.dispatch(
      "push",
      t.pushEvent({
        title: "Nová poptávka",
        body: "Rekonstrukce",
        url: "/poptavky/1",
        tag: "inquiry.new:1",
        nid: "n1",
        badge: 4,
        snooze: true,
      }),
    );
    expect(t.shown).toHaveLength(1);
    const { title, options } = t.shown[0]!;
    expect(title).toBe("Nová poptávka");
    expect(options).toMatchObject({
      body: "Rekonstrukce",
      tag: "inquiry.new:1",
      data: { url: "/poptavky/1", nid: "n1", tag: "inquiry.new:1" },
      renotify: false,
      requireInteraction: false,
    });
    expect((options.actions as { action: string }[]).map((a) => a.action)).toEqual([
      "open",
      "snooze",
    ]);
    expect(t.badge).toHaveBeenCalledWith(4);
  });

  it("naléhavé: znovu upozorní při nahrazení a vyžaduje reakci; odznak 0 ho smaže", async () => {
    const t = setup();
    await t.dispatch("push", t.pushEvent({ title: "STK", tag: "x", urgent: true, badge: 0 }));
    expect(t.shown[0]!.options).toMatchObject({ renotify: true, requireInteraction: true });
    expect(t.clearBadge).toHaveBeenCalled();
  });

  it("akce Odložit se nenabízí bez id upozornění; cizí adresa se nahradí kořenem", async () => {
    const t = setup();
    await t.dispatch(
      "push",
      t.pushEvent({ title: "X", url: "https://evil.example/x", snooze: true }),
    );
    expect((t.shown[0]!.options.actions as unknown[]).length).toBe(1);
    expect(t.shown[0]!.options.data).toMatchObject({ url: "/" });
    await t.dispatch("push", t.pushEvent({ title: "Y", url: "//evil.example" }));
    expect(t.shown[1]!.options.data).toMatchObject({ url: "/" });
  });

  it("záloha: prázdný i nečitelný push se zobrazí jako obecné upozornění", async () => {
    const t = setup();
    await t.dispatch("push", t.pushEvent(undefined));
    await t.dispatch("push", {
      data: {
        json: () => {
          throw new Error("špatný JSON");
        },
      },
    });
    expect(t.shown.map((s) => s.title)).toEqual(["Nové upozornění", "Nové upozornění"]);
    expect(t.shown[0]!.options.data).toMatchObject({ url: "/inbox" });
  });
});

describe("service worker: klepnutí na upozornění", () => {
  const ackClient = (): Client & { posted: unknown[] } => {
    const posted: unknown[] = [];
    return {
      posted,
      focus: vi.fn(async () => undefined),
      postMessage: (m, ports) => {
        posted.push(m);
        ports[0]!.postMessage("ok"); // aplikace odpověděla: přejde sama
      },
    };
  };

  it("označí upozornění za přečtené a otevře stránku v už otevřeném okně bez načtení znovu", async () => {
    const c = ackClient();
    const navigate = vi.fn();
    c.navigate = navigate;
    const t = setup({ clients: [c] });
    const n = notification({ url: "/zakazky/1", nid: "0191a000-0000-7000-8000-000000000001" });
    await t.dispatch("notificationclick", { notification: n, action: "" });
    expect(n.close).toHaveBeenCalled();
    expect(c.posted).toEqual([{ type: "notification-open", url: "/zakazky/1" }]);
    expect(navigate).not.toHaveBeenCalled();
    expect(t.opened).toEqual([]);
    expect(t.fetchMock).toHaveBeenCalledWith(
      "/api/push/opened",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
    expect(JSON.parse((t.fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      id: "0191a000-0000-7000-8000-000000000001",
    });
  });

  it("když okno na zprávu neodpoví, přesměruje ho; bez okna otevře nové", async () => {
    const silent: Client = {
      focus: async () => undefined,
      postMessage: () => undefined,
      navigate: vi.fn(async () => undefined),
    };
    const t = setup({ clients: [silent] });
    await t.dispatch("notificationclick", {
      notification: notification({ url: "/inbox" }),
      action: "",
    });
    expect(silent.navigate).toHaveBeenCalledWith("/inbox");

    const none = setup();
    await none.dispatch("notificationclick", {
      notification: notification({ url: "/kalendar" }),
      action: "",
    });
    expect(none.opened).toEqual(["/kalendar"]);
    expect(none.fetchMock).not.toHaveBeenCalled(); // bez id není co označit
  });

  it("upřednostní zaostřené okno před ostatními", async () => {
    const other = ackClient();
    const focused = ackClient();
    focused.focused = true;
    const t = setup({ clients: [other, focused] });
    await t.dispatch("notificationclick", {
      notification: notification({ url: "/ukoly" }),
      action: "",
    });
    expect(focused.posted).toHaveLength(1);
    expect(other.posted).toHaveLength(0);
  });

  it("akce Odložit jen pošle požadavek a nic neotevírá", async () => {
    const t = setup();
    const n = notification({ url: "/stroje", nid: "0191a000-0000-7000-8000-000000000002" });
    await t.dispatch("notificationclick", { notification: n, action: "snooze" });
    expect(n.close).toHaveBeenCalled();
    expect(t.opened).toEqual([]);
    expect(t.fetchMock).toHaveBeenCalledWith("/api/push/snooze", expect.anything());
    expect(JSON.parse((t.fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      id: "0191a000-0000-7000-8000-000000000002",
      minutes: 60,
    });
  });

  it("selhání požadavku na server nezabrání otevření stránky", async () => {
    const t = setup({ fetchImpl: async () => Promise.reject(new Error("offline")) });
    await t.dispatch("notificationclick", {
      notification: notification({ url: "/dochazka", nid: "n" }),
      action: "",
    });
    expect(t.opened).toEqual(["/dochazka"]);
  });
});

describe("service worker: obnova odběru", () => {
  it("po rotaci odběru se zařízení přihlásí znovu a starý odběr se nahradí novým", async () => {
    const t = setup();
    await t.dispatch("pushsubscriptionchange", {
      oldSubscription: { endpoint: "https://old", options: {} },
      newSubscription: null,
    });
    const post = t.fetchMock.mock.calls.find(
      (c) =>
        c[0] === "/api/push/subscription" && (c[1] as RequestInit | undefined)?.method === "POST",
    )!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toMatchObject({
      endpoint: "https://new",
      oldEndpoint: "https://old",
    });
  });

  it("odhlášený uživatel se znovu nepřihlašuje (401)", async () => {
    const t = setup({ fetchImpl: async () => new Response("{}", { status: 401 }) });
    await t.dispatch("pushsubscriptionchange", {
      oldSubscription: { endpoint: "https://old", options: {} },
    });
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("service worker: terminál zůstal nedotčený", () => {
  it("část pro offline stránku terminálu je v souboru dál a push nepřepisuje navigace mimo /t", () => {
    expect(source).toContain("TERMINAL_OFFLINE_CACHE");
    expect(source).toContain('pathname !== "/t"');
  });
});
