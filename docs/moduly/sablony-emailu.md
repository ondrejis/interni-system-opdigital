# Šablony e-mailů

> Vyprávěcí dokumentace modulu `sablony-emailu`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/sablony-emailu.md), [databáze](../reference/databaze/sablony-emailu.md).

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

- **Popis z manifestu:** Šablony e-mailů s proměnnými z klienta, kontaktu, obchodu a zakázky; otevření připraveného e-mailu v Gmailu nebo kopie do schránky.
- **Závisí na:** [`kontakty`](kontakty.md)
- **Entity:** žádné
- **Příkazy:** žádné
- **Referenční stránky:** [modul](../reference/moduly/sablony-emailu.md), [databáze](../reference/databaze/sablony-emailu.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění               | Název                    | Výchozí: owner |
| ----------------------- | ------------------------ | -------------- |
| `sablony-emailu.read`   | Vidí šablony e-mailů     | vše            |
| `sablony-emailu.create` | Zakládá šablony e-mailů  | vše            |
| `sablony-emailu.write`  | Upravuje šablony e-mailů | vše            |
| `sablony-emailu.delete` | Maže šablony e-mailů     | vše            |

<!-- docs:generated:end -->

## Účel

<!-- Co modul řeší, pro koho, proč existuje a co do něj naopak nepatří. Tři až šest vět. -->

Sdílené šablony e-mailů (follow-up, nabídka, onboarding, připomínka platby…) s předmětem a textem, ve kterých jdou použít proměnné z kontaktu, organizace, obchodu a zakázky. Z karty kontaktu, organizace (klienta), obchodu nebo zakázky se jedním dialogem „E-mail ze šablony“ připraví hotový e-mail. **E-maily se z OPSYS neodesílají a pošta se nesynchronizuje** (SAB-05): OPSYS jen otevře připravenou zprávu v Gmailu, nebo text zkopíruje. Soukromá knihovna textů vlastníka je v modulu Můj prostor (KNI), tento modul nabízí jen sdílené šablony.

## Kdo to používá (role)

<!-- Které výchozí role modul používají, co v něm každá dělá a jaký mají rozsah (vše / moje). Matice oprávnění je v souhrnu výše. -->

Vlastník i partner čtou a používají všechny sdílené šablony (`sablony-emailu.read`), zakládat a upravovat je smí podle oprávnění `create` a `write`, mazat podle `delete`. Autor může šablonu zamknout jako soukromou (jen vlastník ji vidí a používá); partnerovi se soukromá šablona nikdy neukáže, ani v dialogu, ani ve výběru, ani v canary cestách soukromí.

## Hlavní toky krok za krokem

<!-- Každý tok zvlášť: spouštěč, očíslované kroky z pohledu uživatele i systému (co se zapíše, spočítá, odešle), výsledek a co se stane při chybě. -->

**Založení a úprava.** Šablona se zakládá v seznamu (název je povinný; kategorie je volný text s návrhy, jazyk cs/sk/en). Na detailu je záložka „Text e-mailu“: předmět a text, paleta proměnných (vloží `{klíč}` na místo kurzoru v naposledy upravovaném poli) a živý náhled vpravo. Náhled se plní daty záznamu vybraného v „Náhled pro“ (kontakt, organizace, obchod, zakázka); bez výběru zůstanou proměnné jako zástupné symboly. Neznámá proměnná (překlep) se hlásí hned. Uložení jde příkazem `sablony-emailu.saveContent` (oprávnění, audit, ochrana před přepsáním cizí změny).

**E-mail ze šablony.** Akce „E-mail ze šablony“ v hlavičce kontaktu, organizace, obchodu a zakázky otevře dialog: výběr šablony (nejpoužívanější první, filtr jazyka a kategorie, hledání) → náhled (adresát, předmět, text; chybějící hodnoty červeně) → **Otevřít v Gmailu** (adresa `https://mail.google.com/mail/?view=cm&fs=1&to=…&su=…&body=…`) nebo **Kopírovat** text či předmět. První otevření nebo kopie započítá použití (`markUsed`; v jednom dialogu se šablona počítá jednou). Po otevření v Gmailu dialog jedním klikem nabídne „Zapsat aktivitu“: přes službu `tasks.logDoneActivity` vznikne hotová aktivita typu e-mail navázaná na kontakt, organizaci, obchod, zakázku.

**Přesun s knihovnou (MPR-2).** `emailTemplatesService` (import, export, odebrání textu) je hotová a otestovaná; zatím se neregistruje (viz Hrany).

## Stavy a přechody

<!-- Stavové automaty (pipeline, fáze, stavy dokladů): z čeho kam se smí, za jakých podmínek, co přechod automaticky udělá. Hodí se tabulka nebo diagram Mermaid. -->

Šablona nemá stavy. Jediný automaticky měněný údaj je počítadlo použití (jen roste, klient ho zadat nemůže).

## Pravidla a výpočty

<!-- Vzorce, zaokrouhlování, sazby, meze, priority pravidel a příklad s čísly. U každého pravidla odkaz na funkci, která ho provádí. -->

- **Proměnné** mají tvar `{klíč}` (malá písmena a podtržítko), dosazuje je `renderEmailTemplate` z jádra. Hodnoty se vkládají jako text, nikdy HTML, a nevyhodnocují se podruhé. Předmět je jednořádkový.
- **Katalog** (`buildCatalog` v `packages/modules/sablony-emailu/src/context.ts`) = příspěvky `emailVars` zapnutých modulů (kontakty: `jmeno`, `prijmeni`, `firma`, `email`, `telefon`; obchody: `obchod`; zakázky: `zakazka`, `cislo_zakazky`) + výchozí nedostupné + `odesilatel` (jméno přihlášeného, dodává tento modul). Co modul nepřispívá, jde do šablony napsat, ale zůstane prázdné.
- **Chybějící hodnota** (R-46) = prázdný řetězec, v náhledu zvýrazněný „chybí: klíč“ a vypsaný v upozornění. **Neznámá proměnná** zůstane v textu a hlásí se.
- **Dosazovací data** (`resolveContext`): obchod nese organizaci a kontakt, zakázka organizaci; z organizace se bere hlavní kontakt (oslovení a adresa); adresát = e-mail kontaktu, jinak e-mail organizace; neplatný e-mail se do odkazu nedává.
- **Gmail URL** (`gmailComposeUrl`, `composeLinks` v `logic.ts`): UTF-8 procentové kódování (diakritika `%C5%A0`), mezera `%20`, konec řádku `%0A`. Limit délky `GMAIL_URL_MAX` = 7 500 znaků zakódované adresy (R-46): delší e-mail nemá Gmail ani `mailto:` odkaz a nabídne se jen Kopírovat. Diakritika zabírá šest znaků, takže český text se vejde zhruba do 1 200 znaků.

## Oprávnění

<!-- Jak se oprávnění projevují v chování: kdo co vidí a smí, co je skryté (například peníze), jak funguje rozsah „jen moje“. Seznam oprávnění je v souhrnu. -->

`sablony-emailu.read` stačí k výběru šablony, náhledu, otevření v Gmailu, kopii, započtení použití i zápisu aktivity (kterou ověřuje ještě služba úkolů). Uložení textu z editoru vyžaduje `write`. Záznamy, ze kterých se píše (kontakt, organizace, obchod, zakázka), se čtou přes entity, takže soukromé a nedostupné záznamy aktér nevykreslí („nenalezeno“) a nelze k nim zapsat aktivitu.

## Nastavení

<!-- Co se nastavuje v administraci a v konfiguraci klienta, co která volba mění a jaké jsou výchozí hodnoty. -->

Žádné. Kategorie jsou volný text (editor nabízí Follow-up, Nabídka, Onboarding, Připomínka platby, Poděkování, Schůzka). Výchozí šablony se nezakládají (seed klienta je může doplnit).

## Události a upozornění

<!-- Kdy a komu přijde upozornění, jaké události modul oznamuje rozšířením klienta, které plánované úlohy běží a co dělají. -->

Žádné doménové události ani upozornění (OPSYS nemá notifikace). Modul neodesílá ani nepřijímá poštu.

## Exporty

<!-- Co a jak se exportuje (XLSX, CSV, PDF, ISDOC, kalendářový kanál), kdo to smí a co je v souboru. -->

Žádné vlastní exporty; seznam šablon exportuje generický export entit.

## Integrace s jinými moduly

<!-- Závislosti, poskytovatelé dat, sloty, události; kdo od modulu data bere a komu je modul dává; co se stane po vypnutí modulu. -->

Závisí jen na `kontakty` (hledání, hlavní kontakt). Obchody a zakázky zná jen přes registr entit (atributy `company`, `person`) a příspěvky `emailVars`, takže modul funguje i bez nich. Zápis aktivity přes službu `tasks` (modul Úkoly); bez ní se nabídka nezobrazí. Akce „E-mail ze šablony“ se přidává do `recordActions` entit `company`, `person`, `deal`, `job` bez zásahu do hostitelů. Po vypnutí modulu akce i šablony zmizí.

## Hrany a známá omezení

<!-- Co funguje jinak, než by uživatel čekal, co zatím chybí, a odkazy na otevřené otázky. -->

- Služba `emailTemplates` pro MPR-2 není zaregistrovaná: klíč není v `ServiceMap` a `SERVICE_OWNERS` (zmrazené kontrakty, viz ZADOSTI), `collectServers` by jinak shodil aplikaci. Knihovna ji najde, až bude klíč přidán.
- Akce se v hlavičce řadí podle pořadí modulů, ne podle `CLIENT_ACTIONS.email` (`RecordAction` nemá `order`).
- Text je prostý (Gmail compose bere jen text); formátování se nepřenáší. Tělo jako dokument Tiptap (`body_json`) se z textu odvozuje jen kvůli přesunu do knihovny.
- Náhled obchodu a zakázky předpokládá, že moduly přispívají `emailVars`; bez příspěvku zůstanou jejich proměnné prázdné.
- Gmail se otevře ve výchozím přihlášeném účtu prohlížeče.

## Odkazy na kód a testy

<!-- Hlavní místa v kódu a testy, které chování zajišťují, ve tvaru `cesta/soubor.ts#symbol`. -->

- `packages/modules/sablony-emailu/src/entities.ts#emailTemplateEntity` – entita a odvození těla z textu
- `packages/modules/sablony-emailu/src/service.ts#renderTemplate` – e-mail ze šablony; `#markUsed`, `#logActivity`, `#saveContent`, `#emailTemplatesService`
- `packages/modules/sablony-emailu/src/context.ts#resolveContext` – data pro proměnné, adresát; `#buildCatalog`
- `packages/modules/sablony-emailu/src/logic.ts#gmailComposeUrl` – odkaz do Gmailu; `#composeLinks`, `#buildPreview`
- `packages/modules/sablony-emailu/src/logic.test.ts`, `tests/sablony-emailu.int.test.ts`, `apps/web/e2e/sablony-emailu.spec.ts`
