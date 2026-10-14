# OPSIS – Logická specifikace funkcí

Oct 13, 2026 · @Ondřej Dvořák

## Co je OPSIS

OPSIS je interní systém agentury OP Digital pro Ondřeje a Patrika. Na jednom místě drží obchody, klienty, zakázky, úkoly, kalendář, peníze a jejich rozdělení mezi dvě IČO. Každého klienta propojuje s jeho složkou na sdíleném Google Disku. Dokument popisuje, co systém dělá a podle jakých pravidel. Neřeší, jak je to naprogramované.

**Pro koho**

- **Ondřej (vlastník systému)** vidí a smí všechno. Navíc má vlastní soukromou část.
- **Patrik (partner)** pracuje s obchody, klienty, zakázkami, úkoly a financemi společných zakázek. Co přesně smí, nastavuje Ondřej.

**Principy**

1. **Jeden klient, jedna karta, celá historie.** Klient v systému zůstává navždy, i když spolupráce skončila, se vším, co se s ním kdy dělo.
2. **Transparentnost mezi partnery.** Společné zakázky, jejich rozdělení a vzájemné dluhy vidí oba celé.
3. **Soukromé zůstává soukromé.** Co si Ondřej označí jako soukromé, Patrik nevidí nikde, ani v součtech.
4. **Každá změna je dohledatelná.** Systém zapisuje, kdo co kdy změnil, a tento záznam nejde upravit ani smazat.
5. **Rychlost.** Přepnutí obrazovky a uložení změny působí okamžitě. Častá práce jde dělat z klávesnice.
6. **Nepřeplácané.** Žádné automatické follow-upy, notifikace ani builder automatizací. Automatizace řeší n8n mimo systém.
7. **Funguje na cestách.** Na mobilu jde do pár ťuknutí najít klienta, zavolat mu nebo otevřít jeho složku.

**Fáze**: funkce jsou označené fází, ve které vzniknou: **MVP** (základ pro denní práci), **v2** (propojení a přehledy), **v3** (fakturace a rozšíření). Co označení nemá, patří do MVP.

## Hlavní průchod systémem

Většina práce v OPSIS jde po jedné cestě: lead se stane obchodem, vyhraný obchod zakládá zakázku a její složku na Disku, platby zakázky se rozdělí mezi vás a z rozdělení vzniká saldo, kdo komu dluží.

&#91;embedded content: hlavní průchod systémem · od leadu po vyrovnání\]

Úkoly, poznámky a historie změn provázejí všechny kroky. Klient zůstává v systému i po skončení spolupráce.

## Uživatelé, role a viditelnost

O tom, co kdo vidí, rozhodují dvě věci: **oprávnění** (co smí dělat) a **viditelnost záznamu** (jestli je sdílený, nebo soukromý). Ondřej vidí vždy všechno.

**Role**

| Role | Kdo | Co smí |
| --- | --- | --- |
| Vlastník | Ondřej | všechno, včetně nastavení, oprávnění, uživatelů a soukromé části |
| Partner | Patrik | to, co mu Ondřej zapne (výchozí: obchody, klienti, kontakty, zakázky, úkoly, poznámky, kalendář, finance společných zakázek, hodiny, šablony e-mailů, historie změn) |
| Externista | budoucí freelancer | jen zakázky a úkoly, ke kterým je přiřazený; zatím se nepoužívá |

**Přihlášení**

- Systém běží online na vlastní adrese. Přihlášení je e-mailem, heslem a vždy i druhým faktorem (kód z aplikace v telefonu). Bez druhého faktoru se nikdo dál nedostane.
- Účty zakládá jen Ondřej pozvánkou. Sám se zaregistrovat nejde.
- Zařízení jde označit jako důvěryhodné; kód se pak 30 dní nevyžaduje.
- Každý vidí svá přihlášená zařízení a může je odhlásit. Ondřej může odhlásit kohokoli.

**Oprávnění**

- Ondřej v Nastavení zapíná a vypíná pro každého uživatele jednotlivé funkce: u každého modulu zvlášť vidět, vytvářet, upravovat a mazat, plus zvláštní práva (export, správa pipeline, šablon, polí a štítků, zápis plateb, úprava rozdělení, zápis vyrovnání, správa integrací).
- Funkce z části „Můj prostor“ jsou pro ostatní vypnuté. Ondřej je technicky může zapnout, ale výchozí je vypnuto.
- Změna oprávnění platí do několika sekund, i když je druhý zrovna přihlášený.

**Viditelnost záznamů**

1. Co vytvoří Patrik, je vždy sdílené a Ondřej to vidí.
2. Co vytvoří Ondřej, je ve výchozím stavu sdílené. Při vytvoření i kdykoli později to může přepnout na soukromé (ikona zámku).
3. Soukromý záznam Patrik nevidí nikde: v seznamech, hledání, kalendáři, přehledu, historii změn ani v součtech a počtech.
4. Co patří pod soukromý záznam (úkoly a poznámky soukromé zakázky, její platby a hodiny), je automaticky soukromé taky.
5. Soukromý úkol nejde přiřadit Patrikovi. Systém nabídne „Zveřejnit a přiřadit“ s potvrzením.
6. Rozdělení příjmů a vyrovnání u sdílených zakázek vidí oba celé.

## Společné funkce

Všechny moduly ovládáš stejně. Seznam, filtr, detail i vytváření fungují všude stejně, takže kdo zvládne obchody, zvládne i zakázky.

**Navigace**

- Levý panel se sekcemi: **Práce** (Přehled, Moje úkoly, Kalendář), **CRM** (Obchody, Klienti, Organizace, Kontakty), **Realizace** (Zakázky, Hodiny), **Finance** (Platby a rozdělení, Vyrovnání), **Marketing** (Reklama, Šablony e-mailů), **Můj prostor** (jen Ondřej), dole Historie změn, Koš a Nastavení.
- U položek se ukazují počty jen tam, kde je potřeba něco udělat (úkoly po termínu, platby po splatnosti, domény před expirací).
- Do panelu jde připnout vlastní uložené pohledy, např. „Moje otevřené obchody“.

**Seznamy**

- Každý modul má seznam s volitelnými sloupci. Pořadí a šířku sloupců jde měnit přetažením.
- Hodnoty jde upravit přímo v řádku (text, výběr, datum, osoba, štítky, částka).
- Více řádků jde označit a hromadně změnit vlastníka, štítky, fázi, stav nebo viditelnost, případně je smazat.
- Kde to dává smysl, jde seznam přepnout na board (sloupce podle fáze nebo stavu) nebo kalendář.

**Filtry a uložené pohledy**

- Filtr se skládá z podmínek „pole · operátor · hodnota“, např. „Fáze je Nabídka“, „Hodnota je větší než 50 000 Kč“, „Bez další aktivity“. Filtrovat jde podle všech polí včetně vlastních.
- Operátory podle typu pole: je, není, obsahuje, je prázdné, před, po, v posledních N dnech, mezi.
- Filtr, řazení, sloupce a seskupení jde uložit jako pohled, osobní nebo sdílený. Odkaz na filtrovaný seznam jde poslat druhému.
- Rychlé předvolby: Moje, Dnes, Po termínu, Bez aktivity, Soukromé (jen Ondřej).

**Detail záznamu**

- Všude stejná kostra: vlevo obsah, vpravo panel vlastností (každá hodnota jde upravit kliknutím), k tomu časová osa všeho, co se se záznamem dělo.
- Detail jde otevřít na celou obrazovku nebo jako náhled v bočním panelu nad seznamem.
- V hlavičce: název, stav nebo fáze, vlastník, zámek viditelnosti (jen Ondřej) a menu (duplikovat, smazat, kopírovat odkaz, zobrazit v historii).

**Vytváření**

- Tlačítko „Nový…“ nebo klávesa C otevře krátký formulář jen s nutnými poli. Ostatní se doplní v detailu.
- Přes hledání (Cmd+K) jde vytvořit cokoli odkudkoli.

**Mazání a koš**

- Smazání je vždy vratné: hned se objeví „Vrátit“ a záznam jde do koše.
- Koš drží záznamy 30 dní. Obnovení vrátí i to, co pod záznam patřilo.
- Nevratné nebo citlivé akce systém potvrzuje: trvalé smazání, změna oprávnění, zrušení retaineru, přepočet rozdělení zaplacené platby, sloučení duplicit.

**Štítky a vlastní pole**

- Štítky s barvou jde dávat na firmy, kontakty, obchody, zakázky a úkoly.
- Vlastní pole jde přidat k firmám, kontaktům, obchodům, zakázkám a úkolům. Typy: text, dlouhý text, číslo, částka, datum, výběr, vícenásobný výběr, osoba, odkaz, e-mail, telefon, zaškrtávací pole. U pole jde nastavit povinnost a jestli se ukazuje ve formuláři a v seznamu.
- Vlastní pole se nemaže, jen archivuje. Data v něm zůstanou.

**Realtime**: změnu, kterou udělá jeden, druhý uvidí do dvou sekund bez obnovení stránky.

## Přehled (dashboard)

Každý má svůj přehled poskládaný z widgetů. Widgety jde přidávat, přetahovat, zvětšovat, nastavovat a odebírat. Každý může mít víc přehledů (např. „Den“ a „Finance“) a přepínat mezi nimi.

- Úpravy se dělají v režimu „Upravit“. Mimo něj přehled nejde omylem rozházet.
- Na tabletu a mobilu se widgety skládají pod sebe ve stejném pořadí.

**Widgety**

| Widget | Co ukazuje | Fáze |
| --- | --- | --- |
| Úkoly na dnes | moje úkoly na dnes a po termínu, odškrtnout jde přímo ve widgetu | MVP |
| Pipeline v Kč | součet a vážený součet obchodů podle fází | MVP |
| Moje otevřené obchody | obchody bez další aktivity nahoře | MVP |
| Zakázky ve skluzu | zakázky po termínu nebo s úkoly po termínu | MVP |
| Příjmy tento měsíc | můj podíl: vystaveno, zaplaceno, plánováno | MVP |
| Saldo vyrovnání | kdo komu dluží a kolik | MVP |
| Nezaplacené platby | po splatnosti a blízko splatnosti | MVP |
| Poslední změny | co se v systému naposledy dělo | MVP |
| Rychlé odkazy | vlastní odkazy a uložené pohledy | MVP |
| Číslo | jedno číslo z libovolného uloženého pohledu (počet nebo součet) | MVP |
| Seznam z pohledu | prvních N řádků libovolného uloženého pohledu | MVP |
| Nadcházející schůzky | dnes a zítra z kalendáře | v2 |
| Leady a CPL | leady tento měsíc, cena za lead, náklad na vyhraný obchod | v2 |
| Hodiny tento týden | moje hodiny podle zakázek | v2 |
| Expirace | domény a hostingy do 60 dní (jen Ondřej) | v2 |
| Retainery | aktivní retainery a měsíční součet | v2 |

Výchozí přehled po prvním přihlášení: Úkoly na dnes, Pipeline v Kč, Zakázky ve skluzu, Příjmy tento měsíc, Saldo vyrovnání a Poslední změny. Díky widgetům „Číslo“ a „Seznam z pohledu“ si každý postaví, co potřebuje, bez úprav systému.

## Obchody a pipeline

Obchody fungují jako v Pipedrivu. Každý obchod je v jedné fázi pipeline, má hodnotu, vlastníka a ideálně naplánovanou další aktivitu. Vyhráno a Prohráno nejsou fáze, ale výsledek obchodu.

**Výchozí pipeline „Obchody“** (fáze jde přejmenovat, přidat, smazat a přeskládat; pipeline může být víc)

| Fáze | Pravděpodobnost | Zvýraznit, když je bez aktivity déle než |
| --- | --- | --- |
| Nová poptávka | 10 % | 1 den |
| Kontaktováno | 20 % | 5 dní |
| Schůzka / konzultace | 40 % | 7 dní |
| Nabídka odeslaná | 60 % | 7 dní |
| Vyjednávání | 80 % | 10 dní |

**Co obchod obsahuje**: název, firma, hlavní kontakt a další kontakty, hodnota, služby (web, marketing, systémy), očekávané datum uzavření, vlastník, zdroj (ručně, Meta, webový formulář, doporučení, jiné) a u leadů z Meta i kampaň a reklamu, štítky, vlastní pole, poznámky, aktivity a historii.

**Board**

- Sloupce podle fází. V hlavičce sloupce počet obchodů, součet hodnot a vážený součet (hodnota × pravděpodobnost).
- Karta: název, firma, hodnota, vlastník, služby a datum další aktivity.
- Obchod bez naplánované další aktivity má výstražnou ikonu. Obchod, který je ve fázi déle bez aktivity, než fáze dovoluje, je zvýrazněný červeně. Jen vizuálně, nic se automaticky neděje.
- Obchod se přesouvá tažením mezi fázemi. Při tažení se dole objeví zóny „Vyhráno“ a „Prohráno“.
- Systém si pamatuje, kdy obchod do které fáze vstoupil a jak dlouho v ní byl.

**Seznam**: stejné obchody v tabulce s filtry a uloženými pohledy.

**Detail obchodu**

- Nahoře pás fází, na který jde kliknout, a tlačítka Vyhráno / Prohráno.
- Blok „Další aktivita“ s rychlým přidáním (hovor, schůzka, úkol…).
- Rychlé zápisy: aktivita, poznámka, e-mail ze šablony.
- Časová osa: aktivity, poznámky, změny fází a polí.

**Prohra**: musí se vybrat důvod (Cena, Vybrali konkurenci, Nereaguje, Odloženo, Nevhodný klient, Jiné; seznam jde upravit) a jde připsat poznámku. Prohraný obchod jde znovu otevřít.

**Výhra**

1. Obchod se označí jako vyhraný s datem.
2. Firma se stane aktivním klientem (pokud ještě nebyla), dostane datum „klient od“ a služby z obchodu.
3. Systém nabídne založení zakázek: pro každou službu z obchodu jeden předvyplněný řádek (typ, šablona, název, start, vlastník, členové, rozdělení). Řádky jde upravit, odebrat nebo přidat. „Přeskočit“ zakázku nezaloží.
4. Po potvrzení vzniknou zakázky ze šablon a na Disku se vytvoří jejich složky.

**Leady z Meta (v2)**: padají rovnou do fáze „Nová poptávka“ se štítkem Meta a názvem kampaně. Dokud nový lead nikdo neotevře, je na boardu zvýrazněný.

## Organizace a kontakty

Organizace a kontakty tvoří adresář všech firem a lidí, se kterými jste kdy jednali. Klienti jsou jeho část: firmy, které mají stav klienta.

**Organizace**

- Údaje: název, oficiální název, IČO, DIČ, právní forma, sídlo, web, obecný e-mail a telefon, obor, vlastník, štítky, vlastní pole.
- **ARES**: po zadání IČO systém do dvou sekund doplní název, sídlo, DIČ a právní formu. Ukáže, co se změní, a uživatel potvrdí. Tlačítkem „Aktualizovat z ARES“ jde údaje kdykoli obnovit. Když ARES nefunguje, firma se uloží i tak.
- Firmu jde založit i bez IČO, jen s názvem.
- **Duplicity**: stejné IČO systém nedovolí a odkáže na existující firmu. Podobný název nebo stejná doména webu vyvolá upozornění „Možná duplicita“, ale jde pokračovat.
- **Sloučení** (Ondřej): u duplicit se vybere hlavní záznam a vše ostatní (kontakty, obchody, zakázky, úkoly, poznámky) se přesune k němu.
- Detail organizace vypadá stejně jako karta klienta. Záložky bez dat se neukazují.

**Kontakty**

- Údaje: jméno, příjmení, firma (hlavní a případně další s rolí), pozice, víc e-mailů a telefonů se štítkem (práce, mobil, soukromý) a jedním hlavním, LinkedIn, příznak „rozhoduje“, vlastník, štítky, vlastní pole.
- Telefon a e-mail jde všude rovnou použít (zavolat, napsat) nebo zkopírovat.
- Duplicity se hlídají podle e-mailu a telefonu (bez ohledu na mezery a předvolbu). Sloučení funguje stejně jako u firem.
- Detail kontaktu: údaje, firmy, obchody, úkoly, poznámky, časová osa.
- Kontakt jde rychle založit přímo z firmy, obchodu nebo zakázky.

## Klienti a karta klienta

Karta klienta je nejdůležitější obrazovka systému. Ukazuje o klientovi úplně všechno: kontakty, služby, zakázky, obchody, peníze, úkoly, kontext a celou historii, a jedním klikem otevře jeho složku na Disku.

**Stavy klienta**

| Stav | Význam | Co se stane při přechodu |
| --- | --- | --- |
| Lead | firma, se kterou se jedná | vytvoří se složka na Disku |
| Aktivní | probíhá spolupráce | při prvním přechodu se uloží datum „klient od“; složka na Disku se vytvoří, pokud ještě neexistuje |
| Pozastavený | spolupráce stojí, ale neskončila | nic |
| Bývalý | spolupráce skončila | systém se zeptá na důvod a datum ukončení; složka se přesune do archivu; nic se nemaže |

Návrat z Bývalý na Aktivní vrátí složku z archivu.

**Seznam klientů**

- Výchozí: aktivní a pozastavení. Přepínač „Všichni, včetně bývalých“.
- Sloupce: název, stav, služby, vlastník, aktivní zakázky, příjem za posledních 12 měsíců (jen kdo smí vidět finance), klient od, poslední aktivita, tlačítko Disk.
- Seskupení podle stavu nebo služby.

**Hlavička karty**: název, stav, služby, vlastník, štítky, zámek viditelnosti (Ondřej). Tlačítka: **Otevřít Disk**, Zavolat (hlavní kontakt), E-mail ze šablony, Web, Nový úkol, Nová poznámka, Nová zakázka, Nový obchod.

**Záložky karty**

| Záložka | Obsah |
| --- | --- |
| Přehled | kontext klienta, hlavní kontakty, aktivní zakázky s fází, otevřené obchody, nejbližší úkoly a schůzky, finanční souhrn, posledních 5 událostí |
| Kontext | kdo rozhoduje, jak s nimi komunikovat, historie spolupráce, na co si dát pozor, proč spolupráce skončila; volný text, upravuje se přímo na místě |
| Kontakty | všichni lidé z firmy, role, kdo rozhoduje, rychlé volání a e-mail |
| Zakázky | všechny zakázky včetně dokončených a zrušených |
| Obchody | otevřené, vyhrané a prohrané s důvodem |
| Úkoly a aktivity | otevřené i hotové, filtr podle typu |
| Poznámky | připnuté nahoře, pak od nejnovější |
| Finance | platby všech zakázek, rozdělení, součty za rok a celkem, retainery |
| Reklama (v2) | reklamní účty a kampaně klienta, útrata, leady, cena za lead po měsících |
| Hosting a domény | jen Ondřej: hosting, údržba, domény a data obnovy |
| Historie | všechno, co se s klientem kdy stalo, včetně změn údajů a událostí na Disku |

**Finanční souhrn**: kolik klient celkem zaplatil, kolik za posledních 12 měsíců, aktivní měsíční retainer, nezaplacené platby. Patrik vidí jen součty ze sdílených zakázek.

## Zakázky

Zakázka je konkrétní práce pro jednoho klienta a má jeden ze tří typů: **Web**, **Marketing** (poptávkové kampaně), **Systémy** (systémy na míru). Má fáze, úkoly, členy, pravidla rozdělení příjmů, platby a vlastní složku na Disku. Vzniká z vyhraného obchodu, ze šablony nebo ručně.

**Co zakázka obsahuje**: kód (např. Z-2026-014), název, klient, typ, stav (Plánovaná, Aktivní, Pozastavená, Dokončená, Zrušená), aktuální fáze, model fakturace (jednorázově, úvodní fáze a pak retainer, rovnou retainer, hodinově), vlastník, členové, start, termín, dohodnutá cena, popis, původní obchod, štítky, vlastní pole.

**Výchozí fáze** (jen počáteční nastavení; upravují se v šablonách)

| Typ | Fáze |
| --- | --- |
| Web | Podklady → Návrh → Vývoj → Revize klienta → Spuštění → Předání |
| Marketing | Onboarding (přístupy, Business Manager, pixel) → Tvorba kreativ a videí → Spuštění kampaní → Optimalizace → Vyhodnocení úvodní fáze → Retainer |
| Systémy | Analýza → Specifikace → Vývoj → Testování → Nasazení → Podpora |

**Šablony zakázek**

- Šablona obsahuje typ, fáze, úkoly a plánované platby. U úkolu: název, typ, priorita, kdo ho řeší, termín jako počet dní od startu zakázky, odhad času. U platby: popis, částka, kdo fakturuje, splatnost jako počet dní od startu.
- Šablon může být pro každý typ libovolně mnoho, jedna je výchozí. Šablonu jde zduplikovat nebo archivovat.
- Hotovou zakázku jde uložit jako novou šablonu (vezmou se fáze a úkoly bez konkrétních dat).
- Změna šablony neovlivní zakázky, které už běží.

**Seznam a board**

- Seznam: kód, název, klient, typ, stav, aktuální fáze, vlastník, členové, termín, hodnota, tlačítko Disk.
- Board podle stavu, nebo podle fází (pro jeden typ zakázky).
- Zakázka po termínu nebo s úkoly po termínu má výstražnou ikonu.

**Detail zakázky**

- Hlavička: kód, název, klient, typ, stav, vlastník, členové, termín, **Otevřít Disk** (složka zakázky), zámek viditelnosti.
- Pás fází: kliknutím se fáze nastaví jako aktuální. Při dokončení fáze se systém zeptá, jestli dokončit i její otevřené úkoly.
- Záložky: Úkoly (seskupené podle fází, jde je přetahovat mezi fázemi), Finance (rozdělení, platby, retainer), Hodiny (v2), Poznámky, Obchod, Reklama (v2, jen marketing), Historie.

**Marketing: úvodní fáze a retainer**

1. Šablona „Marketing – úvodní fáze“ vytvoří dvě plánované platby po 7 000 Kč. První fakturuje Patrik, druhou Ondřej. Částky i fakturující jde změnit.
2. Po dokončení fáze „Vyhodnocení úvodní fáze“ se v hlavičce zakázky objeví volba **Pokračovat na retainer** / **Ukončit**.
3. **Pokračovat**: nastaví se měsíční částka, od kterého měsíce, den vystavení, kdo fakturuje (pořád stejný člověk, nebo střídavě) a rozdělení pro retainer. Zakázka přejde do fáze Retainer.
4. Každý měsíc pak systém sám založí plánovanou platbu „Retainer MM/RRRR“ i s rozdělením. Kdo fakturuje, po vystavení faktury doplní její číslo a označí platbu jako vystavenou.
5. **Ukončit**: zakázka se dokončí. Pokud klient nemá jinou aktivní zakázku, systém nabídne změnu stavu klienta na Bývalý.
6. Retainer jde ukončit k určitému měsíci; budoucí plánované platby se zruší.

**Dokončení zakázky**: systém upozorní na otevřené úkoly a nezaplacené platby, ale dokončení nezablokuje.

## Úkoly, aktivity a poznámky

Úkol a CRM aktivita jsou jedna a tatáž věc, jen s jiným typem. Hovor naplánovaný k obchodu i úkol „nahrát texty“ v zakázce se tak ukážou ve stejném seznamu „Moje úkoly“ i ve stejném kalendáři.

**Typy**: Úkol, Hovor, Schůzka, E-mail, Termín. Další typy jde přidat v Nastavení (název, ikona, barva, jestli se ukazuje v kalendáři).

**Co úkol obsahuje**: název, typ, stav (K řešení, Probíhá, Hotovo, Zrušeno), priorita (Žádná, Nízká, Střední, Vysoká, Urgentní), kdo ho řeší, termín (datum, u hovoru a schůzky i čas a délka), místo, popis, podúkoly (jedna úroveň), komentáře, odhad času, výsledek (u hovoru a schůzky), štítky, viditelnost a vazby: obchod, firma, kontakt, zakázka a fáze zakázky.

**Moje úkoly**

- Pohledy: Dnes (včetně úkolů po termínu), Nadcházejících 7 dní, Bez termínu, Delegované (zadal jsem, řeší druhý), Hotové.
- Seskupení podle data, zakázky, klienta nebo priority. Přepínač seznam / board podle stavu.
- Rychlé přidání nahoře v seznamu. Systém z textu pozná datum a typ: „zavolat Novákovi zítra 10:00“ = Hovor, zítra v 10:00. Před uložením ukáže, co rozpoznal.

**Pravidla**

- Hovor a schůzka s časem se zapíšou do Google Kalendáře toho, kdo je řeší (v2).
- Po dokončení hovoru nebo schůzky systém nabídne zapsat výsledek a naplánovat další aktivitu. Jen nabídne, sám nic nevytváří.
- Úkol u obchodu aktualizuje „další aktivitu“ a „poslední aktivitu“ obchodu.
- Úkol v zakázce bez fáze se ukáže ve skupině „Bez fáze“.
- Úkol přiřazený druhému se mu objeví okamžitě. Notifikace se neposílají.
- Komentáře k úkolu slouží k domluvě mezi vámi dvěma. Zmínka @jméno jen zvýrazní jméno.

**Poznámky**

- Formátovaný text: nadpisy, seznamy, checklisty, odkazy. Obrázky a soubory patří na Disk.
- Poznámka patří ke klientovi, kontaktu, obchodu nebo zakázce, nebo je samostatná.
- Důležité poznámky jde připnout nahoru.
- Ukládá se průběžně při psaní, každá změna je v historii.

## Kalendář (v2)

Kalendář ukazuje na jedné ploše schůzky a úkoly z OPSIS a události z Google Kalendářů obou uživatelů. Co vznikne v OPSIS, je do minuty v Googlu, a naopak.

- Každý si připojí svůj Google účet sám a vybere, které kalendáře se zobrazují a do kterého OPSIS zapisuje.
- Pohledy: Den, Týden (výchozí), Měsíc, Agenda. Pracovní doba 8–18 je zvýrazněná.
- Vrstvy, které jde zapnout a vypnout: moje kalendáře, Patrikovy kalendáře, úkoly s termínem bez času (pruh nahoře). Soukromé události z Googlu se druhému ukazují jen jako „Obsazeno“.
- Schůzka se vytvoří tažením v kalendáři: název, čas, místo, vazba na klienta, obchod nebo kontakt, účastníci a přepínač „Poslat pozvánky“ (výchozí vypnuto).
- Přetažením nebo změnou délky se událost přesune i v Googlu.
- U události z Googlu jde jedním klikem nastavit vazbu na klienta nebo obchod. Pokud e-mail účastníka patří kontaktu v CRM, systém vazbu sám nabídne.
- Schůzka s vazbou na obchod se ukáže v jeho historii a jako jeho další aktivita.
- Odkaz na Google Meet jde otevřít přímo z náhledu události.
- Bez připojeného Googlu ukazuje kalendář jen úkoly a schůzky z OPSIS.

## Finance

Finance odpovídají na tři otázky: kolik kdo z vás vydělal, co je vyfakturované a nezaplacené, a kdo komu dluží. Faktury se vystavují mimo OPSIS, každý ve svém nástroji. OPSIS je jen eviduje a počítá rozdělení. Nikdo z vás není plátce DPH, takže částky jsou bez DPH logiky.

**Pravidla rozdělení (na každé zakázce)**

- U zakázky se nastaví, komu kolik patří. Každé pravidlo má osobu, způsob a hodnotu:
  - **procenta** (např. Ondřej 60 %, Patrik 40 %),
  - **fixně za platbu** (např. Ondřej 10 000 Kč z každé platby),
  - **fixně celkem** (např. Patrik 10 000 Kč za celou zakázku, odečítá se postupně z plateb).
- Pravidlo může platit pro všechny platby, nebo jen pro určitý druh: jednorázové, úvodní fáze, retainer, navíc.
- Pravidlo může mít platnost od–do. Tak jde u retaineru změnit poměr od určitého měsíce, aniž se přepočítá minulost.
- Nové zakázky dostanou výchozí pravidla z Nastavení (např. 50 / 50).
- Systém ukazuje živý náhled: „Z platby 10 000 Kč dostane Ondřej 6 000 Kč, Patrik 4 000 Kč.“

**Jak se platba rozdělí**

1. Nejdřív se odečtou fixní částky.
2. Zbytek se rozdělí podle procent.
3. Haléře, které po zaokrouhlení zbydou, dostane ten, kdo fakturoval.
4. Když zakázka nemá žádné pravidlo, celá platba patří tomu, kdo fakturoval.
5. Rozdělení jedné konkrétní platby jde přepsat ručně; platba pak má štítek „Rozděleno ručně“.

**Platby**

- Každá platba má: zakázku, popis, druh, částku, kdo fakturuje, stav, číslo faktury, datum vystavení, splatnost, datum zaplacení a podíly obou z vás.
- Stavy: **Plánovaná** → **Vystavená** (systém se zeptá na číslo faktury a datum) → **Zaplacená** (zeptá se na datum úhrady), případně **Zrušená**.
- Platby vznikají ručně, ze šablony zakázky, nebo samy každý měsíc z retaineru.
- Nezaplacená platba po splatnosti je červeně a počítá se do čísla u položky Finance.
- Seznam všech plateb jde filtrovat podle období, fakturujícího, stavu, typu zakázky a klienta, se součty dole.

**Vyrovnání**

- Pro každou platbu platí: kdo fakturoval, dostal peníze; když část patří druhému, dluží mu ji.
- Nahoře je jedno číslo: „Patrik dluží Ondřejovi 12 400 Kč“, opačně, nebo „Vyrovnáno“.
- Počítá se ze zaplacených plateb, nebo už z vystavených (nastavení).
- Pod tím rozpis po měsících: kdo kolik fakturoval, komu kolik patří, rozdíl. Rozkliknutím měsíce se ukážou konkrétní platby.
- **Zapsat vyrovnání**: kdo, komu, kolik (předvyplní se saldo), kdy, jak (faktura mezi IČO, převod, zápočet), číslo dokladu. Zapsané vyrovnání jde stornovat.
- Soukromé zakázky Ondřeje se do vyrovnání nepočítají.

**Příklady**

| Situace | Pravidla | Kdo komu dluží |
| --- | --- | --- |
| Web 50 000 Kč, fakturuje Ondřej | Ondřej 60 %, Patrik 40 % | Ondřej dluží Patrikovi 20 000 Kč |
| Úvodní fáze 2 × 7 000 Kč, první fakturuje Patrik, druhou Ondřej | 50 / 50 | nikdo, dluhy se vzájemně vyruší |
| Systém 80 000 Kč, fakturuje Patrik | Ondřej fixně 10 000 Kč z platby, zbytek Patrik | Patrik dluží Ondřejovi 10 000 Kč |
| Retainer 15 000 Kč za 12/2026 a 01/2027 | do 12/2026 Ondřej 70 / Patrik 30, od 01/2027 50 / 50 | 12/2026: podíl 10 500 / 4 500; 01/2027: 7 500 / 7 500 |
| Patrikovi fixně celkem 10 000 Kč, dvě platby po 6 000 Kč | Patrik fixně celkem, zbytek Ondřej | 1. platba: vše Patrikovi; 2. platba: 4 000 Patrikovi, 2 000 Ondřejovi |

**Přehledy**: příjmy podle osoby po měsících, podle typu zakázky a podle klienta (top 10), měsíční příjem z retainerů. Patrik vidí jen sdílené zakázky, Ondřej si může zapnout i soukromé.

## Google Disk

Každý klient má na sdíleném disku jednu složku. Uvnitř je obecná složka klienta, složka každé služby, kterou mu děláte, a ve složce služby podsložka každé zakázky. Složky zakládá automatizace v n8n; OPSIS jí říká kdy a jakou strukturu.

**Struktura složek**

```
OP Digital – Klienti (sdílený disk)
├─ Klienti/
│  └─ {Název klienta}/
│     ├─ 00 Klient/
│     │  ├─ Smlouvy a objednávky/
│     │  ├─ Brand a loga/
│     │  └─ Podklady od klienta/
│     ├─ 10 Web/                       (jen když má službu Web)
│     │  └─ {RRRR-MM} {Název zakázky}/
│     │     ├─ 01 Podklady/
│     │     ├─ 02 Návrh/
│     │     ├─ 03 Texty a obsah/
│     │     ├─ 04 Fotky a média/
│     │     └─ 05 Předání/
│     ├─ 20 Marketing/                 (jen když má službu Marketing)
│     │  └─ {RRRR-MM} {Název zakázky}/
│     │     ├─ 01 Strategie a podklady/
│     │     ├─ 02 Kreativy/ (Foto, Video, Texty a scénáře)
│     │     ├─ 03 Finální exporty/
│     │     └─ 04 Reporty/
│     └─ 30 Systémy/                   (jen když má službu Systémy)
│        └─ {RRRR-MM} {Název zakázky}/
│           ├─ 01 Analýza a specifikace/
│           ├─ 02 Podklady a data/
│           ├─ 03 Design/
│           ├─ 04 Dokumentace/
│           └─ 05 Předání/
└─ Archiv/
   └─ {Název klienta}/                 (bývalí klienti)
```

**Kdy se co stane**

| Událost v OPSIS | Co se stane na Disku |
| --- | --- |
| firma dostane stav klienta (i Lead), nebo klik na „Vytvořit složku“ | složka klienta + 00 Klient + složky jeho služeb |
| klientovi přibude služba | dovytvoří se chybějící složka služby |
| vznikne zakázka | složka zakázky s podsložkami podle typu |
| přejmenování klienta | přejmenuje se jeho složka |
| klient přejde na Bývalý | složka se přesune do Archivu |
| klient se vrátí z Bývalý | složka se vrátí zpět |

**Tlačítko Otevřít Disk**

- Je na kartě klienta (otevře jeho složku) i v detailu zakázky (otevře složku zakázky). Otevírá se v nové kartě, na mobilu v aplikaci Google Disk.
- Stavy tlačítka: „Otevřít Disk“, „Vytváří se…“, „Zkusit znovu“ (chyba nebo 10 minut bez odpovědi), „Vytvořit složku“ (klient zatím složku nemá).
- Systém si pamatuje složku, ne její cestu. Přejmenování nebo přesun na Disku tlačítko nerozbije.

**Pravidla**

- Strukturu jde upravit v Nastavení jako strom (přidat, přejmenovat, smazat nebo přeskládat podsložky) zvlášť pro klienta a pro každý typ zakázky. Změna platí jen pro nově zakládané složky.
- Smazání čehokoli v OPSIS nikdy nesmaže nic na Disku.

## Reklama a leady z Meta (v2)

OPSIS spojuje útratu za reklamu na Facebooku a Instagramu s leady, které z ní přišly, a s obchody, které z leadů vznikly. Je tak vidět, kolik stojí lead a kolik vyhraný obchod.

**Příjem leadů**

- Lead z formuláře Meta přijde přes n8n a v OPSIS vznikne kontakt, případně firma, a obchod ve fázi „Nová poptávka“.
- Kontakt se páruje podle e-mailu nebo telefonu, firma podle názvu nebo IČO. Duplicity nevznikají; stejný lead poslaný dvakrát se založí jen jednou.
- U obchodu se uloží zdroj Meta, kampaň, reklamní sada a reklama.
- U každého formuláře jde v Nastavení určit, do které pipeline a fáze leady padají a kdo je jejich vlastník.
- Každý příchozí lead se zaznamená, i když se ho nepodaří zpracovat, aby nic nezmizelo.

**Reklamní účty a kampaně**

- Systém načte reklamní účty a u každého Ondřej určí, jestli patří OP Digital (vaše akvizice), nebo klientovi.
- Kampaň jde přiřadit konkrétní marketingové zakázce klienta. Její čísla se pak ukážou u zakázky i na kartě klienta.
- Data (útrata, zobrazení, kliky, leady) se stahují každý den ráno a jde je obnovit ručně. Posledních 7 dní se přepočítává kvůli zpětným korekcím od Meta.

**Co je vidět**

- U účtu: kampaně za zvolené období (7, 30, 90 dní, měsíc, vlastní) se sloupci útrata, zobrazení, kliky, CTR, leady podle Meta, leady podle OPSIS, cena za lead, vyhrané obchody, náklad na vyhraný obchod, přiřazená zakázka.
- U kampaně: reklamní sady a reklamy se stejnými čísly, náhled kreativy, seznam leadů (obchodů) z kampaně a graf útraty a leadů po dnech.
- Rozdíl mezi počtem leadů podle Meta a podle OPSIS ukazuje leady, které se cestou ztratily.

## Hodiny a šablony e-mailů (v2)

Hodiny ukazují, kolik času zakázka stála a jaká z ní vyšla hodinovka. Šablony e-mailů zrychlí opakované zprávy klientům.

**Hodiny**

- Zápis bez stopek: k úkolu („Zapsat čas“), k zakázce, nebo v týdenním výkazu (mřížka zakázka × den). Formát `1,5` nebo `1:30`.
- Přehledy: moje hodiny za týden a měsíc, hodiny podle zakázky a osoby.
- U zakázky: odpracováno vs. odhad úkolů a efektivní hodinová sazba každého z vás (jeho podíl na příjmech ÷ jeho hodiny).
- Žádné schvalování výkazů.

**Šablony e-mailů**

- Sdílené šablony s kategorií (follow-up, nabídka, onboarding, připomínka platby…), jazykem (čeština, slovenština, angličtina) a počtem použití.
- Šablona má předmět a text s proměnnými: křestní jméno kontaktu, název firmy, název obchodu, název zakázky, jméno odesílatele. Náhled ukáže šablonu vyplněnou daty vybraného kontaktu.
- Použití: z kontaktu, obchodu, klienta nebo zakázky „E-mail ze šablony“ → výběr šablony → náhled s vyplněnými údaji → **Otevřít v Gmailu** (připravený e-mail s adresátem, předmětem a textem) nebo **Kopírovat**.
- Po otevření v Gmailu systém nabídne jedním klikem zapsat e-mail jako hotovou aktivitu.
- E-maily se odesílají z Gmailu, ne z OPSIS. Pošta se do systému nesynchronizuje.

## Hledání a historie změn

Hledání (Cmd+K) je nejrychlejší cesta kamkoli. Historie změn je záznam toho, kdo co kdy udělal, a nejde upravit ani smazat.

**Hledání**

- Otevře se odkudkoli zkratkou Cmd+K (Ctrl+K), na mobilu lupou v dolní liště.
- Bez zadání ukáže posledních 8 otevřených záznamů a nejčastější příkazy.
- Hledá v klientech a firmách, kontaktech, obchodech, zakázkách, úkolech a poznámkách: v názvu, IČO, e-mailech, telefonech i textu poznámek. Na diakritice a velikosti písmen nezáleží. U telefonu nezáleží na mezerách: „777 12“ najde „+420 777 123 456“.
- Výsledky jsou seskupené podle typu a u každého je podtitulek (firma, fáze, telefon).
- Příkazy: Nový obchod / klient / kontakt / zakázka / úkol / poznámka, Přejít na…, Přepnout téma, Zapsat hodiny, Zapsat platbu.
- Akce bez otevření záznamu: u kontaktu zavolat, zkopírovat telefon nebo napsat e-mail, u klienta otevřít Disk.
- Výsledky naskočí okamžitě během psaní.

**Historie změn**

- Zapisuje se každá změna: vytvoření, úprava (každé pole „před → po“), smazání, obnovení, změna fáze, výhra, prohra, změna viditelnosti, přihlášení a neúspěšné pokusy, změny oprávnění a nastavení.
- U každého záznamu je jeho historie součástí časové osy. Globální stránka Historie ukazuje vše s filtry (kdo, typ záznamu, akce, období) a hledáním.
- Jako autor může figurovat i systém: n8n, Google, Meta nebo automatická úloha.
- Historii nejde upravit ani smazat, ani Ondřejem. Smazané záznamy v ní zůstávají s odkazem do koše.
- Patrik nevidí historii soukromých záznamů Ondřeje. Bezpečnostní události (přihlášení) vidí jen u svého účtu.
- Historii jde exportovat do CSV (Ondřej nebo kdo má právo exportu).

## Můj prostor (jen Ondřej)

Sekce, kterou vidí jen Ondřej. Obsahuje evidenci hostingu, údržby a domén, opakované faktury, soukromou e-mailovou knihovnu a přehled soukromých záznamů. Nic z ní se nepromítá do Patrikových seznamů, součtů ani hledání.

**Hosting a údržba (v2)**

- Evidence, kdo u vás má hosting a kdo platí údržbu webu: klient, druh (hosting / údržba), název služby, web, cena, období (ročně / měsíčně), od kdy, další obnova, stav (aktivní, pozastavená, zrušená), kde web reálně běží, poznámka.
- Pohledy: Obnova do 30 dní, Podle klienta, Zrušené.
- Nahoře souhrn: roční opakovaný příjem z hostingu a údržby a počet aktivních služeb.
- Po vyfakturování obnovy se datum další obnovy posune o období.
- Na kartě klienta se ukazuje v záložce „Hosting a domény“.

**Domény (v2)**

- Evidence: doména, klient, registrátor, datum expirace, kdo platí (vy / klient), automatické prodloužení, cena obnovy, DNS, navázaný hosting, poznámka.
- Barva podle blížící se expirace: víc než 60 dní normální, 60–30 dní upozornění, méně než 30 dní nebo po expiraci kritická. Hranici jde u domény změnit.
- Počet kritických domén je u položky v menu a ve widgetu Expirace. Žádné e-maily ani notifikace.
- Hromadné vložení: seznam domén, každá na řádek, pak doplnit klienty.

**Opakované faktury (v3)**

- U hostingu a údržby jde zapnout „připravovat fakturu“. Systém pak X dní před obnovou (výchozí 14) připraví návrh faktury.
- Návrhy: klient, služba, období, částka, stav. Akce: upravit, **Schválit a vytvořit ve Fakturoidu**, zrušit.
- Po vytvoření se uloží číslo a odkaz na fakturu ve Fakturoidu a v OPSIS vznikne platba (celá Ondřejovi, mimo vyrovnání s Patrikem).

**E-mailová knihovna (v2)**

- Soukromá databáze e-mailů a textů na cokoli: kategorie, štítky, hledání, kopírování jedním klikem, otevření v Gmailu, stejné proměnné jako šablony.
- Text jde přesunout mezi knihovnou a sdílenými šablonami.

**Soukromé**

- Všechny soukromé zakázky, úkoly a poznámky na jednom místě, seskupené podle typu.
- Tady se zakládají samostatné soukromé poznámky.

## Nastavení

Nastavení má osobní část (každý sám za sebe) a systémovou část, kterou spravuje Ondřej, nebo kdo k tomu dostane oprávnění. Každá změna nastavení jde do historie.

| Sekce | Co se v ní nastavuje | Kdo |
| --- | --- | --- |
| Profil | jméno, avatar, heslo, druhý faktor, záložní kódy, přihlášená zařízení | každý |
| Vzhled | světlý / tmavý / podle systému, hustota řádků, úvodní stránka po přihlášení | každý |
| Můj Google Kalendář (v2) | připojení účtu, zobrazované kalendáře, kalendář pro zápis | každý |
| Uživatelé | pozvat, deaktivovat, role, IČO a fakturační nástroj uživatele | Ondřej |
| Oprávnění | zapínání a vypínání funkcí pro každého uživatele | Ondřej |
| Pipeline | pipeline, fáze, pravděpodobnosti, doba do zvýraznění, důvody prohry | s oprávněním |
| Typy aktivit | název, ikona, barva, zobrazení v kalendáři | s oprávněním |
| Vlastní pole | pole pro firmy, kontakty, obchody, zakázky a úkoly | s oprávněním |
| Štítky | název, barva, kde se dají použít | s oprávněním |
| Šablony zakázek | fáze, úkoly, plánované platby, výchozí šablona pro typ | s oprávněním |
| Finance | výchozí rozdělení nových zakázek, z čeho se počítá vyrovnání (zaplacené / vystavené) | Ondřej |
| Google Disk | stav napojení, struktura složek pro klienta a každý typ zakázky, test | s oprávněním |
| Integrace | ARES, Meta (účty, formuláře a kam padají leady), Fakturoid (jen Ondřej), webhooky pro n8n | s oprávněním |
| Systém | stav systému, zálohy, chyby integrací, koš | Ondřej |

**Webhooky pro n8n**: OPSIS umí posílat do n8n události (nový obchod, změna fáze, výhra, prohra, změna stavu klienta, nová zakázka, změna fáze zakázky, dokončení zakázky, nový a dokončený úkol, nová a zaplacená platba). Co s nimi n8n udělá, je na vás. Soukromá data Ondřeje se posílají jen na webhooky, které jsou označené jako jeho.

## Mobil

Na mobilu jde hlavně o rychlé dohledání na cestách: najít klienta, lead nebo zakázku, zavolat, napsat, otevřít Disk a zapsat poznámku nebo úkol. Mobil není zmenšený desktop, má vlastní rozložení.

**Navigace**: spodní lišta Hledat, Klienti, Obchody, Úkoly, Více. Po otevření se ukáže Hledat s posledními záznamy a klávesnicí připravenou k psaní.

**Co na mobilu musí jít**

- Hledat přes všechno; výsledky ukazují telefon a firmu, ťuknutím na telefon se volá.
- Karta klienta s tlačítky Zavolat, E-mail, Navigovat (adresa v mapách), Disk; pod nimi kontakty, aktivní zakázky, otevřené obchody a poslední poznámky.
- Kontakt s tlačítky Zavolat, SMS, WhatsApp, E-mail.
- Obchod a zakázka: číst, změnit fázi, stav a vlastníka.
- Moje úkoly: odškrtnout, přesunout termín, rychle přidat. Swipe doleva nabídne Hotovo a Odložit.
- Nová poznámka nebo úkol k čemukoli, s diktováním přes klávesnici telefonu.
- Board obchodů jako posuvné sloupce; obchod se přesouvá přes „Přesunout do fáze“.

**Na mobilu záměrně omezené**: oprávnění, editor šablon, editor struktury Disku, úpravy přehledu (jen pořadí widgetů) a široké tabulky (zobrazí se jako karty).

**Instalace na plochu (v2)**: OPSIS jde přidat na plochu telefonu jako aplikaci. Naposledy načtená data jsou vidět i při slabém signálu, jen ke čtení.

## Co systém nedělá a otevřené body

Systém záměrně neobsahuje věci, které by ho přeplácaly nebo které už řeší jiný nástroj.

**Co OPSIS nedělá**

- Žádný oddělený Leads Inbox. Leady jdou rovnou do první fáze pipeline.
- Žádný builder automatizací. Automatizace se řeší v n8n přes webhooky.
- Žádná synchronizace Gmailu a žádné odesílání e-mailů ze systému.
- Žádné automatické follow-upy a žádné notifikace (e-mail, push, Telegram). Upozornění jsou jen vizuálně v aplikaci.
- Žádné vystavování faktur klientům, s výjimkou Ondřejových ročních faktur za hosting a údržbu přes Fakturoid (v3).
- Žádný import historických dat z jiných systémů.
- Žádné ukládání přístupů a hesel klientů.
- Žádný generátor nabídek.
- Žádné napojení na Asanu.

**Otevřené body**

- [ ] **Vyrovnání mezi IČO.** Fakturujete si rozdíl jednou měsíčně, nebo po každé platbě? Zatím systém jen počítá saldo a eviduje ručně zapsaná vyrovnání.
- [ ] **Úvodní fáze marketingu.** Platí, že si z 2 × 7 000 Kč každý nechá svých 7 000 Kč (50 / 50 bez vyrovnání)?
- [ ] **Kdo fakturuje retainer.** Pořád stejný člověk, střídání po měsících, nebo podle zakázky? Zatím jde nastavit u každé zakázky.
- [ ] **Ad spend.** Týká se vašich akvizičních kampaní, kampaní klientů, nebo obojího? Systém umí obojí; co má přednost?
- [ ] **Patrikův fakturační nástroj.** Jak se jmenuje a jestli ho později napojit. Zatím se čísla faktur zapisují ručně.
- [ ] **Fáze pipeline a zakázek.** Výchozí fáze v tomto dokumentu potvrdit nebo upravit.
- [ ] **Struktura složek na Disku.** Potvrdit navrženou strukturu.
- [ ] **Pozvánky na schůzky.** Má být posílání pozvánek účastníkům výchozí zapnuté, nebo vypnuté?
