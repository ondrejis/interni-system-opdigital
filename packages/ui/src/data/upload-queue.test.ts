import { describe, expect, it } from "vitest";
import {
  TransientUploadError,
  createUploadQueue,
  memoryStore,
  type NewUploadTask,
  type UploadTask,
} from "./upload-queue";

const task = (name = "a.jpg"): NewUploadTask => ({
  entity: "job",
  recordId: "j1",
  kind: "photo",
  name,
  blob: new Blob(["x"]),
  takenAt: "2026-10-08T10:00:00.000Z",
  label: "Zakázka 1",
});

function setup(upload: (t: UploadTask) => Promise<void>) {
  const store = memoryStore();
  let clock = 1_000;
  const timers: { fn: () => void; ms: number }[] = [];
  let n = 0;
  const q = createUploadQueue({
    store,
    upload,
    delaysMs: [100, 200],
    now: () => clock,
    newId: () => `t${++n}`,
    schedule: (fn, ms) => timers.push({ fn, ms }),
  });
  return { q, store, timers, advance: (ms: number) => (clock += ms) };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("fronta nahrávání", () => {
  it("úspěšně odeslanou fotku z fronty odstraní", async () => {
    const sent: string[] = [];
    const { q, store } = setup(async (t) => void sent.push(t.name));
    await q.add(task("1.jpg"));
    await q.add(task("2.jpg"));
    await q.flush();
    expect(sent).toEqual(["1.jpg", "2.jpg"]);
    expect(await store.all()).toEqual([]);
  });

  it("dočasná chyba fotku nechá a zkusí znovu po odstupu", async () => {
    let calls = 0;
    const { q, store, timers, advance } = setup(async () => {
      if (++calls < 3) throw new TransientUploadError("Bez signálu");
    });
    await q.add(task());
    await settle();
    let [t] = await store.all();
    expect(t).toMatchObject({ tries: 1, failed: false, error: "Bez signálu" });
    expect(timers.map((x) => x.ms)).toEqual([105]);

    // před uplynutím odstupu se nezkouší
    await q.flush();
    expect(calls).toBe(1);

    advance(101);
    await q.flush();
    [t] = await store.all();
    expect(t).toMatchObject({ tries: 2, failed: false });
    expect(timers.map((x) => x.ms)).toEqual([105, 205]);

    advance(201);
    await q.flush();
    expect(calls).toBe(3);
    expect(await store.all()).toEqual([]);
  });

  it("po vyčerpání pokusů se fotka označí jako neodeslaná a čeká na člověka", async () => {
    const { q, store, advance } = setup(async () => {
      throw new TransientUploadError("Server nedostupný");
    });
    await q.add(task());
    await settle();
    advance(150);
    await q.flush();
    advance(250);
    await q.flush();
    const [t] = await store.all();
    expect(t).toMatchObject({ tries: 3, failed: true, error: "Server nedostupný" });
    // sama už se nezkouší
    advance(100_000);
    await q.flush();
    expect((await store.all())[0]!.tries).toBe(3);
  });

  it("trvalá chyba se neopakuje; ruční zopakování vrátí pokusy a zkusí hned", async () => {
    let allow = false;
    let calls = 0;
    const { q, store } = setup(async () => {
      calls++;
      if (!allow) throw new Error("Tento typ souboru není povolen.");
    });
    await q.add(task());
    await settle();
    expect((await store.all())[0]).toMatchObject({ failed: true, tries: 1 });
    await q.flush();
    expect(calls).toBe(1);

    allow = true;
    await q.retry();
    expect(calls).toBe(2);
    expect(await store.all()).toEqual([]);
  });

  it("zahodit jde i neodeslanou; odběratelé dostávají stav", async () => {
    const seen: number[] = [];
    const { q, store } = setup(async () => {
      throw new Error("Nelze");
    });
    q.subscribe((tasks) => seen.push(tasks.length));
    const id = await q.add(task());
    await settle();
    await q.discard(id);
    expect(await store.all()).toEqual([]);
    expect(seen[seen.length - 1]).toBe(0);
    expect(seen).toContain(1);
  });

  it("souběžné spuštění neodešle jednu fotku dvakrát", async () => {
    let calls = 0;
    const { q } = setup(async () => {
      calls++;
      await settle();
    });
    await q.add(task());
    await Promise.all([q.flush(), q.flush(), q.flush()]);
    expect(calls).toBe(1);
  });
});
