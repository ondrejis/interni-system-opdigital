# OPSIS 00 – Přehled, rozhodnutí a fáze

Oct 7, 2026 · @Ondřej Dvořák

## Co je OPSIS

OPSIS je interní operační systém agentury OP Digital pro dva uživatele: Ondřeje (owner) a Patrika (partner). Nahrazuje Pipedrive, řídí zakázky tří typů (Web, Marketing, Systémy), eviduje rozdělení příjmů mezi dvě IČO a každého klienta propojuje se sdíleným Google Diskem a Google Kalendáři. Běží online na veřejné doméně s povinným dvoufaktorovým přihlášením. Je desktop-first a na mobilu optimalizovaný pro rychlé dohledání klienta, kontaktu nebo zakázky na cestách.

**Hlavní principy**

- **Rychlost nadevše.** Přepnutí obrazovky a uložení změny musí působit okamžitě (cíl pod 100 ms vnímané odezvy). Proto SPA s cache a optimistickými updaty, viz dokument 01.
- **Jeden zdroj pravdy o klientovi.** Klient zůstává v systému navždy, i když spolupráce skončí, s kompletní historií a kontextem.
- **Transparentnost mezi partnery.** Společné zakázky a jejich rozdělení vidí oba celé. Soukromé věci Ondřeje Patrik nevidí vůbec.
- **Každá změna je dohledatelná.** Activity log je podmínka, ne doplněk.
- **Nepřeplácané.** Co není v rozsahu, se nestaví, ani „jen napůl“.

**V rozsahu**

- CRM podle Pipedrivu: pipeline a fáze obchodů (kanban), organizace a kontaktní osoby, aktivity (hovor, schůzka, e-mail, úkol, termín), vlastní pole, štítky, filtry a uložené pohledy, důvody prohry, historie změn (timeline)
- Automatické doplnění firmy z ARES podle IČO
- Klienti s kompletní kartou (360°) a historií
- Zakázky: Web, Marketing (poptávkové kampaně), Systémy; editovatelné fáze a šablony
- Úkoly propojené se zakázkami, obchody a klienty
- Výkazy hodin (ruční zápis, bez stopek)
- Evidence plateb a rozdělení příjmů (procenta / fixní částka), přehled vyrovnání „kdo komu dluží“
- Google Disk: automatické složky klienta a zakázky přes n8n, tlačítko „Otevřít Disk“
- Google Kalendář: plná obousměrná synchronizace pro oba uživatele
- Meta: příjem leadů přes n8n webhook do první fáze pipeline, ad spend propojený s leady
- Přizpůsobitelný dashboard (grid s widgety) pro každého uživatele
- Šablony e-mailů (sdílené) + soukromá e-mailová knihovna Ondřeje
- Jen pro Ondřeje: hosting a údržba webů, domény s hlídáním expirace, opakované faktury, soukromé zakázky / poznámky / úkoly
- Granulární oprávnění (zapínání a vypínání funkcí pro každého uživatele)

**Mimo rozsah (nestavět)**

- Leads Inbox (leady jdou rovnou do první fáze pipeline)
- Builder automatizací a workflow (automatizace se řeší v n8n)
- Synchronizace Gmailu, automatické follow-upy, notifikace
- Vystavování faktur klientům ze systému (každý fakturuje ve svém nástroji; výjimka je Ondřejova opakovaná fakturace přes Fakturoid)
- Import historických dat z jiných systémů
- Ukládání přístupů a hesel klientů
- Generátor nabídek
- Napojení na Asanu

## Mapa dokumentace a instrukce pro AI agenta

Specifikace má pět dokumentů. Agent je čte v tomto pořadí a staví po fázích podle sekce „Fáze implementace“ níže.

| Dokument | Obsah | Kdy ho agent potřebuje |
| --- | --- | --- |
| 00 – Přehled, rozhodnutí a fáze | rozsah, role, moduly, rozhodnutí, fáze, otevřené body | vždy jako první |
| 01 – Architektura a tech stack | stack, infrastruktura, auth a 2FA, engine oprávnění, integrace, výkon, bezpečnost | před založením repozitáře |
| 02 – Datový model | tabulky, vztahy, enumy, indexy, pravidla viditelnosti | před první migrací |
| 03 – Funkční specifikace | chování každého modulu, obrazovky, akce, pravidla, akceptace | při stavbě každé funkce |
| 04 – Design systém | tokeny, typografie, komponenty, layout, mobil, zkratky, anti-patterny | při každé změně UI |

**Pravidla pro agenta**

1. Stav jen to, co je v aktuální fázi. Věci mimo rozsah nepřidávej ani jako „připravené pro budoucnost“, pokud to spec výslovně neříká.
2. Při rozporu mezi dokumenty platí pořadí 00 → 03 → 02 → 01 → 04. Rozpor nahlas ohlas, netipuj.
3. UI texty jsou česky, kód, názvy tabulek, sloupců a proměnných anglicky.
4. Každá změna dat jde přes servisní vrstvu, která (a) ověří oprávnění, (b) aplikuje pravidla viditelnosti, (c) zapíše záznam do activity logu. Přímé zápisy do DB mimo servisní vrstvu jsou zakázané.
5. Každá obrazovka používá výhradně komponenty a tokeny z dokumentu 04. Žádné ad-hoc barvy, stíny ani velikosti.
6. Povinné testy: oprávnění a viditelnost (unit + integrační), výpočty rozdělení a vyrovnání (unit s hraničními případy), ingest endpointy (integrační).
7. Seed skript vytvoří oba uživatele, výchozí pipeline, typy aktivit, důvody prohry, šablony zakázek a ukázková data pro vývoj.
8. Na konci každé fáze zkontroluj akceptační kritéria a vypiš, co splněno není.

## Uživatelé, role a viditelnost

Ondřej je owner a vidí vždy všechno. Patrik dostává oprávnění po jednotlivých funkcích. Záznamy Ondřeje mají přepínač Sdílené / Soukromé, Patrikovy záznamy jsou Ondřejovi viditelné vždy.

| Role | Kdo | Co smí | Stav |
| --- | --- | --- | --- |
| Owner | Ondřej | všechno včetně nastavení, oprávnění, uživatelů a modulů „jen pro Ondřeje“ | aktivní |
| Partner | Patrik | to, co mu owner zapne v matici oprávnění (výchozí: CRM, klienti, zakázky, úkoly, kalendář, finance společných zakázek, hodiny, šablony e-mailů) | aktivní |
| Externista | budoucí freelancer | jen přiřazené zakázky a úkoly | jen připravená v datech a matici, v UI se nezakládá |

**Pravidla viditelnosti**

1. Owner vidí všechny záznamy všech uživatelů bez výjimky.
2. Každý hlavní záznam (organizace, kontakt, obchod, zakázka, úkol/aktivita, poznámka, šablona e-mailu) má pole `visibility` = `shared` | `private` a `created_by`.
3. Záznam vytvořený Partnerem je vždy `shared`. Partner přepínač nevidí.
4. Záznam vytvořený Ownerem má výchozí hodnotu `shared`. Owner ji může přepnout na `private` při vytvoření i kdykoli později (ikona zámku v hlavičce záznamu, zkratka v menu).
5. `private` záznam Partner nevidí nikde: v seznamech, vyhledávání, kalendáři, dashboardu, activity logu ani v počtech a součtech.
6. Dědění: podřízené záznamy (úkoly, poznámky, platby, hodiny) soukromé zakázky nebo obchodu jsou soukromé automaticky.
7. Přiřazení soukromého záznamu Partnerovi není možné. UI nabídne „Zveřejnit a přiřadit“ s potvrzením.
8. Moduly „jen pro Ondřeje“ (hosting a údržba, domény, opakované faktury, e-mailová knihovna) jsou v matici oprávnění vedené zvlášť a ve výchozím stavu jsou pro Partnera vypnuté.
9. Rozdělení příjmů a vyrovnání u sdílených zakázek vidí oba v plném rozsahu.

**Matice oprávnění**

Owner v Nastavení → Oprávnění zapíná pro každého uživatele zvlášť: přístup k modulu (vidět / vytvářet / upravovat / mazat) a speciální práva (export dat, správa pipeline a fází, správa šablon, správa vlastních polí, vidět finance, zapisovat platby, zapisovat vyrovnání). Detail je v dokumentu 01, sekce Oprávnění.

## Přehled modulů

Systém má 15 sdílených modulů a 4 moduly jen pro Ondřeje. Pořadí v tabulce odpovídá pořadí v levém panelu.

| Modul (sidebar) | Pro koho | Fáze | Jedna věta |
| --- | --- | --- | --- |
| Přehled (dashboard) | oba, každý svůj | MVP (widgety rozšíří v2) | grid s widgety, každý si ho poskládá sám |
| Hledání (Cmd+K) | oba | MVP | fulltext přes všechno, bez diakritiky, telefony bez mezer |
| Obchody | oba | MVP | pipeline, kanban i seznam, vyhráno / prohráno |
| Klienti | oba | MVP | karta 360° klienta, stav Lead / Aktivní / Pozastavený / Bývalý |
| Organizace a kontakty | oba | MVP | firmy (ARES) a kontaktní osoby, i ty, co klienty nejsou |
| Zakázky | oba | MVP | Web / Marketing / Systémy, fáze, šablony, členové |
| Úkoly a aktivity | oba | MVP | jeden typ záznamu pro úkoly i CRM aktivity |
| Poznámky | oba | MVP | poznámky ke klientovi, obchodu, zakázce nebo samostatné |
| Finance | oba | MVP | platby, rozdělení, vyrovnání mezi IČO |
| Activity log | oba | MVP | kdo, co, kdy, změny po polích |
| Kalendář | oba | v2 | obousměrná synchronizace s Google Kalendáři obou uživatelů |
| Hodiny | oba | v2 | ruční výkazy k úkolu nebo zakázce |
| Reklama | oba | v2 | Meta ad spend, leady, CPL podle kampaní |
| Šablony e-mailů | oba | v2 | sdílené šablony s proměnnými, otevření v Gmailu |
| Nastavení | owner (část i Partner) | MVP | uživatelé, oprávnění, pipeline, pole, šablony, integrace |
| Hosting a údržba | jen Ondřej | v2 | kdo platí hosting a údržbu, ceny, obnovy |
| Domény | jen Ondřej | v2 | evidence domén, upozornění na expiraci v aplikaci |
| E-mailová knihovna | jen Ondřej | v2 | soukromá databáze e-mailů a textů |
| Opakované faktury | jen Ondřej | v3 | roční faktury za hosting a údržbu přes Fakturoid |

Protéká celým systémem: ARES (MVP), Google Disk přes n8n (MVP), příjem leadů z Meta přes n8n (v2), Google Kalendář (v2), Meta Marketing API (v2), Fakturoid (v3).

## Klíčová rozhodnutí

Tato rozhodnutí jsou uzavřená. Agent je nemění bez souhlasu Ondřeje.

| Oblast | Rozhodnutí | Důvod |
| --- | --- | --- |
| Vztah k Flowmanageru | žádný, stavíme od nuly | samostatný systém pro dva lidi |
| Název | OPSIS | brand se doladí později |
| Přístup | veřejná doména, login + povinné 2FA (TOTP) | práce z mobilu a odkudkoli, bez VPN |
| Frontend | React SPA (Vite, TanStack Router + Query) | nejrychlejší vnímaná odezva za loginem, SSR nic nepřináší |
| Backend a DB | Hono (Node.js, TypeScript) + PostgreSQL + Drizzle | typy end-to-end, jednoduchý provoz na VPS |
| Leady | bez Leads Inboxu, leady padají do fáze „Nová poptávka“ | jednodušší proces |
| Úkoly vs. aktivity | jedna entita `task` s typem (úkol, hovor, schůzka, e-mail, termín) | žádná duplicita, jeden kalendář a jeden seznam „na dnes“ |
| Klient | organizace se stavem klienta, ne samostatná tabulka | lead i bývalý klient je stejná firma s historií |
| Vyhraný obchod | dialog nabídne založení zakázky podle typu služby a šablony, uživatel potvrdí | zakázka nevznikne bez kontroly |
| Fakturace | systém faktury nevystavuje, jen eviduje platby: kdo fakturoval, kolik, číslo faktury, stav | každý fakturuje ve svém nástroji |
| Rozdělení příjmů | pravidla na zakázce (procenta nebo fixní částka na osobu), přepsatelná u jednotlivé platby | každá zakázka je jiná |
| DPH | nikdo není plátce, částky bez DPH logiky | zjednodušení |
| Měna | CZK, částky v haléřích jako integer | přesnost výpočtů |
| Google Disk | Shared Drive, složky vytváří n8n na webhook z OPSIS, ID složek se vrací zpět | Ondřej chce složky řídit v n8n |
| Notifikace a follow-upy | zatím žádné; upozornění jen vizuálně v aplikaci (badge, dashboard) | nepřeplácat první verzi |
| Hodiny | ruční zápis, bez stopek | stačí pro přehled ziskovosti |
| Design | jazyk inspirovaný Linearem, vlastní tokeny, světlý i tmavý režim | čisté, husté, rychlé UI |

## Fáze implementace

MVP obsahuje všechno, bez čeho nejde každodenní práce. v2 přidá integrace a moduly jen pro Ondřeje, v3 fakturaci a rozšíření. Další fáze začíná až po splnění brány té předchozí.

&#91;embedded content: fáze implementace · 3 fáze, 3 brány\]

Zvýrazněná je fáze, kterou agent staví jako první.

**Akceptační kritéria MVP**

- [ ] Oba uživatelé se přihlásí heslem a TOTP; bez 2FA se do aplikace nedostanou.
- [ ] Partner nevidí žádný soukromý záznam Ownera v seznamu, detailu, hledání, dashboardu, logu ani součtech (pokryto testy).
- [ ] Zadání IČO doplní název, adresu a DIČ z ARES do 2 s.
- [ ] Obchod jde přetáhnout mezi fázemi v kanbanu; prohra vyžaduje důvod; výhra nabídne založení zakázky.
- [ ] Založení klienta i zakázky odešle webhook do n8n a do 60 s se u nich objeví funkční tlačítko „Otevřít Disk“.
- [ ] Zakázka vznikne ze šablony včetně fází a úkolů s termíny posunutými od data startu.
- [ ] U zakázky jde nastavit rozdělení (procenta / fixně), zapsat platbu s fakturujícím a saldo vyrovnání sedí na testovacích scénářích z dokumentu 03.
- [ ] Každá změna kteréhokoli záznamu je v activity logu s autorem, časem a změnou po polích.
- [ ] Cmd+K najde klienta podle názvu bez diakritiky, IČO i části telefonního čísla do 150 ms.
- [ ] Na mobilu jde do 3 ťuknutí najít klienta a zavolat jeho kontaktní osobě.
- [ ] Přepnutí mezi již načtenými obrazovkami trvá pod 100 ms.

**Akceptační kritéria v2**

- [ ] Schůzka vytvořená v OPSIS se objeví v Google Kalendáři a změna v Google Kalendáři se propíše zpět do 1 minuty.
- [ ] Lead z Meta formuláře vytvoří kontakt (bez duplicit podle e-mailu a telefonu) a obchod ve fázi „Nová poptávka“ se zdrojovou kampaní.
- [ ] U kampaně je vidět denní spend, počet leadů a CPL; u pipeline náklad na vyhraný obchod.
- [ ] Doména 30 dní před expirací je zvýrazněná v modulu Domény a ve widgetu dashboardu.

**Akceptační kritéria v3**

- [ ] Roční faktura za hosting nebo údržbu se připraví jako návrh, Ondřej ji potvrdí a vznikne ve Fakturoidu se správným odběratelem a částkou.

## Otevřené body

Žádný z těchto bodů neblokuje start MVP. Spec u každého uvádí výchozí řešení, které se později jen přenastaví.

- [ ] **Způsob vyrovnání mezi IČO.** Faktura mezi vámi jednou měsíčně, nebo po každé platbě? Výchozí: systém jen počítá saldo a eviduje ručně zapsaná vyrovnání.
- [ ] **Patrikův fakturační nástroj.** Jak se jmenuje a jestli ho v budoucnu napojit. Výchozí: bez napojení, čísla faktur se zapisují ručně.
- [ ] **Ad spend: čí kampaně.** Vaše akviziční kampaně (náklad na vlastní leady a vyhrané obchody), kampaně klientů (spend a CPL u marketingových zakázek), nebo obojí? Výchozí: datový model umí obojí, v2 začne vašimi kampaněmi.
- [ ] **Úvodní fáze marketingu.** 14 000 Kč = 2 × 7 000 Kč, první fakturuje Patrik, druhou Ondřej. Platí, že si každý nechá svých 7 000 Kč (rozdělení 50/50 bez vyrovnání)?
- [ ] **Kdo fakturuje retainer.** Vždy stejný člověk, střídání po měsících, nebo podle zakázky? Výchozí: nastavitelné u každé zakázky.
- [ ] **Fáze zakázek.** Výchozí fáze Web / Marketing / Systémy jsou v dokumentu 03 a jdou upravit v nastavení šablon.
- [ ] **Výchozí fáze pipeline.** Návrh je v dokumentu 03, potvrdit nebo upravit.
- [ ] **Struktura složek na Disku.** Návrh je v dokumentu 03, potvrdit.
- [ ] **Doména a hosting OPSIS.** Výchozí: subdoména na vaší doméně, Docker na stávajícím Hostinger VPS.
- [ ] **Pozvánky na schůzky.** Má OPSIS při vytvoření schůzky posílat pozvánku účastníkům z Google Kalendáře? Výchozí: vypnuto, zapíná se u každé schůzky zvlášť.
