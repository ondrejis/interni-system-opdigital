# Serverové příkazy

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registry příkazů všech modulů). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Všechny příkazy modulů (91) s oprávněním; vstupní pole jsou v souboru modulu.

## Kontakty

Podrobně: [prikazy/kontakty.md](kontakty.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`kontakty.ares`](kontakty.md#kontaktyares) | `kontakty.write` nebo `poptavky.write` nebo `zakazky.write` | Doplnění firmy z ARES podle IČO. Nikdy nevyhodí chybu kvůli síti: výsledek `ok: false` nese větu pro uživatele. Počet dotazů na uživatele je omezený (ochrana veřejného API i aplikace). |
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

## CRM

Podrobně: [prikazy/poptavky.md](poptavky.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`poptavky.convert`](poptavky.md#poptavkyconvert) | `poptavky.convert` | Kvalifikace poptávky (příkaz zůstal pod původním jménem `poptavky.convert` kvůli kompatibilitě): jedním krokem určí firmu a kontaktní osobu (vybranou, existující podle IČO, e-mailu a telefonu, nebo novou), založí zakázku (číslo ze série) v prvním stavu fáze poptávka a poptávku označí jako kvalifikovanou (stav typu „vyhráno“). Volitelně přijme data první aktivity. Vše v jedné transakci. Vyžaduje zapnutý modul zakázek. |
| [`poptavky.createIntakeKey`](poptavky.md#poptavkycreateintakekey) | `poptavky.intake` |  |
| [`poptavky.intakeKeys`](poptavky.md#poptavkyintakekeys) | `poptavky.intake` |  |
| [`poptavky.markLost`](poptavky.md#poptavkymarklost) | `poptavky.write` | Prohra: stav „prohráno“ a důvod z číselníku. Důvod je povinný (hlídá to i entita). |
| [`poptavky.revokeIntakeKey`](poptavky.md#poptavkyrevokeintakekey) | `poptavky.intake` |  |

## Docházka

Podrobně: [prikazy/dochazka.md](dochazka.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`dochazka.approvals`](dochazka.md#dochazkaapprovals) | `dochazka.approve` |  |
| [`dochazka.clock.break`](dochazka.md#dochazkaclockbreak) | `dochazka.own` |  |
| [`dochazka.clock.in`](dochazka.md#dochazkaclockin) | `dochazka.own` |  |
| [`dochazka.clock.out`](dochazka.md#dochazkaclockout) | `dochazka.own` |  |
| [`dochazka.clock.status`](dochazka.md#dochazkaclockstatus) | přihlášení |  |
| [`dochazka.delete`](dochazka.md#dochazkadelete) | přihlášení |  |
| [`dochazka.lockMonth`](dochazka.md#dochazkalockmonth) | `dochazka.close_month` |  |
| [`dochazka.month`](dochazka.md#dochazkamonth) | přihlášení |  |
| [`dochazka.report`](dochazka.md#dochazkareport) | přihlášení |  |
| [`dochazka.reviewWeek`](dochazka.md#dochazkareviewweek) | `dochazka.approve` |  |
| [`dochazka.save`](dochazka.md#dochazkasave) | přihlášení |  |
| [`dochazka.settings.get`](dochazka.md#dochazkasettingsget) | `settings.manage` |  |
| [`dochazka.settings.save`](dochazka.md#dochazkasettingssave) | `settings.manage` |  |
| [`dochazka.submitWeek`](dochazka.md#dochazkasubmitweek) | přihlášení |  |
| [`dochazka.week`](dochazka.md#dochazkaweek) | přihlášení |  |
| [`dochazka.withdrawWeek`](dochazka.md#dochazkawithdrawweek) | přihlášení |  |

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

## Platforma (jádro)

Podrobně: [prikazy/jadro.md](jadro.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`crm.activity.complete`](jadro.md#crmactivitycomplete) | `poptavky.write` |  |
| [`crm.activity.create`](jadro.md#crmactivitycreate) | `poptavky.write` |  |
| [`crm.activity.delete`](jadro.md#crmactivitydelete) | `poptavky.write` |  |
| [`crm.activity.get`](jadro.md#crmactivityget) | `poptavky.read` |  |
| [`crm.activity.listForDeal`](jadro.md#crmactivitylistfordeal) | `poptavky.read` |  |
| [`crm.activity.listMine`](jadro.md#crmactivitylistmine) | `poptavky.read` |  |
| [`crm.activity.listUpcoming`](jadro.md#crmactivitylistupcoming) | `poptavky.read` |  |
| [`crm.activity.reopen`](jadro.md#crmactivityreopen) | `poptavky.write` |  |
| [`crm.activity.snooze`](jadro.md#crmactivitysnooze) | `poptavky.write` |  |
| [`crm.activity.types`](jadro.md#crmactivitytypes) | `poptavky.read` |  |
| [`crm.activity.update`](jadro.md#crmactivityupdate) | `poptavky.write` |  |
| [`crm.archive.list`](jadro.md#crmarchivelist) | `zakazky.read` | Archiv obchodů (`crm.archive.list`): archivované a uzavřené (prohrané s důvodem ztráty, vyhrané) zakázky v rozsahu aktéra, od nejnovějších. Vstup: `owner` (`all`, `me`, id), `scope` (`closed` = archivované a prohrané, `archived`, `lost`, `won`, `all`), `q` (hledání v názvu a čísle), `limit` a `offset`. Znovuotevření a vrácení z archivu dělají příkazy `crm.deal.reopen` a `crm.deal.unarchive`. |
| [`crm.contact.overview`](jadro.md#crmcontactoverview) | `kontakty.read` | Přehled obchodu u firmy nebo osoby: zakázky s fází a stavem (pro mini pás stavů), souhrn otevřených a vyhraných obchodů, kontaktní osoby, související firmy a (u osoby) účasti na zakázkách. Částky vidí jen, kdo má `zakazky.finance`; zakázky se řídí oprávněním `zakazky.read` (rozsah „jen moje“ platí). |
| [`crm.deal.archive`](jadro.md#crmdealarchive) | `zakazky.write` |  |
| [`crm.deal.history`](jadro.md#crmdealhistory) | `zakazky.read` | Historie stavů zakázky (pás fází: dny ve stavu) a číselník důvodů prohry pro dialog prohry. |
| [`crm.deal.lose`](jadro.md#crmdeallose) | `zakazky.write` |  |
| [`crm.deal.lostReasons`](jadro.md#crmdeallostreasons) | `zakazky.read` |  |
| [`crm.deal.moveCheck`](jadro.md#crmdealmovecheck) | `zakazky.read` | Co brání přesunu zakázky do stavu (nebo výhře či prohře): věty a pole, které stačí vyplnit. Nic nezapisuje. |
| [`crm.deal.quickAdd`](jadro.md#crmdealquickadd) | `zakazky.write` | Rychlé zadání poptávky: jedním příkazem a v jedné transakci založí (nebo vybere) firmu a osobu s kontrolou duplicit (IČO, e-mail, telefon), zakázku ve zvoleném stavu fáze Poptávka a první aktivitu. Selže-li cokoli (duplicita, chybějící oprávnění ke kontaktům, stav mimo obchodní fáze, aktivita), nevznikne nic. První aktivita je povinná, ledaže volající výslovně potvrdí `skipFirstActivity` (UI „Uložit bez aktivity“). |
| [`crm.deal.reopen`](jadro.md#crmdealreopen) | `zakazky.write` |  |
| [`crm.deal.unarchive`](jadro.md#crmdealunarchive) | `zakazky.write` |  |
| [`crm.deal.win`](jadro.md#crmdealwin) | `zakazky.write` |  |
| [`crm.fieldRules.get`](jadro.md#crmfieldrulesget) | `zakazky.read` | Pravidla s popisky a katalog polí, na která jde pravidlo navázat (pro správu v nastavení). |
| [`crm.fieldRules.set`](jadro.md#crmfieldrulesset) | `settings.manage` |  |
| [`crm.follower.follow`](jadro.md#crmfollowerfollow) | `zakazky.read` | Začne sledovat zakázku (sebe, nebo jiného uživatele, když smím zakázku upravovat). |
| [`crm.follower.list`](jadro.md#crmfollowerlist) | `zakazky.read` | Sledující zakázky a zda ji sleduji já. |
| [`crm.follower.unfollow`](jadro.md#crmfollowerunfollow) | `zakazky.read` | Přestane sledovat zakázku (sebe, nebo jiného uživatele, když smím zakázku upravovat). |
| [`crm.forecast`](jadro.md#crmforecast) | `zakazky.read` | Prognóza obchodů po měsících (`crm.forecast`). Agregace běží na serveru nad zakázkami v rozsahu aktéra (oprávnění ke čtení, rozsah „jen moje“); částky a váženou hodnotu dostane jen ten, kdo má `zakazky.finance`, jinak jsou `null` a sečtou se jen počty. Nearchivované otevřené obchody (poptávka, nabídka) padají do měsíců podle předpokládaného uzavření, vyhrané podle data výhry. Vstup: `owner` (`all`, `me`, id uživatele), `from` (první měsíc `YYYY-MM`, výchozí aktuální) a `months` (1 až 12, výchozí 4). |
| [`crm.inbox.import`](jadro.md#crminboximport) | `poptavky.write` | Import poptávek z CSV (soubor čte a mapuje prohlížeč, server přijme řádky po sloupcích). Každý řádek se zkontroluje zvlášť: nesprávný tvar e-mailu, telefonu nebo částky, duplicita v souboru i v systému (existující poptávka se stejným e-mailem nebo telefonem). Platné řádky se zapíšou, vadné se vrátí s větou a číslem řádku; jeden špatný řádek ostatní nezastaví. Poznámka k existujícím kontaktům (firma či osoba se stejným e-mailem) doprovází výsledek jako upozornění. `dryRun` vrátí totéž bez zápisu (náhled před importem). |
| [`crm.inbox.options`](jadro.md#crminboxoptions) | `poptavky.read` nebo `zakazky.read` nebo `zakazky.write` | Číselníky a nabídky pro dialogy schránky a rychlého zadání v jednom dotazu: typy aktivit, zdroje, důvody zamítnutí, typy firem, typy zakázek (vlastní pole) a obchodní stavy nástěnky. |
| [`crm.inbox.qualifyPreview`](jadro.md#crminboxqualifypreview) | `poptavky.convert` | Údaje poptávky a nalezené duplicity pro dialog „Kvalifikovat“ (firma/osoba z poptávky, IČO k doplnění). |
| [`crm.note.create`](jadro.md#crmnotecreate) | `poptavky.write` |  |
| [`crm.note.delete`](jadro.md#crmnotedelete) | `poptavky.write` |  |
| [`crm.note.pin`](jadro.md#crmnotepin) | `poptavky.write` |  |
| [`crm.note.update`](jadro.md#crmnoteupdate) | `poptavky.write` |  |
| [`crm.participant.add`](jadro.md#crmparticipantadd) | `zakazky.write` |  |
| [`crm.participant.list`](jadro.md#crmparticipantlist) | `zakazky.read` | Účastníci zakázky (osoba + role) s kontaktními údaji (ty jen s oprávněním ke kontaktům). |
| [`crm.participant.remove`](jadro.md#crmparticipantremove) | `zakazky.write` |  |
| [`crm.participant.update`](jadro.md#crmparticipantupdate) | `zakazky.write` |  |
| [`crm.timeline.get`](jadro.md#crmtimelineget) | `poptavky.read` |  |
| [`crm.today`](jadro.md#crmtoday) | `poptavky.read` | Data stránky „Moje dnešní práce“ (`crm.today`): (b) moje otevřené obchody bez další aktivity (zhnilé a nejdéle ve stavu první), (c) nové poptávky ve schránce (nejdéle čekající první). Dnešní a zpožděné aktivity bere stránka z komponenty `ActivityList`. Obchody a poptávky se čtou v rozsahu aktéra; cena nabídky jen s `zakazky.finance`. |
