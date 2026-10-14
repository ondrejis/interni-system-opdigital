/**
 * Fronta nahrávání fotek z terénu. Fotka se uloží do zařízení (IndexedDB) dřív, než se zkusí odeslat, takže se neztratí
 * při výpadku signálu ani zavření aplikace; odešle se, jakmile to jde. Dočasné chyby (bez signálu, přetížený server)
 * se opakují s rostoucím odstupem, trvalé (nepovolený soubor, chybějící oprávnění) se označí a čekají na rozhodnutí člověka.
 */

export type UploadTask = {
  id: string;
  entity: string;
  recordId: string;
  kind: string;
  name: string;
  blob: Blob;
  /** ISO čas pořízení. */
  takenAt: string;
  /** Popisek pro seznam („Zakázka …“). */
  label: string;
  tries: number;
  failed: boolean;
  error: string | null;
  createdAt: number;
};

export type NewUploadTask = Omit<UploadTask, "id" | "tries" | "failed" | "error" | "createdAt">;

export interface TaskStore {
  all(): Promise<UploadTask[]>;
  put(task: UploadTask): Promise<void>;
  delete(id: string): Promise<void>;
}

export function memoryStore(): TaskStore {
  const tasks = new Map<string, UploadTask>();
  return {
    all: async () => [...tasks.values()].sort((a, b) => a.createdAt - b.createdAt),
    put: async (t) => void tasks.set(t.id, t),
    delete: async (id) => void tasks.delete(id),
  };
}

/** Úložiště v IndexedDB; když není k dispozici (soukromé okno, starý prohlížeč), spadne na paměť. */
export function indexedDbStore(name = "photo-uploads"): TaskStore {
  const fallback = memoryStore();
  let opened: Promise<IDBDatabase | null> | null = null;
  const open = () =>
    (opened ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        if (typeof indexedDB === "undefined") return resolve(null);
        const req = indexedDB.open(name, 1);
        req.onupgradeneeded = () => req.result.createObjectStore("tasks", { keyPath: "id" });
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
        const req = run(db.transaction("tasks", mode).objectStore("tasks"));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  };
  return {
    async all() {
      const rows = await tx("readonly", (s) => s.getAll() as IDBRequest<UploadTask[]>);
      return (rows ?? (await fallback.all())).sort((a, b) => a.createdAt - b.createdAt);
    },
    async put(t) {
      if ((await tx("readwrite", (s) => s.put(t))) === undefined) await fallback.put(t);
    },
    async delete(id) {
      if ((await tx("readwrite", (s) => s.delete(id))) === undefined) await fallback.delete(id);
    },
  };
}

/** Dočasná chyba: stojí za to to zkusit znovu (bez signálu, 5xx, 429). */
export class TransientUploadError extends Error {}

/** Odstupy mezi pokusy v sekundách; po vyčerpání se úkol označí jako neodeslaný. */
export const RETRY_DELAYS_S = [2, 10, 30, 120, 600, 1800];

export type UploadQueue = ReturnType<typeof createUploadQueue>;

export function createUploadQueue(opts: {
  store: TaskStore;
  upload: (task: UploadTask) => Promise<void>;
  /** Odstupy pokusů v ms; pro testy lze zkrátit. */
  delaysMs?: readonly number[];
  now?: () => number;
  newId?: () => string;
  /** Časovač; v testech nahrazený. */
  schedule?: (fn: () => void, ms: number) => unknown;
}) {
  const {
    store,
    upload,
    delaysMs = RETRY_DELAYS_S.map((s) => s * 1000),
    now = Date.now,
    newId = () => crypto.randomUUID(),
    schedule = (fn, ms) => setTimeout(fn, ms),
  } = opts;
  const listeners = new Set<(tasks: UploadTask[]) => void>();
  let current: Promise<void> | null = null;
  let again = false;
  const nextTry = new Map<string, number>();

  async function notify() {
    const tasks = await store.all();
    for (const l of listeners) l(tasks);
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
          for (const task of await store.all()) {
            if (task.failed) continue;
            if (!force && (nextTry.get(task.id) ?? 0) > now()) continue;
            try {
              await upload(task);
              await store.delete(task.id);
              nextTry.delete(task.id);
            } catch (err) {
              const transient = err instanceof TransientUploadError;
              const tries = task.tries + 1;
              const exhausted = tries > delaysMs.length;
              await store.put({
                ...task,
                tries,
                failed: !transient || exhausted,
                error: err instanceof Error ? err.message : "Nahrání se nepodařilo.",
              });
              if (transient && !exhausted) {
                const wait = delaysMs[tries - 1]!;
                nextTry.set(task.id, now() + wait);
                schedule(() => void flush(), wait + 5);
              }
            }
            await notify();
          }
        } while (again);
      } finally {
        current = null;
      }
      await notify();
    })();
    return current;
  }

  return {
    async add(task: NewUploadTask): Promise<string> {
      const id = newId();
      await store.put({ ...task, id, tries: 0, failed: false, error: null, createdAt: now() });
      await notify();
      void flush();
      return id;
    },
    list: () => store.all(),
    flush,
    /** Zkusí znovu neodeslané (po zapnutí signálu nebo na pokyn člověka). */
    async retry(id?: string) {
      for (const t of await store.all())
        if (t.failed && (!id || t.id === id)) {
          await store.put({ ...t, failed: false, tries: 0, error: null });
          nextTry.delete(t.id);
        }
      await notify();
      await flush(true);
    },
    async discard(id: string) {
      await store.delete(id);
      nextTry.delete(id);
      await notify();
    },
    subscribe(fn: (tasks: UploadTask[]) => void) {
      listeners.add(fn);
      void store.all().then(fn);
      return () => void listeners.delete(fn);
    },
  };
}
