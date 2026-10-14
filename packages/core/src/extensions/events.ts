import type { ClientExtension, EventMap, EventName } from "./types";

export type EventEmitter = <K extends EventName>(name: K, payload: EventMap[K]) => Promise<void>;

/**
 * Vyrobí oznamovač událostí pro rozšíření klienta. Rozšíření se volají postupně v pořadí, v jakém jsou v `extensions/index.ts`;
 * chyba rozšíření se zachytí (`onError`) a akci, která událost vyvolala, nikdy nezruší.
 */
export function createEventEmitter(
  extensions: readonly ClientExtension[],
  onError: (err: unknown, where: string) => void,
): EventEmitter {
  return async (name, payload) => {
    for (const ext of extensions) {
      try {
        await (ext.on?.[name] as ((p: typeof payload) => void | Promise<void>) | undefined)?.(
          payload,
        );
      } catch (err) {
        onError(err, `extension:${ext.id}:${name}`);
      }
    }
  };
}

const bus = globalThis as { __eventEmitter?: EventEmitter }; // globálně: Next bundluje route handlery zvlášť

/** Aplikace tu při startu zaregistruje oznamovač rozšíření klienta (web). Bez něj (worker, testy) se události zahazují. */
export function setEventEmitter(emitter: EventEmitter | undefined): void {
  bus.__eventEmitter = emitter;
}

/**
 * Oznámí událost rozšířením klienta. Pro kód, který nemá `ModuleDeps` (hooky entit, např. `afterCreate`);
 * příkazy modulů používají `deps.emit`. Běží v transakci akce, která událost vyvolala.
 */
export const emitEvent: EventEmitter = async (name, payload) => {
  await bus.__eventEmitter?.(name, payload);
};
