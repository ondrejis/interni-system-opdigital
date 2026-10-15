# Kontakty

> Vyprávěcí dokumentace modulu `kontakty`. Přesné seznamy (pole entit, oprávnění, příkazy a jejich vstupy, tabulky, úlohy, trasy) se tu **neopisují**: jsou v referenci, která vzniká z kódu a nezastará. Tady je to, co z kódu vyčíst nejde: jak věci fungují za sebou, proč jsou tak, jak jsou, a kde jsou hrany.

Referenční stránky vzniklé z kódu: [modul](../reference/moduly/kontakty.md), [entity](../reference/entity/kontakty.md), [databáze](../reference/databaze/kontakty.md).

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

- **Popis z manifestu:** Organizace (klient je organizace se stavem klienta) a kontaktní osoby: více telefonů a e-mailů, doplnění z ARES, kontrola duplicit a jejich sloučení.
- **Závisí na:** žádném modulu
- **Entity:** [`company`](../reference/entity/kontakty.md#company), [`person`](../reference/entity/kontakty.md#person)
- **Příkazy:** [13 příkazů](../reference/prikazy/kontakty.md)
- **Referenční stránky:** [modul](../reference/moduly/kontakty.md), [entity](../reference/entity/kontakty.md), [příkazy](../reference/prikazy/kontakty.md), [databáze](../reference/databaze/kontakty.md)

**Oprávnění a jejich výchozí přidělení rolím:**

| Oprávnění         | Název                           | Výchozí: owner |
| ----------------- | ------------------------------- | -------------- |
| `kontakty.read`   | Vidí organizace a kontakty      | vše            |
| `kontakty.create` | Zakládá organizace a kontakty   | vše            |
| `kontakty.write`  | Upravuje organizace a kontakty  | vše            |
| `kontakty.delete` | Maže organizace a kontakty      | vše            |
| `kontakty.export` | Exportuje organizace a kontakty | vše            |
| `kontakty.merge`  | Slučuje duplicitní kontakty     | vše            |
| `kontakty.ares`   | Doplňuje údaje z ARES           | vše            |

<!-- docs:generated:end -->

## Účel

Modul vede adresář všech organizací a lidí, se kterými agentura jedná (ORG, KON). Klient je organizace se `client_status`, ne samostatná entita; stav klienta, kartu a příkazy k němu dělá modul `klienti`, tady jsou jen sloupce. Modul hlídá kvalitu dat: stejné IČO nedovolí, podobné názvy, domény webu, e-maily a telefony hlásí jako duplicity a umí je sloučit. Nepatří sem zakázky, obchody ani úkoly (jen se při sloučení přepojí).

## Kdo to používá (role)

Vlastník (Ondřej) smí vše včetně sloučení (`kontakty.merge`). Partner (Patrik) čte, zakládá, upravuje a doplňuje z ARES, ale neslučuje, nemaže a neexportuje. Externí spolupracovník nemá nic, dokud mu ho vlastník nepřidělí; s rozsahem „jen moje“ vidí jen záznamy, kde je vlastníkem. Soukromé záznamy (zámek) Partner nikdy nevidí ani v hledání, duplicitách a příspěvcích.

## Hlavní toky krok za krokem

**Nová organizace** (`/kontakty/firmy/nova`, nebo generický dialog „Nový“): jen název stačí (ORG-02). Platné IČO (8 číslic, mod 11) spustí ARES; do 2 s se ukáže náhled změn (doplnění názvu, oficiálního názvu, DIČ, právní formy, sídla), uživatel zaškrtne, co chce, a potvrdí. Při výpadku ARES se zobrazí věta a organizaci jde vyplnit ručně; ukládání ARES nikdy nevolá. Před uložením proběhne kontrola duplicit.

**Aktualizovat z ARES** (akce na detailu): náhled bez cache, vybraná pole se zapíšou přes engine entity (oprávnění, historie) a uloží se `ares_synced_at`. Hodnoty se při zápisu načítají znovu na serveru, klient posílá jen výběr polí.

**Nový kontakt** (`/kontakty/osoby/novy`, `QuickContactDialog` z `@rebar/kontakty/ui` pro obchody a zakázky, karta organizace): jméno, organizace, pozice, víc telefonů a e-mailů se štítkem a hlavním. Shoda telefonu (E.164) nebo e-mailu s jinou osobou ukáže „Možná duplicita“: použít existující, nebo založit přesto.

**Kontaktní údaje**: zdroj pravdy je `person_contact_point` (`value_norm` = e-mail malými písmeny, telefon v E.164). Hlavní údaj od každého druhu se promítá do `person.primary_email/primary_phone` (seznam, hledání, rychlé volání). Úprava v poli seznamu přepíše hlavní údaj, nepřidá druhý.

**Sloučení** (akce „Sloučit duplicitu“, jen `kontakty.merge`): vybere se druhý záznam a hlavní (zůstává); náhled ukáže přepojení, doplnění a varování; sloučení vyžaduje zaškrtnutí potvrzení a je nevratné. Zdroj jde do koše, historie se zapíše k oběma záznamům.

## Stavy a přechody

Modul nemá vlastní stavový automat. Stav klienta (`lead` → `active` → `paused` → `former`) mění modul `klienti`; při sloučení organizací vyhrává aktivnější stav (aktivní, pozastavený, lead, bývalý) a nejstarší „klient od“.

## Pravidla a výpočty

- IČO: osm číslic (kratší se doplní nulami), unikátní mezi živými; kontrolní součet mod 11 se kontroluje jen v náhledu ARES, ne při ukládání (zahraniční a historická IČO). `kontakty/src/companies.ts#assertIcoFree`.
- Možná duplicita organizace: podobnost názvu trigramem > 0,6 po odstranění právních přípon, diakritiky a teček, nebo stejná doména webu (sdílené profily jako facebook.com se ignorují). `kontakty/src/duplicates.ts#checkCompanyDuplicates`.
- Duplicity osob: shoda `value_norm` kteréhokoli údaje; `777 123 456`, `+420777123456` a `00420 777 123 456` jsou totéž. Neplatné číslo se uloží co nejvěrněji (`normalizePhoneE164`), v UI se označí. `kontakty/src/normalize.ts#normalizePhoneE164`.
- ARES: adaptér `AresClient` (fetch s timeoutem 2 s, pevná adresa, bez přesměrování, strop odpovědi), cache 24 h v `ares_cache`, při výpadku starší odpověď s příznakem. Fake pro testy `createFakeAres`. `kontakty/src/ares/lookup.ts#lookupAres`.
- Sloučení: odkazy se hledají v katalogu databáze (cizí klíče a sloupce `company_id`/`person_id`, polymorfní `entity_type`+`entity_id`), takže se přepojí i data modulů, které ještě nejsou hotové. Zámek (`private_record`), historie a hledání se nepřepisují. `kontakty/src/merge.ts#planMerge`.

## Oprávnění

`kontakty.read/create/write/delete/export/merge/ares`. Příkaz `kontakty.ares` smí volat i uživatel s `obchody.write` nebo `zakazky.write` (náhled při zakládání obchodu). Funkce API (`@rebar/kontakty/api`) oprávnění `kontakty.*` nekontrolují, respektují ale zámek.

## Nastavení

Žádné vlastní. ARES je veřejné API bez klíče; panel „ARES“ v Nastavení → Integrace (slot `settings.integrations`, `AresIntegrationPanel`) ověří dostupnost a změří odpověď proti limitu 2 s.

## Události a upozornění

Žádná upozornění (rozhodnutí OPSYS). Doménové události katalog pro kontakty nezná; sloučení proto nic nevysílá a moduly s denormalizací (`deal.next_activity_at`) se po sloučení přepočítají při další změně úkolu.

## Exporty

Seznamy organizací a kontaktů exportuje jádro (`kontakty.export`).

## Integrace s jinými moduly

API: `findCompanyByIco`, `getPrimaryContact`, `findContactDuplicates`, `matchContactDuplicates`, `upsertContactFromLead`, `createCompanyQuick`, `createPersonQuick`, `searchContacts`. Příspěvky: karta klienta (`tabCounts.kontakty`, `summary.contacts`) a proměnné e-mailů (`jmeno`, `prijmeni`, `firma`, `email`, `telefon` pro `company` a `person`). UI pro ostatní: `QuickContactDialog`, `ContactLinks`, `CompanyPicker`. Systémové pole `person.last_activity_at` smí zapisovat modul Úkoly. Po vypnutí modulu mizí organizace i kontakty (ostatní moduly na něm závisí).

## Hrany a známá omezení

- Generický dialog „Nový“ v seznamech nezná ARES ani kontrolu duplicit podle názvu; k tomu slouží stránky „Nová organizace“ a „Nový kontakt“ (paleta Cmd+K). IČO a e-mail/telefon se ale hlídají vždy i v generické cestě.
- Počet otevřených obchodů v seznamu organizací (ORG-09) není: podle D je Organizace generický seznam, počty ukazuje `/klienti`.
- Právní formu mapuje jen známé kódy ARES; neznámý kód zůstane prázdný.
- Smazané kontaktní údaje a osoby zůstávají v DB (soft delete); sloučení nejde vrátit.

## Odkazy na kód a testy

- `packages/modules/kontakty/src/contract.ts#aresInput`, `#mergeApplyInput`
- `packages/modules/kontakty/src/api.ts#createCompanyQuick`
- `packages/modules/kontakty/src/commands.ts#aresCommand`
- `packages/modules/kontakty/src/points.ts#setPersonPoints`
- `packages/modules/kontakty/src/leads.ts#upsertContactFromLead`
- `packages/modules/kontakty/src/ares/diff.ts#buildAresDiff`
- Testy: `packages/modules/kontakty/src/normalize.test.ts`, `src/ares/ares.test.ts`, `src/points.test.ts`, `src/merge.test.ts`, `tests/kontakty.int.test.ts`, `apps/web/e2e/kontakty.spec.ts`.
