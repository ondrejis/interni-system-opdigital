# OPSIS 03 – Funkční specifikace

Oct 7, 2026 · @Ondřej Dvořák

## Aplikační shell a společné vzory

Všechny moduly sdílí stejný shell a stejné vzory pro seznam, detail, filtr a úpravu. Kdo se naučí jeden modul, umí všechny. Vizuální podoba je v dokumentu 04.

**Shell (desktop)**

- Levý sidebar (240 px, sbalitelný): přepínač uživatele a stav nahoře, tlačítko „Nový…“ (C), Hledat (Cmd+K), pak sekce **Práce**: Přehled, Moje úkoly, Kalendář; **CRM**: Obchody, Klienti, Organizace, Kontakty; **Realizace**: Zakázky, Hodiny; **Finance**: Platby a rozdělení, Vyrovnání; **Marketing**: Reklama, Šablony e-mailů; **Můj prostor** (jen Owner): Hosting a údržba, Domény, E-mailová knihovna, Opakované faktury, Soukromé; dole Activity log, Koš, Nastavení.
- Položky sidebaru ukazují počty jen tam, kde vyžadují akci (úkoly po termínu, domény před expirací).
- Uživatel si v sidebaru může připnout uložené pohledy (např. „Moje otevřené obchody“).
- Hlavní plocha: hlavička s názvem, přepínačem pohledu (Seznam / Board / Kalendář, kde dává smysl), filtrem, řazením, seskupením a nastavením sloupců.

**Seznamy**

- Husté řádky (36 px), sloupce volitelné, přetažením měnitelné pořadí a šířka, nastavení se ukládá do pohledu.
- Inline úprava buňky (klik nebo Enter): text, výběr, datum, uživatel, štítky, částka.
- Hromadný výběr (Shift/Cmd+klik, X): změna vlastníka, štítků, fáze, stavu, viditelnosti, smazání.
- Klávesy J/K nebo šipky pohyb, Enter otevře detail, Space otevře náhled v bočním panelu.
- Prázdný stav: jedna věta + jedno tlačítko, bez ilustrace.

**Filtry a uložené pohledy**

- Filtr jako řádek čipů: pole · operátor · hodnota (např. „Fáze je Nabídka“, „Hodnota > 50 000 Kč“, „Bez další aktivity“). Funguje na všechna pole včetně vlastních.
- Operátory podle typu: je / není / obsahuje / je prázdné / před / po / v posledních N dnech / mezi.
- Filtry, řazení, sloupce a seskupení jdou uložit jako pohled (osobní nebo sdílený). Stav je i v URL, takže odkaz na filtr jde poslat.
- Rychlé předvolby: Moje, Dnes, Po termínu, Bez aktivity, Soukromé (jen Owner).

**Detail záznamu**

- Stejná kostra všude: vlevo obsah (název, popis, záložky), vpravo panel vlastností (klíč–hodnota, inline editovatelné, jako v Linearu), dole nebo v záložce Timeline.
- Hlavička: název (inline úprava), stav/fáze, vlastník, ikona zámku pro viditelnost (jen Owner), akce v menu „…“ (duplikovat, přesunout do koše, kopírovat odkaz, zobrazit v logu).
- Timeline: aktivity, poznámky, změny polí, platby, události Disku a kalendáře, s filtrem podle typu.
- Detail jde otevřít jako celá stránka i jako boční panel (peek) nad seznamem.

**Vytváření**

- Klávesa C nebo „Nový…“ otevře rychlý formulář pro aktuální modul; Cmd+K nabízí vytvoření čehokoli.
- Formulář obsahuje jen povinná pole a pole označená „zobrazit při vytvoření“; zbytek se doplní v detailu.
- Cmd+Enter uloží, Esc zavře. Po uložení toast s odkazem „Otevřít“.
- U Ownera přepínač Sdílené / Soukromé přímo ve formuláři.

**Mazání a koš**: smazání je vždy měkké, toast s „Vrátit“ (10 s), koš drží záznamy 30 dní, obnova vrátí i navázané podřízené záznamy.

## Obchody a pipeline

Obchody fungují jako v Pipedrivu: kanban podle fází, každý obchod má hodnotu, vlastníka a další naplánovanou aktivitu. Vyhráno a prohráno nejsou fáze, ale stav obchodu.

**Výchozí pipeline „Obchody“** (editovatelná v Nastavení, lze přidat další pipeline)

| Fáze | Pravděpodobnost | Zvýraznit bez aktivity po |
| --- | --- | --- |
| Nová poptávka | 10 % | 1 dni |
| Kontaktováno | 20 % | 5 dnech |
| Schůzka / konzultace | 40 % | 7 dnech |
| Nabídka odeslaná | 60 % | 7 dnech |
| Vyjednávání | 80 % | 10 dnech |

**Board (kanban)**

- Sloupec = fáze; v hlavičce počet obchodů, součet hodnot a vážený součet (hodnota × pravděpodobnost).
- Karta: název, firma, hodnota, vlastník (avatar), ikony služeb, datum další aktivity. Bez další aktivity = žlutá výstražná ikona; překročené „zvýraznit po“ = karta s červeným okrajem vlevo (jen vizuál, žádná automatika).
- Přetažení mezi fázemi uloží změnu optimisticky a zapíše `deal_stage_history`.
- Dole pod boardem dvě cílové zóny při tažení: „Vyhráno“ a „Prohráno“.
- Filtry jako všude; přepínač pipeline nahoře.

**Seznam**: stejné obchody v tabulce, výchozí sloupce název, firma, kontakt, hodnota, fáze, vlastník, další aktivita, očekávané uzavření, zdroj, štítky.

**Detail obchodu**

- Nahoře progress fází (klikací kroky jako v Pipedrivu) a tlačítka **Vyhráno** / **Prohráno**.
- Panel vlastností: hodnota, očekávané uzavření, vlastník, firma, kontaktní osoby, služby, zdroj (+ Meta kampaň a reklama, pokud přišel z Meta), štítky, vlastní pole, čas ve fázi.
- Hlavní plocha: blok „Další aktivita“ (nejbližší otevřený úkol, rychlé přidání), editor „Aktivita · Poznámka · E-mail ze šablony“, timeline.

**Prohra**: dialog s povinným důvodem (číselník) a volitelnou poznámkou. Obchod jde znovu otevřít.

**Výhra** (detail v sekci Zakázky):

1. Obchod dostane `status = won`, `won_at`.
2. Pokud firma nemá stav klienta nebo je `lead` / `former`, nastaví se `active` a `client_since` (pokud prázdné).
3. Otevře se dialog „Založit zakázky“: pro každou službu z obchodu předvyplněný řádek (typ, šablona, název, start, vlastník, členové, rozdělení). Uživatel může řádek odebrat nebo přidat další. Tlačítko „Přeskočit“ zakázku nezaloží.
4. Po potvrzení vzniknou zakázky ze šablon, přibudou chybějící služby klienta a odejdou webhooky pro Disk.

**Leady z Meta (v2)**: přicházejí do fáze „Nová poptávka“ s odznakem „Meta“ a názvem kampaně na kartě. Nový lead je na kartě zvýrazněný, dokud ho někdo neotevře.

## Organizace a kontakty

Organizace a kontakty jsou adresář všech firem a lidí, se kterými jste kdy mluvili. Klienti jsou jeho podmnožina (sekce Klienti).

**Organizace**

- Seznam: název, IČO, město, stav klienta, služby, vlastník, počet otevřených obchodů, poslední aktivita, štítky.
- Vytvoření: pole IČO je první. Po zadání platného IČO se načte ARES a předvyplní název, sídlo, DIČ a právní formu. Bez IČO jde firmu založit jen s názvem.
- Kontrola duplicit při vytvoření: stejné IČO = zákaz s odkazem na existující záznam; podobný název (trigram > 0,6) nebo stejná doména webu = upozornění „Možná duplicita“ s možností pokračovat.
- Sloučení duplicit (Owner): vybrat hlavní záznam, ostatní kontakty, obchody, zakázky, úkoly a poznámky se přesunou, sloučení se zapíše do logu.
- Detail organizace = karta klienta (sekce Klienti) i pro firmy, které klienty nejsou; záložky bez dat se skryjí.

**Kontakty**

- Seznam: jméno, firma, pozice, primární telefon, primární e-mail, vlastník, poslední aktivita.
- Více e-mailů a telefonů se štítkem (práce, mobil, soukromý), jeden primární.
- Telefon a e-mail jsou v seznamu i detailu klikací (`tel:`, `mailto:`), vedle ikona kopírování.
- Kontrola duplicit podle e-mailu a normalizovaného telefonu, sloučení jako u organizací.
- Detail kontaktu: vlastnosti, firmy (primární + další s rolí), obchody, úkoly, poznámky, timeline.
- Rychlé vytvoření kontaktu přímo z detailu firmy, obchodu nebo zakázky.

## Klienti: karta 360°

Karta klienta je nejdůležitější obrazovka systému. Na jednom místě ukazuje všechno o klientovi: kontakty, služby, zakázky, obchody, peníze, úkoly, kontext a celou historii, plus jedním klikem jeho složku na Disku.

**Seznam klientů**

- Výchozí filtr: stav Aktivní a Pozastavený. Přepínač „Všichni, včetně bývalých“.
- Sloupce: název, stav, služby (čipy), vlastník, aktivní zakázky, příjem za 12 měsíců (jen s `finance.view`), klient od, poslední aktivita, tlačítko Disk.
- Seskupení podle stavu nebo služby.

**Stavy klienta**: Lead → Aktivní → Pozastavený → Bývalý. Přechod na Bývalý se ptá na důvod ukončení a datum, nic nemaže a spustí archivaci složky na Disku. Návrat z Bývalý na Aktivní složku vrátí.

**Hlavička karty**

- Název, stav (výběr), služby jako čipy, vlastník, štítky, zámek viditelnosti (Owner).
- Akční tlačítka: **Otevřít Disk** (nová karta), Zavolat (primární kontakt), E-mail (šablona → Gmail), Web, Nový úkol, Nová poznámka, Nová zakázka, Nový obchod.

**Záložky**

| Záložka | Obsah |
| --- | --- |
| Přehled | kontext klienta, primární kontakty, aktivní zakázky s fází, otevřené obchody, nejbližší úkoly a schůzky, finanční souhrn, poslední 5 událostí |
| Kontext | strukturovaná pole: rozhodovatel, jak s nimi komunikovat, historie spolupráce, na co si dát pozor, důvod ukončení (u bývalých); rich text, editovatelné inline |
| Kontakty | všichni lidé z firmy, role, rozhodovatel, rychlé volání a e-mail |
| Zakázky | všechny zakázky včetně dokončených a zrušených, typ, stav, fáze, období, hodnota |
| Obchody | otevřené, vyhrané, prohrané (s důvodem) |
| Úkoly a aktivity | otevřené a hotové, filtr podle typu |
| Poznámky | připnuté nahoře, pak podle data |
| Finance | platby všech zakázek, rozdělení, součty za rok a celkem; retainery |
| Reklama | (v2) reklamní účty a kampaně klienta, spend, leady, CPL po měsících |
| Hosting a domény | jen Owner: služby hostingu a údržby, domény, data obnovy |
| Timeline | všechno, co se s klientem kdy stalo, včetně změn polí a událostí Disku |

**Finanční souhrn na Přehledu**: celkový příjem od klienta, příjem za posledních 12 měsíců, aktivní měsíční retainer, nezaplacené platby. Partner vidí jen součty ze sdílených zakázek.

## Zakázky

Zakázka je konkrétní práce pro klienta jednoho ze tří typů: Web, Marketing, Systémy. Má fáze, úkoly, členy, pravidla rozdělení, platby a vlastní složku na Disku. Vzniká ze šablony, ručně nebo z vyhraného obchodu.

**Výchozí fáze** (jen počáteční nastavení šablon; upravujete je v Nastavení → Šablony zakázek)

| Typ | Fáze |
| --- | --- |
| Web | Podklady → Návrh → Vývoj → Revize klienta → Spuštění → Předání |
| Marketing | Onboarding (přístupy, BM, pixel) → Tvorba kreativ a videí → Spuštění kampaní → Optimalizace → Vyhodnocení úvodní fáze → Retainer |
| Systémy | Analýza → Specifikace → Vývoj → Testování → Nasazení → Podpora |

**Šablony**

- Šablona = typ + fáze + úkoly (název, typ, priorita, kdo je řeší, termín jako posun ve dnech od startu, odhad) + plánované platby (popis, částka, kdo fakturuje, splatnost jako posun).
- Libovolný počet šablon na typ, jedna výchozí. Duplikace šablony, archivace místo smazání.
- „Uložit zakázku jako šablonu“ z hotové zakázky (vezme fáze a úkoly bez dat).

**Seznam a board**

- Seznam: kód, název, klient, typ, stav, aktuální fáze, vlastník, členové, termín, hodnota, Disk.
- Board: sloupce podle stavu, nebo podle fáze pro jeden typ (filtr typu je pak povinný).
- Zakázka po termínu nebo s úkoly po termínu má výstražnou ikonu.

**Detail zakázky**

- Hlavička: kód, název, klient (odkaz), typ, stav, vlastník, členové, termín, tlačítko **Otevřít Disk** (složka zakázky), zámek viditelnosti.
- Pás fází: klik na fázi ji označí jako aktuální; dokončení fáze se ptá, jestli dokončit její otevřené úkoly.
- Záložky: Úkoly (seskupené podle fází, přetahování mezi fázemi), Finance (pravidla rozdělení, platby, retainer), Hodiny (v2), Poznámky, Obchod (původní obchod), Reklama (v2, jen marketing), Timeline.

**Založení z vyhraného obchodu**

1. Dialog nabídne řádek pro každou službu z obchodu: typ, šablona (výchozí pro typ), název („{klient} – {typ}“), start (dnes), vlastník (vlastník obchodu), členové, pravidla rozdělení (výchozí z Nastavení, např. 50 / 50).
2. Pro marketing navíc model fakturace: „Úvodní fáze → retainer“ (výchozí) nebo „Rovnou retainer“.
3. Po potvrzení: zakázka, fáze a úkoly ze šablony s termíny podle startu, plánované platby ze šablony, vazba `deal_id`, služba klienta, webhook pro Disk.

**Marketing: úvodní fáze a retainer**

1. Šablona „Marketing – úvodní fáze“ vytvoří dvě plánované platby po 7 000 Kč: první fakturuje Patrik, druhou Ondřej (`kind = intro`). Částky a fakturující jdou změnit.
2. Zakázka má `marketing_stage = intro`. Po dokončení fáze „Vyhodnocení úvodní fáze“ se stage přepne na `decision` a v hlavičce se objeví rozhodovací lišta: **Pokračovat na retainer** / **Ukončit**.
3. „Pokračovat“ otevře nastavení retaineru: měsíční částka, od měsíce, den vystavení, kdo fakturuje (pevně jeden, nebo střídavě), pravidla rozdělení pro retainer. Zakázka přejde do fáze Retainer a `marketing_stage = retainer`.
4. Job `retainer.generate` každý měsíc založí plánovanou platbu „Retainer MM/RRRR“ s alokacemi. Fakturující ji po vystavení faktury označí jako vystavenou a doplní číslo faktury.
5. „Ukončit“ nastaví zakázku na dokončenou; pokud klient nemá jinou aktivní zakázku, OPSIS nabídne změnu stavu klienta na Bývalý.
6. Ukončení retaineru: nastavit `end_month`; budoucí plánované platby se zruší.

**Dokončení zakázky**: kontrola otevřených úkolů a nezaplacených plateb (upozornění, ne blokace).

## Úkoly, aktivity a poznámky

Úkol a CRM aktivita jsou jedna věc s typem (Úkol, Hovor, Schůzka, E-mail, Termín). V CRM se jim říká aktivity, v zakázkách úkoly, ale leží ve stejném seznamu „Moje úkoly“ a ve stejném kalendáři.

**Moje úkoly**

- Předvolené pohledy: Dnes (včetně po termínu), Nadcházející 7 dní, Bez termínu, Delegované (vytvořil jsem, řeší druhý), Hotové.
- Seskupení podle data, zakázky, klienta nebo priority; přepínač Seznam / Board (podle stavu).
- Řádek: checkbox, ikona typu, priorita, název, vazba (klient · zakázka · obchod), termín, řešitel.

**Vlastnosti úkolu**: typ, stav (K řešení, Probíhá, Hotovo, Zrušeno), priorita (Žádná, Nízká, Střední, Vysoká, Urgentní), řešitel, termín (datum, volitelně čas a délka), vazby (obchod, organizace, kontakt, zakázka + fáze), popis, podúkoly (jedna úroveň), komentáře, odhad, výsledek (u hovoru a schůzky), štítky, viditelnost.

**Pravidla**

- Hovor a Schůzka mají čas; s napojeným kalendářem se z nich stane událost v Google Kalendáři řešitele (v2).
- Dokončení hovoru nebo schůzky nabídne pole „Výsledek“ a rychlé „Naplánovat další aktivitu“ (ručně, žádná automatika).
- Úkol navázaný na obchod přepočítá u obchodu „další aktivitu“ a „poslední aktivitu“.
- Úkol se zakázkou bez fáze se zobrazí ve skupině „Bez fáze“.
- Přiřazení úkolu druhému uživateli je vidět v jeho „Moje úkoly“ okamžitě (realtime). Notifikace se neposílají.
- Komentáře k úkolu: prostý rich text, zmínka @uživatel jen zvýrazní jméno (bez notifikace).

**Rychlé přidání**: řádek „+ Přidat úkol“ nahoře v každém seznamu úkolů. Parser rozpozná datum v textu („zavolat Novákovi zítra 10:00“ → typ Hovor, termín zítra 10:00) a ukáže, co rozpoznal, před uložením.

**Poznámky**

- Rich text (Tiptap): nadpisy, seznamy, checklisty, odkazy, kód; vkládání obrázků ne (patří na Disk).
- Poznámka patří k jednomu záznamu (klient, kontakt, obchod, zakázka) nebo je samostatná.
- Připnutí nahoru v detailu záznamu; samostatné poznámky v sekci Můj prostor (Owner) nebo v Hledání.
- Automatické ukládání při psaní (debounce 800 ms), historie změn v logu.

## Kalendář (v2)

Kalendář ukazuje na jedné ploše schůzky a úkoly z OPSIS i události z Google Kalendářů obou uživatelů. Co vznikne v OPSIS, je do minuty v Googlu, a naopak.

- Pohledy: Den, Týden (výchozí), Měsíc, Agenda (seznam). Pracovní doba 8–18 zvýrazněná.
- Vrstvy (přepínače vlevo): moje kalendáře, kalendáře Patrika (jen události, které Google sdílí; soukromé události se ukazují jako „Obsazeno“), úkoly s termínem bez času (pruh nahoře).
- Vytvoření tažením v mřížce: rychlý formulář typu Schůzka (název, čas, místo, vazba na klienta / obchod / kontakt, účastníci, přepínač „Poslat pozvánky“).
- Přetažení a změna délky události uloží změnu a propíše ji do Googlu.
- Klik na událost z Googlu: náhled s tlačítkem „Připojit ke klientovi / obchodu“. Pokud e-mail účastníka odpovídá kontaktu v CRM, OPSIS nabídne vazbu automaticky (jedním klikem potvrdit).
- Schůzka v OPSIS s vazbou na obchod se ukáže v jeho timeline a jako jeho další aktivita.
- Odkaz na Google Meet z události je v náhledu klikací.
- Bez připojeného Google účtu kalendář ukazuje jen úkoly a schůzky z OPSIS a nabízí „Připojit Google Kalendář“.

## Finance: platby, rozdělení, vyrovnání

Finance odpovídají na tři otázky: kolik kdo z nás vydělal, co je vyfakturované a nezaplacené, a kdo komu dluží. Faktury se vystavují mimo OPSIS; tady se jen evidují. Výpočty jsou v dokumentu 02, sekce Finance.

**Rozdělení na zakázce** (záložka Finance v detailu zakázky)

- Tabulka pravidel: osoba, způsob (procenta / fixně za platbu / fixně celkem), hodnota, platí pro (vše, jednorázové, úvodní fáze, retainer, navíc), platnost od–do.
- Živý náhled: „Z platby 10 000 Kč dostane Ondřej 6 000 Kč, Patrik 4 000 Kč.“
- Validace: procenta pro stejný typ platby dávají 100 %; jinak upozornění a zbytek jde fakturujícímu.
- Výchozí pravidla pro nové zakázky jsou v Nastavení (např. 50 / 50).

**Platby**

- Na zakázce i v globálním seznamu Finance → Platby. Sloupce: zakázka, klient, popis, typ, částka, fakturuje, stav, číslo faktury, vystaveno, splatnost, zaplaceno, podíl Ondřej, podíl Patrik.
- Stavy: Plánovaná → Vystavená → Zaplacená (nebo Zrušená). Přechod na Vystavenou se ptá na číslo faktury a datum; na Zaplacenou na datum úhrady.
- Po splatnosti a nezaplacená = červený stav v seznamu, počet v sidebaru u Finance.
- Ruční úprava alokací u jedné platby („Rozdělit ručně“) přepne platbu na manuální režim s viditelným štítkem.
- Filtry: období, fakturující, stav, typ zakázky, klient; součty v patičce tabulky.

**Vyrovnání**

- Hlavní číslo nahoře: „Patrik dluží Ondřejovi 12 400 Kč“ (nebo opačně / „Vyrovnáno“), podle zvoleného základu (zaplacené / vystavené).
- Pod ním rozpis po měsících: kolik kdo fakturoval, kolik komu patří, rozdíl.
- Rozklik měsíce ukáže jednotlivé platby, které rozdíl tvoří.
- Tlačítko „Zapsat vyrovnání“: kdo, komu, částka (předvyplněná saldem), datum, způsob (faktura mezi IČO / převod / zápočet), číslo dokladu.
- Seznam zapsaných vyrovnání s možností storna (měkké smazání, v logu).

**Přehled**

- Příjmy podle osoby po měsících (sloupcový graf, aktuální rok), přepínač rok.
- Příjmy podle typu zakázky a podle klienta (top 10).
- Měsíční opakovaný příjem z retainerů (součet aktivních).
- Partner vidí přehled jen ze sdílených zakázek; Owner má přepínač „Včetně soukromých“.

## Google Disk

Každý klient má na sdíleném disku jednu kořenovou složku. Uvnitř je obecná složka klienta a složka každé služby, kterou mu děláte. Každá zakázka má vlastní podsložku ve složce své služby. Strukturu zakládá n8n podle šablony z Nastavení OPSIS (dokument 01, Integrace).

**Navržená struktura**

```
OP Digital – Klienti (Shared Drive)
├─ Klienti/
│  └─ {Název klienta}/
│     ├─ 00 Klient/
│     │  ├─ Smlouvy a objednávky/
│     │  ├─ Brand a loga/
│     │  └─ Podklady od klienta/
│     ├─ 10 Web/                              (jen když má službu Web)
│     │  └─ {RRRR-MM} {Název zakázky}/
│     │     ├─ 01 Podklady/
│     │     ├─ 02 Návrh/
│     │     ├─ 03 Texty a obsah/
│     │     ├─ 04 Fotky a média/
│     │     └─ 05 Předání/
│     ├─ 20 Marketing/                        (jen když má službu Marketing)
│     │  └─ {RRRR-MM} {Název zakázky}/
│     │     ├─ 01 Strategie a podklady/
│     │     ├─ 02 Kreativy/
│     │     │  ├─ Foto/
│     │     │  ├─ Video/
│     │     │  └─ Texty a scénáře/
│     │     ├─ 03 Finální exporty/
│     │     └─ 04 Reporty/
│     └─ 30 Systémy/                          (jen když má službu Systémy)
│        └─ {RRRR-MM} {Název zakázky}/
│           ├─ 01 Analýza a specifikace/
│           ├─ 02 Podklady a data/
│           ├─ 03 Design/
│           ├─ 04 Dokumentace/
│           └─ 05 Předání/
└─ Archiv/
   └─ {Název klienta}/                        (bývalí klienti, přesunuto celé)
```

Číselné prefixy drží pořadí složek stejné u všech klientů. Název kořenové složky je jen název klienta (bez roku), protože klient trvá roky. Datum v názvu zakázky odpovídá jejímu startu.

**Chování v OPSIS**

- Tlačítko **Otevřít Disk** je na kartě klienta (kořenová složka) i v detailu zakázky (složka zakázky). Otevře se v nové kartě. Na mobilu otevře aplikaci Google Disk, je-li nainstalovaná.
- Stavy tlačítka: „Otevřít Disk“ (hotovo), „Vytváří se…“ (čeká na n8n), „Zkusit znovu“ (chyba nebo 10 min bez odpovědi), „Vytvořit složku“ (klient bez složky).
- Spouštěče: firma dostane stav klienta → kořen + `00 Klient` + složky služeb; nová služba → chybějící složka služby; nová zakázka → složka zakázky s podsložkami; přejmenování klienta → přejmenování kořene; Bývalý → přesun do `Archiv`, návrat → zpět.
- Šablona struktury je v Nastavení → Google Disk jako editovatelný strom pro každý typ (přidat, přejmenovat, smazat podsložku, změnit pořadí). Změna platí pro nově zakládané složky; existující se nemění.
- Mazání v OPSIS složky na Disku nikdy nemaže.

## Dashboard

Každý uživatel má vlastní dashboard poskládaný z widgetů v mřížce. Widgety jdou přidávat z knihovny, přetahovat, měnit jejich velikost, nastavovat a odebírat. Uživatel může mít víc dashboardů (např. „Den“ a „Finance“) a přepínat mezi nimi.

**Mřížka**: 12 sloupců, výška řádku 40 px, mezery 12 px; breakpointy desktop (12 sl.), tablet (6 sl.), mobil (1 sl., widgety pod sebou v pořadí z desktopu). Režim „Upravit“ zapne táhla a tlačítka; mimo něj je dashboard statický. Rozložení se ukládá do `dashboards.layout`.

**Knihovna widgetů**

| Widget | Obsah | Nastavení | Fáze |
| --- | --- | --- | --- |
| Úkoly na dnes | moje úkoly dnes + po termínu, odškrtávání přímo ve widgetu | zahrnout delegované | MVP |
| Pipeline v Kč | součet a vážený součet podle fází | pipeline, vlastník | MVP |
| Moje otevřené obchody | seznam bez další aktivity nahoře | počet řádků | MVP |
| Zakázky ve skluzu | po termínu nebo s úkoly po termínu | typ zakázky | MVP |
| Příjmy tento měsíc | můj podíl: vystaveno, zaplaceno, plánováno | základ výpočtu | MVP |
| Saldo vyrovnání | kdo komu dluží + odkaz do Vyrovnání | – | MVP |
| Nezaplacené platby | po splatnosti a blízko splatnosti | – | MVP |
| Poslední změny | feed z activity logu | jen moje / vše | MVP |
| Rychlé odkazy | vlastní seznam odkazů a uložených pohledů | odkazy | MVP |
| Číslo (KPI) | jedno číslo z uloženého pohledu (počet nebo součet pole) | pohled, pole, funkce | MVP |
| Seznam z pohledu | prvních N řádků libovolného uloženého pohledu | pohled, počet řádků | MVP |
| Nadcházející schůzky | dnes a zítra z kalendáře | kalendáře | v2 |
| Leady a CPL | leady tento měsíc, CPL, náklad na vyhraný obchod | účty, období | v2 |
| Hodiny tento týden | moje hodiny podle zakázek | – | v2 |
| Expirace | domény a hostingy do 60 dní (jen Owner) | počet dní | v2 |
| Retainery | aktivní retainery a měsíční součet | – | v2 |

Výchozí dashboard při prvním přihlášení: Úkoly na dnes, Pipeline v Kč, Zakázky ve skluzu, Příjmy tento měsíc, Saldo vyrovnání, Poslední změny. Widgety „Číslo“ a „Seznam z pohledu“ dovolí postavit si cokoli dalšího bez programování.

## Reklama, hodiny, šablony e-mailů (v2)

Tři menší moduly, které rozšiřují zakázky a CRM.

**Reklama**

- Seznam reklamních účtů: název, komu patří (OP Digital / klient), poslední synchronizace, spend tento měsíc.
- Detail účtu: kampaně s filtrem období (7 / 30 / 90 dní, měsíc, vlastní). Sloupce: kampaň, stav, spend, zobrazení, kliky, CTR, leady (Meta), leady (OPSIS), CPL, vyhrané obchody, náklad na vyhraný obchod, přiřazená zakázka.
- Rozklik kampaně: reklamní sady a reklamy se stejnými metrikami, náhled kreativy, seznam leadů (obchodů) z kampaně.
- Graf spend a leady po dnech (dvě osy) v detailu kampaně.
- Přiřazení kampaně zakázce klienta: ruční výběr v řádku; tím se metriky objeví v záložce Reklama u zakázky a klienta.
- Nastavení → Integrace → Meta: připojení tokenu, výběr účtů, mapování lead formulářů na pipeline a fázi.

**Hodiny**

- Zápis hodin: v detailu úkolu („Zapsat čas“) nebo zakázky, nebo v týdenním výkazu (mřížka zakázka × den, zápis v hodinách s desetinnou čárkou nebo `1:30`).
- Přehled: moje hodiny týden / měsíc, hodiny podle zakázky a osoby; u zakázky srovnání s odhadem úkolů a efektivní hodinová sazba (podíl na příjmech / hodiny).
- Bez stopek, bez schvalování.

**Šablony e-mailů**

- Seznam sdílených šablon s kategorií (follow-up, nabídka, onboarding, připomínka platby…), jazykem a počtem použití.
- Editor: předmět, tělo (rich text), proměnné vkládané z menu (`{{kontakt.krestni_jmeno}}`, `{{firma.nazev}}`, `{{obchod.nazev}}`, `{{zakazka.nazev}}`, `{{uzivatel.jmeno}}`), náhled s daty vybraného kontaktu.
- Použití: z detailu kontaktu, obchodu, klienta nebo zakázky „E-mail ze šablony“ → výběr šablony → náhled s doplněnými proměnnými → **Otevřít v Gmailu** (compose URL s adresátem, předmětem a tělem) nebo **Kopírovat**.
- Po otevření v Gmailu nabídne OPSIS „Zapsat jako aktivitu E-mail“ (jeden klik, hotová aktivita s předmětem).

## Hledání a activity log

Cmd+K je nejrychlejší cesta kamkoli v systému. Activity log je nezměnitelný záznam, kdo co kdy udělal.

**Cmd+K**

- Otevře se odkudkoli (Cmd+K / Ctrl+K, na mobilu ikona lupy v dolní liště).
- Bez dotazu: posledních 8 otevřených záznamů a nejčastější příkazy.
- S dotazem: výsledky seskupené podle typu (Klienti a organizace, Kontakty, Obchody, Zakázky, Úkoly, Poznámky), u každého podtitulek (firma, fáze, telefon). Hledá se v názvu, IČO, e-mailech, telefonech a textu poznámek, bez ohledu na diakritiku a velikost písmen.
- Příkazy: „Nový obchod / klient / kontakt / zakázka / úkol / poznámka“, „Přejít na …“ (všechny moduly), „Přepnout téma“, „Zapsat hodiny“, „Zapsat platbu“.
- Akce u výsledku bez otevření: Enter = otevřít, Cmd+Enter = otevřít v novém panelu, u kontaktu Tab nabídne Zavolat / Kopírovat telefon / E-mail, u klienta Otevřít Disk.
- Výsledky se objeví do 150 ms; při psaní se nezasekávají (rušení předchozích požadavků).

**Activity log**

- Globální stránka: chronologický feed s filtry (uživatel, typ záznamu, akce, období, kategorie data / bezpečnost / integrace) a fulltextem v názvech záznamů.
- Řádek: kdo (avatar nebo systém: n8n, Google, Meta, job), co („změnil fázi obchodu“), na čem (odkaz), kdy (relativně, přesný čas v tooltipu). Rozbalení ukáže změny po polích „před → po“.
- V detailu každého záznamu je jeho log součástí Timeline.
- Log nejde upravit ani smazat (ani Owner). Smazané záznamy zůstávají v logu s odkazem do koše.
- Partner nevidí záznamy logu o soukromých datech Ownera; bezpečnostní kategorii vidí jen pro svůj účet.
- Export logu do CSV (jen s `deals.export` nebo Owner).

## Jen pro Ondřeje

Sekce „Můj prostor“ v sidebaru je viditelná jen Ownerovi. Obsahuje evidenci hostingu, údržby a domén, opakované faktury, e-mailovou knihovnu a přehled soukromých záznamů.

**Hosting a údržba (v2)**

- Seznam: klient, druh (hosting / údržba), název služby, web, cena, období, další obnova, stav, připravovat fakturu (v3).
- Pohledy: Obnova do 30 dní, Podle klienta, Zrušené.
- Souhrn nahoře: roční opakovaný příjem z hostingu a údržby, počet aktivních služeb.
- Po označení obnovy jako vyfakturované se `next_renewal_on` posune o období.
- Na kartě klienta záložka „Hosting a domény“ (jen Owner).

**Domény (v2)**

- Seznam: doména, klient, registrátor, expirace, kdo platí, automatické prodloužení, poznámka.
- Stav barvou: více než 60 dní (normální), 60–30 dní (upozornění), méně než 30 dní nebo po expiraci (kritické). Hranice jde u domény změnit (`warn_days`).
- Počet kritických domén u položky v sidebaru a ve widgetu Expirace. Žádné e-maily ani notifikace.
- Hromadné vložení domén (vložit seznam, každá na řádek, pak doplnit klienta).

**Opakované faktury (v3)**

- Job připraví návrh faktury `invoice_lead_days` před obnovou služby s nastaveným „připravovat fakturu“.
- Seznam návrhů: klient, služba, období, částka, stav. Akce: Upravit, **Schválit a vytvořit ve Fakturoidu**, Zrušit.
- Po vytvoření se uloží číslo a odkaz faktury z Fakturoidu a vznikne platba v OPSIS (100 % Ondřej, mimo saldo).

**E-mailová knihovna (v2)**

- Soukromá databáze e-mailů a textů na cokoli: kategorie, štítky, fulltext, kopírování jedním klikem, „Otevřít v Gmailu“.
- Stejný editor jako šablony e-mailů včetně proměnných; jde přesunout do sdílených šablon a zpět.

**Soukromé**

- Pohled na všechny moje soukromé zakázky, úkoly a poznámky na jednom místě, seskupené podle typu.
- Samostatné soukromé poznámky (bez vazby) se zakládají zde.

## Nastavení

Nastavení je rozdělené na osobní (každý uživatel) a systémové (podle oprávnění, většinou Owner).

| Sekce | Obsah | Kdo |
| --- | --- | --- |
| Profil | jméno, avatar, heslo, 2FA, záložní kódy, aktivní relace | každý |
| Vzhled | téma (světlé / tmavé / podle systému), hustota (kompaktní / pohodlná), výchozí stránka po přihlášení | každý |
| Můj Google Kalendář | připojení účtu, výběr zobrazených kalendářů, výchozí kalendář pro zápis (v2) | každý |
| Uživatelé | pozvat, deaktivovat, role, IČO a fakturační nástroj uživatele | Owner |
| Oprávnění | matice funkce × uživatel (dokument 01) | Owner |
| Pipeline | pipeline, fáze (název, pořadí, pravděpodobnost, zvýraznit po), důvody prohry | `settings.pipelines` |
| Typy aktivit | název, ikona, barva, zda je událostí kalendáře | `settings.pipelines` |
| Vlastní pole | pro organizace, kontakty, obchody, zakázky, úkoly; typ, možnosti, povinnost, zobrazení | `settings.custom_fields` |
| Štítky | název, barva, rozsah | `settings.tags` |
| Šablony zakázek | fáze, úkoly, plánované platby, výchozí šablona pro typ | `settings.templates` |
| Finance | výchozí pravidla rozdělení pro nové zakázky, základ salda (zaplacené / vystavené) | Owner |
| Google Disk | stav napojení na n8n, editor stromu složek pro klienta a každý typ zakázky, test webhooku | `settings.integrations` |
| Integrace | ARES (stav), Meta (token, účty, mapování formulářů), Fakturoid (Owner), odchozí webhooky, ingest tajemství | `settings.integrations` |
| Systém | verze, fronta úloh, zálohy, chybná doručení, koš | Owner |

Každá změna v Nastavení se zapisuje do activity logu.

## Mobil

Na mobilu jde hlavně o rychlé dohledání: najít klienta, lead nebo zakázku, zavolat, poslat e-mail, otevřít Disk, zapsat poznámku nebo úkol. Mobil není zmenšený desktop; má vlastní rozložení pro tyto akce. Vzhled je v dokumentu 04, sekce Mobil.

**Navigace**: spodní lišta se 5 položkami: Hledat, Klienti, Obchody, Úkoly, Více (ostatní moduly). Výchozí obrazovka po otevření je Hledat s posledními záznamy.

**Co musí fungovat na mobilu (MVP)**

- [ ] Hledání přes všechno, výsledky s telefonem a firmou přímo v řádku; tap na telefon volá.
- [ ] Karta klienta: hlavička s tlačítky Zavolat, E-mail, Navigovat (adresa v mapách), Disk; pod ní kontakty, aktivní zakázky, otevřené obchody, poslední poznámky.
- [ ] Detail kontaktu s tlačítky Zavolat, SMS, WhatsApp (odkaz `wa.me`), E-mail.
- [ ] Detail obchodu a zakázky ke čtení, změna fáze, stavu a vlastníka.
- [ ] Moje úkoly: odškrtnutí, změna termínu, rychlé přidání.
- [ ] Nová poznámka a nový úkol k libovolnému záznamu, diktování přes klávesnici telefonu.
- [ ] Board obchodů jako vodorovně posuvné sloupce, přesun karty přes menu „Přesunout do fáze“ (tažení na mobilu není povinné).

**Na mobilu záměrně omezené**: matice oprávnění, editor šablon, editor struktury Disku, nastavení dashboardu (jen přeskládání pořadí widgetů) a tabulky s mnoha sloupci (zobrazí se jako karty).

**PWA (v2)**: manifest a ikona pro „Přidat na plochu“, celoobrazovkový režim, poslední data dostupná i při slabém signálu z persistované cache (jen čtení).
