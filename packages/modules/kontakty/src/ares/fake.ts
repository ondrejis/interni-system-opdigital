import type { AresClient, AresCompany, AresFetchResult } from "./types";

/** Fake ARES pro testy: znalé firmy, počítání volání, simulace výpadku a zpoždění. Bez sítě. */
export type FakeAres = AresClient & {
  /** IČO všech dotazů v pořadí, v jakém přišly. */
  readonly calls: string[];
  /** Přepne simulaci výpadku (`unavailable`). */
  setDown(down: boolean): void;
  /** Přidá nebo přepíše firmu, kterou ARES „zná“. */
  add(company: AresCompany): void;
};

/** Ukázkové firmy pro testy (platná IČO). */
export const FAKE_ARES_COMPANIES: readonly AresCompany[] = [
  {
    ico: "27082440",
    name: "Alza.cz a.s.",
    dic: "CZ27082440",
    legalForm: "Akciová společnost",
    street: "Jankovcova 1522/53",
    city: "Praha",
    zip: "170 00",
  },
  {
    ico: "00006947",
    name: "Ministerstvo financí",
    dic: null,
    legalForm: "Organizační složka státu",
    street: "Letenská 525/15",
    city: "Praha",
    zip: "118 00",
  },
];

/** Vyrobí fake adaptér ARES; bez argumentů zná `FAKE_ARES_COMPANIES`. */
export function createFakeAres(
  companies: readonly AresCompany[] = FAKE_ARES_COMPANIES,
  opts: { latencyMs?: number; down?: boolean } = {},
): FakeAres {
  const known = new Map(companies.map((c) => [c.ico, c]));
  const calls: string[] = [];
  let down = opts.down ?? false;
  return {
    calls,
    setDown: (v) => {
      down = v;
    },
    add: (c) => {
      known.set(c.ico, c);
    },
    async lookup(ico): Promise<AresFetchResult> {
      calls.push(ico);
      if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));
      if (down)
        return { ok: false, reason: "unavailable", message: "ARES teď neodpovídá (fake)." };
      const c = known.get(ico);
      return c
        ? { ok: true, company: c }
        : { ok: false, reason: "not_found", message: "Organizaci s tímto IČO ARES nezná." };
    },
  };
}
