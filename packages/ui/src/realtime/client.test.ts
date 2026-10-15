import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRealtimeClient, type EventSourceLike } from "./client";

class FakeEs implements EventSourceLike {
  handlers = new Map<string, (e: { data?: string }) => void>();
  onerror: ((e: unknown) => void) | null = null;
  closed = false;
  addEventListener(type: string, l: (e: { data?: string }) => void) {
    this.handlers.set(type, l);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data?: unknown) {
    this.handlers.get(type)?.({ data: data === undefined ? "" : JSON.stringify(data) });
  }
}

describe("realtime klient", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (extra: { maxErrors?: number } = {}) => {
    const es = new FakeEs();
    const invalidate = vi.fn();
    const invalidateAll = vi.fn();
    const stop = startRealtimeClient({ connect: () => es, invalidate, invalidateAll, ...extra });
    return { es, invalidate, invalidateAll, stop };
  };

  it("slučuje bouři změn a zneplatní jen dotčené entity (i nadřazenou)", () => {
    const { es, invalidate } = setup();
    es.emit("ready");
    es.emit("change", { e: "company", i: "1", a: "update" });
    es.emit("change", { e: "company", i: "2", a: "update" });
    es.emit("change", { e: "comment", i: "3", a: "create", x: "job", y: "9" });
    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect([...invalidate.mock.calls[0]![0]].sort()).toEqual(["comment", "company", "job"]);
  });

  it("zneplatní do 2 s (výchozí prodleva je zlomek sekundy)", () => {
    const { es, invalidate } = setup();
    es.emit("change", { e: "task", i: "1", a: "update" });
    vi.advanceTimersByTime(1999);
    expect(invalidate).toHaveBeenCalled();
  });

  it("po obnovení spojení a při resync zneplatní všechno", () => {
    const { es, invalidateAll } = setup();
    es.emit("ready");
    expect(invalidateAll).not.toHaveBeenCalled(); // první připojení nic nezameškalo
    es.onerror?.(new Error("x"));
    es.emit("ready");
    expect(invalidateAll).toHaveBeenCalledTimes(1);
    es.emit("resync");
    expect(invalidateAll).toHaveBeenCalledTimes(2);
  });

  it("když se spojení nedaří, přejde na polling; po obnovení ho zastaví", () => {
    const { es, invalidateAll } = setup({ maxErrors: 2 });
    es.onerror?.(new Error("1"));
    es.onerror?.(new Error("2"));
    vi.advanceTimersByTime(15_000);
    expect(invalidateAll).toHaveBeenCalledTimes(1);
    invalidateAll.mockClear();
    es.emit("ready");
    vi.advanceTimersByTime(60_000);
    expect(invalidateAll).toHaveBeenCalledTimes(1); // jen zneplatnění po obnovení spojení, žádný polling
  });

  it("ukončení zavře spojení a zruší časovače", () => {
    const { es, invalidate, stop } = setup();
    es.emit("change", { e: "task", i: "1", a: "update" });
    stop();
    vi.advanceTimersByTime(1000);
    expect(es.closed).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("poškozená zpráva se ignoruje", () => {
    const { es, invalidate } = setup();
    es.handlers.get("change")?.({ data: "{not json" });
    vi.advanceTimersByTime(500);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
