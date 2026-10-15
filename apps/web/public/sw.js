/* Service worker. Část 1: společný základ (instalace, aktivace). Část 2: čtení naposledy načtených stránek bez spojení
   (MOB-10), viz dole. Část 3: upozornění v telefonu (push; OPSYS push nepoužívá, kód zůstal v platformě). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/* ===========================================================================================================
   Čtení bez spojení (MOB-10, v2). Pravidla:
   - Jen čtení: ukládají se odpovědi na GET (stránky, jejich RSC data, hašované soubory aplikace). Cokoli jiného
     (POST, server actions, /api/*, SSE) jde vždy rovnou na server a nikdy se neukládá ani neopakuje – zápisy se
     bez spojení prostě nepovedou, žádná fronta.
   - Stránky: nejdřív síť (po 4 s se při slabém signálu vezme uložená kopie, pokud existuje); bez sítě uložená kopie,
     jinak /offline.html.
   - Přihlašovací a jednorázové stránky se neukládají. Při odhlášení (POST /api/auth/sign-out) se všechny mezipaměti
     OPSYS smažou, aby na sdíleném zařízení nezůstala cizí data.
   =========================================================================================================== */
const PAGES_CACHE = "opsys-pages-v1";
const STATIC_CACHE = "opsys-static-v1";
const OFFLINE_URL = "/offline.html";
const OWN_CACHES = [PAGES_CACHE, STATIC_CACHE, "opsys-data-v1"];
const NETWORK_WAIT_MS = 4000;
const NO_CACHE_PAGES =
  /^\/(prihlaseni|start|overeni|pozvanka|zapomenute-heslo|obnova-hesla|ui|tv)(\/|$)/;

/** Rozhodne, co se s požadavkem stane: "static" (cache-first), "page" (síť, pak kopie) nebo "bypass" (nechat být). */
function cachePolicy(request) {
  if (request.method !== "GET") return "bypass";
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return "bypass";
  }
  if (url.origin !== self.location.origin) return "bypass";
  const path = url.pathname;
  if (path.startsWith("/api/") || path === "/sw.js" || path === "/manifest.webmanifest")
    return "bypass";
  if (path.startsWith("/_next/static/") || path.startsWith("/pwa-icon/")) return "static";
  if (path === OFFLINE_URL) return "static";
  if (NO_CACHE_PAGES.test(path)) return "bypass";
  const accept = request.headers.get("accept") || "";
  const wantsPage =
    request.mode === "navigate" ||
    request.headers.get("rsc") === "1" ||
    accept.includes("text/html") ||
    accept.includes("text/x-component");
  return wantsPage ? "page" : "bypass";
}

/** Do mezipaměti jen úspěšná odpověď bez přesměrování (přesměrování na přihlášení se nesmí uložit jako stránka). */
function cacheable(response) {
  return (
    !!response &&
    response.status === 200 &&
    !response.redirected &&
    response.type !== "opaqueredirect"
  );
}

async function clearOwnCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith("opsys-")).map((k) => caches.delete(k)));
}

async function staticResponse(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) await cache.put(request, res.clone());
  return res;
}

async function pageResponse(request) {
  const cache = await caches.open(PAGES_CACHE);
  const network = fetch(request).then(async (res) => {
    if (cacheable(res)) await cache.put(request, res.clone());
    return res;
  });
  const cached = await cache.match(request, { ignoreVary: true });
  try {
    if (!cached) return await network;
    // slabý signál: po chvíli se ukáže uložená kopie, síť dobíhá na pozadí a kopii obnoví
    network.catch(() => {});
    return await Promise.race([
      network,
      new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_WAIT_MS)),
    ]);
  } catch (err) {
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw err;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => {}),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  let path = "";
  try {
    path = new URL(request.url).pathname;
  } catch {
    return;
  }
  if (path === "/api/auth/sign-out") {
    event.waitUntil(clearOwnCaches().catch(() => {}));
    return;
  }
  const policy = cachePolicy(request);
  if (policy === "static") event.respondWith(staticResponse(request));
  else if (policy === "page") event.respondWith(pageResponse(request));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-offline") event.waitUntil(clearOwnCaches());
});

/* ===========================================================================================================
   Upozornění v telefonu (push): příjem, zobrazení, klepnutí, akce „Odložit“ a obnova odběru po rotaci.
   Obsah zprávy skládá server pro konkrétního příjemce (nese jen to, co smí vidět); tady se jen zobrazí.
   Zpráva: { title, body, url, tag, nid, badge, count, urgent, snooze, ts }.
   =========================================================================================================== */
const PUSH_ICON = "/pwa-icon/192";

/** Odkaz z upozornění smí vést jen na stránku téhož systému. */
function pushUrl(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

/** Odznak počtu nepřečtených na ikoně aplikace (kde to systém umí). */
function setPushBadge(count) {
  try {
    const nav = self.navigator;
    if (typeof count !== "number") return Promise.resolve();
    if (count > 0 && nav && nav.setAppBadge) return nav.setAppBadge(count).catch(() => {});
    if (count === 0 && nav && nav.clearAppBadge) return nav.clearAppBadge().catch(() => {});
  } catch {
    /* odznak je jen pomůcka */
  }
  return Promise.resolve();
}

/** Odeslání malého požadavku na server (cookie se posílají). Chyba nesmí zabránit otevření stránky. */
function postJson(url, body) {
  return fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

self.addEventListener("push", (event) => {
  event.waitUntil(showPush(event));
});

async function showPush(event) {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  // záloha bez dat: push přišel prázdný nebo nečitelný; Chrome vyžaduje, aby se každý push něco zobrazil
  if (!data || typeof data !== "object") data = { title: "Nové upozornění", url: "/inbox" };
  const tag = typeof data.tag === "string" && data.tag ? data.tag : undefined;
  const nid = typeof data.nid === "string" ? data.nid : null;
  const actions = [{ action: "open", title: "Otevřít" }];
  if (data.snooze && nid) actions.push({ action: "snooze", title: "Odložit o hodinu" });
  await self.registration.showNotification(String(data.title || "Nové upozornění").slice(0, 120), {
    body: data.body ? String(data.body).slice(0, 240) : undefined,
    tag,
    // nová zpráva se stejným tagem starou nahradí; ozve se jen když jde o naléhavou
    renotify: Boolean(tag) && data.urgent === true,
    requireInteraction: data.urgent === true,
    icon: PUSH_ICON,
    badge: PUSH_ICON,
    timestamp: typeof data.ts === "number" ? data.ts : Date.now(),
    data: { url: pushUrl(data.url), nid, tag: tag || null },
    actions,
  });
  await setPushBadge(typeof data.badge === "number" ? data.badge : undefined);
}

/**
 * Otevře stránku v okně, které už je otevřené (bez načtení znovu, ať se nezahodí rozepsaná práce): aplikace odpoví
 * na zprávu a přejde sama. Když neodpoví (stará stránka, přihlašovací obrazovka), okno se přesměruje; bez okna se otevře nové.
 */
async function openFromPush(url) {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const target =
    list.find((c) => c.focused) || list.find((c) => c.visibilityState === "visible") || list[0];
  if (target) {
    try {
      await target.focus();
    } catch {
      /* okno nejde zaostřit (iOS) – zkusíme aspoň přejít */
    }
    const answered = await new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(false), 600);
      channel.port1.onmessage = () => {
        clearTimeout(timer);
        resolve(true);
      };
      try {
        target.postMessage({ type: "notification-open", url }, [channel.port2]);
      } catch {
        clearTimeout(timer);
        resolve(false);
      }
    });
    if (answered) return;
    try {
      if ("navigate" in target) {
        await target.navigate(url);
        return;
      }
    } catch {
      /* spadne zpět na otevření nového okna */
    }
  }
  await self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  notification.close();
  if (event.action === "snooze" && data.nid) {
    event.waitUntil(postJson("/api/push/snooze", { id: data.nid, minutes: 60 }));
    return;
  }
  event.waitUntil(
    Promise.all([
      data.nid ? postJson("/api/push/opened", { id: data.nid }) : Promise.resolve(),
      openFromPush(pushUrl(data.url)),
    ]),
  );
});

/** Prohlížeč odběr občas obnoví (jiná adresa, nové klíče): zařízení se přihlásí znovu, ať nepřestane dostávat upozornění. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(resubscribe(event));
});

async function resubscribe(event) {
  const old = event.oldSubscription || null;
  let key = old && old.options ? old.options.applicationServerKey : null;
  try {
    const res = await fetch("/api/push/subscription", { credentials: "same-origin" });
    if (res.status === 401) return; // odhlášen: odběr se vytvoří při příštím zapnutí
    const info = await res.json();
    if (info && info.publicKey) key = urlBase64ToBytes(info.publicKey);
  } catch {
    /* bez spojení použijeme klíč ze starého odběru */
  }
  const sub =
    event.newSubscription ||
    (key
      ? await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        })
      : null);
  if (!sub) return;
  await postJson("/api/push/subscription", {
    ...sub.toJSON(),
    oldEndpoint: old ? old.endpoint : null,
  });
}

function urlBase64ToBytes(base64url) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* Úklid: staré offline cache po odstraněném terminálu a starší verze mezipamětí OPSYS se při aktivaci smažou. */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                k.startsWith("terminal-offline-") ||
                (k.startsWith("opsys-") && !OWN_CACHES.includes(k)),
            )
            .map((k) => caches.delete(k)),
        ),
      )
      .catch(() => {}),
  );
});
