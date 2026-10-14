import { describe, expect, it } from "vitest";
import { createTerminalQueue, memoryOpStore, type QueuedOp, type SendResult } from "./queue";

/** Atrapa serveru s ochranou proti duplicitě podle opId (jako `runTerminalOp`). */
function fakeServer(rules: (op: QueuedOp) => SendResult | null = () => null) {
  const done = new Map<string, unknown>();
  const executed: string[] = [];
  const calls: QueuedOp[] = [];
  return {
    executed,
    calls,
    done,
    send: async (op: QueuedOp): Promise<SendResult> => {
      calls.push(op);
      const forced = rules(op);
      if (forced) return forced;
      if (done.has(op.opId)) return { kind: "ok", result: done.get(op.opId), duplicate: true };
      executed.push(op.label);
      done.set(op.opId, { ok: op.label });
      return { kind: "ok", result: { ok: op.label }, duplicate: false };
    },
  };
}

function setup(rules?: Parameters<typeof fakeServer>[0]) {
  let t = 1_000;
  let n = 0;
  const server = fakeServer(rules);
  const timers: { fn: () => void; ms: number }[] = [];
  const store = memoryOpStore();
  const queue = createTerminalQueue({
    owner: "u1",
    store,
    send: server.send,
    now: () => t,
    newId: () => `op-${++n}`,
    schedule: (fn, ms) => timers.push({ fn, ms }),
  });
  return {
    queue,
    server,
    store,
    timers,
    advance: (ms: number) => void (t += ms),
  };
}

describe("zápisová fronta terminálu", () => {
  it("zápis se nejdřív uloží a po potvrzení serverem zmizí", async () => {
    const { queue, store } = setup();
    const out = await queue.submit({ command: "a.b", input: { x: 1 }, label: "Příchod" });
    expect(out).toMatchObject({ status: "sent", duplicate: false });
    expect(await store.all()).toEqual([]);
  });

  it("do vstupu přidá čas pořízení, ale nepřepíše ten, který je zadaný", async () => {
    const { queue, server } = setup();
    await queue.submit({ command: "a.b", input: { x: 1 }, label: "A" });
    await queue.submit({ command: "a.b", input: { at: "2026-01-01T00:00:00Z" }, label: "B" });
    await queue.submit({ command: "a.b", input: { x: 1 }, label: "C", stamp: false });
    expect(server.calls[0]!.input).toEqual({ at: new Date(1_000).toISOString(), x: 1 });
    expect(server.calls[1]!.input).toEqual({ at: "2026-01-01T00:00:00Z" });
    expect(server.calls[2]!.input).toEqual({ x: 1 });
  });

  it("bez signálu zápis zůstane ve frontě a odešle se po obnovení, právě jednou", async () => {
    let online = false;
    const { queue, server, store, advance } = setup(() =>
      online ? null : { kind: "retry", message: "Bez připojení.", scope: "network" },
    );
    const out = await queue.submit({ command: "a.b", input: {}, label: "Příchod" });
    expect(out).toEqual({ status: "queued", message: "Bez připojení." });
    expect(await store.all()).toHaveLength(1);
    expect(server.executed).toEqual([]);
    online = true;
    advance(60_000);
    await queue.flush();
    expect(server.executed).toEqual(["Příchod"]);
    expect(await store.all()).toEqual([]);
  });

  it("opakované odeslání téhož zápisu (výpadek po zpracování serverem) nevytvoří duplicitu", async () => {
    let lostResponse = true;
    const { server } = setup();
    // server zápis zpracuje, ale odpověď se ztratí
    const real = server.send;
    const wrapped = async (op: QueuedOp): Promise<SendResult> => {
      const r = await real(op);
      if (lostResponse) {
        lostResponse = false;
        return { kind: "retry", message: "Spojení přerušeno.", scope: "network" };
      }
      return r;
    };
    const q = createTerminalQueue({
      owner: "u1",
      store: memoryOpStore(),
      send: wrapped,
      now: () => 1_000,
      newId: () => "op-x",
      schedule: () => undefined,
    });
    const first = await q.submit({ command: "a.b", input: {}, label: "Odškrtnout" });
    expect(first.status).toBe("queued");
    await q.flush(true);
    expect(server.executed).toEqual(["Odškrtnout"]);
    expect(server.calls.map((c) => c.opId)).toEqual(["op-x", "op-x"]);
  });

  it("dvě stejná podání v řadě jsou dva různé zápisy, ale stejné opId se vykoná jednou", async () => {
    const { queue, server } = setup();
    await queue.submit({ command: "a.b", input: {}, label: "A" });
    await queue.submit({ command: "a.b", input: {}, label: "A" });
    expect(server.executed).toEqual(["A", "A"]);
    expect(new Set(server.calls.map((c) => c.opId)).size).toBe(2);
  });

  it("trvalé odmítnutí je konflikt s českou hláškou; zápis zůstane, dokud ho člověk nevyřeší", async () => {
    const { queue, store } = setup((op) =>
      op.label === "Příchod" ? { kind: "rejected", message: "Píchačka už běží." } : null,
    );
    const out = await queue.submit({ command: "dochazka.clock.in", input: {}, label: "Příchod" });
    expect(out).toEqual({ status: "conflict", message: "Píchačka už běží." });
    const [op] = await store.all();
    expect(op).toMatchObject({ state: "conflict", error: "Píchačka už běží." });
    // konflikt se sám neodešle znovu ani nezmizí
    await queue.flush(true);
    expect(await store.all()).toHaveLength(1);
  });

  it("konflikt zdrží další zápisy téže skupiny, zápisy jiné skupiny ne", async () => {
    const { queue, server } = setup((op) =>
      op.label === "Příchod" ? { kind: "rejected", message: "Konflikt." } : null,
    );
    await queue.submit({ command: "c.in", input: {}, label: "Příchod", group: "clock" });
    const odchod = await queue.submit({
      command: "c.out",
      input: {},
      label: "Odchod",
      group: "clock",
    });
    const task = await queue.submit({
      command: "t.done",
      input: {},
      label: "Úkol",
      group: "task:1",
    });
    expect(odchod.status).toBe("queued");
    expect(task.status).toBe("sent");
    expect(server.executed).toEqual(["Úkol"]);
  });

  it("zápisy téže skupiny se odesílají v pořadí pořízení", async () => {
    let online = false;
    const { queue, server, advance } = setup(() =>
      online ? null : { kind: "retry", message: "Bez připojení.", scope: "network" },
    );
    await queue.submit({ command: "c.in", input: {}, label: "Příchod", group: "clock" });
    advance(10);
    await queue.submit({ command: "c.break", input: {}, label: "Přestávka", group: "clock" });
    advance(10);
    await queue.submit({ command: "c.out", input: {}, label: "Odchod", group: "clock" });
    online = true;
    advance(60_000);
    await queue.flush(true);
    expect(server.executed).toEqual(["Příchod", "Přestávka", "Odchod"]);
  });

  it("chyba jednoho zápisu (poškozená data na serveru) nezablokuje ostatní skupiny", async () => {
    const { queue, server } = setup((op) =>
      op.label === "Vadný" ? { kind: "retry", message: "Něco se nepovedlo.", scope: "op" } : null,
    );
    await queue.submit({ command: "a.b", input: {}, label: "Vadný", group: "g1" });
    const ok = await queue.submit({ command: "a.b", input: {}, label: "Dobrý", group: "g2" });
    expect(ok.status).toBe("sent");
    expect(server.executed).toEqual(["Dobrý"]);
  });

  it("výjimka při odeslání (síť) je dočasná chyba, ne ztráta", async () => {
    const store = memoryOpStore();
    let fail = true;
    const q = createTerminalQueue({
      owner: "u1",
      store,
      send: async () => {
        if (fail) throw new TypeError("Failed to fetch");
        return { kind: "ok", result: null, duplicate: false };
      },
      now: () => 5,
      newId: () => "op-1",
      schedule: () => undefined,
    });
    expect((await q.submit({ command: "a.b", input: {}, label: "X" })).status).toBe("queued");
    expect(await store.all()).toHaveLength(1);
    fail = false;
    await q.flush(true);
    expect(await store.all()).toEqual([]);
  });

  it("konflikt jde zkusit znovu nebo zahodit; zahodit smí jen člověk", async () => {
    let reject = true;
    const { queue, store } = setup(() => (reject ? { kind: "rejected", message: "Ne." } : null));
    await queue.submit({ command: "a.b", input: {}, label: "X" });
    reject = false;
    await queue.retry();
    expect(await store.all()).toEqual([]);

    reject = true;
    await queue.submit({ command: "a.b", input: {}, label: "Y" });
    const [op] = await store.all();
    await queue.discard(op!.opId);
    expect(await store.all()).toEqual([]);
  });

  it("odběratelé dostanou stav fronty i potvrzené zápisy", async () => {
    const { queue } = setup();
    const seen: number[] = [];
    const sent: string[] = [];
    queue.subscribe((ops) => seen.push(ops.length));
    queue.onSent((op) => sent.push(op.label));
    await queue.submit({ command: "a.b", input: {}, label: "A" });
    expect(sent).toEqual(["A"]);
    expect(seen).toContain(1);
    expect(seen.at(-1)).toBe(0);
  });

  it("opakování má rostoucí odstupy", async () => {
    const { queue, timers } = setup(() => ({ kind: "retry", message: "x", scope: "op" }));
    await queue.submit({ command: "a.b", input: {}, label: "A" });
    await queue.flush(true);
    await queue.flush(true);
    const waits = timers.map((t) => t.ms);
    expect(waits[0]).toBeLessThan(waits[1]!);
    expect(waits[1]).toBeLessThan(waits[2]!);
  });

  it("sdílený telefon: zápisy jednoho uživatele se neodešlou pod účtem jiného", async () => {
    const store = memoryOpStore();
    const sentBy: string[] = [];
    const mk = (owner: string) =>
      createTerminalQueue({
        owner,
        store,
        send: async (op) => {
          sentBy.push(`${owner}:${op.label}`);
          return { kind: "ok", result: null, duplicate: false };
        },
        newId: () => `op-${owner}-${sentBy.length}`,
        schedule: () => undefined,
      });
    const offline = createTerminalQueue({
      owner: "jiri",
      store,
      send: async () => ({ kind: "retry", message: "Bez připojení.", scope: "network" }),
      schedule: () => undefined,
    });
    await offline.submit({ command: "a.b", input: {}, label: "Jiřího příchod" });
    const martin = mk("martin");
    await martin.flush(true);
    expect(sentBy).toEqual([]);
    expect(await martin.list()).toEqual([]);
    const jiri = mk("jiri");
    await jiri.flush(true);
    expect(sentBy).toEqual(["jiri:Jiřího příchod"]);
  });
});
