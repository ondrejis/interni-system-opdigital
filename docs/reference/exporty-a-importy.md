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
| `event` | kalendar | chybí, stačí čtení `kalendar.read` |
| `calendar_resource` | kalendar | chybí, stačí čtení `kalendar.read` |

## Další výstupy (PDF, kalendářové kanály, tisk)

Route handlery, jejichž adresa napovídá export, PDF, kanál nebo tisk (výběr podle názvu adresy):

| Adresa | Metody | Soubor | Popis |
| --- | --- | --- | --- |
| `/api/dashboards/export` | `POST` | `apps/web/src/app/api/dashboards/export/route.ts` | Export z nástěnky: data jednoho widgetu do CSV / XLSX nebo snímek celé nástěnky do PDF. Obsah se vždy počítá znovu s oprávněními přihlášeného, takže export neobsahuje nic, co by uživatel na nástěnce neviděl. |
| `/api/export/[entity]` | `POST` | `apps/web/src/app/api/export/[entity]/route.ts` | Export seznamu entity (CSV, XLSX, PDF). Malý export se vrací rovnou jako stream, velký (nad limitem klienta) nebo vyžádaný na pozadí se zařadí do fronty (odpověď 202 s číslem exportu) a hotový soubor čeká v „Moje exporty“. Oprávnění (čtení či `permissions.export` entity, skryté atributy, rozsah „jen moje“) hlídá datová vrstva. |
| `/api/exports/[id]/file` | `GET` | `apps/web/src/app/api/exports/[id]/file/route.ts` | Hotový export z „Moje exporty“ ke stažení. Jen jeho autor, jen do uplynutí doby uchování. |
| `/api/kalendar/feed/[token]` | `GET` | `apps/web/src/app/api/kalendar/feed/[token]/route.ts` | Odběr kalendáře (iCalendar) podle tajného tokenu v adrese, bez přihlášení: Google, Apple a Outlook nemají jak se přihlásit. V databázi je jen otisk tokenu; špatný token je stejně „nenalezeno“ jako neexistující modul. |

## Příjem dat zvenčí (import, veřejný formulář, nahrání souborů)

Route handlery a příkazy, jejichž název napovídá import, příjem poptávky, nahrávání nebo synchronizaci (výběr podle názvu):

| Adresa | Metody | Soubor | Popis |
| --- | --- | --- | --- |
| `/api/invitations/accept` | `POST` | `apps/web/src/app/api/invitations/accept/route.ts` | Přijetí pozvánky (bez přihlášení): jméno a heslo. Omezeno na 10 pokusů za 10 minut z jedné adresy. |

| Příkaz | Popis |
| --- | --- |
| `kalendar.import.add` |  |
| `kalendar.import.delete` |  |
| `kalendar.import.list` |  |
| `kalendar.import.sync` |  |

## Příkazy související s exportem nebo odesláním dokladů

| Příkaz | Popis |
| --- | --- |
| `kalendar.feed.regenerate` | Nový odkaz: starý přestane fungovat. Token se vrací jen tady, v databázi zůstává otisk. |
| `kalendar.feed.status` |  |
