# OPSYS – digest specifikace (C)

Vznik 2026-10-14 · analytický výtah ze `docs/specifikace/00` a `10`–`14` (v dokumentech se systém jmenuje OPSIS; zde OPSYS = OPSIS).
Pořadí autority: **00 → 13 → 12 → 11 → 14** (10 je jen přehled; architektura z 11 se NEPOUŽIJE, platí jádro Rebar: Next.js + Drizzle + PostgreSQL).
Fáze: **MVP** (základ), **v2** (propojení, přehledy), **v3** (fakturace). Co ve 00 nemá označení, je MVP.
Zdroj u požadavku: `[00]` logická spec., `[13]` funkční, `[12]` datový model, `[11]` architektura, `[14]` design, `[10]` přehled. Co není ve 00, ale je v 10–14, je označeno zdrojem; nic není doplněno od sebe (domněnky jsou jen v oddílech 2 a 4 jako PŘEDPOKLAD).

---
## 1. Požadavky po modulech

### SPOL – Společné funkce (navigace, seznamy, filtry, detail, koš, štítky, pole)
- **SPOL-01** [MVP] Levý panel: Práce (Přehled, Moje úkoly, Kalendář) · CRM (Obchody, Klienti, Organizace, Kontakty) · Realizace (Zakázky, Hodiny) · Finance (Platby a rozdělení, Vyrovnání) · Marketing (Reklama, Šablony e-mailů) · Můj prostor (jen Ondřej: Hosting a údržba, Domény, E-mailová knihovna, Opakované faktury, Soukromé) · dole Historie změn, Koš, Nastavení. [00,13]
- **SPOL-02** [MVP] Počty u položek panelu jen tam, kde je třeba akce: úkoly po termínu, platby po splatnosti (Finance), domény před expirací (kritické). [00,13]
- **SPOL-03** [MVP] Do panelu jde připnout vlastní uložený pohled (např. „Moje otevřené obchody“). [00]
- **SPOL-04** [MVP] Každý modul má seznam s volitelnými sloupci; pořadí a šířka se mění tažením a ukládají se do pohledu. [00,13]
- **SPOL-05** [MVP] Inline úprava hodnoty v řádku: text, výběr, datum, osoba, štítky, částka. [00]
- **SPOL-06** [MVP] Hromadný výběr řádků: změna vlastníka, štítků, fáze, stavu, viditelnosti, smazání. [00]
- **SPOL-07** [MVP] Přepínač Seznam / Board / Kalendář tam, kde dává smysl (obchody: board po fázích; zakázky: board po stavu nebo po fázi jednoho typu; úkoly: board po stavu). [00,13]
- **SPOL-08** [MVP] Filtr = podmínky „pole · operátor · hodnota“ nad všemi poli vč. vlastních; operátory: je, není, obsahuje, je prázdné, před, po, v posledních N dnech, mezi; příklady „Fáze je Nabídka“, „Hodnota > 50 000 Kč“, „Bez další aktivity“. [00]
- **SPOL-09** [MVP] Filtr+řazení+sloupce+seskupení se uloží jako pohled (osobní/sdílený); stav filtru je v URL (odkaz jde poslat). [00,13]
- **SPOL-10** [MVP] Rychlé předvolby: Moje, Dnes, Po termínu, Bez aktivity, Soukromé (jen Ondřej). [00]
- **SPOL-11** [MVP] Detail záznamu má všude stejnou kostru: vlevo obsah, vpravo panel vlastností (klik = úprava), časová osa; otevře se na celou obrazovku i jako boční náhled nad seznamem. [00,13]
- **SPOL-12** [MVP] Hlavička detailu: název, stav/fáze, vlastník, zámek viditelnosti (jen Ondřej), menu: duplikovat, smazat, kopírovat odkaz, zobrazit v historii. [00]
- **SPOL-13** [MVP] „Nový…“ / klávesa C otevře krátký formulář jen s povinnými poli (+ pole „zobrazit při vytvoření“); Cmd+K vytvoří cokoli odkudkoli; Ondřej má přepínač Sdílené/Soukromé přímo ve formuláři. [00,13]
- **SPOL-14** [MVP] Smazání je vždy vratné: ihned „Vrátit“ (10 s), záznam jde do koše na 30 dní, obnova vrátí i podřízené záznamy; po 30 dnech trvalé smazání jobem. [00,13,11]
- **SPOL-15** [MVP] Potvrzovací dialog jen u: trvalé smazání, změna oprávnění, zrušení retaineru, přepočet rozdělení zaplacené platby, sloučení duplicit. [00,14]
- **SPOL-16** [MVP] Štítky s barvou na firmy, kontakty, obchody, zakázky, úkoly (štítek má rozsah použití). [00,12]
- **SPOL-17** [MVP] Vlastní pole na firmy, kontakty, obchody, zakázky, úkoly; typy: text, dlouhý text, číslo, částka, datum, výběr, vícenásobný výběr, osoba, odkaz, e-mail, telefon, zaškrtávací pole; nastavitelná povinnost, zobrazení ve formuláři a v seznamu; pole se jen archivuje (data zůstanou). [00,12]
- **SPOL-18** [MVP] Realtime: změna jednoho je u druhého do 2 s bez obnovení; soukromé události se Patrikovi neposílají. [00,11]
- **SPOL-19** [MVP] Klávesnice: Cmd/Ctrl+K a C jsou povinné [00]; zbytek tabulky zkratek (J/K, Enter, Space, X, Esc, E, S, A, P, D, L, G+P/O/K/Z/U/F/N, Shift+D = Disk, Cmd+Enter, Cmd+Backspace, Cmd+Z 10 s, ?) je návrh z [14].
- **SPOL-20** [MVP] Prázdný stav: jedna věta + jedno tlačítko; formát částek „14 000 Kč“, data „7. 10. 2026“, telefon „+420 777 123 456“, IČO 8 číslic bez mezer. [14]

### NFR – Nefunkční požadavky (převážně z 10/11, přehodnotit pro Next.js)
- **NFR-01** [MVP] Každá změna dat prochází jednou servisní vrstvou: ověří oprávnění → aplikuje viditelnost → zapíše audit (ve stejné transakci). Přímé zápisy mimo ni zakázané. [10,11]
- **NFR-02** [MVP] Přepnutí obrazovky a uložení působí okamžitě; cíl přechodu mezi načtenými obrazovkami < 100 ms, detailní rozpočty z [11] (p95 seznam 120 ms, úprava 200 ms). [00,10,11]
- **NFR-03** [MVP] Cmd+K: výsledky do 150 ms (p95). [10,11]
- **NFR-04** [MVP] ARES doplní údaje do 2 s. [00]
- **NFR-05** [MVP] Po založení klienta/zakázky se do 60 s objeví funkční tlačítko „Otevřít Disk“. [10]
- **NFR-06** [MVP] Změna oprávnění platí do několika sekund (11: do 5 s) i u přihlášeného. [00,11]
- **NFR-07** [MVP] Peníze v haléřích (integer), jen CZK, bez logiky DPH; časová zóna Europe/Prague; UI česky, kód/DB anglicky. [10,11,12]
- **NFR-08** [MVP] Povinné testy: oprávnění+viditelnost (každý endpoint seznam/detail/hledání/agregace: Partner nedostane soukromé ani jeho příspěvek do součtu), výpočty rozdělení a salda (8 scénářů ve FIN-22), ingest endpointy. [10,11]
- **NFR-09** [MVP] Seed: oba uživatelé, výchozí pipeline, typy aktivit, důvody prohry, šablony zakázek, výchozí pravidla rozdělení, ukázková data pro vývoj. [10,12]
- **NFR-10** [MVP] Žádné notifikace (e-mail, push, Telegram), žádné automatické follow-upy; upozornění jen vizuálně v aplikaci. [00]
- **NFR-11** [MVP] Tokeny integrací šifrované v DB (AES-256-GCM); příchozí webhooky podepsané HMAC + časová značka ±5 min; CSRF, bezpečnostní hlavičky, neindexovatelné. [11]
- **NFR-12** [MVP] Zálohy: noční šifrovaný dump mimo server, retence 30 denních + 12 měsíčních, týdenní test obnovy; v Nastavení → Systém stav záloh. [00,11]
- **NFR-13** [MVP] Ošetření výpadků: integrace (ARES, Disk, Meta, Google) nesmí blokovat uložení; stav integrace + „Otestovat“ v Nastavení. [00,11]
- **NFR-14** [MVP] Aplikace běží online na vlastní adrese; desktop-first, min. šířka 1024 px, mobil < 768 px má vlastní rozložení. [00,14]

### AUT – Přihlášení a uživatelé
- **AUT-01** [MVP] Přihlášení e-mailem, heslem a vždy druhým faktorem (TOTP); bez 2FA se nikdo dál nedostane. [00,11]
- **AUT-02** [MVP] Účty zakládá jen Ondřej pozvánkou (jednorázový odkaz, 48 h); veřejná registrace neexistuje. [00,11]
- **AUT-03** [MVP] První přihlášení: heslo ≥ 12 znaků s kontrolou uniklých hesel, nastavení TOTP, 10 záložních kódů. [11]
- **AUT-04** [MVP] Zařízení jde označit jako důvěryhodné: kód se 30 dní nevyžaduje; relace 30 dní s prodlužováním. [00,11]
- **AUT-05** [MVP] Každý vidí svá přihlášená zařízení a odhlásí je; Ondřej odhlásí kohokoli. [00]
- **AUT-06** [MVP] Rate limit přihlášení 5 pokusů / 15 min na účet a IP. [11]
- **AUT-07** [MVP] Role: Vlastník (Ondřej, vše), Partner (Patrik, co mu Ondřej zapne), Externista (jen přiřazené zakázky a úkoly; zatím nepoužívaná, v UI se nezakládá). [00,10]
- **AUT-08** [MVP] Přihlášení, neúspěšné pokusy, změna 2FA a oprávnění jdou do historie (kategorie security). [00,11]

### VID – Viditelnost záznamů
- **VID-01** [MVP] Ondřej vidí vždy všechno. [00]
- **VID-02** [MVP] Co vytvoří Patrik, je vždy sdílené (přepínač nevidí). [00,10]
- **VID-03** [MVP] Co vytvoří Ondřej, je výchozí sdílené; kdykoli přepne na soukromé (ikona zámku, i při vytvoření). [00]
- **VID-04** [MVP] Soukromý záznam Patrik nevidí nikde: seznamy, hledání, kalendář, přehled, historie, součty a počty. [00]
- **VID-05** [MVP] Pod soukromým záznamem je soukromé i podřízené (úkoly, poznámky, platby, hodiny soukromé zakázky; úkoly soukromého obchodu); `visibility_source` own/inherited; zveřejnění rodiče zveřejní děti, které nebyly soukromé samy. [00,10,11]
- **VID-06** [MVP] Soukromý úkol nejde přiřadit Patrikovi; systém nabídne „Zveřejnit a přiřadit“ s potvrzením. [00]
- **VID-07** [MVP] Rozdělení příjmů a vyrovnání u sdílených zakázek vidí oba celé. [00]
- **VID-08** [MVP] Agregace (pipeline, přehled, saldo, počty v panelu) používají stejný scope; Partner nikdy nevidí číslo obsahující soukromá data. [11]
- **VID-09** [MVP] Soukromá data Ondřeje se posílají jen na webhooky označené jako jeho. [00]
- **VID-10** [MVP] Změna viditelnosti je událost v historii. [00]

### NAS – Nastavení a oprávnění
- **NAS-01** [MVP] Matice Ondřej→uživatel: u každého modulu zvlášť vidět / vytvářet / upravovat / mazat + zvláštní práva: export, správa pipeline, šablon, polí a štítků, zápis plateb, úprava rozdělení, zápis vyrovnání, správa integrací. [00]
- **NAS-02** [MVP] Výchozí práva Partnera [11]: obchody, kontakty = vše kromě delete/export; klienti view+edit; zakázky vše kromě delete; úkoly, poznámky, hodiny, kalendář, šablony e-mailů vše; finance view + payments_write (ne splits_edit, settlements_write); reklama view; historie view; settings: pipelines, custom_fields, templates, tags (ne integrations, users).
- **NAS-03** [MVP] Funkce „Můj prostor“ (`owner.*`: hosting, domains, email_library, recurring_invoices) jsou pro ostatní vypnuté; Ondřej je může zapnout. [00,11]
- **NAS-04** [MVP] Seznam klíčů funkcí je jediný zdroj pravdy a nový modul bez klíčů neprojde testem. [11]
- **NAS-05** [MVP] Osobní nastavení: Profil (jméno, avatar, heslo, 2FA, záložní kódy, zařízení), Vzhled (světlý/tmavý/podle systému, hustota řádků, úvodní stránka). [00,13]
- **NAS-06** [MVP] Uživatelé (Ondřej): pozvat, deaktivovat, role, IČO a fakturační nástroj uživatele. [00]
- **NAS-07** [MVP] Pipeline (oprávnění): pipeline, fáze, pravděpodobnosti, doba do zvýraznění, důvody prohry. Typy aktivit: název, ikona, barva, zobrazení v kalendáři. [00]
- **NAS-08** [MVP] Vlastní pole, Štítky, Šablony zakázek (fáze, úkoly, plánované platby, výchozí šablona typu) – každé s vlastním oprávněním. [00]
- **NAS-09** [MVP] Finance (Ondřej): výchozí rozdělení nových zakázek (např. 50/50); základ salda: zaplacené / vystavené. [00]
- **NAS-10** [MVP] Google Disk: stav napojení, editor stromu složek pro klienta a každý typ zakázky, test. Integrace: ARES, Meta (účty, formuláře, kam padají leady; v2), Fakturoid (jen Ondřej; v3), webhooky pro n8n. [00]
- **NAS-11** [MVP] Systém (Ondřej): stav systému, zálohy, chyby integrací, koš, chybná doručení webhooků. [00,13]
- **NAS-12** [MVP] Každá změna nastavení jde do historie. [00]
- **NAS-13** [v2] Můj Google Kalendář: připojení účtu, zobrazované kalendáře, kalendář pro zápis. [00]

### OBCH – Obchody a pipeline
- **OBCH-01** [MVP] Obchod je v jedné fázi pipeline, má hodnotu, vlastníka a ideálně další aktivitu; Vyhráno/Prohráno není fáze, ale výsledek (open/won/lost). [00]
- **OBCH-02** [MVP] Výchozí pipeline „Obchody“ (pravděpodobnost · zvýraznit při nečinnosti déle než): Nová poptávka 10 % · 1 den; Kontaktováno 20 % · 5 dní; Schůzka / konzultace 40 % · 7 dní; Nabídka odeslaná 60 % · 7 dní; Vyjednávání 80 % · 10 dní. [00]
- **OBCH-03** [MVP] Fáze jde přejmenovat, přidat, smazat, přeskládat; pipeline může být víc (přepínač nahoře). [00,13]
- **OBCH-04** [MVP] Obchod obsahuje: název, firma, hlavní kontakt + další, hodnota, služby (web, marketing, systémy), očekávané uzavření, vlastník, zdroj (ručně, Meta, webový formulář, doporučení, jiné), u Meta kampaň a reklama, štítky, vlastní pole, poznámky, aktivity, historii. [00]
- **OBCH-05** [MVP] Board: sloupce = fáze; v hlavičce počet, součet hodnot a vážený součet (hodnota × pravděpodobnost). [00]
- **OBCH-06** [MVP] Karta: název, firma, hodnota, vlastník, služby, datum další aktivity. [00]
- **OBCH-07** [MVP] Obchod bez naplánované další aktivity má výstražnou ikonu; obchod ve fázi bez aktivity déle než práh fáze je červeně; jen vizuálně, nic se neděje automaticky. [00]
- **OBCH-08** [MVP] Přesun tažením mezi fázemi (optimisticky); při tažení se dole objeví zóny Vyhráno a Prohráno. [00,13]
- **OBCH-09** [MVP] Systém eviduje, kdy obchod vstoupil do které fáze a jak dlouho v ní byl. [00,12]
- **OBCH-10** [MVP] Seznam: tabulka s filtry/pohledy; výchozí sloupce: název, firma, kontakt, hodnota, fáze, vlastník, další aktivita, očekávané uzavření, zdroj, štítky. [00,13]
- **OBCH-11** [MVP] Detail: klikací pás fází, tlačítka Vyhráno/Prohráno, blok „Další aktivita“ s rychlým přidáním (hovor, schůzka, úkol…), rychlé zápisy (aktivita, poznámka, e-mail ze šablony), časová osa (aktivity, poznámky, změny fází a polí). [00]
- **OBCH-12** [MVP] Prohra vyžaduje důvod z číselníku (Cena, Vybrali konkurenci, Nereaguje, Odloženo, Nevhodný klient, Jiné; seznam editovatelný) + volitelná poznámka; prohraný obchod jde znovu otevřít. [00]
- **OBCH-13** [MVP] Výhra: (1) obchod won + datum; (2) firma se stane aktivním klientem, pokud ještě nebyla, dostane „klient od“ a služby z obchodu; (3) nabídne se dialog zakázek: řádek za každou službu (typ, šablona, název, start, vlastník, členové, rozdělení), řádky jde upravit/odebrat/přidat, „Přeskočit“ nezaloží nic; (4) po potvrzení vzniknou zakázky ze šablon a složky na Disku. [00,13]
- **OBCH-14** [MVP] Úkol navázaný na obchod aktualizuje jeho „další“ a „poslední aktivitu“. [00,12]
- **OBCH-15** [v2] Lead z Meta padá do „Nová poptávka“ se štítkem Meta a názvem kampaně; nový lead je na boardu zvýrazněný, dokud ho někdo neotevře. [00]

### ORG – Organizace a ARES
- **ORG-01** [MVP] Údaje: název, oficiální název, IČO, DIČ, právní forma, sídlo, web, obecný e-mail a telefon, obor, vlastník, štítky, vlastní pole. [00]
- **ORG-02** [MVP] Firmu jde založit i jen s názvem (bez IČO). [00]
- **ORG-03** [MVP] Po zadání platného IČO (8 číslic, kontrola mod 11) systém do 2 s doplní název, sídlo, DIČ, právní formu, ukáže změny a uživatel potvrdí. [00,11]
- **ORG-04** [MVP] „Aktualizovat z ARES“ kdykoli; ukládá se čas synchronizace, cache odpovědí 24 h; výpadek ARES uložení neblokuje. [00,11]
- **ORG-05** [MVP] Stejné IČO systém nedovolí a odkáže na existující firmu. [00]
- **ORG-06** [MVP] Podobný název (trigram > 0,6) nebo stejná doména webu = upozornění „Možná duplicita“, jde pokračovat. [00,13]
- **ORG-07** [MVP] Sloučení duplicit (Ondřej): vybere se hlavní záznam, kontakty, obchody, zakázky, úkoly a poznámky se přesunou; zapíše se do historie; s potvrzením. [00,13]
- **ORG-08** [MVP] Detail organizace = karta klienta (KLI); záložky bez dat se neukazují. [00]
- **ORG-09** [MVP] Seznam: název, IČO, město, stav klienta, služby, vlastník, počet otevřených obchodů, poslední aktivita, štítky. [13]

### KON – Kontakty
- **KON-01** [MVP] Údaje: jméno, příjmení, firma (hlavní + další s rolí), pozice, víc e-mailů a telefonů se štítkem (práce, mobil, soukromý) a jedním hlavním, LinkedIn, příznak „rozhoduje“, vlastník, štítky, vlastní pole. [00]
- **KON-02** [MVP] Telefon a e-mail jdou rovnou použít (zavolat, napsat) nebo zkopírovat. [00]
- **KON-03** [MVP] Duplicity podle e-mailu a telefonu bez ohledu na mezery a předvolbu (normalizace E.164); sloučení jako u firem. [00,11,12]
- **KON-04** [MVP] Detail: údaje, firmy, obchody, úkoly, poznámky, časová osa. [00]
- **KON-05** [MVP] Rychlé založení kontaktu přímo z firmy, obchodu nebo zakázky. [00]
- **KON-06** [MVP] Seznam: jméno, firma, pozice, primární telefon, primární e-mail, vlastník, poslední aktivita. [13]

### KLI – Klienti a karta klienta
- **KLI-01** [MVP] Klient = organizace se stavem klienta (ne samostatná entita); zůstává navždy se vší historií. [00,10,12]
- **KLI-02** [MVP] Stavy: Lead (jedná se; vytvoří se složka na Disku) · Aktivní (při prvním přechodu uloží „klient od“; složka se vytvoří, pokud neexistuje) · Pozastavený (nic) · Bývalý (zeptá se na důvod a datum ukončení; složka do Archivu; nic se nemaže). Návrat Bývalý→Aktivní vrátí složku. [00]
- **KLI-03** [MVP] Seznam: výchozí aktivní a pozastavení, přepínač „Všichni, včetně bývalých“; sloupce název, stav, služby, vlastník, aktivní zakázky, příjem za 12 měsíců (jen s právem na finance), klient od, poslední aktivita, tlačítko Disk; seskupení podle stavu nebo služby. [00]
- **KLI-04** [MVP] Hlavička karty: název, stav, služby, vlastník, štítky, zámek (Ondřej); tlačítka Otevřít Disk, Zavolat (hlavní kontakt), E-mail ze šablony, Web, Nový úkol, Nová poznámka, Nová zakázka, Nový obchod. [00]
- **KLI-05** [MVP] Záložka Přehled: kontext, hlavní kontakty, aktivní zakázky s fází, otevřené obchody, nejbližší úkoly a schůzky, finanční souhrn, posledních 5 událostí. [00]
- **KLI-06** [MVP] Záložka Kontext: volný text upravovaný na místě (kdo rozhoduje, jak komunikovat, historie spolupráce, na co si dát pozor, proč spolupráce skončila). [00]
- **KLI-07** [MVP] Záložky Kontakty (role, rozhoduje, rychlé volání a e-mail), Zakázky (i dokončené a zrušené), Obchody (otevřené, vyhrané, prohrané s důvodem), Úkoly a aktivity (filtr typu), Poznámky (připnuté nahoře, pak nejnovější), Finance (platby všech zakázek, rozdělení, součty za rok a celkem, retainery), Historie (vč. změn údajů a událostí Disku). [00]
- **KLI-08** [v2] Záložka Reklama: reklamní účty a kampaně klienta, útrata, leady, cena za lead po měsících. [00]
- **KLI-09** [v2] Záložka Hosting a domény (jen Ondřej): hosting, údržba, domény, data obnovy. [00]
- **KLI-10** [MVP] Finanční souhrn: celkem zaplaceno, za 12 měsíců, aktivní měsíční retainer, nezaplacené platby; Patrik vidí jen součty ze sdílených zakázek. [00]
- **KLI-11** [MVP] Přechod stavu a přejmenování klienta spouští události Disku (viz DRV-02). [00]

### ZAK – Zakázky, šablony, retainer, marketing úvodní fáze
- **ZAK-01** [MVP] Zakázka patří jednomu klientovi a má typ Web / Marketing / Systémy; vzniká z vyhraného obchodu, šablony nebo ručně. [00]
- **ZAK-02** [MVP] Pole: kód (Z-2026-014), název, klient, typ, stav (Plánovaná, Aktivní, Pozastavená, Dokončená, Zrušená), aktuální fáze, model fakturace (jednorázově, úvodní fáze a pak retainer, rovnou retainer, hodinově), vlastník, členové, start, termín, dohodnutá cena, popis, původní obchod, štítky, vlastní pole. [00]
- **ZAK-03** [MVP] Kód „Z-RRRR-NNN“ (např. Z-2026-014): unikátní, rok + pořadí, generuje DB sekvence. [00,12]
- **ZAK-04** [MVP] Výchozí fáze – Web: Podklady → Návrh → Vývoj → Revize klienta → Spuštění → Předání. Marketing: Onboarding (přístupy, Business Manager, pixel) → Tvorba kreativ a videí → Spuštění kampaní → Optimalizace → Vyhodnocení úvodní fáze → Retainer. Systémy: Analýza → Specifikace → Vývoj → Testování → Nasazení → Podpora. (Počáteční nastavení; upravují se v šablonách.) [00]
- **ZAK-05** [MVP] Šablona zakázky: typ, fáze, úkoly (název, typ, priorita, řešitel, termín = počet dní od startu, odhad), plánované platby (popis, částka, fakturující, splatnost = počet dní od startu). [00]
- **ZAK-06** [MVP] Šablon na typ libovolně mnoho, jedna výchozí; duplikace, archivace (ne mazání); hotovou zakázku jde uložit jako šablonu (fáze a úkoly bez dat); změna šablony neovlivní běžící zakázky. [00]
- **ZAK-07** [MVP] Seznam: kód, název, klient, typ, stav, aktuální fáze, vlastník, členové, termín, hodnota, Disk; board podle stavu, nebo podle fází pro jeden typ; zakázka po termínu / s úkoly po termínu má výstražnou ikonu. [00,13]
- **ZAK-08** [MVP] Detail: hlavička (kód, název, klient, typ, stav, vlastník, členové, termín, Otevřít Disk, zámek); pás fází – klik nastaví aktuální fázi, při dokončení fáze dotaz „dokončit i její otevřené úkoly?“. [00]
- **ZAK-09** [MVP] Záložky detailu: Úkoly (po fázích, přetahování mezi fázemi), Finance (rozdělení, platby, retainer), Hodiny (v2), Poznámky, Obchod, Reklama (v2, jen marketing), Historie. [00]
- **ZAK-10** [MVP] Založení z výhry: řádek za službu – typ, šablona (výchozí typu), název („{klient} – {typ}“), start (dnes), vlastník (vlastník obchodu), členové, rozdělení (výchozí z Nastavení); u marketingu volba modelu „Úvodní fáze → retainer“ (výchozí) / „Rovnou retainer“. [00,13]
- **ZAK-11** [MVP] Po potvrzení vznikne: zakázka, fáze a úkoly ze šablony s termíny od startu, plánované platby ze šablony, vazba na obchod, služba klienta (pokud chyběla), událost pro Disk. [13]
- **ZAK-12** [MVP] Šablona „Marketing – úvodní fáze“ vytvoří dvě plánované platby po 7 000 Kč: 1. fakturuje Patrik, 2. Ondřej (druh intro); částky i fakturující jdou změnit. [00,13]
- **ZAK-13** [MVP] Po dokončení fáze „Vyhodnocení úvodní fáze“ se v hlavičce objeví volba **Pokračovat na retainer** / **Ukončit**. [00]
- **ZAK-14** [MVP] Pokračovat: nastaví se měsíční částka, od kterého měsíce, den vystavení, kdo fakturuje (stále stejný, nebo střídavě), rozdělení pro retainer; zakázka přejde do fáze Retainer. [00,13]
- **ZAK-15** [MVP] Každý měsíc (job 1. dne 5:00) systém sám založí plánovanou platbu „Retainer MM/RRRR“ včetně rozdělení; unikát (zakázka, retainer, měsíc) brání duplicitě; fakturující po vystavení doplní číslo faktury a označí vystavenou. [00,11,12]
- **ZAK-16** [MVP] Ukončit: zakázka se dokončí; pokud klient nemá jinou aktivní zakázku, systém nabídne stav klienta Bývalý. [00]
- **ZAK-17** [MVP] Ukončení retaineru k určitému měsíci; budoucí plánované platby se zruší (s potvrzením). [00,14]
- **ZAK-18** [MVP] Dokončení zakázky upozorní na otevřené úkoly a nezaplacené platby, ale nezablokuje. [00]
- **ZAK-19** [MVP] Členové zakázky (role lead/member); šablonový úkol má pravidlo řešitele (vlastník, lead, konkrétní uživatel, nepřiřazeno). [12]

### UKO – Úkoly, aktivity, poznámky
- **UKO-01** [MVP] Úkol a CRM aktivita = jedna entita s typem; hovor u obchodu i úkol v zakázce jsou ve stejném seznamu „Moje úkoly“ i v kalendáři. [00]
- **UKO-02** [MVP] Typy: Úkol, Hovor, Schůzka, E-mail, Termín; další typy v Nastavení (název, ikona, barva, zda v kalendáři). [00]
- **UKO-03** [MVP] Pole: název, typ, stav (K řešení, Probíhá, Hotovo, Zrušeno), priorita (Žádná, Nízká, Střední, Vysoká, Urgentní), řešitel, termín (datum; u hovoru/schůzky čas a délka), místo, popis, podúkoly (1 úroveň), komentáře, odhad času, výsledek (hovor, schůzka), štítky, viditelnost, vazby: obchod, firma, kontakt, zakázka + fáze. [00]
- **UKO-04** [MVP] Moje úkoly – pohledy: Dnes (vč. po termínu), Nadcházejících 7 dní, Bez termínu, Delegované (zadal jsem, řeší druhý), Hotové; seskupení podle data, zakázky, klienta, priority; seznam/board podle stavu. [00]
- **UKO-05** [MVP] Rychlé přidání nahoře: parser pozná datum a typ („zavolat Novákovi zítra 10:00“ = Hovor zítra 10:00) a před uložením ukáže, co rozpoznal. [00]
- **UKO-06** [v2] Hovor a schůzka s časem se zapíšou do Google Kalendáře řešitele. [00]
- **UKO-07** [MVP] Po dokončení hovoru/schůzky systém nabídne zapsat výsledek a naplánovat další aktivitu; sám nic nevytváří. [00]
- **UKO-08** [MVP] Úkol v zakázce bez fáze je ve skupině „Bez fáze“. [00]
- **UKO-09** [MVP] Přiřazený úkol se druhému objeví okamžitě; notifikace se neposílají. [00]
- **UKO-10** [MVP] Komentáře k úkolu (domluva mezi dvěma); @jméno jen zvýrazní jméno. [00]
- **UKO-11** [MVP] Poznámky: formátovaný text (nadpisy, seznamy, checklisty, odkazy), bez obrázků/souborů (patří na Disk); patří ke klientovi, kontaktu, obchodu nebo zakázce, nebo jsou samostatné; jdou připnout; autosave při psaní (800 ms), každá změna v historii. [00,13]

### KAL – Kalendář Google (v2)
- **KAL-01** [v2] Jedna plocha: schůzky a úkoly z OPSYS + události z Google Kalendářů obou; změny do minuty oběma směry. [00,10]
- **KAL-02** [v2] Každý si připojí svůj Google účet sám, vybere zobrazované kalendáře a kalendář pro zápis. [00]
- **KAL-03** [v2] Pohledy Den, Týden (výchozí), Měsíc, Agenda; pracovní doba 8–18 zvýrazněná. [00]
- **KAL-04** [v2] Vrstvy: moje kalendáře, Patrikovy kalendáře, úkoly s termínem bez času (pruh nahoře); soukromé události z Googlu se druhému ukazují jako „Obsazeno“. [00]
- **KAL-05** [v2] Schůzka tažením: název, čas, místo, vazba na klienta/obchod/kontakt, účastníci, přepínač „Poslat pozvánky“ (výchozí vypnuto). [00]
- **KAL-06** [v2] Přetažení / změna délky se propíše do Googlu. [00]
- **KAL-07** [v2] U události z Googlu vazba na klienta/obchod jedním klikem; shoda e-mailu účastníka s kontaktem → systém vazbu sám nabídne. [00]
- **KAL-08** [v2] Schůzka s vazbou na obchod se ukáže v jeho historii a jako jeho další aktivita; odkaz na Google Meet jde otevřít z náhledu. [00]
- **KAL-09** [v2] Bez připojeného Googlu kalendář ukazuje jen úkoly a schůzky z OPSYS. [00]
- **KAL-10** [v2] Technika sync: push notifikace + inkrementální sync + záloha polling 5 min; konflikt vyhrává novější změna; sync změny v historii s aktérem google; ID úkolu v extendedProperties události. [11]

### FIN – Finance: pravidla rozdělení, platby, vyrovnání
- **FIN-01** [MVP] Faktury se vystavují mimo OPSYS; systém je jen eviduje a počítá rozdělení; nikdo není plátce DPH. [00]
- **FIN-02** [MVP] Pravidlo rozdělení na zakázce: osoba + způsob (**procenta**; **fixně za platbu**; **fixně celkem** – odečítá se postupně z plateb) + hodnota. [00]
- **FIN-03** [MVP] Pravidlo platí pro všechny platby, nebo jen pro druh: jednorázové, úvodní fáze, retainer, navíc; má volitelnou platnost od–do (změna poměru retaineru od měsíce bez přepočtu minulosti). [00]
- **FIN-04** [MVP] Nové zakázky dostanou výchozí pravidla z Nastavení (např. 50/50); živý náhled „Z platby 10 000 Kč dostane Ondřej 6 000 Kč, Patrik 4 000 Kč.“ [00]
- **FIN-05** [MVP] Rozdělení platby: (1) odečtou se fixní částky, (2) zbytek podle procent, (3) zbylé haléře dostane fakturující, (4) bez pravidel celá platba fakturujícímu, (5) ruční přepis jedné platby → štítek „Rozděleno ručně“. [00]
- **FIN-06** [MVP] Detail výpočtu: konkrétní `applies_to` má přednost před „vše“; pravidla platná k datu období (retainer: `period_month`, jinak datum vystavení / dnes); `fixed_total` jen ze zbytku nealokovaného v dřívějších platbách (podle data vystavení, pak vytvoření); fixní částka nepřesáhne zbytek platby; zaokrouhlení dolů na haléře. [12]
- **FIN-07** [MVP] Validace pravidel: procenta pro stejný druh platby dávají 100 %, jinak upozornění a zbytek jde fakturujícímu. [13]
- **FIN-08** [MVP] Platba: zakázka, popis, druh (jednorázová, úvodní, retainer, navíc), částka > 0, fakturující, stav, číslo faktury, datum vystavení, splatnost, datum zaplacení, podíly obou, režim rozdělení (pravidla/ručně), poznámka. [00,12]
- **FIN-09** [MVP] Stavy: Plánovaná → Vystavená (dotaz na číslo faktury a datum) → Zaplacená (dotaz na datum úhrady), případně Zrušená. [00]
- **FIN-10** [MVP] Platby vznikají ručně, ze šablony zakázky, nebo měsíčně z retaineru. [00]
- **FIN-11** [MVP] Nezaplacená platba po splatnosti je červeně a počítá se do čísla u položky Finance. [00]
- **FIN-12** [MVP] Seznam všech plateb: filtr období, fakturující, stav, typ zakázky, klient; součty dole; sloupce: zakázka, klient, popis, typ, částka, fakturuje, stav, číslo faktury, vystaveno, splatnost, zaplaceno, podíl Ondřej, podíl Patrik. [00,13]
- **FIN-13** [MVP] Alokace se přepočítají při změně částky, fakturujícího, pravidel nebo data; u platby ve stavu Zaplacená se přepočet nejdřív potvrzuje; součet alokací = částka platby. [00,12]
- **FIN-14** [MVP] Vyrovnání: kdo fakturoval, dostal peníze; patří-li část druhému, dluží mu ji. Nahoře jedno číslo „Patrik dluží Ondřejovi 12 400 Kč“ / opačně / „Vyrovnáno“. [00]
- **FIN-15** [MVP] Saldo = dluhy jedním směrem − dluhy druhým − zapsaná vyrovnání; základ výpočtu nastavitelný: zaplacené (výchozí), nebo už vystavené. [00,12]
- **FIN-16** [MVP] Pod číslem rozpis po měsících (kdo kolik fakturoval, komu kolik patří, rozdíl); rozklik měsíce ukáže konkrétní platby. [00]
- **FIN-17** [MVP] „Zapsat vyrovnání“: kdo, komu, kolik (předvyplněno saldem), kdy, jak (faktura mezi IČO, převod, zápočet), číslo dokladu; zapsané vyrovnání jde stornovat (měkce, v historii). [00,13]
- **FIN-18** [MVP] Soukromé zakázky Ondřeje se do vyrovnání nepočítají. [00]
- **FIN-19** [MVP] Přehledy: příjmy podle osoby po měsících (rok), podle typu zakázky, podle klienta (top 10), měsíční příjem z retainerů; Patrik jen sdílené zakázky, Ondřej přepínač „Včetně soukromých“. [00,13]
- **FIN-20** [MVP] Retainer (data): měsíční částka, od/do měsíce, den vystavení (1–28), fakturující pevně nebo střídavě (kdo začíná), aktivní. [12]
- **FIN-21** [MVP] Příklad pravidel „Retainer 15 000 Kč: do 12/2026 Ondřej 70 / Patrik 30, od 01/2027 50 / 50“ → 12/2026 podíl 10 500 / 4 500, 01/2027 7 500 / 7 500. [00]
- **FIN-22** [MVP] Testovací scénáře (povinné unit testy, viz tabulka pod seznamem): 8 scénářů z [12], z nichž 5 je ve [00]. [00,12]

| # | Situace | Pravidla | Alokace | Saldo |
|---|---|---|---|---|
| 1 | Web 50 000 Kč, fakturuje Ondřej | O 60 % / P 40 % | O 30 000, P 20 000 | O dluží P 20 000 |
| 2 | Úvodní fáze 2×7 000, 1. fakt. Patrik, 2. Ondřej | 50/50 | každá platba O 3 500, P 3 500 | 0 |
| 3 | Systém 80 000, fakturuje Patrik | O fixně 10 000/platba, P zbytek | O 10 000, P 70 000 | P dluží O 10 000 |
| 4 | 333,33 Kč, fakturuje Ondřej | 50/50 | P 166,66, O 166,67 | O dluží P 166,66 |
| 5 | Scénář 1 + vyrovnání O→P 20 000 | – | – | 0 |
| 6 | Retainer 15 000 za 12/2026 a 01/2027 | do 12/26 O 70/P 30, od 01/27 50/50 | 12/26 O 10 500 P 4 500; 01/27 O 7 500 P 7 500 | dle fakturujícího |
| 7 | P fixně celkem 10 000, dvě platby 6 000 | P fixed_total 10 000, O zbytek | 1.: P 6 000, O 0; 2.: P 4 000, O 2 000 | dle fakturujícího |
| 8 | Platba bez pravidel | žádná | 100 % fakturujícímu | 0 |

### DRV – Google Disk přes n8n a struktura složek
- **DRV-01** [MVP] Struktura (výchozí, editovatelná, viz strom níže): sdílený disk „OP Digital – Klienti“; `Klienti/{Název klienta}/` s `00 Klient`, `10 Web`, `20 Marketing`, `30 Systémy` (služby jen pokud je klient má), v nich `{RRRR-MM} {Název zakázky}/` s podsložkami podle typu; `Archiv/{Název klienta}/` pro bývalé. [00,13]
- **DRV-02** [MVP] Spouštěče → akce na Disku: firma dostane stav klienta (i Lead) nebo klik „Vytvořit složku“ → složka klienta + 00 Klient + složky služeb; přibude služba → dovytvoří se složka služby; vznikne zakázka → složka zakázky s podsložkami; přejmenování klienta → přejmenuje se složka; Bývalý → přesun do Archivu; návrat → zpět. [00]
- **DRV-03** [MVP] Složky zakládá n8n; OPSYS mu pošle událost (drive.client.create / add_service / project.create / client.rename / client.archive / restore) s payloadem `{eventId, event, client{id,name,ico,folderId?}, project?{id,code,name,type,startDate}, structure, callbackUrl}`; n8n volá zpět `POST /ingest/drive` `{eventId,status ok|error,folders{root?,services?,project?},error?}`. [11]
- **DRV-04** [MVP] Systém ukládá ID složky, ne cestu; tlačítko otevře `drive.google.com/drive/folders/{id}` v nové kartě (mobil: aplikace Google Disk); přejmenování/přesun na Disku nic nerozbije. [00,11]
- **DRV-05** [MVP] Tlačítko „Otevřít Disk“ je na kartě klienta (složka klienta) i v detailu zakázky (složka zakázky); stavy: „Otevřít Disk“, „Vytváří se…“, „Zkusit znovu“ (chyba nebo 10 min bez odpovědi), „Vytvořit složku“ (klient zatím složku nemá). [00]
- **DRV-06** [MVP] Strom složek se upravuje v Nastavení (přidat, přejmenovat, smazat, přeskládat) zvlášť pro klienta a pro každý typ zakázky; změna platí jen pro nově zakládané složky. [00]
- **DRV-07** [MVP] Smazání čehokoli v OPSYS nikdy nesmaže nic na Disku. [00]
- **DRV-08** [MVP] Doručení události do n8n s retry (5×, 1 min → 1 h) a záznamem stavu (sent/done/error/timeout); „Test webhooku“ v Nastavení. [11,12]

```
OP Digital – Klienti (sdílený disk)
├─ Klienti/{Název klienta}/
│  ├─ 00 Klient/  (Smlouvy a objednávky · Brand a loga · Podklady od klienta)
│  ├─ 10 Web/        {RRRR-MM} {Název zakázky}/ 01 Podklady · 02 Návrh · 03 Texty a obsah · 04 Fotky a média · 05 Předání
│  ├─ 20 Marketing/  {RRRR-MM} {Název zakázky}/ 01 Strategie a podklady · 02 Kreativy (Foto · Video · Texty a scénáře) · 03 Finální exporty · 04 Reporty
│  └─ 30 Systémy/    {RRRR-MM} {Název zakázky}/ 01 Analýza a specifikace · 02 Podklady a data · 03 Design · 04 Dokumentace · 05 Předání
└─ Archiv/{Název klienta}/   (bývalí klienti, přesunuto celé)
```

### REK – Reklama / Meta (v2)
- **REK-01** [v2] Lead z Meta formuláře přijde přes n8n; v OPSYS vznikne kontakt, případně firma, a obchod ve fázi „Nová poptávka“. [00]
- **REK-02** [v2] Kontakt se páruje podle e-mailu nebo telefonu, firma podle názvu nebo IČO (jinak nová); duplicity nevznikají; stejný lead poslaný dvakrát se založí jednou (idempotence podle leadgenId). [00,11]
- **REK-03** [v2] U obchodu se uloží zdroj Meta, kampaň, reklamní sada a reklama. [00]
- **REK-04** [v2] Mapování formuláře → pipeline, fáze, vlastník (Nastavení → Integrace → Meta); výchozí pipeline „Obchody“. [00,11]
- **REK-05** [v2] Každý příchozí lead se zaznamená i při selhání zpracování (nic nezmizí). [00,12]
- **REK-06** [v2] Reklamní účty se načtou; u každého Ondřej určí, zda patří OP Digital, nebo klientovi; kampaň jde přiřadit marketingové zakázce klienta (čísla pak u zakázky i na kartě klienta). [00]
- **REK-07** [v2] Data (útrata, zobrazení, kliky, leady) se stahují denně ráno (6:00) + ručně; posledních 7 dní se přepočítává. [00,11]
- **REK-08** [v2] U účtu: kampaně za období (7, 30, 90 dní, měsíc, vlastní) se sloupci útrata, zobrazení, kliky, CTR, leady Meta, leady OPSYS, CPL, vyhrané obchody, náklad na vyhraný obchod, přiřazená zakázka. [00]
- **REK-09** [v2] U kampaně: sady a reklamy se stejnými čísly, náhled kreativy, seznam leadů (obchodů), graf útraty a leadů po dnech. [00]
- **REK-10** [v2] Rozdíl leadů Meta vs. OPSYS ukazuje ztracené leady. Metriky: CPL = útrata / leady Meta; CPL OPSYS = útrata / obchody se zdrojem Meta; náklad na vyhraný obchod = útrata / vyhrané obchody kampaně. [00,12]
- **REK-11** [v2] Seznam účtů: název, komu patří, poslední synchronizace, útrata tento měsíc. [13]

### HOD – Hodiny (v2)
- **HOD-01** [v2] Zápis bez stopek: u úkolu („Zapsat čas“), u zakázky, nebo v týdenním výkazu (mřížka zakázka × den); formát `1,5` nebo `1:30`. [00]
- **HOD-02** [v2] Přehledy: moje hodiny týden/měsíc, podle zakázky a osoby. [00]
- **HOD-03** [v2] U zakázky: odpracováno vs. odhad úkolů a efektivní hodinová sazba každého (jeho podíl na příjmech ÷ jeho hodiny). [00]
- **HOD-04** [v2] Žádné schvalování výkazů; viditelnost hodin se odvozuje ze zakázky. [00,12]

### SAB – Šablony e-mailů (v2)
- **SAB-01** [v2] Sdílené šablony s kategorií (follow-up, nabídka, onboarding, připomínka platby…), jazykem (cs, sk, en) a počtem použití. [00]
- **SAB-02** [v2] Šablona = předmět + text s proměnnými: křestní jméno kontaktu, název firmy, název obchodu, název zakázky, jméno odesílatele; náhled s daty vybraného kontaktu. [00,12]
- **SAB-03** [v2] Použití z kontaktu/obchodu/klienta/zakázky: „E-mail ze šablony“ → výběr → náhled → **Otevřít v Gmailu** (adresát, předmět, text) nebo **Kopírovat**. [00]
- **SAB-04** [v2] Po otevření v Gmailu nabídka jedním klikem zapsat e-mail jako hotovou aktivitu. [00]
- **SAB-05** [v2] E-maily se odesílají z Gmailu, ne z OPSYS; pošta se nesynchronizuje. [00]

### HLE – Hledání (Cmd+K)
- **HLE-01** [MVP] Otevře se odkudkoli Cmd/Ctrl+K; na mobilu lupou v dolní liště. [00]
- **HLE-02** [MVP] Bez zadání: posledních 8 otevřených záznamů a nejčastější příkazy. [00]
- **HLE-03** [MVP] Hledá v klientech a firmách, kontaktech, obchodech, zakázkách, úkolech, poznámkách: název, IČO, e-maily, telefony, text poznámek; bez ohledu na diakritiku a velikost písmen; telefon bez ohledu na mezery („777 12“ najde „+420 777 123 456“). [00]
- **HLE-04** [MVP] Výsledky seskupené podle typu, s podtitulkem (firma, fáze, telefon); naskakují okamžitě během psaní (cíl 150 ms). [00,13]
- **HLE-05** [MVP] Příkazy: Nový obchod / klient / kontakt / zakázka / úkol / poznámka, Přejít na…, Přepnout téma, Zapsat hodiny, Zapsat platbu. [00]
- **HLE-06** [MVP] Akce bez otevření záznamu: u kontaktu zavolat / zkopírovat telefon / napsat e-mail, u klienta otevřít Disk. [00]
- **HLE-07** [MVP] Hledání respektuje viditelnost (soukromé se Patrikovi nenajde). [00,11]

### HIS – Historie změn
- **HIS-01** [MVP] Zapisuje se každá změna: vytvoření, úprava (každé pole „před → po“), smazání, obnovení, změna fáze, výhra, prohra, změna viditelnosti, přihlášení a neúspěšné pokusy, změny oprávnění a nastavení. [00]
- **HIS-02** [MVP] Historie záznamu je součástí jeho časové osy; globální stránka s filtry (kdo, typ záznamu, akce, období; kategorie data/security/integration) a hledáním. [00,13]
- **HIS-03** [MVP] Autorem může být i systém: n8n, Google, Meta, automatická úloha. [00]
- **HIS-04** [MVP] Historii nejde upravit ani smazat (ani Ondřej; aplikační DB role bez UPDATE/DELETE); smazané záznamy v ní zůstávají s odkazem do koše. [00,11]
- **HIS-05** [MVP] Patrik nevidí historii soukromých záznamů; bezpečnostní události vidí jen u svého účtu. [00]
- **HIS-06** [MVP] Export do CSV (Ondřej nebo kdo má právo exportu). [00]
- **HIS-07** [MVP] Citlivá pole (tokeny, hesla) se do záznamu nikdy nezapisují. [11]

### MPR – Můj prostor: obecně
- **MPR-01** [MVP/v2] Sekci vidí jen Ondřej; nic z ní se nepromítá do Patrikových seznamů, součtů ani hledání. [00]

### HOST – Hosting a údržba (v2)
- **HOST-01** [v2] Evidence: klient, druh (hosting / údržba), název služby, web, cena, období (ročně / měsíčně), od kdy, další obnova, stav (aktivní, pozastavená, zrušená), kde web reálně běží, poznámka. [00]
- **HOST-02** [v2] Pohledy: Obnova do 30 dní, Podle klienta, Zrušené; nahoře souhrn: roční opakovaný příjem z hostingu a údržby, počet aktivních služeb. [00]
- **HOST-03** [v2] Po vyfakturování obnovy se „další obnova“ posune o období. [00]

### DOM – Domény (v2)
- **DOM-01** [v2] Evidence: doména, klient, registrátor, expirace, kdo platí (vy/klient), automatické prodloužení, cena obnovy, DNS, navázaný hosting, poznámka. [00]
- **DOM-02** [v2] Barva podle expirace: > 60 dní normální; 60–30 upozornění; < 30 dní nebo po expiraci kritická; hranici jde u domény změnit (`warn_days`, výchozí 30). [00,12]
- **DOM-03** [v2] Počet kritických domén u položky v menu a ve widgetu Expirace; žádné e-maily ani notifikace. [00]
- **DOM-04** [v2] Hromadné vložení: seznam domén po řádcích, pak doplnit klienty. [00]

### FAK – Opakované faktury / Fakturoid (v3)
- **FAK-01** [v3] U hostingu/údržby zapnutelné „připravovat fakturu“; systém X dní před obnovou (výchozí 14) připraví návrh (klient, služba, období, částka, stav). [00]
- **FAK-02** [v3] Akce: upravit, **Schválit a vytvořit ve Fakturoidu**, zrušit; faktura vznikne až po schválení, odběratel párovaný podle IČO, jinak založen. [00,11]
- **FAK-03** [v3] Po vytvoření se uloží číslo a odkaz faktury a v OPSYS vznikne platba celá Ondřejovi, mimo vyrovnání s Patrikem. [00]

### KNI – E-mailová knihovna (v2)
- **KNI-01** [v2] Soukromá databáze e-mailů a textů: kategorie, štítky, hledání, kopírování jedním klikem, otevření v Gmailu, stejné proměnné jako šablony. [00]
- **KNI-02** [v2] Text jde přesunout mezi knihovnou a sdílenými šablonami. [00]

### SOUK – Soukromé
- **SOUK-01** [MVP] Přehled všech soukromých zakázek, úkolů a poznámek, seskupený podle typu; zde se zakládají samostatné soukromé poznámky. [00]

### PRE – Přehled (dashboard)
- **PRE-01** [MVP] Každý má svůj přehled z widgetů: přidat, přetáhnout, zvětšit, nastavit, odebrat; víc přehledů (např. „Den“, „Finance“) s přepínáním. [00]
- **PRE-02** [MVP] Úpravy jen v režimu „Upravit“; tablet a mobil: widgety pod sebe ve stejném pořadí (na mobilu jen přeskládání). [00,13]
- **PRE-03** [MVP] Výchozí přehled po prvním přihlášení: Úkoly na dnes, Pipeline v Kč, Zakázky ve skluzu, Příjmy tento měsíc, Saldo vyrovnání, Poslední změny. [00]
- **PRE-04** [MVP] Widgety MVP: Úkoly na dnes (dnes + po termínu, odškrtnutí přímo, volba „zahrnout delegované“) · Pipeline v Kč (součet a vážený podle fází) · Moje otevřené obchody (bez další aktivity nahoře) · Zakázky ve skluzu (po termínu nebo s úkoly po termínu) · Příjmy tento měsíc (můj podíl: vystaveno, zaplaceno, plánováno) · Saldo vyrovnání (kdo komu dluží + odkaz) · Nezaplacené platby (po splatnosti a blízko) · Poslední změny (jen moje / vše) · Rychlé odkazy (vlastní odkazy a uložené pohledy). [00,13]
- **PRE-05** [MVP] Widget „Číslo“ = jedno číslo (počet nebo součet pole) z libovolného uloženého pohledu; „Seznam z pohledu“ = prvních N řádků libovolného pohledu. [00,13]
- **PRE-06** [v2] Widgety: Nadcházející schůzky (dnes, zítra) · Leady a CPL (leady měsíc, CPL, náklad na vyhraný obchod) · Hodiny tento týden · Expirace (domény a hostingy do 60 dní; jen Ondřej) · Retainery (aktivní a měsíční součet). [00]
- **PRE-07** [MVP] Rozložení v mřížce (12 sl., tablet 6, mobil 1) se ukládá per uživatel; konfigurace widgetu (pohled, období, účty). [13]

### MOB – Mobil
- **MOB-01** [MVP] Spodní lišta: Hledat, Klienti, Obchody, Úkoly, Více; po otevření obrazovka Hledat s posledními záznamy a klávesnicí. [00]
- **MOB-02** [MVP] Hledání přes všechno; výsledky s telefonem a firmou; ťuknutí na telefon volá. Cíl: najít klienta a zavolat do 3 ťuknutí. [00,10]
- **MOB-03** [MVP] Karta klienta: tlačítka Zavolat, E-mail, Navigovat (adresa v mapách), Disk; pod nimi kontakty, aktivní zakázky, otevřené obchody, poslední poznámky. [00]
- **MOB-04** [MVP] Kontakt: tlačítka Zavolat, SMS, WhatsApp (wa.me), E-mail. [00,13]
- **MOB-05** [MVP] Obchod a zakázka: číst, změnit fázi, stav, vlastníka. [00]
- **MOB-06** [MVP] Moje úkoly: odškrtnout, přesunout termín, rychle přidat; swipe doleva nabídne Hotovo a Odložit. [00]
- **MOB-07** [MVP] Nová poznámka/úkol k čemukoli, diktování přes klávesnici. [00]
- **MOB-08** [MVP] Board obchodů jako posuvné sloupce; přesun přes „Přesunout do fáze“ (tažení nepovinné). [00,13]
- **MOB-09** [MVP] Záměrně omezené na mobilu: oprávnění, editor šablon, editor struktury Disku, úpravy přehledu (jen pořadí widgetů), široké tabulky (jako karty). [00]
- **MOB-10** [v2] Instalace na plochu (PWA); poslední načtená data jen ke čtení při slabém signálu. [00]

### WEB – Webhooky pro n8n
- **WEB-01** [MVP] OPSYS posílá do n8n události: nový obchod, změna fáze, výhra, prohra, změna stavu klienta, nová zakázka, změna fáze zakázky, dokončení zakázky, nový a dokončený úkol, nová a zaplacená platba (`deal.created/stage_changed/won/lost`, `client.status_changed`, `project.created/phase_changed/completed`, `task.created/completed`, `payment.created/paid`). [00,11]
- **WEB-02** [MVP] Registrace URL a výběr událostí v Nastavení → Integrace; payload = událost + aktuální stav záznamu; podpis HMAC; doručení s retry a logem. [11]
- **WEB-03** [MVP] Soukromá data Ondřeje jen na webhooky označené jako jeho (`include_private`). [00,12]
- **WEB-04** [MVP/v2] Příchozí ingest endpointy z n8n s podpisem: `/ingest/drive` (MVP), `/ingest/leads` (v2; idempotence podle leadgenId). [11]
- **WEB-05** [MVP] Co n8n s událostmi udělá, je mimo OPSYS; OPSYS nemá builder automatizací. [00]

**Počty požadavků:** SPOL 20 · NFR 14 · AUT 8 · VID 10 · NAS 13 · OBCH 15 · ORG 9 · KON 6 · KLI 11 · ZAK 19 · UKO 11 · KAL 10 · FIN 22 · DRV 8 · REK 11 · HOD 4 · SAB 5 · HLE 7 · HIS 7 · MPR 1 · HOST 3 · DOM 4 · FAK 3 · KNI 2 · SOUK 1 · PRE 7 · MOB 10 · WEB 5 = **246**.

---
## 2. Rozpory a mezery

Platí pořadí 00 → 13 → 12 → 11 → 14. Závažnost: V = blokuje/ovlivní návrh, S = střední, N = drobná. „Rebar“ = existující jádro (Next.js 16, Drizzle, Better Auth, pg-boss, modulový systém, `clients/<slug>`).

### 2a. Architektura (přechod z 11 na Rebar)
- **R-01 (V) Stack a repo.** 11 popisuje Vite SPA + Hono + monorepo `opsis/{apps/web,apps/api,packages/*}`, TanStack Router, Hono RPC, Biome, Docker/Traefik. → Neplatí. Doména OPSYS se staví jako moduly/klientská konfigurace nad Rebar (server actions/route handlery místo Hono, ESLint+Prettier, Caddy dle `deploy/`). Z 11 se přebírá jen to, co je doménové: engine oprávnění a viditelnosti, pravidla jobů, integrace, ingest kontrakty.
- **R-02 (V) Vrstva dat/UI v jádře.** 11/12 počítají s vlastním filtr/pohled/audit/oprávnění/soubory. Rebar má registr entit (`defineEntity`), příkazy, rbac, audit, frontu, nastavení. → Před implementací zmapovat, co jádro už umí (filtry, uložené pohledy, vlastní pole, štítky, koš, audit); duplicitní tabulky z 12 nezakládat dvakrát. (Mimo rozsah tohoto digestu; ověřit v `docs/ARCHITECTURE.md`, `docs/reference/`.)
- **R-03 (V) Moduly jádra mají jinou doménu.** Rebar moduly (poptávky, kontakty, zakázky, kalendář, fakturace, docházka, sklad, stroje) jsou pro stavební firmy; 00 výslovně nechce vystavování faktur, notifikace, sklad. → Zapnout jen modul, který sedí; fakturaci, notifikace/push a docházku/sklad/stroje v konfiguraci OPSYS nezapínat (00: žádné notifikace). Mapování poptávky↔obchod, zakázky↔zakázka vyžaduje rozhodnutí.
- **R-04 (S) Realtime.** 11: SSE + LISTEN/NOTIFY, 2 s. Rebar mechanismus nezmapován. → Požadavek (SPOL-18, ≤2 s, filtr dle viditelnosti) platí; technika podle jádra.
- **R-05 (S) Výkonové rozpočty z 11** (100 ms přechod, IndexedDB cache, optimistické mutace, JS bundle 220 kB) jsou navržené pro SPA. 00 říká jen „okamžitě“. → Brát jako cíle, ne jako akceptační kritérium, dokud není známa výkonnost Next.js řešení.
- **R-06 (S) Design systém 14 vs. `@rebar/ui`.** 14 definuje vlastní tokeny, Inter, Lucide, Linear-styl; jádro má vlastní design system a branding klienta. → Platí hlasy z 14 jako principy (hustota, klávesnice, bez gradientů), tokeny a komponenty podle `@rebar/ui` + branding klienta; akcent přes jediný token.
- **R-07 (N) Cesty a identifikátory.** `/api/ingest/*`, hlavička `X-Opsis-Signature`, `opsisTaskId`, název OPSIS vs. OPSYS. → Rozhodnout jednotný název (PŘEDPOKLAD: `opsys` v kódu a hlavičkách, „OPSYS“ v UI).
- **R-08 (N) Provozní otevřené body 10/11** (Hostinger VPS, Traefik, subdoména, GitHub Actions, Sentry, Backblaze) jsou zastaralé; 00 říká jen „vlastní adresa“. → Řídit `deploy/` a `DEPLOYMENT.md` jádra.
- **R-09 (N) Passkey (11, v2)** a PWA offline fronta změn max. 50 (14) nejsou ve 00. → Nezařazovat (00 má PWA jen čtení).
- **R-10 (N) UUID v7, `bigint` haléře, `sort_order` text** apod. jsou implementační z 12; neřešit, pokud jádro používá jinak, jen zachovat sémantiku (haléře, řazení bez přečíslování).

### 2b. 00 proti 10–14
- **R-11 (V) Rozdělení: normalizace procent vs. zbytek fakturujícímu.** 12: procenta se normalizují na 100 %; 13: při součtu ≠ 100 % upozornění a zbytek jde fakturujícímu; 00 mlčí. → Platí 13: zbytek bez pravidla jde fakturujícímu; součet > 100 % blokovat validací (PŘEDPOKLAD).
- **R-12 (V) Platba bez zakázky.** 00/13: platba z Fakturoidu vzniká v OPSYS „celá Ondřejovi, mimo vyrovnání“; 12: `project_payments.project_id` povinné a `kind` nemá hodnotu „recurring“; `recurring_services.project_id` je nullable. → Potřeba entity „platba bez zakázky“ nebo `kind=recurring` a nullable zakázka; vždy soukromá (Ondřej) a mimo saldo (PŘEDPOKLAD).
- **R-13 (V) Soukromé záznamy a Disk.** Složka soukromého klienta/zakázky na sdíleném Disku je pro Patrika viditelná mimo OPSYS a názvy složek prozradí existenci; 00 to neřeší (jen „webhooky označené jako jeho“). → PŘEDPOKLAD: u soukromého klienta/zakázky se složka nezakládá automaticky, jen ručním „Vytvořit složku“ s varováním.
- **R-14 (V) Soukromé záznamy a kalendář.** 00: soukromé události z Googlu se druhému ukazují jako „Obsazeno“; princip 3 říká, že Patrik soukromé nevidí nikde. Soukromý OPSYS úkol typu schůzka zapsaný do Googlu by se Patrikovi objevil. → PŘEDPOKLAD: do Googlu s příznakem private (Patrik vidí jen „Obsazeno“ bez názvu); alternativa nezapisovat – rozhodnout.
- **R-15 (V) Org vytvořená z leadu spouští složku.** 00: stav Lead = složka; Meta lead vytváří „firmu“ (REK-01). Pokud nová firma dostane stav Lead, vzniká složka za každý lead. → PŘEDPOKLAD: firma z Meta leadu vzniká bez stavu klienta (null); Lead se nastaví ručně.
- **R-16 (S) Výhra u bývalého klienta.** 13: firma lead/former/null → active; 00: „pokud ještě nebyla“. → Platí 13 (former → active, složka se vrátí z Archivu).
- **R-17 (S) „klient od“.** 12: první vyhraný obchod; 00: při prvním přechodu na Aktivní; 13: při výhře, pokud prázdné. → Platí 00+13: první přechod na Aktivní (ať ruční, nebo výhrou).
- **R-18 (S) Export historie.** 00: „kdo má právo exportu“; 13: „jen s deals.export nebo Owner“; 11: klíč `export` jen u obchodů a kontaktů. → Zavést samostatné právo `activity.export` (PŘEDPOKLAD).
- **R-19 (S) Domény: pevné 60 vs. `warn_days`.** 00: normální >60, upozornění 60–30, kritická <30, „hranici jde změnit“; 12: jediné `warn_days` (výchozí 30). → PŘEDPOKLAD: `warn_days` mění hranici kritická (výchozí 30); hranice 60 = 2 × warn_days. Barvy pro hosting nespecifikovány (job `domains.check` ho zmiňuje).
- **R-20 (S) Pozvánky na schůzky.** 00 tělo i 10/11/13: výchozí vypnuto; 00 otevřený bod se ptá. → Považovat za rozhodnuté: vypnuto, přepínač u schůzky (viz O-8).
- **R-21 (S) Partner a finance.** 00: výchozí Partner má „finance společných zakázek“; 11: jen `view` + `payments_write`, ne `splits_edit`, `settlements_write`. Ale výhra (Partner zakládá zakázky) předvyplňuje rozdělení. → Platí 11 pro výchozí práva; při založení zakázky se použijí výchozí pravidla z Nastavení bez práva `splits_edit`; úprava pravidel jen s `splits_edit`.
- **R-22 (S) Partner a Reklama.** 11: výchozí `ads.view`; 00 ve výčtu výchozích práv Partnera Reklamu neuvádí. → v2: ponechat view (11).
- **R-23 (S) Poznámky samostatné.** 00: samostatné soukromé poznámky v Můj prostor → Soukromé; samostatné sdílené (Patrik) nemají v navigaci žádné místo (10 měla modul „Poznámky“, 00 panel ne). → PŘEDPOKLAD: seznam „Poznámky“ jako položka v sekci Práce (malá úprava navigace), nebo jen přes Cmd+K; rozhodnout.
- **R-24 (S) Toast a vrácení.** 00 „Vrátit“ bez času; 13: 10 s; 14: toast 5 s, Cmd+Z 10 s. → Vrácení po smazání 10 s (13), toast s akcí zůstává po tu dobu.
- **R-25 (S) Hodinová sazba.** 12: nevede se; 00 „efektivní hodinová sazba“ z příjmů. Model fakturace „hodinově“ (00) nemá žádné chování (kromě příznaku). → Příznak bez automatiky (PŘEDPOKLAD).
- **R-26 (S) Roční vs. měsíční opakované faktury.** 00 „roční faktury za hosting a údržbu“, ale evidence umí `monthly`. → v3: podpora obou období, částka za období.
- **R-27 (N) Kontext klienta.** 12 `context jsonb` strukturovaně (decisionMaker, howToCommunicate, history, notes); 00 „volný text, upravuje se na místě“. → Zachovat 4 pojmenovaná pole (13).
- **R-28 (N) Počty módulů.** 10: 15+4 modulů, 00 popisuje sekce panelu; Poznámky a Activity log v 00 jiné jméno (Historie změn). → Platí názvosloví 00.
- **R-29 (N) Typy aktivit oprávnění.** 00: „s oprávněním“; 13 mapuje na `settings.pipelines`; 11 nemá klíč. → Použít `settings.pipelines` (13).
- **R-30 (N) Nastavení Systém vs. Koš.** Koš je v panelu (00) i v Nastavení → Systém (00, 13). → Jedna implementace, dva vstupy.

### 2c. Mezery (spec nic neříká)
- **R-31 (V) Viditelnost dětí soukromé organizace** (obchody, zakázky, kontakty firmy) – dědění definováno jen pro zakázku/obchod. → PŘEDPOKLAD: soukromá organizace nedědí do obchodů/zakázek automaticky; uživatel je nastaví; Patrik nemůže vybrat soukromou firmu.
- **R-32 (S) Kontrola duplicity IČO u soukromých firem** prozradí Patrikovi existenci. → PŘEDPOKLAD: obecná chyba bez odkazu.
- **R-33 (S) Historie po zveřejnění.** 12: `visibility` v logu = kopie v době zápisu. → PŘEDPOKLAD: staré soukromé záznamy zůstanou skryté i po zveřejnění; záznam o změně viditelnosti se zapíše s hodnotou po změně.
- **R-34 (S) Smazaný záznam po 30 dnech**: log má jen `entity_id`. → PŘEDPOKLAD: do kontextu logu uložit název záznamu.
- **R-35 (S) Retainer den vystavení** (`issue_day`) – 00 neříká, co z něj plyne (plánované datum vystavení / splatnost?). → PŘEDPOKLAD: předvyplní plánované datum vystavení platby.
- **R-36 (S) „Rovnou retainer“** (bez úvodní fáze): kdy se nastavuje retainer? → PŘEDPOKLAD: dialog nastavení retaineru při založení zakázky.
- **R-37 (S) Kód zakázky**: rok, čítač per rok, odsazení. → PŘEDPOKLAD: rok založení, čítač od 1 každý rok, 3 číslice (Z-2026-014).
- **R-38 (S) Klik na fázi**: co se stane s předchozími fázemi? → PŘEDPOKLAD: předchozí fáze se označí hotové (po dotazu na jejich otevřené úkoly), následující nezahájené.
- **R-39 (S) Cena zakázky z obchodu s více službami**: obchod má jednu hodnotu, zakázka `budget`. → PŘEDPOKLAD: u jedné služby předvyplnit hodnotou obchodu, u více ponechat prázdné.
- **R-40 (S) „Po splatnosti“ u Plánované platby**. → PŘEDPOKLAD: červeně jen Vystavená po splatnosti; Plánovaná s prošlým termínem je upozornění.
- **R-41 (S) Období widgetu „Příjmy tento měsíc“** a přehledů (vystaveno/zaplaceno/plánováno). → PŘEDPOKLAD: podle `issue_date` / `paid_date` / `due_date` v měsíci.
- **R-42 (S) Záznam „nový lead neotevřen“** nemá pole v modelu 12. → doplnit `first_opened_at`/`opened_by` (nebo příznak) u obchodu.
- **R-43 (S) Připnutí uloženého pohledu do panelu** (00) nemá sloupec v `saved_views`; poslední otevřené záznamy (HLE-02) nemají úložiště. → doplnit příznak připnutí; poslední záznamy per uživatel.
- **R-44 (S) Překryv `ad_campaigns.pipeline_id` vs. `lead_form_mappings`** (kam padají leady). → Platí mapování formuláře (00); `pipeline_id` kampaně vypustit. Nemapovaný formulář → výchozí pipeline, první fáze, vlastník Ondřej (PŘEDPOKLAD).
- **R-45 (N) Smazání fáze pipeline s obchody**, archivace důvodu prohry. → PŘEDPOKLAD: nejdřív přesunout obchody do jiné fáze.
- **R-46 (N) Gmail compose URL** má limit délky; chybějící proměnná v šabloně. → PŘEDPOKLAD: při překročení limitu nabídnout jen Kopírovat; chybějící proměnná = prázdný řetězec zvýrazněný v náhledu.
- **R-47 (N) Odlišení „hosting obnova vyfakturována“ ve v2** (před Fakturoidem). → PŘEDPOKLAD: ruční akce „Označit obnovu jako vyfakturovanou“.
- **R-48 (N) Ukončená služba klienta** (`organization_services.status=ended`) – co s Diskem? → nic (Disk se nemaže).

---
## 3. Doménový model OPSYS (entity)

Legenda: **S** = sdílená/soukromá dle `visibility` (shared|private, u Ondřeje přepínatelné) · **D** = dědí viditelnost z rodiče · **O** = jen Ondřej (oprávnění `owner.*`, ne příznak) · **U** = vlastnictví uživatele · **SD** = soft-delete (koš 30 dní) · **AU** = audit v historii. Společné sloupce hlavních entit: id, created_at, updated_at, created_by, deleted_at (+ visibility, visibility_source u entit S). Peníze v haléřích, procenta numeric, telefon dvojí (zadaný + E.164), custom_fields (jsonb), search_text.

**Identita**
- **User** – e-mail, jméno, zkrácené jméno, role (owner|partner|external), barva avataru, IČO, fakturační nástroj (volný text), aktivní, 2FA, preference. Vztahy: oprávnění, relace. U · AU · bez SD (deaktivace).
- **UserPermission** – (uživatel, klíč funkce `modul.akce`, granted, granted_by). Owner nemá řádky (vše implicitně). AU.
- **Invitation** – e-mail, role, hash tokenu, platnost 48 h, přijato. AU.

**CRM**
- **Organization** (= klient) – název, oficiální název, IČO (unikát), DIČ, právní forma, adresa, web, obecný e-mail/telefon, obor, **client_status** (null|lead|active|paused|former), client_since, client_until, důvod konce, vlastník, kontext (rozhodovatel, jak komunikovat, historie, poznámky), drive_folder_id, drive_status (none|pending|ready|error), ares_synced_at. S · SD · AU.
- **OrganizationService** – (organizace, typ web|marketing|systems, stav active|ended, od–do, drive_folder_id), unikát (org, typ). Dědí z organizace · AU.
- **Person** – jméno, příjmení, primární firma, pozice, e-maily [{hodnota, štítek, primární}], telefony [{hodnota, E.164, štítek, primární}], LinkedIn, rozhoduje, vlastník. S · SD · AU. **PersonOrganization** (kontakt, další firma, role) – D.
- **Pipeline** (název, pořadí, výchozí, archivace) · **PipelineStage** (název, pořadí, pravděpodobnost 0–100, rotting_days) · **LostReason** (název, pořadí, aktivní) – nastavení, AU.
- **Deal** – název, pipeline, fáze, stage_entered_at, status (open|won|lost), firma, hlavní kontakt, hodnota, služby [web|marketing|systems], očekávané uzavření, vlastník, source (manual|meta|web_form|referral|other), source_detail, meta_campaign/adset/ad/leadgen id, won_at, lost_at, důvod prohry + poznámka, last_activity_at, next_task_id, (doplnit: první otevření u Meta leadu). S · SD · AU. **DealParticipant** (obchod, kontakt) – D. **DealStageHistory** (obchod, z fáze, do fáze, kdo, kdy, doba ve fázi) – D, jen přírůstky.

**Práce**
- **TaskType** – název, ikona, barva, pořadí, is_calendar_event, systémový (Úkol, Hovor, Schůzka, E-mail, Termín). Nastavení, AU.
- **Task** (i CRM aktivita) – název, popis (rich text), typ, stav (todo|in_progress|done|canceled), priorita (none|low|medium|high|urgent), řešitel, termín (datum, čas, délka), místo, completed_at, podúkol (1 úroveň), vazby (obchod, organizace, kontakt, zakázka, fáze zakázky), odhad, výsledek, send_invites, původní šablonový úkol, štítky. S (+D z obchodu/zakázky) · SD · AU. **TaskAttendee** (úkol, uživatel/kontakt/e-mail) – D. **TaskComment** (úkol, autor, text) – D · SD · AU.
- **Note** – název, rich text + plain text, připnuto, max. jedna vazba (obchod|organizace|kontakt|zakázka) nebo samostatná. S (+D) · SD · AU.
- **Tag** (název, barva, rozsah) · **Tagging** (štítek, entita, id) · **CustomFieldDefinition** (entita organization|person|deal|project|task, klíč, popisek, typ [12 typů], možnosti, povinné, ve formuláři, v seznamu, pořadí, archivace) – nastavení, AU; hodnoty v `custom_fields` entity.

**Zakázky**
- **Project** (zakázka) – kód (Z-RRRR-NNN, unikát), název, organizace, typ (web|marketing|systems), stav (planned|active|paused|completed|canceled), billing_model (one_off|intro_then_retainer|retainer|hourly), marketing_stage (intro|decision|retainer|ended), aktuální fáze, šablona, původní obchod, vlastník, start, termín, completed_at, dohodnutá cena, popis, drive_folder_id, drive_status. S · SD · AU.
- **ProjectMember** (zakázka, uživatel, role lead|member) – D. **ProjectPhase** (název, pořadí, stav not_started|in_progress|done|skipped, od–do, completed_at) – D.
- **ProjectTemplate** (název, typ, popis, výchozí model fakturace, výchozí, aktivní) · **TemplatePhase** (pořadí, posun startu, délka) · **TemplateTask** (fáze, název, popis, typ, priorita, pravidlo řešitele, posun termínu ve dnech, odhad) · **TemplatePayment** (popis, částka, fakturující, splatnost ve dnech) – nastavení, archivace, AU.
- **TimeEntry** (v2) – uživatel, zakázka, volitelně úkol, datum, minuty > 0, poznámka. D (zakázka) · SD · AU.

**Finance**
- **SplitRule** – zakázka, uživatel, mode (percent|fixed_per_payment|fixed_total), procento, fixní částka, applies_to (all|one_off|intro|retainer|extra), platnost od–do, pořadí. D · AU.
- **Payment** – zakázka (viz R-12: u Fakturoidu bez zakázky), popis, kind (one_off|intro|retainer|extra), period_month, částka > 0, fakturující, status (planned|issued|paid|canceled), číslo faktury, vystaveno, splatnost, zaplaceno, allocation_mode (rules|manual), poznámka; unikát (zakázka, retainer, měsíc). D · SD/zrušení · AU. **PaymentAllocation** (platba, uživatel, částka ≥ 0; součet = částka platby) – D · AU.
- **Retainer** – zakázka, částka, od–do měsíce, den vystavení 1–28, issuer_mode (fixed|alternate), fakturující / první při střídání, aktivní. D · AU.
- **Settlement** – kdo, komu, částka, datum, způsob (invoice|transfer|offset), reference, poznámka. Sdílená mezi oběma (jen sdílené zakázky) · SD (storno) · AU.

**Kalendář (v2)**
- **CalendarAccount** (uživatel, Google e-mail, šifrované tokeny, stav) · **Calendar** (účet, Google ID, název, barva, zobrazit, výchozí pro zápis, sync token, watch kanál) · **CalendarEvent** (zrcadlo: kalendář, Google ID, etag, název, od–do, celodenní, místo, účastníci, odkaz, vazba na úkol/obchod/organizaci/kontakt). U · AU (sync akce s aktérem google).

**Reklama (v2)**
- **AdAccount** (Meta ID, název, časová zóna, měna, owner_kind agency|client, organizace, aktivní, poslední sync) · **AdCampaign** (účet, Meta ID, název, cíl, stav, přiřazená zakázka) · **AdSet** · **Ad** (+ náhled kreativy) · **AdInsightDaily** (datum, úroveň campaign|adset|ad, objekt, útrata, zobrazení, kliky, leady; posledních 7 dní se přepisuje) · **LeadFormMapping** (Meta form ID, pipeline, fáze, vlastník, výchozí služby) · **IngestEvent** (zdroj, external_id unikát, payload, stav received|processed|failed, chyba, vytvořená entita). Nastavení/technické, bez soft-delete, vlastní log (AU u mapování).

**Jen Ondřej (O)**
- **RecurringService** (v2) – klient, volitelně zakázka, druh (hosting|maintenance), název, web, cena za období, období (yearly|monthly), od, další obnova, stav (active|paused|canceled), auto_prepare_invoice, invoice_lead_days (14), Fakturoid subjekt, kde běží, poznámka. SD · AU.
- **Domain** (v2) – doména (unikát), klient, registrátor, expirace, kdo platí (agency|client), auto-prodloužení, DNS, navázaný hosting, cena obnovy, warn_days (30), poznámka. SD · AU.
- **RecurringInvoiceDraft** (v3) – služba, období od–do, částka, stav (draft|approved|sent_to_fakturoid|canceled), Fakturoid id/číslo/URL, schváleno, chyba; unikát (služba, období od). AU.
- **EmailTemplate** – scope (shared|owner_library), název, kategorie, předmět, tělo (rich text + text), jazyk (cs|sk|en), usage_count; knihovna je vždy soukromá (O). S · SD · AU.

**Průřezové**
- **SavedView** (uživatel, entita, název, rozložení list|board|calendar, filtry, řazení, sloupce, seskupení, sdílený, výchozí, pořadí; doplnit: připnutí do panelu) – U/sdílený · AU. **Dashboard** (uživatel, název, výchozí, rozložení po breakpointech) + **DashboardWidget** (typ, konfigurace) – U.
- **ActivityLog** – autor (uživatel | n8n|google|meta|job|system), akce, kategorie (data|security|integration), entita+id, kopie viditelnosti, změny {pole: [před, po]}, kontext (obchod, zakázka, organizace…), IP, user agent; jen INSERT, **nikdy SD, nikdy úprava** (AU sama).
- **DriveRequest** (id = eventId, událost, organizace, zakázka, payload, stav sent|done|error|timeout, pokusy, chyba) · **WebhookEndpoint** (název, URL, tajemství šifrovaně, události, include_private, aktivní) · **WebhookDelivery** (endpoint, událost, payload, stav pending|delivered|failed, pokusy, poslední chyba) · **IntegrationCredential** (poskytovatel google|meta|fakturoid, uživatel, šifrovaná data, stav) · **Setting** (klíč–hodnota: drive.structure, finance.balance_basis, finance.default_split, meta.default_pipeline…; AU).

**Souhrn:** soft-delete + koš 30 dní: Organization, Person, Deal, Task, TaskComment, Note, Project, TimeEntry, Settlement, RecurringService, Domain, EmailTemplate (+ děti při obnově). Audit: všechno kromě technických (IngestEvent, WebhookDelivery, DriveRequest mají vlastní stav; DealStageHistory a ActivityLog jsou samy záznam). Soukromé (S): Organization, Person, Deal, Project, Task, Note, EmailTemplate; dědí: Payment, Allocation, SplitRule, Retainer, TimeEntry, ProjectPhase/Member, TaskComment, DealParticipant.

---
## 4. Otevřené body a výchozí rozhodnutí

Zaškrtávací seznam z konce 00 (nic nezaškrtnuto) + výchozí řešení, aby šlo stavět bez čekání.

- [ ] **O-1 Vyrovnání mezi IČO** (měsíčně / po platbě). **PŘEDPOKLAD:** systém jen počítá saldo a eviduje ručně zapsaná vyrovnání (FIN-14–17); způsob (faktura mezi IČO / převod / zápočet) je pole; měsíční rozpis slouží jako podklad. Bez vazby na fakturaci.
- [ ] **O-2 Úvodní fáze marketingu** (2 × 7 000 Kč, každý si nechá svých 7 000). **PŘEDPOKLAD:** ano; šablona nastaví 50/50 a fakturující Patrik → Ondřej; saldo se vyruší (FIN scénář 2).
- [ ] **O-3 Kdo fakturuje retainer.** **PŘEDPOKLAD:** nastavuje se u každé zakázky (pevně / střídavě), výchozí „pevně vlastník zakázky“.
- [ ] **O-4 Ad spend – čí kampaně.** **PŘEDPOKLAD:** datový model obojí (`owner_kind` agency|client); první dodávka v2 = účty OP Digital (vlastní akvizice, CPL a náklad na vyhraný obchod), pak klientské kampaně přiřazené zakázkám.
- [ ] **O-5 Patrikův fakturační nástroj.** **PŘEDPOKLAD:** bez napojení; čísla faktur se zapisují ručně; v uživateli volný text „fakturační nástroj“.
- [ ] **O-6 Fáze pipeline a zakázek.** **PŘEDPOKLAD:** výchozí fáze z 00 (OBCH-02, ZAK-04) jsou seed a jde je upravit v Nastavení.
- [ ] **O-7 Struktura složek na Disku.** **PŘEDPOKLAD:** strom z 00 (DRV-01) je výchozí hodnota `drive.structure`; změny platí jen pro nové složky.
- [ ] **O-8 Pozvánky na schůzky.** **PŘEDPOKLAD:** výchozí vypnuto, přepínač „Poslat pozvánky“ u každé schůzky (KAL-05).

Doplňková rozhodnutí z oddílu 2, která je třeba potvrdit (každé má PŘEDPOKLAD u příslušného R-xx): název OPSIS/OPSYS v kódu (R-07), soukromé a Disk (R-13), soukromé a kalendář (R-14), org z Meta leadu bez stavu klienta (R-15), samostatné sdílené poznámky v navigaci (R-23), `activity.export` (R-18), Fakturoidová platba bez zakázky (R-12), mapování na moduly jádra (R-03).

---
## 5. Akceptační scénáře (end-to-end)

- **AS-01 Lead → obchod → výhra → zakázky + složky.** Ondřej založí obchod (služby web+marketing, 50 000 Kč) pro firmu s IČO (ARES doplní do 2 s). Přetáhne po fázích (stage history se zapisuje), označí Vyhráno → firma Aktivní, „klient od“ dnes, dialog nabídne 2 řádky; po potvrzení vzniknou 2 zakázky (Z-2026-001/002) ze šablon s úkoly s termíny od startu, plánovanými platbami a do 60 s tlačítka „Otevřít Disk“ u klienta i zakázky; struktura `10 Web/{RRRR-MM} …` a `20 Marketing/…`.
- **AS-02 Platby → rozdělení → saldo → vyrovnání.** Web 50 000 Kč fakturuje Ondřej, pravidla 60/40: platba Plánovaná → Vystavená (číslo faktury, datum) → Zaplacená (datum). Alokace O 30 000 / P 20 000, saldo „Ondřej dluží Patrikovi 20 000 Kč“ (základ zaplacené); po zapsání vyrovnání O→P 20 000 je „Vyrovnáno“; storno vyrovnání vrátí dluh. Widgety Saldo a Příjmy tento měsíc sedí; scénáře 1–8 z FIN-22 projdou jako unit testy.
- **AS-03 Marketing úvodní fáze → retainer.** Zakázka z šablony má 2 × 7 000 Kč (1. Patrik, 2. Ondřej), 50/50: po obou zaplacených saldo 0. Po dokončení fáze „Vyhodnocení úvodní fáze“ se objeví Pokračovat/Ukončit; Pokračovat (15 000 Kč měsíčně od 12/2026, den vystavení, střídání) → fáze Retainer; job v 1. dni měsíce založí „Retainer 12/2026“ s alokacemi, druhé spuštění nevytvoří duplikát.
- **AS-04 Změna poměru retaineru bez přepočtu minulosti.** Pravidla do 12/2026 O 70/P 30, od 01/2027 50/50: platba za 12/2026 → O 10 500 / P 4 500, za 01/2027 → 7 500 / 7 500; změna pravidel u zaplacené platby vyžaduje potvrzení přepočtu; ukončení retaineru k měsíci zruší budoucí plánované platby (s potvrzením) a nabídne stav klienta Bývalý, nemá-li jinou aktivní zakázku.
- **AS-05 Soukromá zakázka Ondřeje.** Ondřej založí zakázku se zámkem, přidá úkol, poznámku, platbu a hodiny. Patrik se přihlásí a v seznamech, Cmd+K, kalendáři, přehledu, historii, součtech klienta, saldu a webhookech (neoznačených jako Ondřejových) to nevidí; zakázka není v saldu; pokus o přiřazení soukromého úkolu Patrikovi nabídne „Zveřejnit a přiřadit“ s potvrzením; po zveřejnění zakázky se děti (nezveřejněné samy) zveřejní.
- **AS-06 Oprávnění a role.** Ondřej Patrikovi vypne `projects.create`: do několika sekund (i při přihlášení) mizí „Nová zakázka“ a server akci odmítne; Patrik nemá delete obchodů/kontaktů, nevidí Můj prostor ani klíče `owner.*`; změna oprávnění je v historii a vyžaduje potvrzení.
- **AS-07 Přihlášení a 2FA.** Pozvánka (platná 48 h) → heslo ≥ 12 znaků, TOTP, záložní kódy; bez 2FA nejde dál; důvěryhodné zařízení 30 dní bez kódu; 6. pokus v 15 min je zablokován; Ondřej odhlásí Patrikovo zařízení.
- **AS-08 Meta lead: idempotence a selhání (v2).** n8n pošle lead (leadgenId X): vznikne kontakt (shoda e-mailu/telefonu bez duplicity), firma (název/IČO), obchod v „Nová poptávka“ se zdrojem Meta, kampaní, sadou, reklamou, zvýrazněný do otevření; druhé odeslání X nic nezaloží. Lead s chybou se zaznamená (stav failed). Po ranním importu spend je vidět CPL, náklad na vyhraný obchod a rozdíl Meta vs. OPSYS.
- **AS-09 Disk: stavy tlačítka a události.** Nový klient: „Vytváří se…“ → po callbacku „Otevřít Disk“; bez odpovědi 10 min → „Zkusit znovu“; klient bez složky → „Vytvořit složku“; přejmenování klienta přejmenuje složku; Bývalý přesune do `Archiv`, návrat vrátí; nová služba dovytvoří složku služby; smazání záznamu v OPSYS nic na Disku nesmaže; přejmenování složky na Disku tlačítko nerozbije (ukládá se ID).
- **AS-10 ARES, duplicity, sloučení.** Zadání IČO doplní údaje (s náhledem změn), výpadek ARES uložení neblokuje; stejné IČO odmítnuto s odkazem; podobný název/stejná doména → „Možná duplicita“, lze pokračovat; duplicitní kontakty (stejný telefon bez mezer/předvolby) lze sloučit; sloučení přesune obchody, zakázky, úkoly, poznámky a zapíše se do historie.
- **AS-11 Úkoly a aktivity.** Rychlé přidání „zavolat Novákovi zítra 10:00“ → Hovor, zítra 10:00 (náhled rozpoznání); dokončený hovor nabídne výsledek a další aktivitu; úkol u obchodu mění „další/poslední aktivitu“, obchod bez aktivity má výstrahu a po překročení prahu fáze červené zvýraznění; úkol přiřazený Patrikovi se mu objeví do 2 s, bez notifikace.
- **AS-12 Prohra, znovuotevření, board.** Prohra bez důvodu nejde uložit; s důvodem „Cena“ + poznámka; znovu otevřít vrátí obchod mezi otevřené; hlavička sloupce ukazuje počet, součet a vážený součet; mobil: přesun přes „Přesunout do fáze“.
- **AS-13 Kalendář (v2).** Schůzka vytvořená tažením s vazbou na obchod se do minuty objeví v Google Kalendáři a v historii obchodu jako další aktivita; přetažení v Googlu se propíše zpět; shoda e-mailu účastníka s kontaktem nabídne vazbu; soukromé Patrikovy události jsou „Obsazeno“; pozvánky se bez přepínače neposílají.
- **AS-14 Hledání a mobil.** Cmd+K: „novak“ najde „Novák“ (bez diakritiky), „777 12“ najde „+420 777 123 456“, výsledky do 150 ms, soukromé záznamy Ondřeje Patrik nenajde; bez zadání 8 posledních; na mobilu klient → Zavolat do 3 ťuknutí, swipe úkolu Hotovo/Odložit, nová poznámka diktováním.
- **AS-15 Koš, historie a webhooky.** Smazání zobrazí „Vrátit“ (10 s), záznam je 30 dní v koši a obnova vrátí i podřízené; historie ukazuje „před → po“, nejde ji upravit ani smazat (ani Ondřejem) a smazané záznamy v ní zůstanou; výhra odešle `deal.won` s HMAC a při chybě 5× retry; soukromá data jen na webhook označený jako Ondřejův; doručení se zobrazí v Nastavení → Systém.
- **(rezerva) AS-16 Můj prostor (v2/v3).** Hromadné vložení domén, barvy expirace (>60, 60–30, <30 / po expiraci), počet kritických u menu bez e-mailu; hosting „obnova do 30 dní“ a posun obnovy po vyfakturování; v3 návrh faktury 14 dní před obnovou → Schválit a vytvořit ve Fakturoidu → platba 100 % Ondřej mimo saldo.
