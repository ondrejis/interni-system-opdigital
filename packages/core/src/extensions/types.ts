/**
 * Události, na které se dá z rozšíření klienta reagovat. Seznam roste s moduly
 * (fáze 4); rozšíření se k jádru připojuje jen přes tyto události a sloty.
 */
export interface EventMap {
  "zakazky.created": { id: string };
  /** Poptávka byla převedena na zakázku. */
  "poptavky.converted": { id: string; jobId: string };
}

export type EventName = keyof EventMap;

export type ClientExtension = {
  /** Unikátní id rozšíření (kebab-case). */
  id: string;
  /** Reakce na události jádra. */
  on?: { [K in EventName]?: (payload: EventMap[K]) => void | Promise<void> };
};

export function defineExtension(ext: ClientExtension): ClientExtension {
  return ext;
}
