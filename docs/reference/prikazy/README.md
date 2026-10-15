# Serverové příkazy

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registry příkazů všech modulů). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Všechny příkazy modulů (204) s oprávněním; vstupní pole jsou v souboru modulu.

## Organizace a kontakty

Podrobně: [prikazy/kontakty.md](kontakty.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`kontakty.ares`](kontakty.md#kontaktyares) | `kontakty.ares` nebo `kontakty.write` nebo `obchody.write` nebo `zakazky.write` | Doplnění organizace z ARES podle IČO (ORG-03, ORG-04). Bez `apply` vrací náhled změn (do 2 s, cache 24 h); s `apply: true` a `companyId` zapíše vybraná pole a čas synchronizace. Nikdy nevyhodí chybu kvůli síti: `ok: false` nese větu pro uživatele a organizaci jde uložit ručně. |
| [`kontakty.ares.test`](kontakty.md#kontaktyarestest) | `kontakty.ares` | Test ARES pro Nastavení → Integrace: zkusí stáhnout zkušební subjekt (bez cache) a změří dobu odpovědi proti limitu 2 s (NFR-04). Nic neukládá. |
| [`kontakty.company.checkDuplicates`](kontakty.md#kontaktycompanycheckduplicates) | `kontakty.read` | Kontrola duplicit organizace: stejné IČO (nejde uložit), podobný název nebo doména webu („Možná duplicita“). |
| [`kontakty.company.contacts`](kontakty.md#kontaktycompanycontacts) | `kontakty.read` | Kontakty organizace (hlavní i další) s hlavním telefonem a e-mailem pro kartu a záložku. |
| [`kontakty.merge.apply`](kontakty.md#kontaktymergeapply) | `kontakty.merge` | Sloučení duplicity (jen vlastník): `sourceId` zanikne a všechno, co na něj odkazovalo, přejde na `targetId` (hlavní záznam). Nevratné z rozhraní, proto vyžaduje výslovné `confirm: true`. |
| [`kontakty.merge.preview`](kontakty.md#kontaktymergepreview) | `kontakty.merge` | Náhled sloučení: co se přepojí a doplní. Nic nemění. |
| [`kontakty.person.checkDuplicates`](kontakty.md#kontaktypersoncheckduplicates) | `kontakty.read` | Kontrola duplicit osoby podle e-mailu a telefonu (E.164, nezávisle na mezerách a předvolbě). |
| [`kontakty.person.companies`](kontakty.md#kontaktypersoncompanies) | `kontakty.read` | Organizace osoby: hlavní a další s rolí. |
| [`kontakty.person.points`](kontakty.md#kontaktypersonpoints) | `kontakty.read` | Kontaktní údaje osoby (e-maily a telefony se štítkem a hlavním). |
| [`kontakty.person.quickCreate`](kontakty.md#kontaktypersonquickcreate) | `kontakty.create` | Rychlé založení kontaktu (z organizace, obchodu, zakázky, palety): jméno, volitelně organizace, pozice a více e-mailů a telefonů. Při shodě e-mailu nebo telefonu s existující osobou nic nezaloží a vrátí shody; `force: true` založí i přesto (člověk se rozhodl). |
| [`kontakty.person.setCompanies`](kontakty.md#kontaktypersonsetcompanies) | `kontakty.write` | Nastaví hlavní organizaci osoby a nahradí její další organizace s rolí. |
| [`kontakty.person.setPoints`](kontakty.md#kontaktypersonsetpoints) | `kontakty.write` | Nahradí kontaktní údaje osoby (hlavní jsou právě jeden e-mail a jeden telefon). |
| [`kontakty.search`](kontakty.md#kontaktysearch) | `kontakty.read` | Hledání organizací a osob pro výběr (rychlé zadání obchodu, účastníci zakázky, sloučení, šablony e-mailů): podle jména bez diakritiky, IČO, e-mailu a části telefonu bez předvolby. |

## Klienti

Podrobně: [prikazy/klienti.md](klienti.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`klienti.list`](klienti.md#klientilist) | `klienti.read` | Seznam klientů (KLI-03): výchozí lead, aktivní a pozastavení; sloupce z příspěvků modulů. |
| [`klienti.saveContext`](klienti.md#klientisavecontext) | `klienti.write` | Uloží pole kontextu klienta (KLI-06; autosave po jednom poli). |
| [`klienti.setServices`](klienti.md#klientisetservices) | `klienti.write` | Úplný seznam služeb klienta. |
| [`klienti.setStatus`](klienti.md#klientisetstatus) | `klienti.write` | Změna stavu klienta (KLI-02): Bývalý vyžaduje důvod, „klient od“ se uloží při prvním přechodu na Aktivní. |
| [`klienti.summary`](klienti.md#klientisummary) | `klienti.read` | Souhrn karty klienta (KLI-05, KLI-10). |
| [`klienti.tabCounts`](klienti.md#klientitabcounts) | `klienti.read` | Počty záložek karty a záložky bez dat (KLI-07, ORG-08). |

## Google Disk

Podrobně: [prikazy/disk.md](disk.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`disk.enabled.set`](disk.md#diskenabledset) | `disk.manage` | Zapne nebo vypne zakládání složek. |
| [`disk.folderState`](disk.md#diskfolderstate) | `disk.read` | Stav složky klienta nebo zakázky pro tlačítko „Otevřít Disk“ (DRV-05). |
| [`disk.requestFolder`](disk.md#diskrequestfolder) | `disk.write` | Ruční „Vytvořit složku“; u soukromého záznamu až s potvrzeným varováním (`force`). |
| [`disk.retry`](disk.md#diskretry) | `disk.write` | „Zkusit znovu“ po chybě nebo po 10 minutách bez odpovědi n8n. |
| [`disk.status`](disk.md#diskstatus) | `disk.manage` | Stav napojení na n8n a poslední požadavky (Nastavení → Google Disk). |
| [`disk.structure.get`](disk.md#diskstructureget) | `disk.manage` | Strom složek z Nastavení a zda je zakládání zapnuté. |
| [`disk.structure.set`](disk.md#diskstructureset) | `disk.manage` | Uloží strom složek; platí jen pro nově zakládané složky (už založené se nemění). |
| [`disk.test`](disk.md#disktest) | `disk.manage` | Test napojení: kontroly nastavení a posledních výsledků (nic nezakládá). |

## Zakázky

Podrobně: [prikazy/zakazky.md](zakazky.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`zakazky.board`](zakazky.md#zakazkyboard) | `zakazky.read` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.client.setFormer`](zakazky.md#zakazkyclientsetformer) | `zakazky.write` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.complete`](zakazky.md#zakazkycomplete) | `zakazky.write` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.complete.preview`](zakazky.md#zakazkycompletepreview) | `zakazky.read` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.create`](zakazky.md#zakazkycreate) | `zakazky.create` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.createFromTemplate`](zakazky.md#zakazkycreatefromtemplate) | `zakazky.create` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.detail`](zakazky.md#zakazkydetail) | `zakazky.read` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.participants.add`](zakazky.md#zakazkyparticipantsadd) | `zakazky.write` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.participants.remove`](zakazky.md#zakazkyparticipantsremove) | `zakazky.write` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.phase.complete`](zakazky.md#zakazkyphasecomplete) | `zakazky.write` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.phase.preview`](zakazky.md#zakazkyphasepreview) | `zakazky.read` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.phases.edit`](zakazky.md#zakazkyphasesedit) | `zakazky.write` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.prefillFromDeal`](zakazky.md#zakazkyprefillfromdeal) | `zakazky.read` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.setPhase`](zakazky.md#zakazkysetphase) | `zakazky.write` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.setStatus`](zakazky.md#zakazkysetstatus) | `zakazky.write` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.team.add`](zakazky.md#zakazkyteamadd) | `zakazky.write` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.team.remove`](zakazky.md#zakazkyteamremove) | `zakazky.write` | Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`. |
| [`zakazky.template.archive`](zakazky.md#zakazkytemplatearchive) | `zakazky.templates` | Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`. |
| [`zakazky.template.create`](zakazky.md#zakazkytemplatecreate) | `zakazky.templates` | Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`. |
| [`zakazky.template.duplicate`](zakazky.md#zakazkytemplateduplicate) | `zakazky.templates` | Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`. |
| [`zakazky.template.get`](zakazky.md#zakazkytemplateget) | `zakazky.read` | Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`. |
| [`zakazky.template.list`](zakazky.md#zakazkytemplatelist) | `zakazky.read` | Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`. |
| [`zakazky.template.saveFromJob`](zakazky.md#zakazkytemplatesavefromjob) | `zakazky.templates` | Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`. |
| [`zakazky.template.setDefault`](zakazky.md#zakazkytemplatesetdefault) | `zakazky.templates` | Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`. |
| [`zakazky.template.update`](zakazky.md#zakazkytemplateupdate) | `zakazky.templates` | Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`. |

## Obchody

Podrobně: [prikazy/obchody.md](obchody.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`obchody.archive`](obchody.md#obchodyarchive) | `obchody.delete` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.board`](obchody.md#obchodyboard) | `obchody.read` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.create`](obchody.md#obchodycreate) | `obchody.create` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.detail`](obchody.md#obchodydetail) | `obchody.read` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.history`](obchody.md#obchodyhistory) | `obchody.read` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.lose`](obchody.md#obchodylose) | `obchody.write` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.lostReasons`](obchody.md#obchodylostreasons) | `obchody.read` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.markOpened`](obchody.md#obchodymarkopened) | `obchody.read` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.moveStage`](obchody.md#obchodymovestage) | `obchody.write` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.participants.add`](obchody.md#obchodyparticipantsadd) | `obchody.write` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.participants.remove`](obchody.md#obchodyparticipantsremove) | `obchody.write` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.pipeline.get`](obchody.md#obchodypipelineget) | `obchody.pipelines` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.pipeline.lostReason.add`](obchody.md#obchodypipelinelostreasonadd) | `obchody.pipelines` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.pipeline.lostReason.reorder`](obchody.md#obchodypipelinelostreasonreorder) | `obchody.pipelines` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.pipeline.lostReason.update`](obchody.md#obchodypipelinelostreasonupdate) | `obchody.pipelines` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.pipeline.stage.add`](obchody.md#obchodypipelinestageadd) | `obchody.pipelines` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.pipeline.stage.delete`](obchody.md#obchodypipelinestagedelete) | `obchody.pipelines` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.pipeline.stage.reorder`](obchody.md#obchodypipelinestagereorder) | `obchody.pipelines` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.pipeline.stage.update`](obchody.md#obchodypipelinestageupdate) | `obchody.pipelines` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.quickAdd`](obchody.md#obchodyquickadd) | `obchody.create` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.reopen`](obchody.md#obchodyreopen) | `obchody.write` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.update`](obchody.md#obchodyupdate) | `obchody.write` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.win`](obchody.md#obchodywin) | `obchody.write` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`obchody.winPreview`](obchody.md#obchodywinpreview) | `obchody.read` | Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`. |

## Úkoly a poznámky

Podrobně: [prikazy/ukoly.md](ukoly.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`ukoly.assign`](ukoly.md#ukolyassign) | `ukoly.write` |  |
| [`ukoly.attendees.set`](ukoly.md#ukolyattendeesset) | `ukoly.write` |  |
| [`ukoly.complete`](ukoly.md#ukolycomplete) | `ukoly.write` |  |
| [`ukoly.counts`](ukoly.md#ukolycounts) | `ukoly.read` |  |
| [`ukoly.create`](ukoly.md#ukolycreate) | `ukoly.create` |  |
| [`ukoly.delete`](ukoly.md#ukolydelete) | `ukoly.delete` |  |
| [`ukoly.forRecord`](ukoly.md#ukolyforrecord) | `ukoly.read` |  |
| [`ukoly.get`](ukoly.md#ukolyget) | `ukoly.read` |  |
| [`ukoly.list`](ukoly.md#ukolylist) | `ukoly.read` |  |
| [`ukoly.note.create`](ukoly.md#ukolynotecreate) | `ukoly.create` | `ukoly.note.create`: nová poznámka. |
| [`ukoly.note.delete`](ukoly.md#ukolynotedelete) | `ukoly.delete` | `ukoly.note.delete`: smazání do koše. |
| [`ukoly.note.get`](ukoly.md#ukolynoteget) | `ukoly.read` | `ukoly.note.get`: poznámka s obsahem. |
| [`ukoly.note.list`](ukoly.md#ukolynotelist) | `ukoly.read` | `ukoly.note.list`: poznámky k záznamu nebo samostatné (připnuté nahoře, pak nejnovější; hledání v textu). |
| [`ukoly.note.pin`](ukoly.md#ukolynotepin) | `ukoly.write` | `ukoly.note.pin`: připnutí a odepnutí. |
| [`ukoly.note.save`](ukoly.md#ukolynotesave) | `ukoly.write` | `ukoly.note.save`: autosave obsahu s ochranou verzí (konflikt se vrací jako výsledek, ne výjimka). |
| [`ukoly.note.update`](ukoly.md#ukolynoteupdate) | `ukoly.write` | `ukoly.note.update`: přesun k jinému záznamu a štítky. |
| [`ukoly.parse`](ukoly.md#ukolyparse) | `ukoly.read` |  |
| [`ukoly.publishAndAssign`](ukoly.md#ukolypublishandassign) | `ukoly.write` |  |
| [`ukoly.quickAdd`](ukoly.md#ukolyquickadd) | `ukoly.create` |  |
| [`ukoly.reschedule`](ukoly.md#ukolyreschedule) | `ukoly.write` |  |
| [`ukoly.setStatus`](ukoly.md#ukolysetstatus) | `ukoly.write` |  |
| [`ukoly.type.delete`](ukoly.md#ukolytypedelete) | `ukoly.types` |  |
| [`ukoly.type.list`](ukoly.md#ukolytypelist) | `ukoly.read` |  |
| [`ukoly.type.reorder`](ukoly.md#ukolytypereorder) | `ukoly.types` |  |
| [`ukoly.type.save`](ukoly.md#ukolytypesave) | `ukoly.types` |  |
| [`ukoly.update`](ukoly.md#ukolyupdate) | `ukoly.write` |  |

## Kalendář

Podrobně: [prikazy/kalendar.md](kalendar.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`kalendar.account`](kalendar.md#kalendaraccount) | `kalendar.read` |  |
| [`kalendar.calendars.refresh`](kalendar.md#kalendarcalendarsrefresh) | `kalendar.write` |  |
| [`kalendar.connect.start`](kalendar.md#kalendarconnectstart) | `kalendar.write` |  |
| [`kalendar.createMeeting`](kalendar.md#kalendarcreatemeeting) | `kalendar.write` |  |
| [`kalendar.delete`](kalendar.md#kalendardelete) | `kalendar.write` |  |
| [`kalendar.disconnect`](kalendar.md#kalendardisconnect) | `kalendar.write` |  |
| [`kalendar.forRecord`](kalendar.md#kalendarforrecord) | `kalendar.read` |  |
| [`kalendar.link`](kalendar.md#kalendarlink) | `kalendar.write` |  |
| [`kalendar.move`](kalendar.md#kalendarmove) | `kalendar.write` |  |
| [`kalendar.range`](kalendar.md#kalendarrange) | `kalendar.read` |  |
| [`kalendar.setWriteTarget`](kalendar.md#kalendarsetwritetarget) | `kalendar.write` |  |
| [`kalendar.settings.get`](kalendar.md#kalendarsettingsget) | `settings.manage` |  |
| [`kalendar.settings.save`](kalendar.md#kalendarsettingssave) | `settings.manage` |  |
| [`kalendar.suggestLinks`](kalendar.md#kalendarsuggestlinks) | `kalendar.read` |  |
| [`kalendar.sync`](kalendar.md#kalendarsync) | `kalendar.write` |  |
| [`kalendar.test`](kalendar.md#kalendartest) | `kalendar.write` |  |
| [`kalendar.toggleCalendar`](kalendar.md#kalendartogglecalendar) | `kalendar.write` |  |

## Hodiny

Podrobně: [prikazy/hodiny.md](hodiny.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`hodiny.cell.save`](hodiny.md#hodinycellsave) | `hodiny.write` | Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`). |
| [`hodiny.delete`](hodiny.md#hodinydelete) | `hodiny.delete` | Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`). |
| [`hodiny.forTask`](hodiny.md#hodinyfortask) | `hodiny.read` | Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`). |
| [`hodiny.job.summary`](hodiny.md#hodinyjobsummary) | `hodiny.read` | Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`). |
| [`hodiny.jobs`](hodiny.md#hodinyjobs) | `hodiny.read` | Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`). |
| [`hodiny.parse`](hodiny.md#hodinyparse) | `hodiny.read` | Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`). |
| [`hodiny.report`](hodiny.md#hodinyreport) | `hodiny.read` | Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`). |
| [`hodiny.save`](hodiny.md#hodinysave) | `hodiny.write` | Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`). |
| [`hodiny.week`](hodiny.md#hodinyweek) | `hodiny.read` | Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`). |

## Finance

Podrobně: [prikazy/finance.md](finance.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`finance.balance`](finance.md#financebalance) | `finance.read` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.balance.months`](finance.md#financebalancemonths) | `finance.read` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.client.overview`](finance.md#financeclientoverview) | `finance.read` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.job.overview`](finance.md#financejoboverview) | `finance.read` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.payment.create`](finance.md#financepaymentcreate) | `finance.payments_write` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.payment.get`](finance.md#financepaymentget) | `finance.read` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.payment.list`](finance.md#financepaymentlist) | `finance.read` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.payment.overrideAllocation`](finance.md#financepaymentoverrideallocation) | `finance.splits_edit` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.payment.recalc`](finance.md#financepaymentrecalc) | `finance.payments_write` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.payment.transition`](finance.md#financepaymenttransition) | `finance.payments_write` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.payment.update`](finance.md#financepaymentupdate) | `finance.payments_write` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.reports`](finance.md#financereports) | `finance.read` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.retainer.change`](finance.md#financeretainerchange) | `finance.payments_write` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.retainer.continue`](finance.md#financeretainercontinue) | `finance.payments_write` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.retainer.end`](finance.md#financeretainerend) | `finance.payments_write` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.retainer.endPreview`](finance.md#financeretainerendpreview) | `finance.read` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.settings.get`](finance.md#financesettingsget) | `finance.read` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.settings.set`](finance.md#financesettingsset) | `finance.settings` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.settlement.cancel`](finance.md#financesettlementcancel) | `finance.settlements_write` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.settlement.create`](finance.md#financesettlementcreate) | `finance.settlements_write` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.settlement.list`](finance.md#financesettlementlist) | `finance.read` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.split.default`](finance.md#financesplitdefault) | `finance.read` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.split.get`](finance.md#financesplitget) | `finance.read` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.split.preview`](finance.md#financesplitpreview) | `finance.read` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |
| [`finance.split.set`](finance.md#financesplitset) | `finance.splits_edit` | Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení). |

## Reklama

Podrobně: [prikazy/reklama.md](reklama.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`reklama.account.detail`](reklama.md#reklamaaccountdetail) | `reklama.read` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.account.setActive`](reklama.md#reklamaaccountsetactive) | `reklama.manage` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.account.setOwner`](reklama.md#reklamaaccountsetowner) | `reklama.write` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.accounts.list`](reklama.md#reklamaaccountslist) | `reklama.read` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.campaign.assignJob`](reklama.md#reklamacampaignassignjob) | `reklama.write` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.campaign.detail`](reklama.md#reklamacampaigndetail) | `reklama.read` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.connection.get`](reklama.md#reklamaconnectionget) | `reklama.manage` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.connection.remove`](reklama.md#reklamaconnectionremove) | `reklama.manage` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.connection.save`](reklama.md#reklamaconnectionsave) | `reklama.manage` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.connection.test`](reklama.md#reklamaconnectiontest) | `reklama.manage` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.forClient`](reklama.md#reklamaforclient) | `reklama.read` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.forJob`](reklama.md#reklamaforjob) | `reklama.read` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.leads.recent`](reklama.md#reklamaleadsrecent) | `reklama.manage` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.mapping.delete`](reklama.md#reklamamappingdelete) | `reklama.manage` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.mapping.save`](reklama.md#reklamamappingsave) | `reklama.manage` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.mappings.list`](reklama.md#reklamamappingslist) | `reklama.manage` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.metrics`](reklama.md#reklamametrics) | `reklama.read` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |
| [`reklama.sync`](reklama.md#reklamasync) | `reklama.manage` | Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`. |

## Šablony e-mailů

Podrobně: [prikazy/sablony-emailu.md](sablony-emailu.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`sablony-emailu.logActivity`](sablony-emailu.md#sablony-emailulogactivity) | `sablony-emailu.read` | Zapíše e-mail jako hotovou aktivitu (typ e-mail) přes službu úkolů (SAB-04); oprávnění ověří služba. |
| [`sablony-emailu.markUsed`](sablony-emailu.md#sablony-emailumarkused) | `sablony-emailu.read` | Započítá použití šablony (otevření v Gmailu nebo kopie); vrací, zda jde nabídnout zápis aktivity (SAB-04). |
| [`sablony-emailu.pick`](sablony-emailu.md#sablony-emailupick) | `sablony-emailu.read` | Hledání kontaktů, organizací, obchodů a zakázek, kterými se náhled vyplní. |
| [`sablony-emailu.preview`](sablony-emailu.md#sablony-emailupreview) | `sablony-emailu.read` | Náhled rozepsané šablony s daty vybraných záznamů (editor, SAB-02). |
| [`sablony-emailu.render`](sablony-emailu.md#sablony-emailurender) | `sablony-emailu.read` | E-mail ze šablony pro kontakt, organizaci, obchod nebo zakázku (SAB-03): vyplněný předmět a text, adresát a adresa pro Gmail (`gmailUrl`; `null` + `tooLong` při překročení limitu délky, R-46). Nic se neodesílá (SAB-05). |
| [`sablony-emailu.saveContent`](sablony-emailu.md#sablony-emailusavecontent) | `sablony-emailu.write` | Uloží předmět a text šablony z editoru. |
| [`sablony-emailu.templates`](sablony-emailu.md#sablony-emailutemplates) | `sablony-emailu.read` | Šablony pro výběr v dialogu „E-mail ze šablony“ (nejpoužívanější první; SAB-01). |
| [`sablony-emailu.variables`](sablony-emailu.md#sablony-emailuvariables) | `sablony-emailu.read` | Katalog proměnných šablon (příspěvky zapnutých modulů + výchozí) pro editor a nápovědu. |

## Můj prostor

Podrobně: [prikazy/muj-prostor.md](muj-prostor.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`muj-prostor.client.overview`](muj-prostor.md#muj-prostorclientoverview) | `muj-prostor.hosting` nebo `muj-prostor.domains` | Hosting, údržba a domény jednoho klienta pro záložku „Hosting a domény“ na kartě klienta (KLI-09). |
| [`muj-prostor.domains.assignClient`](muj-prostor.md#muj-prostordomainsassignclient) | `muj-prostor.domains` | Přiřadí (nebo odebere) klienta u vybraných domén; po hromadném vložení se tak doplňují klienti. |
| [`muj-prostor.domains.bulkAdd`](muj-prostor.md#muj-prostordomainsbulkadd) | `muj-prostor.domains` | Hromadné vložení domén (DOM-04): text s jednou doménou na řádek. Neplatné zápisy, opakování v zadání a domény, které už evidované jsou, se přeskočí a vrátí se v odpovědi; ostatní se založí přes engine entity (historie, hledání) v jedné transakci. Klienta, registrátora a další hodnoty jde zadat pro všechny najednou; jinak se doplňují později. |
| [`muj-prostor.domains.list`](muj-prostor.md#muj-prostordomainslist) | `muj-prostor.domains` | Seznam domén s popisky klienta a hostingu a souhrnem (barvy expirace se dopočítají podle `today`). |
| [`muj-prostor.fakturoid.disconnect`](muj-prostor.md#muj-prostorfakturoiddisconnect) | `muj-prostor.recurring_invoices` | Odpojí Fakturoid. |
| [`muj-prostor.fakturoid.save`](muj-prostor.md#muj-prostorfakturoidsave) | `muj-prostor.recurring_invoices` | Uloží přístup k Fakturoidu (šifrovaně; vyžaduje i `settings.integrations`). |
| [`muj-prostor.fakturoid.status`](muj-prostor.md#muj-prostorfakturoidstatus) | `muj-prostor.recurring_invoices` | Stav nastavení Fakturoidu (bez tajemství). |
| [`muj-prostor.fakturoid.test`](muj-prostor.md#muj-prostorfakturoidtest) | `muj-prostor.recurring_invoices` | Test spojení s Fakturoidem. |
| [`muj-prostor.hosting.markRenewed`](muj-prostor.md#muj-prostorhostingmarkrenewed) | `muj-prostor.hosting` | Označí obnovu jako vyfakturovanou: další obnova se posune o období (HOST-03, R-47). Jen aktivní služba s vyplněným datem. Dvojí kliknutí nebo druhé okno nic nezdvojí: příkaz nese datum, které uživatel viděl, a při neshodě skončí chybou. Změna jde přes engine entity, takže je v historii před → po. |
| [`muj-prostor.hosting.overview`](muj-prostor.md#muj-prostorhostingoverview) | `muj-prostor.hosting` | Souhrn hostingu a údržby a nejbližší obnovy (karty nad seznamem a panel „K obnově“). |
| [`muj-prostor.hosting.undoRenewed`](muj-prostor.md#muj-prostorhostingundorenewed) | `muj-prostor.hosting` | Vrátí poslední posun obnovy (tlačítko „Zpět“ v oznámení): jen když má služba pořád datum, na které ji posunula `markRenewed`; jinak by přepsala pozdější úpravu. |
| [`muj-prostor.invoices.approve`](muj-prostor.md#muj-prostorinvoicesapprove) | `muj-prostor.recurring_invoices` | Schválit a vytvořit ve Fakturoidu: faktura, posun obnovy, platba vlastníkovi (idempotentní). |
| [`muj-prostor.invoices.cancel`](muj-prostor.md#muj-prostorinvoicescancel) | `muj-prostor.recurring_invoices` | Zruší návrh. |
| [`muj-prostor.invoices.overview`](muj-prostor.md#muj-prostorinvoicesoverview) | `muj-prostor.recurring_invoices` | Návrhy a hotové faktury, souhrn a stav Fakturoidu (stránka Opakované faktury, sekce na kartě klienta). |
| [`muj-prostor.invoices.prepare`](muj-prostor.md#muj-prostorinvoicesprepare) | `muj-prostor.recurring_invoices` | Ručně připraví návrhy (totéž co denní úloha); idempotentní. |
| [`muj-prostor.invoices.reopen`](muj-prostor.md#muj-prostorinvoicesreopen) | `muj-prostor.recurring_invoices` | Vrátí zrušený návrh do konceptu. |
| [`muj-prostor.invoices.retryPayment`](muj-prostor.md#muj-prostorinvoicesretrypayment) | `muj-prostor.recurring_invoices` | Doplní chybějící platbu u hotové faktury. |
| [`muj-prostor.invoices.update`](muj-prostor.md#muj-prostorinvoicesupdate) | `muj-prostor.recurring_invoices` | Upraví částku konceptu. |
| [`muj-prostor.library.list`](muj-prostor.md#muj-prostorlibrarylist) | `muj-prostor.email_library` | Hledání a seznam e-mailové knihovny s počty kategorií a štítků. |
| [`muj-prostor.library.move`](muj-prostor.md#muj-prostorlibrarymove) | `muj-prostor.email_library` | Přesun nebo kopie textu mezi knihovnou a sdílenými šablonami. |
| [`muj-prostor.library.pick`](muj-prostor.md#muj-prostorlibrarypick) | `muj-prostor.email_library` | Hledání záznamů pro výběr v náhledu. |
| [`muj-prostor.library.preview`](muj-prostor.md#muj-prostorlibrarypreview) | `muj-prostor.email_library` | Text položky vyplněný daty vybraného kontaktu, organizace, obchodu a zakázky, s odkazy do Gmailu. |
| [`muj-prostor.library.variables`](muj-prostor.md#muj-prostorlibraryvariables) | `muj-prostor.email_library` | Katalog proměnných textu (stejný jako u šablon e-mailů). |
| [`muj-prostor.private.createNote`](muj-prostor.md#muj-prostorprivatecreatenote) | `muj-prostor.private_overview` | Nová samostatná soukromá poznámka; zakládá ji služba `tasks` (modul Úkoly a poznámky). |
| [`muj-prostor.private.overview`](muj-prostor.md#muj-prostorprivateoverview) | `muj-prostor.private_overview` | Všechny soukromé záznamy na jednom místě, seskupené podle typu. |
