# Můj prostor

> Vyprávěcí dokumentace modulu `muj-prostor`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/muj-prostor.md), [databáze](../reference/databaze/muj-prostor.md).

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

- **Popis z manifestu:** Soukromá sekce vlastníka: hosting a údržba webů, domény s expirací, soukromá e-mailová knihovna, opakované faktury (Fakturoid) a přehled soukromých záznamů.
- **Závisí na:** [`kontakty`](kontakty.md)
- **Entity:** žádné
- **Příkazy:** žádné
- **Referenční stránky:** [modul](../reference/moduly/muj-prostor.md), [databáze](../reference/databaze/muj-prostor.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění                        | Název                                  | Výchozí: owner |
| -------------------------------- | -------------------------------------- | -------------- |
| `muj-prostor.hosting`            | Spravuje hosting a údržbu webů         | vše            |
| `muj-prostor.domains`            | Spravuje domény                        | vše            |
| `muj-prostor.email_library`      | Spravuje soukromou e-mailovou knihovnu | vše            |
| `muj-prostor.recurring_invoices` | Spravuje opakované faktury             | vše            |
| `muj-prostor.private_overview`   | Vidí přehled soukromých záznamů        | vše            |

<!-- docs:generated:end -->

## Účel

<!-- Co modul řeší, pro koho, proč existuje a co do něj naopak nepatří. Tři až šest vět. -->

Soukromá sekce vlastníka (Ondřej). Nic z ní se nepromítá do Patrikových seznamů, součtů, hledání, odznaků ani karty klienta: entity nemají zámek soukromí, přístup určují oprávnění `muj-prostor.*`, která má jen role `owner`.

### Hosting a domény (MPR-1)

Evidence hostingu a údržby webů klientů (opakované služby s obnovou) a domén s expirací. Žádné e-maily ani notifikace: upozornění je jen barva a číslo u položky v menu.

## Kdo to používá (role)

<!-- Které výchozí role modul používají, co v něm každá dělá a jaký mají rozsah (vše / moje). Matice oprávnění je v souhrnu výše. -->

Jen `owner`. Patrik (`partner`) nemá žádné oprávnění `muj-prostor.*`: příkazy odmítne brána, entity pro něj neexistují (seznamy, hledání, export), odznak v menu je 0, příspěvek ke kartě klienta je prázdný a metriky nástěnek vrací nuly. Čtecí cesty jsou v `privatePaths` pro canary test.

## Hlavní toky krok za krokem

<!-- Každý tok zvlášť: spouštěč, očíslované kroky z pohledu uživatele i systému (co se zapíše, spočítá, odešle), výsledek a co se stane při chybě. -->

**Hosting a údržba** (`/muj-prostor/hosting`): nahoře souhrn (roční opakovaný příjem, aktivní služby, obnova do 30 dní, po termínu), panel „K obnově do 30 dní“ s tlačítkem „Označit obnovu“ a pod ním seznam s pohledy Obnova do 30 dní, Podle klienta, Zrušené (výchozí „Aktuální“ = aktivní a pozastavené). „Označit obnovu jako vyfakturovanou“ (`muj-prostor.hosting.markRenewed`) posune další obnovu o období a nabídne „Zpět“ (`undoRenewed`). Příkaz nese datum, které uživatel viděl, takže dvojklik nic nezdvojí.

**Domény** (`/muj-prostor/domeny`): souhrn (kritické, upozornění, celkem, bez klienta), seznam od nejbližší expirace s barvou, filtr a hledání. „Hromadně vložit“ (`muj-prostor.domains.bulkAdd`): doména na řádek (protokol, `www`, cesta se odstraní), neplatné, opakované a už evidované se přeskočí a vrátí v odpovědi; volitelně klient, registrátor a plátce pro všechny. Pak krok „Doplnění klientů“ (zaškrtnout domény, vybrat klienta, přiřadit; `assignClient`). Stejné přiřazení je v seznamu u vybraných řádků.

**Karta klienta**: záložka „Hosting a domény“ (`muj-prostor.client.overview`), počet z příspěvku `clientCard.tabCounts`.

Generický seznam entit s filtry, uloženými pohledy a exportem je na `/muj-prostor/hosting/vse` a `/muj-prostor/domeny/vse` (tam leží i detaily záznamů; stránky výše je zastiňují jen u kořenové adresy).

## Stavy a přechody

<!-- Stavové automaty (pipeline, fáze, stavy dokladů): z čeho kam se smí, za jakých podmínek, co přechod automaticky udělá. Hodí se tabulka nebo diagram Mermaid. -->

Služba: `active` (počítá se do příjmu a obnovy), `paused` a `canceled` (nepočítají se; obnovu u nich jde označit jen v `active`). Přechody jsou volné (úprava stavu v záznamu). Doména stavy nemá, stav je odvozen z data expirace.

## Pravidla a výpočty

<!-- Vzorce, zaokrouhlování, sazby, meze, priority pravidel a příklad s čísly. U každého pravidla odkaz na funkci, která ho provádí. -->

- **Barva expirace** (`packages/modules/muj-prostor/src/domains/logic.ts#expiryState`, R-19): kritická je méně než `warn_days` dní (výchozí 30) a po expiraci, upozornění do dvojnásobku (výchozí 60–30, hranice patří do upozornění), dál normální; bez data „neznámá“. Odznak v menu je počet kritických (`countCriticalDomains`, SQL `criticalDomainSql` odpovídá `expiryState`, hlídá to integrační test).
- **Posun obnovy** (`hosting/logic.ts#shiftRenewal`, HOST-03, R-47): ročně o 12 měsíců, měsíčně o 1; den v měsíci se drží (31. 1. → 28. 2. → 31. 3. díky `since`).
- **Roční opakovaný příjem** (`hosting/logic.ts#summarizeServices`, R-26): jen aktivní služby, měsíční cena × 12; pozastavené a zrušené se nepočítají.
- **Doména** se ukládá normalizovaně (`domains/logic.ts#normalizeDomain`, punycode) a je mezi nesmazanými unikátní bez ohledu na velikost písmen (hlídá entita i DB index).

## Oprávnění

<!-- Jak se oprávnění projevují v chování: kdo co vidí a smí, co je skryté (například peníze), jak funguje rozsah „jen moje“. Seznam oprávnění je v souhrnu. -->

`muj-prostor.hosting` (služby, karta klienta, obnova), `muj-prostor.domains` (domény, odznak). Export entit mají stejná oprávnění. Příkazy kontrolují oprávnění bránou i datové funkce (`assertCan`).

## Nastavení

<!-- Co se nastavuje v administraci a v konfiguraci klienta, co která volba mění a jaké jsou výchozí hodnoty. -->

Výchozí sdílené pohledy zakládá `db:seed` (`seed.ts#MUJ_PROSTOR_VIEWS`); smazaný pohled se znovu nezakládá. Hranice „kritická“ je `warn_days` u každé domény. Nastavení modul nemá.

## Události a upozornění

<!-- Kdy a komu přijde upozornění, jaké události modul oznamuje rozšířením klienta, které plánované úlohy běží a co dělají. -->

Žádné události ani upozornění. Metriky nástěnek: `muj-prostor.expirations` (widget Expirace, parametr `days`, výchozí 60; domény i obnovy hostingu), `muj-prostor.domains_critical`, `muj-prostor.retainers` (měsíční ekvivalent), `muj-prostor.retainers_arr`, `muj-prostor.retainers_active` (widget Retainery).

## Exporty

<!-- Co a jak se exportuje (XLSX, CSV, PDF, ISDOC, kalendářový kanál), kdo to smí a co je v souboru. -->

CSV/XLSX z generických seznamů `/vse` (oprávnění modulu).

## Integrace s jinými moduly

<!-- Závislosti, poskytovatelé dat, sloty, události; kdo od modulu data bere a komu je modul dává; co se stane po vypnutí modulu. -->

Závisí na `kontakty` (klient = `company`, soft odkaz). Přispívá do karty klienta (`contributions.clientCard`, `recordTabs.company`), blokuje smazání firmy s evidovaným hostingem nebo doménou (`deleteBlockers`, jen pro vlastníka) a nabízí odznak (`navBadges`).

## Hrany a známá omezení

<!-- Co funguje jinak, než by uživatel čekal, co zatím chybí, a odkazy na otevřené otázky. -->

Barva expirace je jen na stránce Domény a v kartě klienta; generický seznam `/vse` barvy nemá. U hostingu se barva podle R-19 nespecifikuje (zvýrazněn je jen stav obnovy). Seznam domén je omezen na 5000 řádků. Hromadné vložení max. 500 domén najednou.

## Odkazy na kód a testy

<!-- Hlavní místa v kódu a testy, které chování zajišťují, ve tvaru `cesta/soubor.ts#symbol`. -->

- `packages/modules/muj-prostor/src/domains/logic.ts#expiryState`, `#parseDomainList`; `hosting/logic.ts#shiftRenewal`, `#summarizeServices` (unit testy `logic.test.ts`).
- `packages/modules/muj-prostor/src/hosting/commands.ts#hostingMarkRenewed`, `domains/commands.ts#domainsBulkAdd`.
- `tests/muj-prostor-hosting-domeny.int.test.ts`, `apps/web/e2e/muj-prostor-hosting-domeny.spec.ts`.
