# Hodiny

> Vyprávěcí dokumentace modulu `hodiny`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/hodiny.md), [databáze](../reference/databaze/hodiny.md).

<!--
Jak psát (podrobně v docs/DOCS-PROCES.md):
- Každá věta musí platit pro aktuální kód. Co se mění s kódem a jde to vyčíst z kódu, patří do reference, ne sem.
- Odkazuj na kód ve tvaru `cesta/soubor.ts#symbol` (cesta od kořene repozitáře, symbol je deklarace v souboru).
  Test tests/docs.test.ts ověří, že soubor i symbol existují.
- Sekci, kterou jsi zatím nenapsal, nech s řádkem „TODO: doplnit vyprávění“; pnpm docs:status je vypíše.
- Blok „Souhrn z kódu“ nepiš ručně, doplňuje ho pnpm docs:generate.
-->

## Souhrn z kódu

<!-- docs:generated:start -->

_Tento blok vzniká z kódu (`pnpm docs:generate`); neupravuj ho ručně. Vyprávění píš pod ním._

- **Popis z manifestu:** Zápis odpracovaného času k zakázkám a úkolům: týdenní mřížka, formáty 1,5 a 1:30, souhrny podle zakázky.
- **Závisí na:** [`zakazky`](zakazky.md)
- **Entity:** žádné
- **Příkazy:** žádné
- **Referenční stránky:** [modul](../reference/moduly/hodiny.md), [databáze](../reference/databaze/hodiny.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění       | Název                      | Výchozí: owner |
| --------------- | -------------------------- | -------------- |
| `hodiny.read`   | Vidí odpracované hodiny    | vše            |
| `hodiny.write`  | Zapisuje a upravuje hodiny | vše            |
| `hodiny.delete` | Maže záznamy hodin         | vše            |

<!-- docs:generated:end -->

## Účel

Hodiny ukazují, kolik času zakázka stála a jaká z ní vyšla hodinovka každému z dvojice. Zapisuje se zpětně, bez stopek: do týdenní mřížky, z úkolu nebo ze zakázky. Modul neschvaluje výkazy, nepočítá náklady práce ani docházku (píchačka, absence a uzávěrka z původního jádra odpadly). Hodiny nejsou podklad pro fakturaci, jen pro přehled a sazbu.

## Kdo to používá (role)

Owner (Ondřej) i Partner (Patrik) mají `hodiny.read`, `hodiny.write` a `hodiny.delete` v rozsahu „vše“: každý zapisuje jen své hodiny, ale v přehledech vidí hodiny obou. Při rozsahu „jen moje“ (například externí spolupracovník, kterému majitel oprávnění přidělí) vidí a zapisuje jen vlastní. Hodiny soukromých zakázek vidí jen owner.

## Hlavní toky krok za krokem

1. **Týdenní výkaz** (`/hodiny`): řádek je zakázka, sloupec den, buňka textové pole. Čas se píše `1,5`, `1.5`, `1:30`, `90m`, `1h30`; Enter nebo opuštění pole uloží (`hodiny.cell.save`), prázdné pole nebo `0` buňku vymaže. Zakázku do výkazu přidá výběr pod mřížkou (nebo tlačítko se zakázkou z posledních čtyř týdnů). Tlačítko 1:30 / 1,5 přepíná jen zobrazení a pamatuje si ho prohlížeč.
2. **Zapsat čas** (dialog): z paletového příkazu „Zapsat hodiny“ (`/hodiny?zapsat=1`), z hlavičky zakázky, ze záložky Hodiny zakázky a z dialogu úkolu (slot `task.dialog.extras`). Vybere se den, čas a poznámka; u úkolu se zakázka vezme z úkolu. Dialog tvoří vždy nový záznam; existující záznam se upraví kliknutím na řádek (v týdnu, u úkolu).
3. **Přehledy** (`/hodiny/prehled`): moje hodiny za týden nebo měsíc podle zakázky či osoby; s rozsahem „vše“ i hodiny všech s rozpadem (zakázka → osoby, osoba → zakázky).
4. **Záložka Hodiny u zakázky**: odpracováno, odhad úkolů, zbývá nebo přečerpáno, tabulka „Kdo kolik“ s podílem na příjmech a efektivní sazbou a posledních 10 záznamů.

## Stavy a přechody

Záznam nemá stav (žádné schvalování, uzávěrka ani koncepty). Je buď živý, nebo smazaný (měkce, jde obnovit z Koše).

## Pravidla a výpočty

- **Formáty času:** `src/logic/parse-time.ts#parseDuration`. Číslo bez jednotky jsou hodiny; `h:mm` hodiny a minuty; jednotky `h`, `hod`, `m`, `min`. Desetinné hodiny se zaokrouhlí na minuty. Nula je platná jen v buňce (smazání), záznam musí mít > 0 minut. Nejvýš 24 hodin na záznam i na člověka a den (`src/logic/grid.ts#dayLimitError`).
- **Buňka mřížky** upravuje jen čas „bez úkolu“ (`src/logic/grid.ts#planCellSave`): žádný záznam + čas = nový; čas 0 = smazání; víc záznamů bez úkolu v buňce se sloučí do nejstaršího (poznámky se spojí, aby se text neztratil). Čas zapsaný u úkolů je v buňce vidět jako „+ 0:30“ a počítá se do součtů, ale buňka ho nemění.
- **Odpracováno vs. odhad** (`src/logic/effort.ts#computeJobEffort`): odhad = součet `estimateMin` nezrušených úkolů zakázky; zbývá = max(0, odhad − odpracováno), přečerpáno = max(0, odpracováno − odhad), procento = odpracováno / odhad.
- **Efektivní hodinová sazba** každého = jeho podíl na příjmech zakázky ÷ jeho hodiny, v haléřích zaokrouhleno na celé; kdo nemá hodiny, má sazbu „–“. Podíly dává služba `finance.allocatedByUser`.

## Oprávnění

`hodiny.read` (rozsah vše / jen moje), `hodiny.write` (zápis a úprava vlastních záznamů včetně vymazání buňky), `hodiny.delete` (příkaz `hodiny.delete` na konkrétní záznam). Upravovat ani mazat cizí záznamy příkazy nejde (tváří se jako neexistující); správce je může upravit v seznamu `/hodiny/zaznamy`. Peníze (příjmy, sazby) vidí jen ten, kdo má `finance.read` a u hodin rozsah „vše“.

**Soukromí:** `time_entry` nemá vlastní zámek, dědí ho od zakázky a úkolu (D §5.1). Příkazy při zápisu nastaví `is_private` podle rodiče a udržují `private_record`; všechna čtení (týden, přehledy, metriky, souhrn zakázky) jdou přes `src/access.ts#visibleEntries` a `privateScope`. Partner tedy hodiny soukromé zakázky nikde nevidí ani nezapíše (zakázka je pro něj `NotFound`).

## Nastavení

Žádné. Ukládá se jen předvolba zobrazení času (1:30 / 1,5) v prohlížeči.

## Události a upozornění

Žádné: modul nevysílá doménové události, nic neupozorňuje ani nepřipomíná.

## Exporty

Seznam `/hodiny/zaznamy` (entita `time_entry`) se exportuje obecným exportem entit s příslušným oprávněním; modul nemá vlastní export.

## Integrace s jinými moduly

Závisí na `zakazky` (výběr a viditelnost zakázek přes registr entit). Volitelně: modul Úkoly (zápis k úkolu, odhad úkolů; příspěvek `slots["task.dialog.extras"]`) a modul Finance (`finance.allocatedByUser`, sazby). Bez nich: čas jde zapsat k zakázce, odhad a sazby se nezobrazí. Metriky nástěnek `hodiny.week` („Hodiny tento týden“) a `hodiny.by_job` (podle zakázky nebo osoby). Do UI zakázky přispívá záložka „Hodiny“ a akce „Zapsat čas“, do palety příkaz „Zapsat hodiny“.

## Hrany a známá omezení

- Odhad úkolů se čte přes registr entit (`aggregateRecords`), protože `ServiceMap.tasks` zatím nemá `estimateByJob` (žádost v `docs/opsys/ZADOSTI.md`). Jakmile ji služba nabídne, použije se přednostně.
- Dokud `finance.allocatedByUser` není implementováno (vyhazuje `NotImplementedError`), je u zakázky efektivní sazba „–“.
- Zápis jen za sebe; cizí hodiny jen čtení.
- Budoucí dny se zapsat smějí (plánování); strop je jen 24 hodin za den.

## Odkazy na kód a testy

- `packages/modules/hodiny/src/logic/parse-time.ts#parseDuration`, `packages/modules/hodiny/src/logic/grid.ts#planCellSave`, `packages/modules/hodiny/src/logic/effort.ts#computeJobEffort`, `packages/modules/hodiny/src/logic/report.ts#groupHours`
- `packages/modules/hodiny/src/data/write.ts#saveCell`, `packages/modules/hodiny/src/data/read.ts#jobSummary`, `packages/modules/hodiny/src/metrics.ts#hodinyMetrics`
- Testy: `packages/modules/hodiny/src/logic/*.test.ts`, `tests/hodiny.int.test.ts`, `apps/web/e2e/hodiny.spec.ts`
