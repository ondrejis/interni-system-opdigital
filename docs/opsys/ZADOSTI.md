# ZADOSTI: žádosti o změnu sdílených míst

Jeden řádek na žádost: `kdo → komu → co`. Sdílené a zamčené soubory (D §3.1) po S0 mění jen integrátor (INT); kontrakty
(`@rebar/core/contracts`) jen architekt. Vyřízené řádky se škrtají a odkazují na commit.

| Kdo | Komu | Co |
| --- | ---- | -- |
| S1 | C1 | core `task` smazat celý: tabulka je dočasně přejmenovaná na `core_task` (migrace `0013_opsys`), aby `ukoly` mohla mít tabulku `task`; symbol `task` v `@rebar/core/db` zatím zůstal (`collab/tasks.ts`, `/ukoly` stránka jádra, záložka „Úkoly“, oprávnění `tasks.*`) |
| S1 | C1 | `EntityLink.table` (nepovinná tabulka dítěte, které není entita: `job_phase`, `deal_participant`, `deal_stage_history`, `task_attendee`, `payment_allocation`) a `AttributeDef.lookupScope` jsou zatím jen typy; engine je má respektovat při kaskádě zámku, koše a nabídce štítků. `column` v `parents`/`children` je název vlastnosti tabulky (camelCase) |
| S1 | C1 | `payment` s `job_id = null` (R-12) je vždy soukromá: engine při vytvoření nastaví `is_private = true`; `time_entry`, `job_phase` mají `ownLock: false` (dědí od zakázky a úkolu) |
| S1 | INT | `tests/security-static.test.ts`: z `PUBLIC` jsem odstranil `kalendar/feed/[token]` (trasa i iCal feed zanikly, kód je v `packages/_donor/web`) |
| S1 | INT | `docs:generate`, `docs:coverage --prune` a `docs/moduly/*.md` po S1 (nové tabulky, entity, oprávnění, ubrané příkazy kontaktů, zakázek a kalendáře); `docs/NOTIFICATIONS.md` dál obsahuje události kalendáře (`kalendar.*`), které D ruší (rozhodne KAL-A) |
| S1 | OBC-A | pipeline `deal/default` a číselník `deal.lost_reason` jsem založil v manifestu `obchody` (seed), aby šly testovat entity; uprav podle potřeby (fáze, barvy) |
| S1 | KAL-A, ZAK-A, KON | starý kód těchto modulů je v `packages/_donor/{kalendar,zakazky,kontakty}` (tag `opsys-s0` ho má i v historii); v modulech zůstaly jen schéma, entity a (u `kontakty`) příkaz `kontakty.ares` |
