# Serverové příkazy

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registry příkazů všech modulů). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Všechny příkazy modulů (253) s oprávněním; vstupní pole jsou v souboru modulu.

## Kontakty

Podrobně: [prikazy/kontakty.md](kontakty.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`kontakty.ares`](kontakty.md#kontaktyares) | `kontakty.write` nebo `poptavky.write` nebo `zakazky.write` | Doplnění firmy z ARES podle IČO. Nikdy nevyhodí chybu kvůli síti: výsledek `ok: false` nese větu pro uživatele. Počet dotazů na uživatele je omezený (ochrana veřejného API i aplikace). |
| [`kontakty.merge.preview`](kontakty.md#kontaktymergepreview) | `kontakty.merge` | Náhled sloučení: co se přepojí a doplní. Nic nemění. |
| [`kontakty.merge.run`](kontakty.md#kontaktymergerun) | `kontakty.merge` | Sloučení duplicity: `sourceId` zanikne a všechno, co na něj odkazovalo, přejde na `targetId`. Nevratné z uživatelského rozhraní, proto vyžaduje výslovné `confirm: true`. |
| [`kontakty.person.points`](kontakty.md#kontaktypersonpoints) | `kontakty.read` | Další e-maily a telefony osoby s typem. |
| [`kontakty.person.setPoints`](kontakty.md#kontaktypersonsetpoints) | `kontakty.write` | Nahradí další e-maily a telefony osoby (hlavní údaje se mění v poli osoby). |
| [`kontakty.search`](kontakty.md#kontaktysearch) | `kontakty.read` | Hledání firem a osob pro výběr (rychlé zadání poptávky, účastníci zakázky, sloučení). |

## Zakázky

Podrobně: [prikazy/zakazky.md](zakazky.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`zakazky.approval.decide`](zakazky.md#zakazkyapprovaldecide) | `zakazky.approve` nebo `zakazky.approve_all` |  |
| [`zakazky.approval.queue`](zakazky.md#zakazkyapprovalqueue) | `zakazky.approve` nebo `zakazky.approve_all` |  |
| [`zakazky.approval.reopen`](zakazky.md#zakazkyapprovalreopen) | přihlášení |  |
| [`zakazky.approval.rules.delete`](zakazky.md#zakazkyapprovalrulesdelete) | `zakazky.approve_all` |  |
| [`zakazky.approval.rules.list`](zakazky.md#zakazkyapprovalruleslist) | `zakazky.approve_all` |  |
| [`zakazky.approval.rules.save`](zakazky.md#zakazkyapprovalrulessave) | `zakazky.approve_all` |  |
| [`zakazky.approval.state`](zakazky.md#zakazkyapprovalstate) | přihlášení |  |
| [`zakazky.budget.calc.delete`](zakazky.md#zakazkybudgetcalcdelete) | `zakazky.budget` |  |
| [`zakazky.budget.calc.list`](zakazky.md#zakazkybudgetcalclist) | `zakazky.economics` |  |
| [`zakazky.budget.calc.replace`](zakazky.md#zakazkybudgetcalcreplace) | `zakazky.budget` | Nahradí všechny řádky výkazu výměr položky (dialog ukládá celou tabulku najednou). |
| [`zakazky.budget.calc.save`](zakazky.md#zakazkybudgetcalcsave) | `zakazky.budget` |  |
| [`zakazky.budget.copyOffer`](zakazky.md#zakazkybudgetcopyoffer) | `zakazky.budget` |  |
| [`zakazky.budget.item.bulk`](zakazky.md#zakazkybudgetitembulk) | `zakazky.budget` |  |
| [`zakazky.budget.item.delete`](zakazky.md#zakazkybudgetitemdelete) | `zakazky.budget` |  |
| [`zakazky.budget.item.duplicate`](zakazky.md#zakazkybudgetitemduplicate) | `zakazky.budget` |  |
| [`zakazky.budget.item.move`](zakazky.md#zakazkybudgetitemmove) | `zakazky.budget` |  |
| [`zakazky.budget.item.save`](zakazky.md#zakazkybudgetitemsave) | `zakazky.budget` |  |
| [`zakazky.budget.object.delete`](zakazky.md#zakazkybudgetobjectdelete) | `zakazky.budget` |  |
| [`zakazky.budget.object.save`](zakazky.md#zakazkybudgetobjectsave) | `zakazky.budget` |  |
| [`zakazky.budget.section.delete`](zakazky.md#zakazkybudgetsectiondelete) | `zakazky.budget` |  |
| [`zakazky.budget.section.move`](zakazky.md#zakazkybudgetsectionmove) | `zakazky.budget` |  |
| [`zakazky.budget.section.save`](zakazky.md#zakazkybudgetsectionsave) | `zakazky.budget` |  |
| [`zakazky.budget.tree`](zakazky.md#zakazkybudgettree) | `zakazky.economics` |  |
| [`zakazky.budget.version.create`](zakazky.md#zakazkybudgetversioncreate) | `zakazky.budget` |  |
| [`zakazky.budget.version.list`](zakazky.md#zakazkybudgetversionlist) | `zakazky.economics` |  |
| [`zakazky.budget.version.lock`](zakazky.md#zakazkybudgetversionlock) | `zakazky.budget` |  |
| [`zakazky.budget.version.setStatus`](zakazky.md#zakazkybudgetversionsetstatus) | `zakazky.budget` |  |
| [`zakazky.change.create`](zakazky.md#zakazkychangecreate) | `zakazky.economics` |  |
| [`zakazky.change.decide`](zakazky.md#zakazkychangedecide) | `zakazky.approve` nebo `zakazky.approve_all` | Rozhodnutí o změně (obálka nad `approvalsApi.decide`; oprávnění a limit hlídá schvalování). |
| [`zakazky.change.delete`](zakazky.md#zakazkychangedelete) | `zakazky.economics` |  |
| [`zakazky.change.get`](zakazky.md#zakazkychangeget) | `zakazky.economics` |  |
| [`zakazky.change.items`](zakazky.md#zakazkychangeitems) | `zakazky.economics` | Položky a oddíly realizační verze pro výběr v editoru změny. |
| [`zakazky.change.line.delete`](zakazky.md#zakazkychangelinedelete) | `zakazky.economics` |  |
| [`zakazky.change.line.save`](zakazky.md#zakazkychangelinesave) | `zakazky.economics` |  |
| [`zakazky.change.list`](zakazky.md#zakazkychangelist) | `zakazky.economics` |  |
| [`zakazky.change.reopen`](zakazky.md#zakazkychangereopen) | `zakazky.economics` |  |
| [`zakazky.change.save`](zakazky.md#zakazkychangesave) | `zakazky.economics` |  |
| [`zakazky.change.submit`](zakazky.md#zakazkychangesubmit) | `zakazky.economics` | Odešle změnu ke schválení: srovná řádky s rozpočtem, přepočte částku a požádá o schválení. |
| [`zakazky.changes.createDraft`](zakazky.md#zakazkychangescreatedraft) | `zakazky.economics` nebo `zakazky.budget` | Stejné jako `create`; název, který volá rozpočet („Nová změna z řádku rozpočtu“). |
| [`zakazky.costs.allocate`](zakazky.md#zakazkycostsallocate) | `zakazky.budget` | Spáruje náklad na oddíl (a případně položku) rozpočtu. `source` a `ref` jsou z řádku seznamu (`allocSource`, `ref`). Víc částí = rozpad na víc oddílů, součet musí sedět; prázdné `parts` párování zruší. |
| [`zakazky.costs.autoAllocate`](zakazky.md#zakazkycostsautoallocate) | `zakazky.budget` |  |
| [`zakazky.costs.delete`](zakazky.md#zakazkycostsdelete) | `zakazky.budget` |  |
| [`zakazky.costs.list`](zakazky.md#zakazkycostslist) | `zakazky.economics` |  |
| [`zakazky.costs.plan`](zakazky.md#zakazkycostsplan) | `zakazky.economics` | Plán vs skutečnost: strom objekt → oddíl s plánem, náklady, závazky, čerpáním a marží. |
| [`zakazky.costs.save`](zakazky.md#zakazkycostssave) | `zakazky.budget` | Ruční náklad: nový (bez `id`) nebo úprava. Rozpad a párování automatických nákladů řeší `allocate`. |
| [`zakazky.costs.targets`](zakazky.md#zakazkycoststargets) | `zakazky.economics` | Oddíly a položky aktuálního rozpočtu zakázky (výběr při párování a v řádcích přijaté faktury). |
| [`zakazky.orders.cancel`](zakazky.md#zakazkyorderscancel) | `zakazky.budget` |  |
| [`zakazky.orders.delete`](zakazky.md#zakazkyordersdelete) | `zakazky.budget` |  |
| [`zakazky.orders.get`](zakazky.md#zakazkyordersget) | `zakazky.economics` |  |
| [`zakazky.orders.list`](zakazky.md#zakazkyorderslist) | `zakazky.economics` | Objednávky zakázky s otevřeným závazkem (kolik z objednaného ještě nepokrývají náklady). |
| [`zakazky.orders.receive`](zakazky.md#zakazkyordersreceive) | `zakazky.budget` |  |
| [`zakazky.orders.save`](zakazky.md#zakazkyorderssave) | `zakazky.budget` | Nová objednávka (bez `id`) nebo úprava konceptu. |
| [`zakazky.orders.submit`](zakazky.md#zakazkyorderssubmit) | `zakazky.budget` |  |
| [`zakazky.phase.preview`](zakazky.md#zakazkyphasepreview) | `zakazky.read` | Pro každou možnou další fázi: jde přechod, a když ne, které kontroly nejsou splněné. |
| [`zakazky.share.create`](zakazky.md#zakazkysharecreate) | `zakazky.share` |  |
| [`zakazky.share.list`](zakazky.md#zakazkysharelist) | `zakazky.share` |  |
| [`zakazky.share.revoke`](zakazky.md#zakazkysharerevoke) | `zakazky.share` |  |
| [`zakazky.share.update`](zakazky.md#zakazkyshareupdate) | `zakazky.share` |  |
| [`zakazky.statement.create`](zakazky.md#zakazkystatementcreate) | `zakazky.write` nebo `zakazky.economics` |  |
| [`zakazky.statement.decide`](zakazky.md#zakazkystatementdecide) | `zakazky.approve` nebo `zakazky.approve_all` |  |
| [`zakazky.statement.delete`](zakazky.md#zakazkystatementdelete) | `zakazky.write` nebo `zakazky.economics` |  |
| [`zakazky.statement.get`](zakazky.md#zakazkystatementget) | `zakazky.write` nebo `zakazky.economics` |  |
| [`zakazky.statement.line.set`](zakazky.md#zakazkystatementlineset) | `zakazky.write` nebo `zakazky.economics` | Zadání provedeného množství za období po položkách (dávka, aby šlo uložit celou tabulku najednou). |
| [`zakazky.statement.list`](zakazky.md#zakazkystatementlist) | `zakazky.write` nebo `zakazky.economics` |  |
| [`zakazky.statement.reopen`](zakazky.md#zakazkystatementreopen) | `zakazky.write` nebo `zakazky.economics` |  |
| [`zakazky.statement.save`](zakazky.md#zakazkystatementsave) | `zakazky.write` nebo `zakazky.economics` |  |
| [`zakazky.statement.setApproved`](zakazky.md#zakazkystatementsetapproved) | `zakazky.approve` nebo `zakazky.approve_all` | Schvalovatel může před schválením snížit schválenou částku (nad nárokovanou nejde). |
| [`zakazky.statement.submit`](zakazky.md#zakazkystatementsubmit) | `zakazky.write` nebo `zakazky.economics` |  |
| [`zakazky.summary`](zakazky.md#zakazkysummary) | `zakazky.economics` | Souhrn zakázky pro hlavičku, seznam a přehled (jediné místo, kde se čísla počítají). |
| [`zakazky.team.add`](zakazky.md#zakazkyteamadd) | `zakazky.write` |  |
| [`zakazky.team.list`](zakazky.md#zakazkyteamlist) | přihlášení |  |
| [`zakazky.team.remove`](zakazky.md#zakazkyteamremove) | `zakazky.write` |  |
| [`zakazky.template.apply`](zakazky.md#zakazkytemplateapply) | `zakazky.budget` |  |
| [`zakazky.template.createFromJob`](zakazky.md#zakazkytemplatecreatefromjob) | `zakazky.budget` | Vytvoří šablonu z existující zakázky (nebo přepíše šablonu `replaceId`). |
| [`zakazky.template.delete`](zakazky.md#zakazkytemplatedelete) | `zakazky.budget` |  |
| [`zakazky.template.get`](zakazky.md#zakazkytemplateget) | `zakazky.read` |  |
| [`zakazky.template.list`](zakazky.md#zakazkytemplatelist) | `zakazky.read` |  |
| [`zakazky.template.save`](zakazky.md#zakazkytemplatesave) | `zakazky.budget` |  |
| [`zakazky.terminal.sites`](zakazky.md#zakazkyterminalsites) | `zakazky.read` | Zakázky, na kterých řemeslník právě pracuje (realizace a předání): adresa s polohou pro navigaci, kontakt na místě a tým. Jen zakázky, které aktér smí vidět (montér a mistr „jen moje“). Žádné ceny, sazby ani marže. |
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

## Realizace

Podrobně: [prikazy/realizace.md](realizace.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`realizace.defects.open`](realizace.md#realizacedefectsopen) | `realizace.read` | Otevřené vady zakázky pro kartu na Přehledu (nejdřív po termínu, pak podle stáří). |
| [`realizace.diary.delete`](realizace.md#realizacediarydelete) | `realizace.write` |  |
| [`realizace.diary.list`](realizace.md#realizacediarylist) | `realizace.read` |  |
| [`realizace.diary.prefill`](realizace.md#realizacediaryprefill) | `realizace.read` | Předvyplnění zápisu z docházky, strojů a skladu toho dne (dodávají je ostatní moduly, pokud běží). |
| [`realizace.diary.print`](realizace.md#realizacediaryprint) | `realizace.read` | Všechny zápisy v období pro tisk deníku (bez cen). |
| [`realizace.diary.save`](realizace.md#realizacediarysave) | `realizace.read` |  |
| [`realizace.diary.sign`](realizace.md#realizacediarysign) | `realizace.read` | Podpis zápisu: soubor s podpisem (ručně, nebo podpis z předání) musí být připojený k téže zakázce. |
| [`realizace.diary.unsign`](realizace.md#realizacediaryunsign) | `realizace.write` |  |
| [`realizace.diary.weather`](realizace.md#realizacediaryweather) | `realizace.read` |  |
| [`realizace.handover.delete`](realizace.md#realizacehandoverdelete) | `realizace.write` |  |
| [`realizace.handover.list`](realizace.md#realizacehandoverlist) | `realizace.read` |  |
| [`realizace.handover.save`](realizace.md#realizacehandoversave) | `realizace.write` |  |
| [`realizace.handover.sign`](realizace.md#realizacehandoversign) | `realizace.write` | Podpis zákazníka: soubor s podpisem musí být připojený k téže zakázce. Podepsaný protokol je neměnný. |
| [`realizace.investor.view`](realizace.md#realizaceinvestorview) | přihlášení | Data Realizace pro veřejnou stránku investora (odkaz jen ke čtení). Příkaz smí volat jen systémový kontext aplikace, který předtím ověřil token odkazu; přihlášený uživatel ho přes `runCommand` volat nesmí, jinak by si mohl vyžádat cizí zakázku. Vrací jen to, co rozsah dovolí, a nikdy ceny, hodiny ani osobní údaje nad rámec jmen. |
| [`realizace.overview`](realizace.md#realizaceoverview) | `realizace.read` | Přehled všech zakázek s harmonogramem (v rozsahu, který aktér vidí): průběh, zpoždění, nejbližší fáze. |
| [`realizace.phases.delete`](realizace.md#realizacephasesdelete) | `realizace.read` |  |
| [`realizace.phases.list`](realizace.md#realizacephaseslist) | `realizace.read` |  |
| [`realizace.phases.move`](realizace.md#realizacephasesmove) | `realizace.read` | Přetažení pruhu v Ganttu: nové datum začátku a konce, volitelně s posunem navazujících. |
| [`realizace.phases.save`](realizace.md#realizacephasessave) | `realizace.read` |  |
| [`realizace.phases.setBaseline`](realizace.md#realizacephasessetbaseline) | `realizace.read` | Aktuální plán se stane novým výchozím (např. po dohodě se zákazníkem o posunu). |
| [`realizace.phases.setProgress`](realizace.md#realizacephasessetprogress) | `realizace.read` |  |
| [`realizace.terminal.defect`](realizace.md#realizaceterminaldefect) | `realizace.write` | Nahlášení závady z terminálu: založí vadu zakázky (stejně jako záložka Vady; tým zakázky dostane upozornění). |
| [`realizace.terminal.note`](realizace.md#realizaceterminalnote) | `realizace.write` | Přidá řádek do dnešního zápisu stavebního deníku (při prvním zápisu dne ho založí). Řádek se vždy připojuje na konec, takže zápisy kolegů téhož dne se nepřepíšou. Podepsaný zápis se nemění (česká hláška). |
| [`realizace.terminal.today`](realizace.md#realizaceterminaltoday) | `realizace.read` | Co se na stavbách řemeslníka dnes dělá: fáze harmonogramu, které dnes běží nebo v nejbližších dnech začnou (jen nedokončené), a zda je za dnešek zapsaný deník. Jen zakázky, které aktér smí vidět; žádné ceny. |

## Fakturace

Podrobně: [prikazy/fakturace.md](fakturace.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`fakturace.addPayment`](fakturace.md#fakturaceaddpayment) | `fakturace.write` |  |
| [`fakturace.createCreditNote`](fakturace.md#fakturacecreatecreditnote) | `fakturace.write` |  |
| [`fakturace.createFromJob`](fakturace.md#fakturacecreatefromjob) | `fakturace.write` | Záloha, dílčí a konečná faktura z rozpočtu zakázky. |
| [`fakturace.createFromStatement`](fakturace.md#fakturacecreatefromstatement) | `fakturace.write` |  |
| [`fakturace.export`](fakturace.md#fakturaceexport) | `fakturace.export` |  |
| [`fakturace.exportAdapters`](fakturace.md#fakturaceexportadapters) | `fakturace.export` |  |
| [`fakturace.finalSettlement`](fakturace.md#fakturacefinalsettlement) | `fakturace.read` | Podklady konečné faktury (rekapitulace s odečty); nic nezakládá. |
| [`fakturace.get`](fakturace.md#fakturaceget) | `fakturace.read` |  |
| [`fakturace.issue`](fakturace.md#fakturaceissue) | `fakturace.write` |  |
| [`fakturace.jobSummary`](fakturace.md#fakturacejobsummary) | `fakturace.read` | Přehled fakturace zakázky: čísla, zádržné, zálohy, soupisy k fakturaci (pro záložku Faktury). |
| [`fakturace.mail.bulk`](fakturace.md#fakturacemailbulk) | `fakturace.write` |  |
| [`fakturace.mail.bulkPreview`](fakturace.md#fakturacemailbulkpreview) | `fakturace.write` |  |
| [`fakturace.mail.list`](fakturace.md#fakturacemaillist) | `fakturace.read` |  |
| [`fakturace.mail.prepare`](fakturace.md#fakturacemailprepare) | `fakturace.write` |  |
| [`fakturace.mail.send`](fakturace.md#fakturacemailsend) | `fakturace.write` |  |
| [`fakturace.received.create`](fakturace.md#fakturacereceivedcreate) | `fakturace.write` |  |
| [`fakturace.received.delete`](fakturace.md#fakturacereceiveddelete) | `fakturace.write` |  |
| [`fakturace.received.get`](fakturace.md#fakturacereceivedget) | `fakturace.read` |  |
| [`fakturace.received.list`](fakturace.md#fakturacereceivedlist) | `fakturace.read` | Přijaté faktury (všechny, nebo jedné zakázky) pro záložku a přehledy. |
| [`fakturace.received.pay`](fakturace.md#fakturacereceivedpay) | `fakturace.write` |  |
| [`fakturace.received.save`](fakturace.md#fakturacereceivedsave) | `fakturace.write` |  |
| [`fakturace.received.submit`](fakturace.md#fakturacereceivedsubmit) | `fakturace.write` |  |
| [`fakturace.received.unpay`](fakturace.md#fakturacereceivedunpay) | `fakturace.write` |  |
| [`fakturace.releaseRetention`](fakturace.md#fakturacereleaseretention) | `fakturace.write` |  |
| [`fakturace.removePayment`](fakturace.md#fakturaceremovepayment) | `fakturace.write` |  |
| [`fakturace.reopen`](fakturace.md#fakturacereopen) | `fakturace.write` | Výjimečné vrácení vystaveného dokladu do konceptu (oprava hned po vystavení). Smí to držitel oprávnění „schvaluje doklady bez limitu“, doklad nesmí mít úhrady ani dobropis a nesmí být odečtený jinde. Číslo z řady zůstává dokladu (v řadě nevzniká díra) a zapíše se do auditu i s důvodem. Běžná oprava je dobropis. |
| [`fakturace.saveDraft`](fakturace.md#fakturacesavedraft) | `fakturace.write` |  |
| [`fakturace.settings.get`](fakturace.md#fakturacesettingsget) | `settings.manage` |  |
| [`fakturace.settings.save`](fakturace.md#fakturacesettingssave) | `settings.manage` |  |

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
| [`dochazka.terminal.summary`](dochazka.md#dochazkaterminalsummary) | `dochazka.own` | Přehled odpracovaného času pro dlaždici Docházka v terminálu: dnešek (záznamy se zakázkou a časy) a týden. Jen vlastní záznamy, jen minuty: sazby, náklady ani částky se nevracejí. |
| [`dochazka.week`](dochazka.md#dochazkaweek) | přihlášení |  |
| [`dochazka.withdrawWeek`](dochazka.md#dochazkawithdrawweek) | přihlášení |  |

## Sklad

Podrobně: [prikazy/sklad.md](sklad.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`sklad.count`](sklad.md#skladcount) | `sklad.read` | Řádky inventury s aktuálním stavem (stav se bere v okamžiku uzavření, ne založení). |
| [`sklad.count.addLine`](sklad.md#skladcountaddline) | `sklad.inventory` | Přidá do otevřené inventury položku, která v systému na umístění není (nalezená zásoba). |
| [`sklad.count.close`](sklad.md#skladcountclose) | `sklad.inventory` | Uzavře inventuru a rozdíly (napočítáno − aktuální stav) zaúčtuje inventurním dokladem. |
| [`sklad.count.saveLine`](sklad.md#skladcountsaveline) | `sklad.inventory` |  |
| [`sklad.count.start`](sklad.md#skladcountstart) | `sklad.inventory` |  |
| [`sklad.doc`](sklad.md#skladdoc) | `sklad.read` | Řádky dokladu. |
| [`sklad.itemDetail`](sklad.md#skladitemdetail) | `sklad.read` | Stavy po umístěních a posledních 100 pohybů jedné karty. |
| [`sklad.jobMaterial`](sklad.md#skladjobmaterial) | `sklad.read` | Čistá spotřeba materiálu na zakázce (výdej − vratky). |
| [`sklad.options`](sklad.md#skladoptions) | `sklad.read` | Podklady pro formuláře dokladů: umístění a aktivní karty se stavy po umístěních. |
| [`sklad.order`](sklad.md#skladorder) | `sklad.read` | Příjemky k objednávce (kolik se kdy přijalo). |
| [`sklad.order.create`](sklad.md#skladordercreate) | `sklad.write` |  |
| [`sklad.order.receive`](sklad.md#skladorderreceive) | `sklad.write` | Příjem objednávky (i částečný): zaúčtuje příjemku, zvýší přijaté množství a přepočítá stav objednávky. |
| [`sklad.order.setStatus`](sklad.md#skladordersetstatus) | `sklad.write` |  |
| [`sklad.overview`](sklad.md#skladoverview) | `sklad.read` | Přehled zásob se stavy po umístěních a souhrnem. |
| [`sklad.post`](sklad.md#skladpost) | `sklad.write` nebo `sklad.issue` nebo `sklad.inventory` |  |
| [`sklad.terminal.items`](sklad.md#skladterminalitems) | `sklad.issue` nebo `sklad.read` | Hledání skladových karet pro rychlý výdej v terminálu: název, kód nebo EAN (bez ohledu na diakritiku), jen aktivní karty s množstvím na skladě. Vrací jen to, co k výdeji řemeslník potřebuje; ceny nikdy. |
| [`sklad.warehouseStock`](sklad.md#skladwarehousestock) | `sklad.read` | Zásoby na jednom umístění. |

## Stroje a vozidla

Podrobně: [prikazy/stroje.md](stroje.md).

| Příkaz | Oprávnění | Popis |
| --- | --- | --- |
| [`stroje.assetCosts`](stroje.md#strojeassetcosts) | `stroje.write` | Náklady stroje za posledních 12 měsíců: palivo bez DPH, servis a provoz; na jednotku. |
| [`stroje.defect.report`](stroje.md#strojedefectreport) | `stroje.log` nebo `stroje.write` | Hlášení z terénu: závada, úkol odpovědné osobě; blokující závada stroj odstaví. |
| [`stroje.defect.resolve`](stroje.md#strojedefectresolve) | `stroje.write` |  |
| [`stroje.fleet`](stroje.md#strojefleet) | `stroje.read` | Přehled vozového parku: karty se stavem, termíny, závadami a dnešní rezervací. |
| [`stroje.fuel`](stroje.md#strojefuel) | `stroje.read` |  |
| [`stroje.fuel.delete`](stroje.md#strojefueldelete) | `stroje.log` nebo `stroje.write` |  |
| [`stroje.fuel.save`](stroje.md#strojefuelsave) | `stroje.log` nebo `stroje.write` |  |
| [`stroje.interval.delete`](stroje.md#strojeintervaldelete) | `stroje.write` |  |
| [`stroje.interval.save`](stroje.md#strojeintervalsave) | `stroje.write` |  |
| [`stroje.jobFleet`](stroje.md#strojejobfleet) | `stroje.read` | Stroje na zakázce: provoz × interní sazba, palivo účtované na zakázku, rezervace. |
| [`stroje.lastMeter`](stroje.md#strojelastmeter) | `stroje.log` nebo `stroje.write` nebo `stroje.read` | Poslední stav tachometru a trasa pro předvyplnění formuláře. |
| [`stroje.log.delete`](stroje.md#strojelogdelete) | `stroje.log` nebo `stroje.write` |  |
| [`stroje.log.save`](stroje.md#strojelogsave) | `stroje.log` nebo `stroje.write` |  |
| [`stroje.logs`](stroje.md#strojelogs) | `stroje.read` |  |
| [`stroje.options`](stroje.md#strojeoptions) | `stroje.read` nebo `stroje.log` | Stroje pro výběr ve formulářích a údaje o přihlášeném. |
| [`stroje.reservation.delete`](stroje.md#strojereservationdelete) | `stroje.write` |  |
| [`stroje.reservation.save`](stroje.md#strojereservationsave) | `stroje.write` |  |
| [`stroje.reservations`](stroje.md#strojereservations) | `stroje.read` |  |
| [`stroje.service`](stroje.md#strojeservice) | `stroje.read` |  |
| [`stroje.service.save`](stroje.md#strojeservicesave) | `stroje.write` |  |

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
| [`core.tasks.complete`](jadro.md#coretaskscomplete) | přihlášení | Odškrtnutí úkolu z terminálu (jde i přes zápisovou frontu). Oprávnění k úkolu hlídá `completeTask`. |
| [`core.tasks.mine`](jadro.md#coretasksmine) | přihlášení | Úkoly přihlášeného pro terminál: otevřené, termínované první, s názvem záznamu, ke kterému patří (jen když ho aktér smí vidět). |
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
| [`crm.contact.duplicates`](jadro.md#crmcontactduplicates) | `kontakty.read` | Kontrola duplicit podle IČO, e-mailu a telefonu (rychlé zadání a kvalifikace ukážou nalezené záznamy k výběru). |
| [`crm.contact.overview`](jadro.md#crmcontactoverview) | `kontakty.read` | Přehled obchodu u firmy nebo osoby: zakázky s fází a stavem (pro mini pás stavů), souhrn otevřených a vyhraných obchodů, kontaktní osoby, související firmy a (u osoby) účasti na zakázkách. Částky vidí jen, kdo má `zakazky.economics`; zakázky se řídí oprávněním `zakazky.read` (rozsah „jen moje“ platí). |
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
| [`crm.forecast`](jadro.md#crmforecast) | `zakazky.read` | Prognóza obchodů po měsících (`crm.forecast`). Agregace běží na serveru nad zakázkami v rozsahu aktéra (oprávnění ke čtení, rozsah „jen moje“); částky a váženou hodnotu dostane jen ten, kdo má `zakazky.economics`, jinak jsou `null` a sečtou se jen počty. Nearchivované otevřené obchody (poptávka, nabídka) padají do měsíců podle předpokládaného uzavření, vyhrané podle data výhry. Vstup: `owner` (`all`, `me`, id uživatele), `from` (první měsíc `YYYY-MM`, výchozí aktuální) a `months` (1 až 12, výchozí 4). |
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
| [`crm.today`](jadro.md#crmtoday) | `poptavky.read` | Data stránky „Moje dnešní práce“ (`crm.today`): (b) moje otevřené obchody bez další aktivity (zhnilé a nejdéle ve stavu první), (c) nové poptávky ve schránce (nejdéle čekající první). Dnešní a zpožděné aktivity bere stránka z komponenty `ActivityList`. Obchody a poptávky se čtou v rozsahu aktéra; cena nabídky jen s `zakazky.economics`. |
