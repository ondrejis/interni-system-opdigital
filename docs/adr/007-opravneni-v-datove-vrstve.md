# ADR 007: Oprávnění v datové vrstvě

- Stav: přijato (2026-10-08)
- Kontext: `docs/AUDIT.md` S1, zadání §5 a §9

## Kontext

Demo kontrolovalo oprávnění na úrovni stránky a akce, ne záznamu. Kdo měl `jobs.view`, viděl všechny zakázky; „Moje zakázky“ byl jen filtr v URL. Zadání chce, aby montér viděl jen své zakázky a aby se na middleware ani skrytí v UI nikdo nespoléhal.

## Rozhodnutí

- **Aktér a kontext.** Každá služba dostává `Ctx` (`actor` s oprávněními, `db` nebo transakce, `requestId`, `ip`) jako první argument. Kontext se vyrábí na jednom místě (`resolveCtx` z cookie, `systemCtx` pro úlohy na pozadí).
- **Oprávnění s rozsahem.** `role_permission(role, permission, scope)`, rozsah `all` (všechny záznamy) nebo `own` (vlastní a přidělené). `can`, `assertCan` pro jeden záznam, `scopedWhere` pro seznamy. Dotaz nad záznamy s rozsahem musí podmínku použít.
- **Politika záznamu.** Komentáře, úkoly a soubory se váží na libovolný záznam, proto jejich oprávnění plyne z politiky záznamu (`registerEntityPolicy`: čtecí a zapisovací oprávnění, vlastníci). Neznámý typ záznamu se odmítne; záznam, který aktér nesmí vidět, se tváří jako neexistující (`NotFoundError`), aby šlo jen hádat, že existuje.
- **Omezená relace.** Role s povinným 2FA bez nastaveného 2FA má `restriction = "2fa_setup"` a smí jen `account.self`. Platí i pro „systémového“ aktéra.
- **Vypnutý modul.** `loadActor` zahodí oprávnění mimo katalog zapnutých modulů.
- **Systémová role** (`owner`) dostane všechna oprávnění katalogu v rozsahu `all`, aby se po přidání modulu nemusela doplňovat.
- **Server actions** vznikají přes `defineAction({ permission, input, handler })`: kontext, oprávnění, validace Zodem a převod chyb jsou pro všechny stejné.
- Stránky a UI oprávnění zobrazují, ale nejsou jediná kontrola.

## Důsledky

- Služby jsou testovatelné bez HTTP (testy oprávnění pro každou roli, ADR 002 o auditu navazuje).
- Každá doména (zakázky, faktury…) musí při vzniku registrovat politiku záznamu a v seznamech používat `scopedWhere`.
