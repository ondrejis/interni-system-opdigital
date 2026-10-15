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

## E-mailová knihovna (MPR-2)

Soukromá databáze e-mailů a textů na cokoli (KNI-01), oddělená od sdílených šablon. Vidí ji a spravuje jen vlastník (oprávnění `muj-prostor.email_library`); nic z ní nejde do hledání ani seznamů ostatních. Položka je název, kategorie, štítky (číselník `tag`, spravuje se v Nastavení → Štítky), předmět a **prostý text** s proměnnými `{jmeno}`, `{firma}`, `{obchod}`, `{zakazka}`, `{odesilatel}`.

**Stránka `/muj-prostor/knihovna`** (UI modulu, `library/library-page.tsx`): vlevo hledání a filtry kategorie a štítku, vpravo detail. Hledání je bez diakritiky a velikosti písmen, každé slovo musí být v názvu, kategorii, předmětu, textu nebo štítku (hodnota i popisek); řeší ho server (`library/data.ts#listLibrary`). Generický seznam entity (filtry, uložené pohledy, export, plný detail s historií) je na `/muj-prostor/knihovna/vse`; detail položky v aplikaci i z globálního hledání otevírá stránku knihovny (`/muj-prostor/knihovna/<id>`).

**Náhled s daty kontaktu.** V detailu se vybere kontakt (případně organizace, obchod, zakázka) a text se vyplní. Katalog proměnných je týž jako u šablon e-mailů: příspěvky `emailVars` zapnutých modulů doplněné výchozími (`library/preview.ts#buildCatalog`), `{odesilatel}` doplní knihovna sama jménem přihlášeného. Vykreslení dělá `renderEmailTemplate` z jádra (`library/logic.ts#buildPreview`). Pravidla:

1. Bez vybraného záznamu zůstanou proměnné v textu jako `{klic}` (text jde zkopírovat i takto).
2. Vybraný kontakt doplní i svou hlavní organizaci; vybraná organizace sama použije svůj hlavní kontakt (je vidět v popisku náhledu).
3. Proměnná, kterou nikdo nevyplnil, se v textu změní na prázdný řetězec a v náhledu je zvýrazněná (R-46); proměnná mimo katalog (překlep) zůstane v textu a je hlášená zvlášť.
4. Adresát je hlavní e-mail kontaktu, jinak e-mail organizace.
5. Odkaz do Gmailu (`https://mail.google.com/mail/?view=cm…`) a `mailto:` se nabídnou jen do délky `GMAIL_URL_MAX` (2000 znaků); delší text jde jen zkopírovat (R-46). Kopírování jedním klikem: text, nebo předmět zvlášť.

**Přesun do sdílených šablon a zpět (KNI-02)** (`library/move.ts`, příkaz `muj-prostor.library.move`): přes službu modulu `sablony-emailu` (`emailTemplates`: `importText`, `exportText`, `remove`), v jedné transakci. Do šablon jde název, kategorie, předmět, text i dokument Tiptap (z prostého textu), původní položka jde do koše; kopie původní nechá. Ze šablony do knihovny se formátování zploští na prostý text. Akci „Přesunout do knihovny“ nabízí knihovna přímo na detailu šablony (`recordActions.email_template`). Bez služby šablon (modul vypnutý) se nic nepřesune. Služba zatím není v `ServiceMap` ani v `SERVICE_OWNERS` (viz `docs/opsys/ZADOSTI.md`), proto ji knihovna bere bez typové kontroly (`emailTemplatesPort`).

**Hrany.** Úprava textu vynuluje uložený dokument Tiptap (`bodyJson`), aby se texty nerozcházely. Štítek, který pro cíl neplatí, se při přesunu vynechá. Text je prostý; formátování (tučné, odrážky) knihovna nezná.

## Soukromé (MPR-2)

Stránka `/muj-prostor/soukrome` (SOUK-01; oprávnění `muj-prostor.private_overview` a zároveň `private.read`, tedy jen vlastník) ukazuje všechny soukromé záznamy na jednom místě, seskupené podle typu: zakázky, úkoly a poznámky nahoře, pak ostatní typy se zámkem (obchody, organizace, kontakty, platby, hodiny, šablony e-mailů…) podle názvu. U každého typu je počet a nejnověji upravené záznamy (nejvýš 100) s odkazem na záznam a stručným popisem (stav, termín, částka).

Přehled nečte tabulky jiných modulů. Projde entity z registru, které mají `visibility`, a každou zeptá přes engine entit s filtrem `isPrivate` (`private/data.ts#loadPrivateOverview`), takže platí oprávnění i rozsah „jen moje“ a modul s vypnutou entitou se prostě nezobrazí. Kdo nemá `private.read`, dostane prázdný přehled; příkaz `muj-prostor.private.overview` mu navíc vrátí `PermissionError`. Čtecí cesta je zapsaná v `privatePaths` pro canary test.

**Nová soukromá poznámka** (tlačítko na stránce, Cmd+K, příkaz `muj-prostor.private.createNote`): samostatná poznámka bez vazby na obchod, zakázku ani kontakt, soukromá od vzniku. Zakládá ji služba `tasks.createPrivateNote` modulu Úkoly (text se předá jako dokument Tiptap); knihovna do tabulky poznámek nezapisuje. Bez zapnutého modulu úkolů se tlačítko nenabídne.

## Opakované faktury (MPR-3, v3)

U hostingu a údržby (`recurring_service`) jde zapnout „Připravovat fakturu“ (`auto_prepare_invoice`) a nastavit, kolik dní předem (`invoice_lead_days`, výchozí 14). Návrh faktury za období služby pak vzniká sám, schvaluje ho a ve Fakturoidu vytváří vlastník (FAK-01 až FAK-03). Systém **nikdy nic neposílá**: žádný e-mail ani notifikace, návrh je vidět jen na stránce `/muj-prostor/faktury` (UI `invoices/invoices-page.tsx`), v odznaku u položky menu a v sekci „Opakované faktury“ v záložce „Hosting a domény“ na kartě klienta (`invoices/client-section.tsx`).

**Tok krok za krokem**

1. Úloha `muj-prostor.invoices.prepare` (denně 5:30, `invoices/index.ts#area`; stejné je tlačítko „Připravit návrhy teď“ a příkaz `muj-prostor.invoices.prepare`) projde aktivní služby se zapnutým „připravovat fakturu“, jejichž další obnova je za `invoice_lead_days` dní nebo dřív (i po termínu, dohnání), a založí návrh `draft`: období od data obnovy do dne před další obnovou o období (`invoices/logic.ts#invoicePeriod`), částka = cena služby. Pro službu a začátek období je návrh jen jeden (unikátní index), takže opakované spuštění nic nezdvojí; zrušený návrh se znovu nevytváří. Služba bez ceny se nepřipraví a stránka ji vypíše („doplňte cenu“). Úloha navíc dožene platby u hotových faktur, kterým platba chybí (`invoices/data.ts#reconcileInvoicePayments`).
2. **Upravit** (`muj-prostor.invoices.update`): jen částku konceptu; schválená a hotová faktura se mění ve Fakturoidu (entita to hlídá i v generickém editoru).
3. **Schválit a vytvořit ve Fakturoidu** (`muj-prostor.invoices.approve`, dialog se souhrnem; `invoices/data.ts#approveInvoice`): pod zámkem řádku návrhu a služby se (a) najde nebo založí odběratel (id uložené u služby → jiná služba téhož klienta → hledání podle `custom_id` a podle IČO → založení z údajů organizace), (b) hledá faktura podle `custom_id` = `opsys-ri-<id návrhu>` a když neexistuje, vytvoří se (jeden řádek, částka v Kč, bez DPH, měna CZK), (c) návrh přejde do `sent_to_fakturoid` s číslem a odkazem, (d) další obnova služby se posune o období (jen pokud ji mezitím nikdo neposunul ručně; tentýž výpočet jako „Označit obnovu“), (e) přes službu `finance.createStandalonePayment` vznikne platba: bez zakázky, druh `recurring`, vždy soukromá, celá vlastníkovi, mimo vyrovnání s Patrikem (R-12), číslo a odkaz faktury jsou na platbě. Příkaz nese částku, kterou uživatel viděl; při neshodě se nic nevytvoří.
4. **Zrušit** (`cancel`) koncept nebo schválený návrh, **Obnovit** (`reopen`) zrušený do konceptu. Zrušit nejde návrh, k němuž už ve Fakturoidu faktura existuje (je třeba dokončit schválení, faktura se převezme); hotovou fakturu stornujete ve Fakturoidu.

**Idempotence a chyby.** Druhé kliknutí, obnovení stránky nebo souběžné volání počká na zámek řádku a uvidí hotovou fakturu; nevznikne druhá faktura ani druhá platba. Chyba Fakturoidu (přihlášení, validace 422, limit, výpadek, časový limit) nechá návrh ve stavu `approved` s důvodem v `error`, další obnova se neposune a schválení jde zopakovat. Když Fakturoid fakturu vytvořil, ale odpověď se ztratila (časový limit), další pokus ji najde podle `custom_id` a převezme. Selže-li jen platba (modul Finance vypnutý nebo chyba), faktura zůstane hotová, `error` říká proč, stránka nabídne „Doplnit platbu“ a úloha ji dohoní.

**Stavy** (`invoice_status`): `draft` (koncept, jde upravit, schválit, zrušit) → `approved` (schválený, Fakturoid zatím fakturu nevytvořil; jde zopakovat nebo zrušit) → `sent_to_fakturoid` (hotovo, nejde měnit) a `canceled` (jde obnovit do `draft`).

**Fakturoid: adaptér.** Aplikace volá jen rozhraní `FakturoidClient` (`invoices/fakturoid/client.ts`): test spojení, hledání a založení odběratele, hledání (podle `custom_id`), vytvoření a načtení faktury. Reálný klient (`fakturoid/http-client.ts#createHttpFakturoidClient`) mluví s API v3 (`https://app.fakturoid.cz/api/v3`) přes `fetch`: OAuth 2 client credentials (`POST /oauth/token`, Basic z Client ID a Client Secret, token na ~2 h v paměti, při 401 jedno obnovení), hlavička `User-Agent: OPSYS (kontakt)`, časový limit 15 s, opakování GET při 429/503/5xx/výpadku sítě, u zápisu jen při 429 a 503 (po časovém limitu se nezapisuje znovu, duplicitu řeší hledání podle `custom_id`), mapování chyb na `FakturoidError` s českou hláškou bez tajných hodnot. Pro testy a vývoj je `fake-client.ts#createFakeFakturoid` (stav v paměti, vstřikování chyb, ztracená odpověď). Výběr klienta dělá `fakturoid/index.ts#resolveFakturoid`: přepsání v testu (`setFakturoidClientOverride`) → vývojový režim `FAKTUROID_MODE=fake` (jen pro lokální vývoj a e2e, faktury jdou jen do paměti procesu) → uložený přístup.

**Nastavení Fakturoidu bez tajemství.** V repu ani v `.env` není nic: vlastník vyplní v **Nastavení → Integrace** panel „Fakturoid“ (`invoices/fakturoid-panel.tsx`, slot `settings.integrations`, vidí ho jen vlastník): název účtu (z adresy `app.fakturoid.cz/<účet>`), Client ID a Client Secret (Fakturoid → Nastavení → Uživatelský účet), kontaktní e-mail do hlavičky požadavků. Uloží se šifrovaně (AES-256-GCM přes `cipher`) do `integration_credential` s poskytovatelem `fakturoid`; do prohlížeče se secret nikdy nevrací (panel ukáže jen poslední čtyři znaky Client ID), prázdný secret při úpravě ponechá uložený, do auditu jde jen „uložen přístup“. „Otestovat spojení“ načte účet a výsledek (i chybu) ukáže přímo v panelu; stav `ok/reauth/error` se uloží. Změna názvu účtu zapomene uložená id odběratelů (patří k jinému účtu); „Odpojit“ přístup smaže. Bez nastavení jde návrhy připravovat, ale schválit ne.

**Oprávnění a soukromí.** Vše pod `muj-prostor.recurring_invoices` (jen vlastník); Patrik příkazy nemá, odznak je 0 a platba z Fakturoidu je soukromá, takže ji nevidí ani v seznamech, součtech nebo salda. Úkon uložení přístupu vyžaduje navíc `settings.integrations`.

**Hrany.** Faktura se vystavuje dnešním datem (ne datem obnovy), splatnost určí nastavení účtu ve Fakturoidu. Fakturoid neumí bankovní účet nastavit přes API, ten musí být v účtu před prvním pokusem. Faktura je jeden řádek s celkovou částkou za období. Stavy faktury po vytvoření (zaplacená, po splatnosti) OPSYS ze Fakturoidu nečte; platba se v OPSYS označuje jako zaplacená ručně ve financích. Souběh dvou spojení se v integračním testu nedá ověřit (testovací databáze je jedno připojení), spoléhá se na zámek řádku (`SELECT … FOR UPDATE`) a na vyhledání podle `custom_id`.

## Odkazy na kód a testy

<!-- Hlavní místa v kódu a testy, které chování zajišťují, ve tvaru `cesta/soubor.ts#symbol`. -->

- `packages/modules/muj-prostor/src/domains/logic.ts#expiryState`, `#parseDomainList`; `hosting/logic.ts#shiftRenewal`, `#summarizeServices` (unit testy `logic.test.ts`).
- `packages/modules/muj-prostor/src/hosting/commands.ts#hostingMarkRenewed`, `domains/commands.ts#domainsBulkAdd`.
- `tests/muj-prostor-hosting-domeny.int.test.ts`, `apps/web/e2e/muj-prostor-hosting-domeny.spec.ts`.
- `packages/modules/muj-prostor/src/invoices/logic.ts#invoicePeriod`, `#isDueForPreparation`, `#invoiceLineName` (unit testy `invoices/logic.test.ts`); `invoices/data.ts#prepareInvoiceDrafts`, `#approveInvoice`, `#cancelInvoice`, `#reconcileInvoicePayments`, `#saveFakturoid`.
- `packages/modules/muj-prostor/src/invoices/fakturoid/http-client.ts#createHttpFakturoidClient` (unit testy `http-client.test.ts`), `fakturoid/fake-client.ts#createFakeFakturoid`, `fakturoid/index.ts#resolveFakturoid`.
- `tests/muj-prostor-faktury.int.test.ts`, `apps/web/e2e/muj-prostor-faktury.spec.ts` (potřebuje `FAKTUROID_MODE=fake`).
