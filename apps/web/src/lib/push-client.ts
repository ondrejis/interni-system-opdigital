"use client";

/*
  Klientská část push upozornění: stav zařízení, zapnutí/vypnutí odběru a zavírání upozornění v zařízení,
  když je člověk přečte v aplikaci. Service worker (`public/sw.js`) zprávy zobrazuje a obsluhuje klepnutí.
*/

export type PushSupport =
  | { state: "unsupported"; reason: "no-api" | "ios-needs-install" }
  | { state: "ready"; permission: NotificationPermission };

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Aplikace běží jako nainstalovaná (z plochy), ne jako karta prohlížeče. */
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Umí tento prohlížeč push? Na iPhonu a iPadu až po „Přidat na plochu“ (iOS 16.4 a novější). */
export function pushSupport(): PushSupport {
  const api = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!api)
    return {
      state: "unsupported",
      reason: isIos() && !isStandalone() ? "ios-needs-install" : "no-api",
    };
  return { state: "ready", permission: Notification.permission };
}

/** Veřejný klíč VAPID z base64url do tvaru, který chce prohlížeč. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

const post = (url: string, body?: unknown, method = "POST") =>
  fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/** Zapne upozornění v tomto zařízení: oprávnění, odběr u push služby, uložení na serveru. */
export async function enablePush(publicKey: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Upozornění jsou v prohlížeči zablokovaná. Povolte je v nastavení webu.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  const res = await post("/api/push/subscription", sub.toJSON());
  if (!res.ok)
    throw new Error(
      ((await res.json().catch(() => null)) as { error?: string } | null)?.error ??
        "Zapnutí se nepovedlo.",
    );
}

/** Vypne upozornění v tomto zařízení (odběr zruší na serveru i v prohlížeči). */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await post("/api/push/subscription", { endpoint: sub.endpoint }, "DELETE");
  await sub.unsubscribe();
}

/** Značka upozornění v zařízení (shodná s `tag` push zprávy): sloučená upozornění sdílejí jednu. */
export const pushTag = (n: { id: string; tag?: string | null }) => n.tag ?? `n:${n.id}`;

/**
 * Zavře upozornění v zařízení (po přečtení v zvonečku/Inboxu). Bez `tags` zavře všechna.
 * Selhání nikdy nevadí – upozornění zmizí samo po ťuknutí.
 */
export async function closePushNotifications(tags?: readonly string[]): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return;
    const shown = await reg.getNotifications();
    for (const n of shown) if (!tags || tags.includes(n.tag)) n.close();
    if (!tags) await syncAppBadge(0);
  } catch {
    /* jen pomůcka */
  }
}

/** Odznak počtu nepřečtených na ikoně nainstalované aplikace (kde to systém umí). */
export async function syncAppBadge(unread: number): Promise<void> {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (unread > 0) await nav.setAppBadge?.(unread);
    else await nav.clearAppBadge?.();
  } catch {
    /* jen pomůcka */
  }
}
