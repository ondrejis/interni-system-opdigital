# Exporty a importy

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit, route handlery v `apps/web/src/app`, příkazy modulů a konstanty exportu v `@rebar/core/export`). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

## Export seznamů do souboru (XLSX, CSV)

Tlačítko Export v každém seznamu entity volá `/api/export/[entity]` (`POST`). Exportuje se celá filtrovaná sada podle viditelných sloupců, nejvýše 50 000 řádků. Sloupce bez oprávnění ke čtení se nevyexportují. Zdroj: `apps/web/src/app/api/export/[entity]/route.ts`.

| Entita | Modul | Oprávnění k exportu |
| --- | --- | --- |
| `company` | kontakty | `kontakty.export` |
| `person` | kontakty | `kontakty.export` |
| `job` | zakazky | `zakazky.export` |
| `job_template` | zakazky | chybí, stačí čtení `zakazky.read` |
| `deal` | obchody | `obchody.export` |
| `task` | ukoly | chybí, stačí čtení `ukoly.read` |
| `note` | ukoly | chybí, stačí čtení `ukoly.read` |
| `task_type` | ukoly | chybí, stačí čtení `ukoly.read` |
| `time_entry` | hodiny | chybí, stačí čtení `hodiny.read` |
| `payment` | finance | `finance.export` |
| `settlement` | finance | `finance.export` |
| `ad_account` | reklama | chybí, stačí čtení `reklama.read` |
| `ad_campaign` | reklama | chybí, stačí čtení `reklama.read` |
| `email_template` | sablony-emailu | chybí, stačí čtení `sablony-emailu.read` |
| `recurring_service` | muj-prostor | `muj-prostor.hosting` |
| `web_domain` | muj-prostor | `muj-prostor.domains` |
| `email_library_item` | muj-prostor | `muj-prostor.email_library` |
| `recurring_invoice` | muj-prostor | chybí, stačí čtení `muj-prostor.recurring_invoices` |

## Další výstupy (PDF, kalendářové kanály, tisk)

Route handlery, jejichž adresa napovídá export, PDF, kanál nebo tisk (výběr podle názvu adresy):

| Adresa | Metody | Soubor | Popis |
| --- | --- | --- | --- |
| `/api/dashboards/export` | `POST` | `apps/web/src/app/api/dashboards/export/route.ts` | Export z nástěnky: data jednoho widgetu do CSV / XLSX nebo snímek celé nástěnky do PDF. Obsah se vždy počítá znovu s oprávněními přihlášeného, takže export neobsahuje nic, co by uživatel na nástěnce neviděl. |
| `/api/export/[entity]` | `POST` | `apps/web/src/app/api/export/[entity]/route.ts` | Export seznamu entity (CSV, XLSX, PDF). Malý export se vrací rovnou jako stream, velký (nad limitem klienta) nebo vyžádaný na pozadí se zařadí do fronty (odpověď 202 s číslem exportu) a hotový soubor čeká v „Moje exporty“. Oprávnění (čtení či `permissions.export` entity, skryté atributy, rozsah „jen moje“) hlídá datová vrstva. |
| `/api/exports/[id]/file` | `GET` | `apps/web/src/app/api/exports/[id]/file/route.ts` | Hotový export z „Moje exporty“ ke stažení. Jen jeho autor, jen do uplynutí doby uchování. |

## Příjem dat zvenčí (import, veřejný formulář, nahrání souborů)

Route handlery a příkazy, jejichž název napovídá import, příjem poptávky, nahrávání nebo synchronizaci (výběr podle názvu):

| Adresa | Metody | Soubor | Popis |
| --- | --- | --- | --- |
| `/api/invitations/accept` | `POST` | `apps/web/src/app/api/invitations/accept/route.ts` | Přijetí pozvánky (bez přihlášení): jméno a heslo. Omezeno na 10 pokusů za 10 minut z jedné adresy. |

| Příkaz | Popis |
| --- | --- |
| `kalendar.sync` |  |
| `reklama.sync` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |

## Příkazy související s exportem nebo odesláním dokladů

| Příkaz | Popis |
| --- | --- |
| `reklama.metrics` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| `sablony-emailu.logActivity` | Zapíše e-mail jako hotovou aktivitu (typ e-mail) přes službu úkolů (SAB-04); oprávnění ověří služba. |
| `sablony-emailu.markUsed` | Započítá použití šablony (otevření v Gmailu nebo kopie); vrací, zda jde nabídnout zápis aktivity (SAB-04). |
| `sablony-emailu.pick` | Hledání kontaktů, organizací, obchodů a zakázek, kterými se náhled vyplní. |
| `sablony-emailu.preview` | Náhled rozepsané šablony s daty vybraných záznamů (editor, SAB-02). |
| `sablony-emailu.render` | E-mail ze šablony pro kontakt, organizaci, obchod nebo zakázku (SAB-03): vyplněný předmět a text, adresát a adresa pro Gmail (`gmailUrl`; `null` + `tooLong` při překročení limitu délky, R-46). Nic se neodesílá (SAB-05). |
| `sablony-emailu.saveContent` | Uloží předmět a text šablony z editoru. |
| `sablony-emailu.templates` | Šablony pro výběr v dialogu „E-mail ze šablony“ (nejpoužívanější první; SAB-01). |
| `sablony-emailu.variables` | Katalog proměnných šablon (příspěvky zapnutých modulů + výchozí) pro editor a nápovědu. |
