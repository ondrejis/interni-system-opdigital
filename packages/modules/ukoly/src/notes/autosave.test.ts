import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_DELAY_MS, Autosaver, type SaveOutcome } from "./autosave";

type Saved = { text: string; baseVersion: number; force: boolean };

/** Umělý server: drží verzi, zápisy trvají `latency` ms; `fail` způsobí výjimku, `conflictAt` vrátí konflikt. */
function makeServer(opts: { latency?: number } = {}) {
  const server = {
    version: 1,
    text: "",
    saves: [] as Saved[],
    failNext: 0,
    inflight: 0,
    maxInflight: 0,
  };
  const save = async (
    text: string,
    args: { baseVersion: number; force: boolean },
  ): Promise<SaveOutcome<{ version: number; text: string }>> => {
    server.inflight++;
    server.maxInflight = Math.max(server.maxInflight, server.inflight);
    await new Promise((r) => setTimeout(r, opts.latency ?? 0));
    server.inflight--;
    if (server.failNext > 0) {
      server.failNext--;
      throw new Error("Síť nedostupná");
    }
    server.saves.push({ text, ...args });
    if (!args.force && args.baseVersion !== server.version)
      return {
        status: "conflict",
        version: server.version,
        value: { version: server.version, text: server.text },
      };
    server.version++;
    server.text = text;
    return { status: "saved", version: server.version, value: { version: server.version, text } };
  };
  return { server, save };
}

describe("Autosaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = (save: ReturnType<typeof makeServer>["save"], extra = {}) =>
    new Autosaver<string, { version: number; text: string }>({ baseVersion: 1, save, ...extra });

  it("uloží až po 800 ms klidu a opakované změny sloučí do jednoho zápisu", async () => {
    const { server, save } = makeServer();
    const a = make(save);
    a.change("a");
    expect(a.state.status).toBe("dirty");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(server.saves).toHaveLength(0);
    a.change("ab"); // nová změna posune časovač
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(server.saves).toHaveLength(0);
    a.change("abc");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(server.saves).toEqual([{ text: "abc", baseVersion: 1, force: false }]);
    expect(a.state.status).toBe("saved");
    expect(a.state.baseVersion).toBe(2);
    expect(a.state.lastSavedAt).not.toBeNull();
  });

  it("při nepřetržitém psaní uloží nejpozději po maxWaitMs", async () => {
    const { server, save } = makeServer();
    const a = make(save, { maxWaitMs: 3000 });
    for (let t = 0; t < 3000; t += 500) {
      a.change(`t${t}`);
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(server.saves.length).toBeGreaterThanOrEqual(1);
    expect(server.saves[0]!.baseVersion).toBe(1);
  });

  it("nikdy neběží dva zápisy zároveň a změny během zápisu se uloží hned po něm se správnou verzí", async () => {
    const { server, save } = makeServer({ latency: 1000 });
    const a = make(save);
    a.change("první");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10); // zápis běží
    expect(a.state.status).toBe("saving");
    a.change("druhý");
    a.change("třetí");
    await vi.advanceTimersByTimeAsync(5000);
    expect(server.maxInflight).toBe(1);
    expect(server.saves.map((s) => [s.text, s.baseVersion])).toEqual([
      ["první", 1],
      ["třetí", 2],
    ]);
    expect(server.text).toBe("třetí");
    expect(a.state.status).toBe("saved");
    expect(a.state.baseVersion).toBe(3);
  });

  it("flush uloží čekající text okamžitě", async () => {
    const { server, save } = makeServer();
    const a = make(save);
    a.change("rychle");
    await a.flush();
    expect(server.saves).toHaveLength(1);
    expect(a.hasUnsaved).toBe(false);
    // bez změn nic neukládá
    await a.flush();
    expect(server.saves).toHaveLength(1);
  });

  it("chyba zápisu text nezahodí: opakuje s prodlevou a po úspěchu se zotaví", async () => {
    const { server, save } = makeServer();
    server.failNext = 2;
    const a = make(save, { retryDelaysMs: [1000, 2000] });
    a.change("důležité");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 5);
    expect(a.state.status).toBe("error");
    expect(a.state.error).toBe("Síť nedostupná");
    expect(a.hasUnsaved).toBe(true);
    await vi.advanceTimersByTimeAsync(1000 + 5);
    expect(a.state.status).toBe("error");
    expect(a.state.failures).toBe(2);
    await vi.advanceTimersByTimeAsync(2000 + 5);
    expect(a.state.status).toBe("saved");
    expect(a.state.error).toBeNull();
    expect(a.state.failures).toBe(0);
    expect(server.text).toBe("důležité");
  });

  it("flush po chybě zkusí zápis ještě jednou", async () => {
    const { server, save } = makeServer();
    server.failNext = 1;
    const a = make(save);
    a.change("text");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 5);
    expect(a.state.status).toBe("error");
    await a.flush();
    expect(server.text).toBe("text");
    expect(a.state.status).toBe("saved");
  });

  describe("konflikt (zápis ze zastaralého okna)", () => {
    it("zápis se nepřepíše mlčky: stav je konflikt a text zůstává čekající", async () => {
      const { server, save } = makeServer();
      server.version = 5;
      server.text = "cizí text";
      const a = make(save); // vychází z verze 1
      a.change("můj text");
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 5);
      expect(a.state.status).toBe("conflict");
      expect(a.state.conflict).toEqual({ version: 5, text: "cizí text" });
      expect(server.text).toBe("cizí text");
      expect(a.hasUnsaved).toBe(true);
      // další psaní při konfliktu nic neodešle
      a.change("můj text 2");
      await vi.advanceTimersByTimeAsync(5000);
      expect(server.saves).toHaveLength(1);
      expect(a.state.status).toBe("conflict");
    });

    it("poslední zápis vyhrává po rozhodnutí „přepsat“ a uloží nejnovější text", async () => {
      const { server, save } = makeServer();
      server.version = 5;
      server.text = "cizí text";
      const a = make(save);
      a.change("můj text");
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 5);
      a.change("můj text 2");
      await a.overwrite();
      expect(server.text).toBe("můj text 2");
      expect(server.saves.at(-1)).toEqual({ text: "můj text 2", baseVersion: 5, force: true });
      expect(a.state.status).toBe("saved");
      expect(a.state.baseVersion).toBe(6);
      // další zápis už nejde přes force
      a.change("dál");
      await a.flush();
      expect(server.saves.at(-1)).toEqual({ text: "dál", baseVersion: 6, force: false });
    });

    it("přijetí cizí verze zahodí čekající text a naváže na cizí verzi", async () => {
      const { server, save } = makeServer();
      server.version = 5;
      server.text = "cizí text";
      const a = make(save);
      a.change("můj text");
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 5);
      a.accept(5);
      expect(a.hasUnsaved).toBe(false);
      expect(a.state.status).toBe("saved");
      a.change("navazuji");
      await a.flush();
      expect(server.saves.at(-1)).toEqual({ text: "navazuji", baseVersion: 5, force: false });
      expect(server.text).toBe("navazuji");
    });
  });

  it("po dispose se nic neukládá", async () => {
    const { server, save } = makeServer();
    const a = make(save);
    a.change("x");
    a.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(server.saves).toHaveLength(0);
  });

  it("onState dostane každou změnu stavu", async () => {
    const { save } = makeServer();
    const seen: string[] = [];
    const a = new Autosaver<string, { version: number; text: string }>({
      baseVersion: 1,
      save,
      onState: (s) => seen.push(s.status),
    });
    a.change("x");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 5);
    expect(seen).toEqual(["dirty", "saving", "saved"]);
  });
});
