/**
 * Zápisová fronta mobilního terminálu. Každý zápis (příchod, odškrtnutí úkolu, poznámka…) se nejdřív uloží do zařízení
 * (IndexedDB) a teprve pak se odesílá, takže se neztratí při výpadku signálu ani zavření aplikace. Zápis nese vlastní
 * identifikátor (`opId`), který server pamatuje: opakované odeslání téhož zápisu (po výpadku uprostřed požadavku, dvojí
 * ťuknutí, dvě otevřené záložky) nevytvoří duplicitu.
 *
 * Pravidla, která hlídají testy:
 * - zápis z fronty zmizí jen po potvrzení serverem nebo na výslovný pokyn člověka (nikdy tiše);
 * - dočasná chyba (bez signálu, chyba serveru) se opakuje s rostoucími odstupy;
 * - trvalé odmítnutí (konflikt: „Píchačka už běží“, uzamčený zápis, chybějící oprávnění) zápis označí jako konflikt
 *   a čeká na rozhodnutí člověka; pořadí zápisů téže skupiny se nikdy neprohodí, zápisy jiných skupin neblokuje.
 */

export type QueuedOp = {
  opId: string;
  /** Komu zápis patří. Sdílený telefon: zápisy jednoho člověka se nikdy neodešlou pod účtem jiného. */
  userId: string;
  /** Příkaz, např. `dochazka.clock.in`. */
  command: string;
  input: unknown;
  /** Lidsky čitelný popis pro seznam čekajících zápisů („Příchod“, „Úkol: Objednat spojky“). */
  label: string;
  /** Zápisy stejné skupiny se odesílají v pořadí a konflikt jednoho zdrží ostatní (např. `clock`). */
  group: string;
  /** Okamžik pořízení na zařízení (ms od epochy). */
  createdAt: number;
  tries: number;
  state: "pending" | "conflict";
  /** Poslední chyba (u konfliktu důvod, u čekajícího zápisu důvod posledního neúspěšného pokusu). */
  error: string | null;
};

export interface OpStore {
  all(): Promise<QueuedOp[]>;
  put(op: QueuedOp): Promise<void>;
  delete(opId: string): Promise<void>;
}

export function memoryOpStore(): OpStore {
  const ops = new Map<string, QueuedOp>();
  return {
    all: async () => [...ops.values()].sort((a, b) => a.createdAt - b.createdAt),
    put: async (o) => void ops.set(o.opId, o),
    delete: async (id) => void ops.delete(id),
  };
}

/** Úložiště v IndexedDB; když není k dispozici (soukromé okno), spadne na paměť (zápisy pak přežijí jen do zavření). */
export function indexedDbOpStore(name = "terminal-ops"): OpStore {
  const fallback = memoryOpStore();
  let opened: Promise<IDBDatabase | null> | null = null;
  const open = () =>
    (opened ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        if (typeof indexedDB === "undefined") return resolve(null);
        const req = indexedDB.open(name, 1);
        req.onupgradeneeded = () => req.result.createObjectStore("ops", { keyPath: "opId" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));
  const tx = async <T>(
    mode: IDBTransactionMode,
    run: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T | undefined> => {
    const db = await open();
    if (!db) return undefined;
    return new Promise<T | undefined>((resolve) => {
      try {
        const req = run(db.transaction("ops", mode).objectStore("ops"));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  };
  return {
    async all() {
      const rows = await tx("readonly", (s) => s.getAll() as IDBRequest<QueuedOp[]>);
      return (rows ?? (await fallback.all())).sort((a, b) => a.createdAt - b.createdAt);
    },
    async put(o) {
      if ((await tx("readwrite", (s) => s.put(o))) === undefined) await fallback.put(o);
    },
    async delete(id) {
      if ((await tx("readwrite", (s) => s.delete(id))) === undefined) await fallback.delete(id);
    },
  };
}

/** Výsledek jednoho pokusu o odeslání (přes server action). */
export type SendResult =
  | { kind: "ok"; result: unknown; duplicate: boolean }
  /** Server zápis trvale odmítl (konflikt, oprávnění, neplatná data): nemá smysl opakovat. */
  | { kind: "rejected"; message: string }
  /** Dočasná chyba. `network`: bez spojení, ostatní zápisy by dopadly stejně, takže se projde frontu až příště. */
  | { kind: "retry"; message: string; scope: "network" | "op" };

/** Co se stalo se zápisem hned po pořízení. */
export type SubmitOutcome =
  | { status: "sent"; result: unknown; duplicate: boolean }
  | { status: "queued"; message: string | null }
  | { status: "conflict"; message: string };

/** Odstupy mezi pokusy v sekundách; po vyčerpání zůstane poslední. */
export const RETRY_DELAYS_S = [2, 10, 30, 120, 600, 1800];

export type TerminalQueue = ReturnType<typeof createTerminalQueue>;

export function createTerminalQueue(opts: {
  /** Přihlášený uživatel; fronta vidí a odesílá jen jeho zápisy. */
  owner: string;
  store: OpStore;
  send: (op: QueuedOp) => Promise<SendResult>;
  delaysMs?: readonly number[];
  now?: () => number;
  newId?: () => string;
  schedule?: (fn: () => void, ms: number) => unknown;
}) {
  const {
    owner,
    store: rawStore,
    send,
    delaysMs = RETRY_DELAYS_S.map((s) => s * 1000),
    now = Date.now,
    newId = () => crypto.randomUUID(),
    schedule = (fn, ms) => setTimeout(fn, ms),
  } = opts;

  const store: OpStore = {
    all: async () => (await rawStore.all()).filter((o) => o.userId === owner),
    put: (o) => rawStore.put(o),
    delete: (id) => rawStore.delete(id),
  };
  const listeners = new Set<(ops: QueuedOp[]) => void>();
  const sentListeners = new Set<(op: QueuedOp, result: unknown) => void>();
  const nextTry = new Map<string, number>();
  const outcomes = new Map<string, SubmitOutcome>();
  let current: Promise<void> | null = null;
  let again = false;

  async function notify() {
    const ops = await store.all();
    for (const l of listeners) l(ops);
  }

  async function pass(force: boolean) {
    const blocked = new Set<string>();
    for (const op of await store.all()) {
      if (blocked.has(op.group)) continue;
      if (op.state === "conflict") {
        blocked.add(op.group);
        continue;
      }
      if (!force && (nextTry.get(op.opId) ?? 0) > now()) {
        blocked.add(op.group);
        continue;
      }
      let r: SendResult;
      try {
        r = await send(op);
      } catch (err) {
        r = {
          kind: "retry",
          scope: "network",
          message: err instanceof Error ? err.message : "Bez připojení.",
        };
      }
      if (r.kind === "ok") {
        await store.delete(op.opId);
        nextTry.delete(op.opId);
        outcomes.set(op.opId, { status: "sent", result: r.result, duplicate: r.duplicate });
        for (const l of sentListeners) l(op, r.result);
      } else if (r.kind === "rejected") {
        await store.put({ ...op, tries: op.tries + 1, state: "conflict", error: r.message });
        nextTry.delete(op.opId);
        outcomes.set(op.opId, { status: "conflict", message: r.message });
        blocked.add(op.group);
      } else {
        const tries = op.tries + 1;
        const wait = delaysMs[Math.min(tries, delaysMs.length) - 1] ?? 60_000;
        await store.put({ ...op, tries, error: r.message });
        nextTry.set(op.opId, now() + wait);
        outcomes.set(op.opId, { status: "queued", message: r.message });
        schedule(() => void flush(), wait + 5);
        if (r.scope === "network") {
          await notify();
          return;
        }
        blocked.add(op.group);
      }
      await notify();
    }
  }

  /** Projde frontu; když už běží, počká na ni a probere i to, co přibylo mezitím. */
  function flush(force = false): Promise<void> {
    if (current) {
      again = true;
      return current;
    }
    current = (async () => {
      try {
        do {
          again = false;
          await pass(force);
        } while (again);
      } finally {
        current = null;
      }
      await notify();
    })();
    return current;
  }

  return {
    /**
     * Uloží zápis do zařízení a hned ho zkusí odeslat. Vrací, co se stalo: `sent` (potvrzeno serverem), `queued` (čeká
     * na signál, neztratí se) nebo `conflict` (server ho odmítl, čeká na rozhodnutí člověka).
     */
    async submit(p: {
      command: string;
      input: unknown;
      label: string;
      group?: string;
      /** Přidá do vstupu čas pořízení `at` (zápis odložený bez signálu se pak zapíše s původním časem). Výchozí ano. */
      stamp?: boolean;
    }): Promise<SubmitOutcome> {
      const createdAt = now();
      const input =
        p.stamp !== false && p.input && typeof p.input === "object" && !Array.isArray(p.input)
          ? { at: new Date(createdAt).toISOString(), ...(p.input as Record<string, unknown>) }
          : p.input;
      const op: QueuedOp = {
        opId: newId(),
        userId: owner,
        command: p.command,
        input,
        label: p.label,
        group: p.group ?? p.command,
        createdAt,
        tries: 0,
        state: "pending",
        error: null,
      };
      await store.put(op);
      await notify();
      await flush();
      const out = outcomes.get(op.opId);
      outcomes.delete(op.opId);
      if (out) return out;
      // zápis zdržel dřívější zápis téže skupiny (čeká nebo je v konfliktu)
      return { status: "queued", message: null };
    },
    flush,
    list: () => store.all(),
    subscribe(fn: (ops: QueuedOp[]) => void) {
      listeners.add(fn);
      void store.all().then(fn);
      return () => void listeners.delete(fn);
    },
    /** Zavolá se po každém potvrzeném zápisu (UI podle toho obnoví data). */
    onSent(fn: (op: QueuedOp, result: unknown) => void) {
      sentListeners.add(fn);
      return () => void sentListeners.delete(fn);
    },
    /** Člověk chce konfliktní zápis zkusit znovu (např. po opravě situace). */
    async retry(opId?: string) {
      for (const op of await store.all())
        if (op.state === "conflict" && (!opId || op.opId === opId)) {
          await store.put({ ...op, state: "pending", tries: 0, error: null });
          nextTry.delete(op.opId);
        }
      await notify();
      await flush(true);
    },
    /** Člověk zápis zahodil. Jediná cesta, jak zápis bez potvrzení serveru ze zařízení odstranit. */
    async discard(opId: string) {
      await store.delete(opId);
      nextTry.delete(opId);
      outcomes.delete(opId);
      await notify();
      await flush();
    },
  };
}
