import type postgres from "postgres";
import { REALTIME_CHANNEL, type RealtimeChange } from "./notify";

/** Odběr zpráv z kanálu: změna záznamu, nebo `resync` (spojení s DB se přerušilo, mohlo se něco zameškat). */
export type HubMessage = { kind: "change"; change: RealtimeChange } | { kind: "resync" };
type Listener = (m: HubMessage) => void;

/**
 * Jedno `LISTEN` spojení na proces (ne na prohlížeč): všechna otevřená SSE spojení sdílejí tento rozbočovač. Při
 * výpadku spojení s databází postgres.js spojení obnoví a znovu zavolá `LISTEN`; rozbočovač pak rozešle `resync`,
 * aby klienti zneplatnili všechno (mezitím mohly zaniknout zprávy).
 */
export class RealtimeHub {
  private readonly listeners = new Set<Listener>();
  private listening = false;
  private starts = 0;
  private stopped = false;
  private unlisten: (() => Promise<void>) | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly sql: postgres.Sql) {}

  /** Přihlásí odběr; první odběratel spustí `LISTEN`, poslední ho ukončí. Vrací funkci pro odhlášení. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.ensure();
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Počet odběratelů (diagnostika, testy). */
  get size(): number {
    return this.listeners.size;
  }

  /** Zda je `LISTEN` aktivní. */
  get ready(): boolean {
    return this.listening;
  }

  /** Počkat, až je `LISTEN` aktivní (testy a první zpráva SSE). */
  async whenReady(timeoutMs = 5000): Promise<boolean> {
    const until = Date.now() + timeoutMs;
    await this.ensure();
    while (!this.listening && Date.now() < until) await new Promise((r) => setTimeout(r, 25));
    return this.listening;
  }

  /** Ukončí `LISTEN` (konec procesu, testy). */
  async close(): Promise<void> {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.listeners.clear();
    const un = this.unlisten;
    this.unlisten = null;
    this.listening = false;
    await un?.().catch(() => {});
  }

  private emit(m: HubMessage) {
    for (const l of [...this.listeners]) {
      try {
        l(m);
      } catch {
        /* chyba jednoho odběratele neruší ostatní */
      }
    }
  }

  private ensurePromise: Promise<void> | null = null;
  private ensure(): Promise<void> {
    if (this.listening || this.stopped) return Promise.resolve();
    this.ensurePromise ??= this.start().finally(() => {
      this.ensurePromise = null;
    });
    return this.ensurePromise;
  }

  private async start(): Promise<void> {
    try {
      const req = await this.sql.listen(
        REALTIME_CHANNEL,
        (payload) => {
          try {
            const change = JSON.parse(payload) as RealtimeChange;
            if (typeof change?.e === "string" && typeof change.i === "string")
              this.emit({ kind: "change", change });
          } catch {
            /* neznámý formát se přeskočí */
          }
        },
        () => {
          // volá se při prvním i při každém obnovení spojení
          this.listening = true;
          this.starts += 1;
          if (this.starts > 1) this.emit({ kind: "resync" });
        },
      );
      this.unlisten = () => req.unlisten();
    } catch {
      this.listening = false;
      if (!this.stopped && this.listeners.size && !this.retry) {
        this.retry = setTimeout(() => {
          this.retry = null;
          void this.ensure();
        }, 3000);
        this.retry.unref?.();
      }
    }
  }
}

const g = globalThis as { __realtimeHub?: RealtimeHub; __realtimeHubSql?: unknown };

/** Rozbočovač procesu (jeden na `sql` spojení). Je na `globalThis`, protože Next.js bundluje route handlery zvlášť. */
export function getRealtimeHub(sql: postgres.Sql): RealtimeHub {
  if (!g.__realtimeHub || g.__realtimeHubSql !== sql) {
    void g.__realtimeHub?.close();
    g.__realtimeHub = new RealtimeHub(sql);
    g.__realtimeHubSql = sql;
  }
  return g.__realtimeHub;
}
