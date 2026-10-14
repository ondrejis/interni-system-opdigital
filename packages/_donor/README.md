# `_donor`: kód odstraněných modulů (zdroj pro nové moduly OPSYS)

Složka je **mimo workspace** (`pnpm-workspace.yaml` ji nevidí), mimo `tsc`, ESLint, Prettier i Vitest. Nic se odsud
neimportuje; kód se **čte a kopíruje** do nových modulů (`packages/modules/<modul>`), viz `docs/opsys/D-plan-a-kontrakty.md` §4.
Na konci prací (INT, D §7 bod 3) se složka smaže.

| Složka          | Z čeho se bere                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `poptavky/`     | bývalé CRM: `src/crm/{deals,board,views,activities,inbox,today,…}` → `obchody` (~45 %) a `ukoly` (~60 %)       |
| `dochazka/`     | bývalá docházka → `hodiny` (~35 %): týdenní mřížka, zápis, report                                           |
| `web/`          | trasy aplikace, které patřily donorům (`intake-poptavky-route.ts`)                                          |
| `tests/`        | testy donorů (`crm.int`, `poptavky-zakazky.int`, `dochazka.int`, `delete-blockers.int`, `crm-activities.int`) |
| `tests/support` | jejich fixtury a probes; `tests/security/` je původní matice oprávnění se starou sestavou                     |

Soubory mají původní vnitřní strukturu a importy (`@rebar/poptavky/*`, `@rebar/dochazka/*` už neexistují): při kopírování
je třeba opravit importy a respektovat nové kontrakty (`@rebar/core/contracts`, služby, události).
