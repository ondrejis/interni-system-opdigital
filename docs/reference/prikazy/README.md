# Serverové příkazy

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registry příkazů všech modulů). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Všechny příkazy modulů (29) s oprávněním; vstupní pole jsou v souboru modulu.

## Organizace a kontakty

Podrobně: [prikazy/kontakty.md](kontakty.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`kontakty.ares`](kontakty.md#kontaktyares) | `kontakty.ares` nebo `kontakty.write` nebo `obchody.write` nebo `zakazky.write` | Doplnění firmy z ARES podle IČO. Nikdy nevyhodí chybu kvůli síti: výsledek `ok: false` nese větu pro uživatele. Počet dotazů na uživatele je omezený (ochrana veřejného API i aplikace). |
| [`kontakty.duplicates`](kontakty.md#kontaktyduplicates) | `kontakty.read` | Kontrola duplicit podle IČO, e-mailu a telefonu (zakládání obchodů a rychlé zadání ukážou nalezené záznamy k výběru). |
| [`kontakty.merge.preview`](kontakty.md#kontaktymergepreview) | `kontakty.merge` | Náhled sloučení: co se přepojí a doplní. Nic nemění. |
| [`kontakty.merge.run`](kontakty.md#kontaktymergerun) | `kontakty.merge` | Sloučení duplicity: `sourceId` zanikne a všechno, co na něj odkazovalo, přejde na `targetId`. Nevratné z uživatelského rozhraní, proto vyžaduje výslovné `confirm: true`. |
| [`kontakty.person.points`](kontakty.md#kontaktypersonpoints) | `kontakty.read` | Další e-maily a telefony osoby s typem. |
| [`kontakty.person.setPoints`](kontakty.md#kontaktypersonsetpoints) | `kontakty.write` | Nahradí další e-maily a telefony osoby (hlavní údaje se mění v poli osoby). |
| [`kontakty.search`](kontakty.md#kontaktysearch) | `kontakty.read` | Hledání firem a osob pro výběr (rychlé zadání poptávky, účastníci zakázky, sloučení). |

## Zakázky

Podrobně: [prikazy/zakazky.md](zakazky.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`zakazky.phase.preview`](zakazky.md#zakazkyphasepreview) | `zakazky.read` | Pro každou možnou další fázi: jde přechod, a když ne, které kontroly nejsou splněné. |
| [`zakazky.team.add`](zakazky.md#zakazkyteamadd) | `zakazky.write` |  |
| [`zakazky.team.list`](zakazky.md#zakazkyteamlist) | přihlášení |  |
| [`zakazky.team.remove`](zakazky.md#zakazkyteamremove) | `zakazky.write` |  |
| [`zakazky.template.apply`](zakazky.md#zakazkytemplateapply) | `zakazky.write` |  |
| [`zakazky.template.createFromJob`](zakazky.md#zakazkytemplatecreatefromjob) | `zakazky.write` | Vytvoří šablonu z existující zakázky (nebo přepíše šablonu `replaceId`). |
| [`zakazky.template.delete`](zakazky.md#zakazkytemplatedelete) | `zakazky.write` |  |
| [`zakazky.template.get`](zakazky.md#zakazkytemplateget) | `zakazky.read` |  |
| [`zakazky.template.list`](zakazky.md#zakazkytemplatelist) | `zakazky.read` |  |
| [`zakazky.template.save`](zakazky.md#zakazkytemplatesave) | `zakazky.write` |  |
| [`zakazky.transition`](zakazky.md#zakazkytransition) | `zakazky.write` | Přechod zakázky do fáze. Je to jen pohodlný vstup do téže cesty jako změna stavu v tabulce nebo na kanbanu: vybere stav fáze (první, nebo zadaný) a změní ho přes entitu, takže platí stejné kontroly a hooky. |

## Kalendář

Podrobně: [prikazy/kalendar.md](kalendar.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`kalendar.event.delete`](kalendar.md#kalendareventdelete) | `kalendar.write` |  |
| [`kalendar.event.get`](kalendar.md#kalendareventget) | `kalendar.read` |  |
| [`kalendar.event.save`](kalendar.md#kalendareventsave) | `kalendar.write` |  |
| [`kalendar.feed.regenerate`](kalendar.md#kalendarfeedregenerate) | `kalendar.read` | Nový odkaz: starý přestane fungovat. Token se vrací jen tady, v databázi zůstává otisk. |
| [`kalendar.feed.status`](kalendar.md#kalendarfeedstatus) | `kalendar.read` |  |
| [`kalendar.import.add`](kalendar.md#kalendarimportadd) | `kalendar.read` |  |
| [`kalendar.import.delete`](kalendar.md#kalendarimportdelete) | `kalendar.read` |  |
| [`kalendar.import.list`](kalendar.md#kalendarimportlist) | `kalendar.read` |  |
| [`kalendar.import.sync`](kalendar.md#kalendarimportsync) | `kalendar.read` |  |
| [`kalendar.options`](kalendar.md#kalendaroptions) | `kalendar.read` |  |
| [`kalendar.range`](kalendar.md#kalendarrange) | `kalendar.read` |  |
