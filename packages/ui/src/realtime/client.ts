/** Změna ze serveru (`/api/realtime`): typ záznamu, id, akce a případně nadřazený záznam. */
export type ChangeEvent = { e: string; i: string; a: string; x?: string; y?: string };

/** Minimální rozhraní `EventSource` (kvůli testům s falešným zdrojem). */
export interface EventSourceLike {
  addEventListener(type: string, listener: (e: { data?: string }) => void): void;
  onerror: ((e: unknown) => void) | null;
  close(): void;
}

/** Nastavení klienta realtime (adresa, zneplatnění dotazů, prodlevy, polling). */
export type RealtimeClientOptions = {
  url?: string;
  /** Vytvoří zdroj událostí; výchozí `new EventSource(url)`. */
  connect?: (url: string) => EventSourceLike;
  /** Zneplatní dotazy daných typů záznamů (a všechny příkazové dotazy). */
  invalidate: (entities: ReadonlySet<string>) => void;
  /** Zneplatní všechno (po obnovení spojení, po návratu na záložku, při pollingu). */
  invalidateAll: () => void;
  /** Sloučení bouře změn do jednoho zneplatnění (ms). */
  debounceMs?: number;
  /** Interval záložního pollingu, když SSE neběží (ms). */
  pollMs?: number;
  /** Po kolika po sobě jdoucích chybách bez `ready` se přejde na polling. */
  maxErrors?: number;
};

/**
 * Klient realtime: otevře SSE, změny slučuje (debounce) a zneplatní jen dotčené entity; po obnovení spojení zneplatní
 * všechno (mezitím mohlo něco uniknout); když se spojení nedaří, přejde na polling, dokud SSE znovu nezačne.
 * Vrací funkci pro ukončení.
 */
export function startRealtimeClient(o: RealtimeClientOptions): () => void {
  const url = o.url ?? "/api/realtime";
  const debounceMs = o.debounceMs ?? 120;
  const pollMs = o.pollMs ?? 15_000;
  const maxErrors = o.maxErrors ?? 2;
  let es: EventSourceLike | null = null;
  let stopped = false;
  let errors = 0;
  let connectedOnce = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  const pending = new Set<string>();

  const flush = () => {
    timer = null;
    if (!pending.size) return;
    const batch = new Set(pending);
    pending.clear();
    o.invalidate(batch);
  };
  const push = (c: ChangeEvent) => {
    pending.add(c.e);
    if (c.x) pending.add(c.x);
    if (!timer) timer = setTimeout(flush, debounceMs);
  };
  const stopPoll = () => {
    if (poll) clearInterval(poll);
    poll = null;
  };
  const startPoll = () => {
    if (!poll)
      poll = setInterval(
        () => (typeof document === "undefined" || !document.hidden) && o.invalidateAll(),
        pollMs,
      );
  };

  const open = () => {
    if (stopped) return;
    try {
      es = (o.connect ?? ((u) => new EventSource(u) as unknown as EventSourceLike))(url);
    } catch {
      startPoll();
      return;
    }
    es.addEventListener("ready", () => {
      errors = 0;
      stopPoll();
      // po obnovení spojení se mohlo něco zameškat
      if (connectedOnce) o.invalidateAll();
      connectedOnce = true;
    });
    es.addEventListener("change", (e) => {
      try {
        push(JSON.parse(e.data ?? "{}") as ChangeEvent);
      } catch {
        /* poškozená zpráva */
      }
    });
    es.addEventListener("resync", () => o.invalidateAll());
    es.onerror = () => {
      errors += 1;
      if (errors >= maxErrors) startPoll();
      connectedOnce = true; // další `ready` je už obnovení
    };
  };

  const onVisible = () => {
    if (!document.hidden) o.invalidateAll();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  open();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    stopPoll();
    es?.close();
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", onVisible);
  };
}
