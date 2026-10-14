# Exporty a importy

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit, route handlery v `apps/web/src/app`, příkazy modulů a konstanty exportu v `@rebar/core/export`). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

## Export seznamů do souboru (XLSX, CSV)

Tlačítko Export v každém seznamu entity volá `/api/export/[entity]` (`POST`). Exportuje se celá filtrovaná sada podle viditelných sloupců, nejvýše 50 000 řádků. Sloupce bez oprávnění ke čtení se nevyexportují. Zdroj: `apps/web/src/app/api/export/[entity]/route.ts`.

| Entita | Modul | Oprávnění k exportu |
| --- | --- | --- |
| `company` | kontakty | chybí, stačí čtení `kontakty.read` |
| `person` | kontakty | chybí, stačí čtení `kontakty.read` |
| `job` | zakazky | chybí, stačí čtení `zakazky.read` |
| `job_order` | zakazky | chybí, stačí čtení `zakazky.economics` |
| `inquiry` | poptavky | chybí, stačí čtení `poptavky.read` |
| `crm_activity` | poptavky | chybí, stačí čtení `poptavky.read` |
| `crm_note` | poptavky | chybí, stačí čtení `poptavky.read` |
| `crm_activity_type` | poptavky | chybí, stačí čtení `poptavky.read` |
| `defect` | realizace | chybí, stačí čtení `realizace.read` |
| `invoice` | fakturace | `fakturace.export` |
| `received_invoice` | fakturace | `fakturace.export` |
| `time_entry` | dochazka | chybí, stačí čtení `dochazka.read` |
| `stock_item` | sklad | chybí, stačí čtení `sklad.read` |
| `warehouse` | sklad | chybí, stačí čtení `sklad.read` |
| `stock_doc` | sklad | chybí, stačí čtení `sklad.read` |
| `purchase_order` | sklad | chybí, stačí čtení `sklad.read` |
| `stock_count` | sklad | chybí, stačí čtení `sklad.read` |
| `asset` | stroje | chybí, stačí čtení `stroje.read` |
| `asset_defect` | stroje | chybí, stačí čtení `stroje.read` |
| `event` | kalendar | chybí, stačí čtení `kalendar.read` |
| `calendar_resource` | kalendar | chybí, stačí čtení `kalendar.read` |

## Další výstupy (PDF, kalendářové kanály, tisk)

Route handlery, jejichž adresa napovídá export, PDF, kanál nebo tisk (výběr podle názvu adresy):

| Adresa | Metody | Soubor | Popis |
| --- | --- | --- | --- |
| `/api/dashboards/export` | `POST` | `apps/web/src/app/api/dashboards/export/route.ts` | Export z nástěnky: data jednoho widgetu do CSV / XLSX nebo snímek celé nástěnky do PDF. Obsah se vždy počítá znovu s oprávněními přihlášeného, takže export neobsahuje nic, co by uživatel na nástěnce neviděl. |
| `/api/export/[entity]` | `POST` | `apps/web/src/app/api/export/[entity]/route.ts` | Export seznamu entity (CSV, XLSX, PDF). Malý export se vrací rovnou jako stream, velký (nad limitem klienta) nebo vyžádaný na pozadí se zařadí do fronty (odpověď 202 s číslem exportu) a hotový soubor čeká v „Moje exporty“. Oprávnění (čtení či `permissions.export` entity, skryté atributy, rozsah „jen moje“) hlídá datová vrstva. |
| `/api/exports/[id]/file` | `GET` | `apps/web/src/app/api/exports/[id]/file/route.ts` | Hotový export z „Moje exporty“ ke stažení. Jen jeho autor, jen do uplynutí doby uchování. |
| `/api/fakturace/[id]/pdf` | `GET` | `apps/web/src/app/api/fakturace/[id]/pdf/route.ts` | PDF faktury. Oprávnění ke čtení záznamu se ověřuje při každém stažení; vystavený doklad se tiskne z uložených údajů. |
| `/api/fakturace/export` | `POST` | `apps/web/src/app/api/fakturace/export/route.ts` | Balík pro účetní za období: ZIP s PDF vydaných faktur, skeny přijatých faktur a souhrnem (XLSX/CSV), volitelně s ISDOC a podklady DPH. Oprávnění `fakturace.export` a viditelnost dokladů se ověřují při každém stažení; ZIP se posílá jako stream. |
| `/api/kalendar/feed/[token]` | `GET` | `apps/web/src/app/api/kalendar/feed/[token]/route.ts` | Odběr kalendáře (iCalendar) podle tajného tokenu v adrese, bez přihlášení: Google, Apple a Outlook nemají jak se přihlásit. V databázi je jen otisk tokenu; špatný token je stejně „nenalezeno“ jako neexistující modul. |
| `/api/zakazky/[id]/nabidka/pdf` | `GET` | `apps/web/src/app/api/zakazky/[id]/nabidka/pdf/route.ts` | PDF nabídky zakázky (jen prodejní ceny, ne náklady ani marže). Přístup k zakázce a oprávnění k ekonomice se ověřují při každém stažení. `?version=` vybere revizi nabídky, `?download` vynutí stažení. |

## Příjem dat zvenčí (import, veřejný formulář, nahrání souborů)

Route handlery a příkazy, jejichž název napovídá import, příjem poptávky, nahrávání nebo synchronizaci (výběr podle názvu):

| Adresa | Metody | Soubor | Popis |
| --- | --- | --- | --- |
| `/api/intake/poptavky` | `POST` | `apps/web/src/app/api/intake/poptavky/route.ts` | Přečte tělo požadavku nejvýš do `max` bajtů; delší tělo se zahodí (`null`), aniž by se načetlo celé do paměti. |
| `/api/invitations/accept` | `POST` | `apps/web/src/app/api/invitations/accept/route.ts` | Přijetí pozvánky (bez přihlášení): jméno a heslo. Omezeno na 10 pokusů za 10 minut z jedné adresy. |

| Příkaz | Popis |
| --- | --- |
| `kalendar.import.add` |  |
| `kalendar.import.delete` |  |
| `kalendar.import.list` |  |
| `kalendar.import.sync` |  |
| `poptavky.createIntakeKey` |  |
| `poptavky.intakeKeys` |  |
| `poptavky.revokeIntakeKey` |  |

## Příkazy související s exportem nebo odesláním dokladů

| Příkaz | Popis |
| --- | --- |
| `fakturace.export` |  |
| `fakturace.exportAdapters` |  |
| `fakturace.mail.bulk` |  |
| `fakturace.mail.bulkPreview` |  |
| `fakturace.mail.list` |  |
| `fakturace.mail.prepare` |  |
| `fakturace.mail.send` |  |
| `kalendar.feed.regenerate` | Nový odkaz: starý přestane fungovat. Token se vrací jen tady, v databázi zůstává otisk. |
| `kalendar.feed.status` |  |
