/*
  Logika automatického ukládání poznámky (UKO-11: „autosave při psaní, 800 ms“). Čistý soubor bez Reactu, prohlížeče
  a serveru: časovače se dají podstrčit, takže se chování testuje bez čekání. Editor ho používá přes `use-note-autosave`.

  Pravidla, která chrání text:
  - zápis počká 800 ms od poslední změny (debounce), ale nejdéle `maxWaitMs`, i když uživatel píše bez přestávky;
  - nikdy neběží dva zápisy zároveň (pořadí zápisů se nepřehodí); změny během zápisu se uloží hned po něm;
  - každý zápis nese verzi, ze které uživatel vycházel (`baseVersion`); server při neshodě vrátí konflikt a text se
    nepřepíše, dokud uživatel nerozhodne (`overwrite` = poslední zápis vyhrává, `accept` = vzít cizí verzi);
  - selhání (síť, server) nic nezahodí: text zůstává čekající a zápis se opakuje s prodlevou;
  - `flush` uloží čekající text hned (opuštění stránky, zavření okna, přepnutí záložky).
*/

/** Stav ukládání pro indikaci v editoru. */
export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

/** Výsledek zápisu na serveru: uloženo (nová verze), nebo konflikt (aktuální stav na serveru). */
export type SaveOutcome<R> =
  | { status: "saved"; version: number; value: R }
  | { status: "conflict"; version: number; value: R };

/** Stav pro vykreslení. */
export type AutosaveState<R> = {
  status: AutosaveStatus;
  /** Verze textu na serveru, na kterou navazuje další zápis. */
  baseVersion: number;
  /** Čas posledního úspěšného zápisu (ms), nebo `null`. */
  lastSavedAt: number | null;
  /** Poslední chyba zápisu (věta pro uživatele), nebo `null`. */
  error: string | null;
  /** Aktuální stav na serveru při konfliktu. */
  conflict: R | null;
  /** Počet neúspěšných pokusů v řadě (0 = bez chyby). */
  failures: number;
};

/** Plánovač časovačů (v testech umělý). */
export type Timers = {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
};

/** Nastavení automatického ukládání. */
export type AutosaveOptions<P, R> = {
  /** Verze textu na serveru při otevření. */
  baseVersion: number;
  /** Zapíše text; `force` = poslední zápis vyhrává (po rozhodnutí o konfliktu). Chyba (výjimka) = zápis se zopakuje. */
  save(payload: P, args: { baseVersion: number; force: boolean }): Promise<SaveOutcome<R>>;
  /** Zavolá se při každé změně stavu. */
  onState?(state: AutosaveState<R>): void;
  /** Prodleva po poslední změně; výchozí 800 ms. */
  delayMs?: number;
  /** Nejdelší doba, po kterou smí text čekat při nepřetržitém psaní; výchozí 10 s. */
  maxWaitMs?: number;
  /** Prodlevy opakování po chybě (poslední platí dál); výchozí 2, 5, 15, 30 s. */
  retryDelaysMs?: readonly number[];
  timers?: Timers;
  now?(): number;
};

const DEFAULT_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Výchozí prodleva automatického ukládání (UKO-11). */
export const AUTOSAVE_DELAY_MS = 800;

/**
 * Řadič automatického ukládání jedné poznámky. Zápis dostane `payload` (např. název a dokument); řadič sám hlídá
 * časování, pořadí, verzi a opakování. Nezná tvar dat ani transport.
 */
export class Autosaver<P, R = unknown> {
  private opts: Required<Pick<AutosaveOptions<P, R>, "delayMs" | "maxWaitMs" | "retryDelaysMs">> &
    AutosaveOptions<P, R>;
  private timers: Timers;
  private pending: { payload: P } | null = null;
  private inflight: Promise<void> | null = null;
  private timer: unknown = null;
  private firstDirtyAt: number | null = null;
  private force = false;
  private conflictVersion = 0;
  private disposed = false;
  private s: AutosaveState<R>;

  /** Vytvoří řadič; nic se neukládá, dokud se nezavolá `change`. */
  constructor(options: AutosaveOptions<P, R>) {
    this.opts = {
      ...options,
      delayMs: options.delayMs ?? AUTOSAVE_DELAY_MS,
      maxWaitMs: options.maxWaitMs ?? 10_000,
      retryDelaysMs: options.retryDelaysMs ?? [2000, 5000, 15_000, 30_000],
    };
    this.timers = options.timers ?? DEFAULT_TIMERS;
    this.s = {
      status: "idle",
      baseVersion: options.baseVersion,
      lastSavedAt: null,
      error: null,
      conflict: null,
      failures: 0,
    };
  }

  /** Aktuální stav. */
  get state(): AutosaveState<R> {
    return this.s;
  }

  /** Čeká nějaký text na uložení (nebo se právě ukládá)? */
  get hasUnsaved(): boolean {
    return this.pending !== null || this.inflight !== null;
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private set(patch: Partial<AutosaveState<R>>) {
    this.s = { ...this.s, ...patch };
    this.opts.onState?.(this.s);
  }

  private clearTimer() {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }

  private schedule(delay: number) {
    this.clearTimer();
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }

  /** Zaznamená novou verzi textu; uloží se po `delayMs` klidu (při konfliktu se jen drží, dokud uživatel nerozhodne). */
  change(payload: P): void {
    if (this.disposed) return;
    this.pending = { payload };
    this.firstDirtyAt ??= this.now();
    if (this.s.status === "conflict") return;
    if (this.s.status !== "saving") this.set({ status: "dirty" });
    if (this.inflight) return; // po dokončení zápisu se naplánuje další
    const waited = this.now() - this.firstDirtyAt;
    this.schedule(Math.max(0, Math.min(this.opts.delayMs, this.opts.maxWaitMs - waited)));
  }

  private async run(): Promise<void> {
    if (this.inflight) return this.inflight;
    if (!this.pending || this.s.status === "conflict") return;
    const job = this.pending;
    this.pending = null;
    this.firstDirtyAt = null;
    this.clearTimer();
    const force = this.force;
    this.set({ status: "saving" });
    const done = (async () => {
      try {
        const out = await this.opts.save(job.payload, { baseVersion: this.s.baseVersion, force });
        if (out.status === "saved") {
          this.force = false;
          this.set({
            baseVersion: out.version,
            lastSavedAt: this.now(),
            error: null,
            conflict: null,
            failures: 0,
            status: this.pending ? "dirty" : "saved",
          });
        } else {
          // text uživatele zůstává čekající (nic se nezahazuje), dokud nerozhodne
          this.pending ??= job;
          this.conflictVersion = out.version;
          this.set({ status: "conflict", conflict: out.value, error: null });
        }
      } catch (e) {
        this.pending ??= job;
        const failures = this.s.failures + 1;
        this.set({
          status: "error",
          failures,
          error: e instanceof Error ? e.message : "Poznámku se nepodařilo uložit.",
        });
        const delays = this.opts.retryDelaysMs;
        this.schedule(delays[Math.min(failures - 1, delays.length - 1)] ?? 30_000);
      }
    })();
    this.inflight = done;
    try {
      await done;
    } finally {
      this.inflight = null;
    }
    // změny během zápisu: uložit hned po něm (jen když nejde o chybu nebo konflikt)
    if (
      !this.disposed &&
      this.pending &&
      (this.s.status === "dirty" || this.s.status === "saving")
    ) {
      this.schedule(Math.min(this.opts.delayMs, 50));
    }
  }

  /** Uloží čekající text hned (opuštění stránky, zavření okna). Vrátí se po dokončení; chybu ani konflikt nevyhazuje, najdeš je ve stavu. */
  async flush(): Promise<void> {
    if (this.disposed) return;
    this.clearTimer();
    let retried = false;
    for (let i = 0; i < 20; i++) {
      if (this.inflight) await this.inflight;
      if (!this.pending || this.s.status === "conflict") return;
      if (this.s.status === "error") {
        if (retried) return;
        retried = true; // po chybě se při `flush` zkusí zápis ještě jednou
      }
      await this.run();
    }
  }

  /** Konflikt vyřešen „poslední zápis vyhrává“: čekající text se zapíše přes cizí verzi (na její verzi naváže). */
  async overwrite(): Promise<void> {
    if (this.s.status !== "conflict" || this.disposed) return;
    this.force = true;
    this.set({ status: "dirty", conflict: null, baseVersion: this.conflictVersion });
    await this.flush();
  }

  /** Konflikt vyřešen přijetím cizí verze: čekající text se zahodí a další zápis naváže na `version` ze serveru. */
  accept(version: number): void {
    this.clearTimer();
    this.pending = null;
    this.firstDirtyAt = null;
    this.force = false;
    this.set({ status: "saved", baseVersion: version, conflict: null, error: null, failures: 0 });
  }

  /** Zopakuje zápis po chybě hned (tlačítko „Zkusit znovu“). */
  async retry(): Promise<void> {
    if (this.s.status !== "error") return;
    this.set({ status: "dirty" });
    await this.flush();
  }

  /** Ukončí řadič (odchod ze stránky); časovač se zruší, už se nic neuloží. Volej po `flush`. */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }
}
