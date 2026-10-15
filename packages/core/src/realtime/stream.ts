import type { Ctx } from "../rbac/types";
import { realtimeFor } from "./filter";
import type { RealtimeHub } from "./hub";

const enc = new TextEncoder();
const frame = (event: string, data: unknown) =>
  enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/** Nastavení proudu SSE pro jednoho prohlížeče (rozbočovač, aktér, odpojení, tlukot srdce). */
export type RealtimeStreamOptions = {
  hub: RealtimeHub;
  ctx: Ctx;
  /** Oprávnění ke čtení entity podle klíče (`null` = typ není entita, nebo se nehlídá). */
  readPermission: (entityType: string) => string | null;
  signal?: AbortSignal | undefined;
  /** Jak často se posílá komentář `: ping`, aby spojení nezavřel proxy server (výchozí 20 s). */
  heartbeatMs?: number;
  /** Po této době se spojení zavře a klient se připojí znovu (nové ověření session; výchozí 30 min). */
  maxAgeMs?: number;
};

/**
 * Proud SSE pro jednoho prohlížeče: `ready` po připojení, `change` pro každou povolenou změnu, `resync` po obnovení
 * spojení s databází, komentář `: ping` jako tlukot srdce. Zavře se při odpojení klienta (`signal`) nebo po `maxAgeMs`.
 */
export function createRealtimeStream(o: RealtimeStreamOptions): ReadableStream<Uint8Array> {
  let cleanup = () => {};
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          /* už zavřeno */
        }
      };
      const send = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          close();
        }
      };
      const unsub = o.hub.subscribe((m) => {
        if (m.kind === "resync") return send(frame("resync", {}));
        const e = realtimeFor(o.ctx, m.change, o.readPermission);
        if (e) send(frame("change", e));
      });
      const beat = setInterval(() => send(enc.encode(": ping\n\n")), o.heartbeatMs ?? 20_000);
      const age = setTimeout(close, o.maxAgeMs ?? 30 * 60_000);
      cleanup = () => {
        unsub();
        clearInterval(beat);
        clearTimeout(age);
      };
      o.signal?.addEventListener("abort", close, { once: true });
      if (o.signal?.aborted) return close();
      send(enc.encode("retry: 2000\n\n"));
      // `ready` až po aktivním LISTEN: změna z doby před připojením by se jinak ztratila
      await o.hub.whenReady();
      send(frame("ready", {}));
    },
    cancel() {
      cleanup();
    },
  });
}
