/* Service worker. Část 1: společný základ a upozornění v telefonu (push). Záměrně nic nekešuje – data jsou citlivá a vždy čerstvá. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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

/* ===========================================================================================================
   Terminál řemeslníka, offline: když se terminál otevírá bez spojení, ukáže se místo chyby prohlížeče stránka
   „Jste offline“ (public/t-offline.html). Nekešuje se nic s daty uživatele, jen tato jedna veřejná statická stránka.
   Zápisy z terminálu čekají ve frontě v zařízení (IndexedDB) a odesílá je aplikace sama, viz docs/TERMINAL.md.
   Tento blok je oddělený od části souboru s push upozorněními a nesahá do ní.
   =========================================================================================================== */
const TERMINAL_OFFLINE_CACHE = "terminal-offline-v1";
const TERMINAL_OFFLINE_URL = "/t-offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(TERMINAL_OFFLINE_CACHE)
      .then((cache) => cache.add(TERMINAL_OFFLINE_URL))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("terminal-offline-") && k !== TERMINAL_OFFLINE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .catch(() => {}),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return;
  const { pathname } = new URL(req.url);
  if (pathname !== "/t" && !pathname.startsWith("/t/")) return;
  event.respondWith(
    fetch(req).catch(() =>
      caches
        .match(TERMINAL_OFFLINE_URL)
        .then((hit) => hit || new Response("Jste offline.", { status: 503 })),
    ),
  );
});
