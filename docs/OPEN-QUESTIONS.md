# Otevřené otázky

Formát: otázka · výchozí chování, které platí, dokud se nerozhodne · stav. Zdroj číslování: `docs/AUDIT.md` §12.

## Rozhodnuto (2026-10-08)

| #   | Otázka                             | Rozhodnutí                                                                                                                                                                                                                              |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Semver image × klientská rozšíření | **Image per klient** z CI matrix → [ADR 001](adr/001-klientske-instance.md)                                                                                                                                                             |
| Q2  | Umístění a repo                    | Lokálně `opdigital-knowledge-base/rebar/`, vzdálené repo `github.com/ondrejis/stavebni-system-core` (soukromé). Interní název v kódu zůstává `rebar` (`@rebar/*`); repo se jmenuje jinak, přejmenování je mechanické                    |
| Q3  | TanStack Query a `uuid`            | Schváleno → [ADR 002](adr/002-konvence-datoveho-modelu.md), [ADR 004](adr/004-klientska-cache-dat.md)                                                                                                                                   |
| Q4  | Servisní přístup agentury          | Vypnuto ve výchozím stavu, zapíná klient na omezenou dobu, povinné 2FA, plný záznam v `audit_log` (`actor_kind = agency`), vypnutelné. V konfiguraci: `agency.serviceAccess`, `agency.serviceAccessMaxHours`; oprávnění `agency.access` |

## Odloženo

| #   | Otázka                                                                      | Poznámka                                                                                                                                                   |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q5  | Licence jádra a co klient dostane při ukončení správy (zdroj, image, návod) | **Vyřešíme později** (rozhodnutí Ondřeje 2026-10-08). `RUNBOOK.md` v části „předání klientovi“ bude do rozhodnutí jen odkazovat sem. Právní kontrola nutná |

## Čeká na odpověď (platí výchozí volba)

| #   | Otázka                                                                       | Výchozí chování                                                                              |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Q6  | Kalendář (události, ICS odběr/import) jako 9. modul?                         | Ano — modul `kalendar` už je v kódu                                                          |
| Q7  | Web Push v core?                                                             | Ano, volitelné konfigurací (fáze 2)                                                          |
| Q8  | Obousměrný Google kalendář                                                   | Odloženo; stačí ICS export a import                                                          |
| Q9  | Datum a combobox: `react-day-picker` + `cmdk`, nebo `react-aria-components`? | `react-day-picker` + `cmdk` (rozhodne se ve fázi 3)                                          |
| Q10 | Typografie                                                                   | Desktop kancelář 13–14 px; mobilní terénní UI min. 16 px, dotykové plochy 44 px              |
| Q11 | Peníze ve skladu                                                             | Součty v haléřích, jednotková cena `numeric(14,4)` → [ADR 003](adr/003-penize-a-mnozstvi.md) |
| Q12 | Počet rolí na uživatele                                                      | Jedna role                                                                                   |
| Q13 | Jazyky UI                                                                    | Jen čeština, slovník připraven pro i18n                                                      |
| Q14 | Poloha při píchačce                                                          | Ne ve výchozím stavu, volitelné per klient (GDPR, souhlas)                                   |
| Q15 | Zálohy restic — čí S3 účet                                                   | Klientův účet                                                                                |
| Q16 | ARES                                                                         | Veřejné API, cache v DB, respektovat limity                                                  |
| Q17 | Další zdroje z `KB_PATH`                                                     | Čteny jen `_proces/` a README klientů                                                        |

## Nové (fáze 1)

| #   | Otázka                                                                            | Výchozí chování                                                          |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Q18 | Viditelný název produktu (např. v přihlašovací stránce, když klient nemá vlastní) | Vždy z `branding.name` klienta; žádný „produktový“ název neexistuje      |
| Q19 | Pojmenování image v GHCR                                                          | `ghcr.io/ondrejis/stavebni-system-core-<slug>:vX.Y.Z` (privátní balíček) |

## Nové (fáze 2)

| #   | Otázka                             | Výchozí chování                                                                                                                                    |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q20 | Náhled PDF                         | Prohlížeč zobrazí PDF přímo (`inline`, v izolovaném sandboxu). Vlastní náhled první stránky přes server se nedělá (těžké na 1 vCPU)                |
| Q21 | Povolené typy souborů              | Obrázky (JPEG, PNG, WebP, GIF), PDF, Word/Excel/PowerPoint, TXT, CSV; max 25 MB. SVG, HTML a archivy ne. Změna jde do nastavení, až bude potřeba   |
| Q22 | Minimální délka hesla              | 12 znaků, bez dalších pravidel složitosti (podle doporučení NIST)                                                                                  |
| Q23 | Absolutní délka relace             | 30 dní; odhlášení po neaktivitě podle `security.idleTimeoutMinutes` (výchozí 8 h)                                                                  |
| Q24 | Reverzní proxy a `X-Forwarded-For` | Omezení počtu přihlášení je podle IP z první hodnoty `X-Forwarded-For`. Caddy musí hlavičku **přepisovat**, ne přeposílat od klienta (řeší fáze 5) |

## Nové (fáze 3)

| #   | Otázka                                         | Výchozí chování                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q25 | Slovník textů UI (zadání 7.11)                 | Texty jsou zatím v komponentách. Centralizace do slovníku (`packages/ui`, `apps/web`) proběhne ve fázi 6; změnu hlídají e2e testy, text se nemění                                                                                                                   |
| Q26 | Hloubka filtrů v UI                            | Jedna úroveň (a/nebo). Hlubší strom z uložených pohledů se zachová a použije, UI ho ukáže jako „skupinu podmínek“                                                                                                                                                   |
| Q27 | Ruční pořadí karet v kanbanu                   | Není (entity nemají atribut pořadí); karty se řadí podle pohledu. Přidá se, až to modul bude potřebovat                                                                                                                                                             |
| Q28 | Hromadné akce: přiřazení, stav, export, mazání | Hotovo pro stav, uživatelské atributy, export CSV (vybrané řádky, zobrazené sloupce) a smazání. Export celé filtrované sady do XLSX/CSV je ze serveru (tlačítko Export v seznamu, ADR 020); hromadné akce modulů (odeslání faktur e-mailem) jdou přes `bulkActions` |

## Nové (fáze 4)

| #   | Otázka                                       | Výchozí chování                                                                                                                                         |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q29 | Storno skladového dokladu                    | Doklady jsou neměnné a nemažou se; chybu opraví vratka nebo inventurní rozdíl. Storno doklad přidáme, pokud ho účetní bude vyžadovat                    |
| Q30 | Ocenění skladu                               | Vážený průměr nákupní ceny přes všechna umístění, bez DPH. FIFO se nedělá                                                                               |
| Q31 | Interní sazba stroje vs. palivo              | Do nákladů zakázky jde provoz × interní sazba (opotřebení) a zvlášť palivo účtované na zakázku bez DPH. Obojí se sčítá, sazbu je třeba zadat bez paliva |
| Q32 | Soukromé jízdy                               | Trasu a účel vidí jen řidič a správce parku, ostatní jen „Soukromá“. Do nákladů zakázky nejdou                                                          |
| Q33 | Push upozornění: zpoždění                    | Vyřešeno ([ADR 024](adr/024-katalog-upozorneni.md)): worker odesílá hned po potvrzení transakce (`LISTEN`), minutový plán je záloha                     |
| Q34 | Odběr kalendáře: token se ukáže jen jednou   | V databázi je jen otisk. Ztracený odkaz = vytvořit nový, starý přestane platit                                                                          |
| Q35 | Opakování událostí a výjimky                 | Opakovanou událost lze změnit nebo zrušit jen celou (bez výjimek jednotlivých výskytů). Z importu se EXDATE respektuje                                  |
| Q36 | Kontakty: související záznamy na kartě firmy | Záložky Poptávky, Zakázky a Faktury se zobrazují podle zapnutých modulů a oprávnění                                                                     |

## Nové (fáze 5)

| #   | Otázka                            | Výchozí chování                                                                                                                                    |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q37 | Architektura image                | Jen `linux/amd64`. ARM (např. Hetzner CAX) přidáme maticí v CI, až bude potřeba                                                                    |
| Q38 | Zero-downtime nasazení            | Není; restart `app` a `worker` trvá desítky sekund. Pro menší klienty přijatelné                                                                   |
| Q39 | Čí jsou přístupy k úložišti záloh | Klientovy (S3 účet klienta); agentura drží heslo restic v `.env` a ve svém správci hesel                                                           |
| Q40 | Heslo prvního uživatele           | Vygeneruje se při instalaci a vypíše se jednou; po prvním přihlášení se vynutí 2FA. E-mailové pozvání místo hesla jde zapnout, až bude SMTP hotové |
| Q41 | Zkouška obnovy ověřuje            | Databázi (počty záznamů proti záloze) a přítomnost souborů; celou aplikaci nad obnovenými daty nespouští                                           |

## Nové (zakázka jako kořen, ADR 015)

Otázky z analýzy konkurence. Výchozí chování je doporučení z analýzy; změní se, až odpoví první klient.

| #   | Otázka                                             | Výchozí chování                                                                                                                                                                                       |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q42 | Stavební objekty                                   | Volitelné; každá verze rozpočtu má skrytý výchozí objekt „Celá zakázka“, uživatel objekty přidá, až je potřebuje                                                                                      |
| Q43 | Nákladová a prodejní cena                          | Jedna položka nese obě jednotkové ceny (marže na každé úrovni); dva samostatné rozpočty se nedělají                                                                                                   |
| Q44 | Vydané faktury                                     | Vystavují se v systému (PDF, QR platba, číselná řada); export do Fakturoidu/Pohody zůstává přes adaptéry                                                                                              |
| Q45 | PDP a zádržné v prvním vydání                      | Ano, jako vlastnost zakázky (`vat_mode`, `retention_bp`) a faktury; zapíná se na zakázce, jinak se nezobrazuje                                                                                        |
| Q46 | Import rozpočtu                                    | Až ve třetí vlně: Excel; formáty KROS/ÚRS podle potřeby klienta                                                                                                                                       |
| Q47 | Kdo schvaluje změny, soupisy, objednávky a faktury | Pravidla s limitem částky: do limitu držitel `zakazky.approve` (kancelář; mistr u svých zakázek), nad limit `zakazky.approve_all` (majitel). Výchozí limit 50 000 Kč, nastavitelný                    |
| Q48 | Odkaz pro investora                                | V této vlně jen ke čtení, vybraný obsah (deník, fotky, dokumenty podle volby); bez přihlášení, odkaz jde zrušit                                                                                       |
| Q49 | Nákladové sazby pracovníků                         | Vidí a mění je jen role s oprávněním k zaměstnancům (výchozí majitel); do ekonomiky zakázky se promítne jen součet, montér a mistr sazby nevidí                                                       |
| Q50 | Fáze zakázky vs. stav pipeline                     | Fáze jsou pevné v kódu, klient konfiguruje stavy uvnitř fáze (`pipeline_stage.phase`); změna fáze má vždy kontroly a automatické akce                                                                 |
| Q51 | Počet záložek detailu zakázky                      | Nejvýš osm: Přehled, Rozpočet, Změny, Náklady, Fakturace, Realizace, Úkoly, Soubory; moduly se řadí do skupin s přepínačem uvnitř. Aktivita je součástí Přehledu                                      |
| Q52 | Mistr a částky ve schvalování                      | Mistr (`zakazky.approve: own`, bez `economics`) vidí ve frontě „Ke schválení“ doklad bez částky; schvaluje podle popisu. Chcete-li, aby částku viděl, dá se mu `zakazky.economics` jen u jeho zakázek |
| Q53 | Sazby pracovníků v nákladech                       | Řádek docházky v nákladech nese jméno, hodiny a částku, takže kancelář s ekonomikou si hodinovou sazbu spočítá. Chcete-li ji skrýt, agregují se náklady z docházky po dnech (jen majitel vidí řádky)  |
| Q54 | Zádržné a DPH                                      | Zádržné je záporný řádek dokladu; uvolnění je samostatný doklad. Kdy přiznat DPH ze zádržného, má ověřit účetní klienta (ADR 017)                                                                     |
| Q55 | Nová zakázka a fáze                                | Ručně založená zakázka začíná ve fázi Poptávka; stav (a tím fázi) jde zvolit hned v dialogu založení. Převod poptávky ji založí ve fázi Poptávka (ADR 016)                                            |

## Nové (konfigurace v administraci, ADR 019)

| #   | Otázka                  | Výchozí chování                                                                                                                      |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Q56 | Zapínání modulů za běhu | Ne. Sestava modulů je v `clients/<slug>/config.ts` a mění se nasazením; Nastavení → Moduly je jen přehled a vysvětlení (ADR 019)     |
| Q57 | Skrytí vlastního pole   | Pole zmizí z tabulky, filtrů, detailu i hledání, hodnoty zůstanou uložené a po zobrazení se vrátí. Trvalé smazání hodnot se nedělá   |
| Q58 | Výchozí sazba DPH       | Nastavená v Nastavení → Sazby DPH; bez volby se bere nejvyšší platná. Neplátce DPH má na fakturách vždy 0 %                          |
| Q59 | Reset číselné řady      | V administraci jen zobrazený (ročně/nikdy); mění ho deklarace řady v modulu. Změna vzoru platí od dalšího dokladu a pořadí pokračuje |
| Q60 | Přeřazení stavů a polí  | Šipkami nahoru a dolů (přístupné i na dotykovém zařízení). Tažení myší se nedělá                                                     |

## Nové (exporty a e-mail faktur, ADR 020)

| #   | Otázka                       | Výchozí chování                                                                                                                                                                        |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q61 | Formáty Pohoda a Money S3    | Adaptér Pohoda/Money S3 nedělá nikdo, dokud ho klient nepožaduje. Výchozí jsou CSV a XLSX (stejné sloupce, včetně režimu DPH a zádržného) a měsíční balík pro účetní                   |
| Q62 | Export seznamů               | Celá filtrovaná sada (ne jen zobrazené řádky), sloupce podle pohledu, nejvýš 50 000 řádků; faktury vyžadují `fakturace.export`. Peníze skryté bez `zakazky.economics` v exportu nejsou |
| Q63 | Co je v balíku pro účetní    | Vydané faktury včetně dobropisů podle data vystavení, přijaté schválené a uhrazené, skeny přijatých, souhrn s označením uhrazených; nejvýš 500 dokladů, jinak zkrátit období           |
| Q64 | Odesílání faktur e-mailem    | Přes SMTP z Nastavení → E-maily, odesílá worker. Příjemce z kontaktní osoby, jinak z firmy; PDF v příloze; evidence u faktury; upomínky ručně (automatické upomínání se nedělá)        |
| Q65 | Automatické upomínky         | Nedělají se. Upomínku posílá člověk po splatnosti (jednotlivě nebo hromadně), počet a datum poslední jsou u faktury. Stupňované upomínky podle dnů přidáme na požádání                 |
| Q66 | Doručenka a otevření e-mailu | Evidujeme jen předání SMTP serveru (odesláno / selhalo s důvodem). Doručení a přečtení se nesleduje (vyžadovalo by sledovací pixel a externí službu)                                   |

## Nové (dotažení po QA a UX)

| #   | Otázka                             | Výchozí chování                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Mazání záznamu s vazbami           | Firma a osoba se nesmažou, dokud na ně odkazují nesmazané zakázky, faktury (vydané i přijaté), poptávky, objednávky, sklad nebo (u firmy) kontaktní osoby; zakázka se nesmaže s fakturou, objednávkou, zamčeným dokladem nebo skladovým dokladem. Věta řekne počty a radu. Moduly dodávají `deleteBlockers` |
| P2  | Cena zakázky v seznamu před výhrou | Sloupec „Cena (smluvní / nabídky)“ a jeho součet v patičce nese u poptávky a nabídky bez zadané ceny cenu nabídky z rozpočtu (jako hlavička „Cena nabídky“); po výhře smluvní cenu. Součet za všechny zakázky tak míchá nabídky a smlouvy, filtr podle fáze to rozdělí                                      |
| P3  | Tachometr při tankování            | Tankování za dnešek s nižším stavem než poslední známý stav stroje se odmítne větou (jako kniha jízd). Zpětně zapsané tankování nižší stav smí a stav stroje nesnižuje. Skutečnou opravu stavu (výměna tachometru) zapisuje správce přímo na kartě stroje                                                   |
| P4  | Cena vratky ze zakázky             | Vratka se oceňuje průměrnou cenou původního výdeje na zakázku (zbývající výdej: hodnota výdejů minus vratek / čisté množství), takže zakázku zbaví přesně toho, co ji stálo. Průměr skladu se přepočte váženě, jako by se zboží za tu cenu přijalo                                                          |
| P5  | Úprava cizí události               | Správce (rozsah „vše“) upravující cizí událost zůstane účastníkem, pokud byl pozvaný; do účastníků se nikdy nezapisuje vlastník události. V přeplněném dni měsíční mřížky jsou vlastní události před pozvanými, dnes před skončenými                                                                        |
| P6  | Neplatné kódování adresy           | `src/proxy.ts` vrátí na adresu s nesprávným procentovým kódováním (`/zakazky/%E0%A4%A`) českou stránku s kódem 400 místo anglické chyby Next.js. Běží na každý požadavek mimo statické soubory (levná kontrola jen u adres se znakem `%`)                                                                   |

## Nové (terminál řemeslníka, ADR 023)

| #   | Otázka                        | Výchozí chování                                                                                                                                                                                                                                                     |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Kdo používá jen terminál      | Role `worker` (`terminal.roles` v `config.ts`, správce ji změní v Nastavení). Mistr ne: schvaluje docházku a spravuje tým, terminál si otevře z menu jako náhled. Role `owner` a role se správou systému jen terminál mít nesmí                                     |
| T2  | Kontakty na místě pro montéra | Montér u zakázky, kde je v týmu, vidí jméno, funkci a telefon kontaktní osoby zákazníka, vedoucího a kolegů z týmu (jen to, žádné e-maily a poznámky), i když nemá `kontakty.read`. Potřebujete-li to zakázat, je to jedna úprava příkazu `zakazky.terminal.sites`  |
| T3  | Mzdy a sazby v terminálu      | Nikdy. Docházka ukazuje jen odpracované hodiny za dnešek a týden (volba `attendance.showHours`). Přehled mzdy neexistuje; vyžadoval by schválení hodin a uzávěrku a ukazoval by částky, které řemeslník podle ADR 015 vidět nemá                                    |
| T4  | Studený start bez signálu     | Nenačte se (jen stránka „Jste offline“). Už otevřený terminál běží dál a zápisy čekají ve frontě. Offline načítání celé aplikace by vyžadovalo kešovat HTML s daty uživatele, což sdílené telefony a odhlášení komplikuje. Přidáme na požádání                      |
| T5  | Fotky u deníku                | Fotka z terminálu se připojí k zakázce (Soubory, druh foto), do polí „fotky dne“ deníku ji přiřazuje kancelář nebo stavbyvedoucí. Povinnost fotky (`diary.requirePhoto`) hlídá jen terminál                                                                         |
| T6  | Zápis do deníku z terminálu   | Řádek `[hh:mm] text` se připojí na konec dnešního zápisu (práce, nebo události), zápisy kolegů se nepřepisují. Podepsaný zápis se nemění (česká hláška, zápis zůstane ve frontě). Zápis starší než 14 dní se odmítne. Počasí se doplní jen u nově založeného zápisu |
| T7  | Zpožděná docházka z fronty    | Příchod a odchod nesou čas ťuknutí; nejdéle 72 hodin zpětně, starší se odmítne s radou zapsat ručně. Konflikt (píchačka už běží z jiného zařízení) se nikdy nepřepíše, zůstane ve frontě s českou hláškou                                                           |
| T8  | Sdílený telefon               | Fronta zápisů patří přihlášenému uživateli, cizí zápisy se neodešlou. Odhlášení s čekajícími zápisy se potvrzuje. Fronta nahrávání fotek je starší a je sdílená (její zápisy se odešlou pod účtem, který je právě přihlášen)                                        |

## Nové (upozornění, ADR 024)

| #   | Otázka                                      | Výchozí chování                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | SMS nebo WhatsApp pro naléhavé události     | Ne. Naléhavé upozornění jde push (vysoká priorita, prorazí tiché hodiny), do zvonku a volitelně e-mailem. Záložní kanál (SMS brána, WhatsApp Business) vyžaduje externí službu, smlouvu a souhlas příjemců; přidáme na požádání klienta (kanál v katalogu je rozšiřitelný)                |
| N2  | Nativní aplikace místo PWA (iOS)            | PWA. Na iPhonu push funguje jen u aplikace přidané na plochu (iOS 16.4+), po restartu telefonu nebo úsporném režimu může být zpožděný; nativní aplikace (App Store) by dala spolehlivější push a odznak, ale stojí vývoj, účty a schvalování. Rozhodnout po zkušenosti z prvního nasazení |
| N3  | Zpoždění push na iOS a v úsporných režimech | Nedá se ovlivnit ze serveru. Naléhavé události mají vysokou prioritu; kritické věci nesmí záviset jen na push (zvoneček a e-mail jsou záloha)                                                                                                                                             |
| N4  | E-mailové shrnutí (digest)                  | E-mail jde vždy okamžitě a po jednom (při náporu jako jeden souhrnný e-mail); časy shrnutí platí jen pro push. Denní e-mailový souhrn přidáme, až o něj klient požádá                                                                                                                     |
| N5  | Upozornění pro klienta (investora)          | Ne. Upozornění dostávají jen uživatelé systému; odkaz pro investora (ke čtení) žádné nevyvolává. Schvalování klientem přes sdílený odkaz (`job.share.decision`) systém dnes nemá; až vznikne, událost se přidá do katalogu                                                                |
| N6  | Příjemce bez práva číst záznam              | Upozornění nedostane (např. účetní bez `zakazky.read` nedostane upozornění o zakázce). Jinak by obsah prozradil záznam, který nesmí vidět                                                                                                                                                 |
| N7  | Odběr a vypršení relace                     | Odběr se neruší, když relace vyprší nečinností (montér, který aplikaci jen občas otevře, by jinak o push přišel); ruší se při odhlášení, deaktivaci a „odhlásit ze všech zařízení“                                                                                                        |
| N8  | Dohled nad doručováním                      | Správce vidí souhrn za 24 hodin v Nastavení → Pravidla upozornění; upozornění správci na selhání doručování (alert při `failed`) se nedělá, počty jsou ve zdravotním přehledu až na požádání                                                                                              |

## Nové (nástěnky a exporty, ADR 025 a 026)

| #   | Otázka                               | Výchozí chování                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Kdo smí skládat nástěnky             | `dashboards.write` mají kancelář, mistr a účetní (majitel vše), montér ne. Sdílení nástěnky data neodemyká: každý vidí jen to, na co má sám právo. Měnit lze v Nastavení → Role                                                                                                                                                                  |
| D2  | Výchozí nástěnky rolí a „domů“       | Čtyři sady (majitel, kancelář, mistr, účetní) jsou v přepínači, ale **neotevírají se na úvodní stránce**, aby výchozí Přehled zůstal stejný. Chcete-li, aby mistr po přihlášení viděl svou nástěnku, nastavte ji roli jako domovskou (Nastavení → Nástěnky)                                                                                      |
| D3  | Metriky z uložených souhrnů zakázek  | Marže a nevyfakturováno se berou z `job.sum_*` (přepočítává příkaz a noční úloha), ne z živých součtů; nezahrnují pozastavené a zakázky před realizací. Faktury po splatnosti se počítají živě podle dnešního data                                                                                                                               |
| D4  | Využití strojů a lidí                | Stroje: jen měřené v motohodinách, dostupná doba 8 h/den (modul Stroje nesmí číst nastavení Docházky); vozidla v km se nepočítají. Lidé: fond pracovní doby bez placených absencí. Chcete-li přesněji, doplní se z nastavení klienta                                                                                                             |
| D5  | `dochazka.labour_cost` a mzdová data | Vyžaduje `dochazka.read` a `employees.read` (ne `zakazky.economics`). Rozhodnout, zda mají mzdové náklady vidět i ti, kdo mají jen ekonomiku zakázek                                                                                                                                                                                             |
| D6  | Datum uzavření poptávky              | Systém ho neeviduje, konverze poptávek se váže na datum přijetí. Chcete-li měřit podle uzavření, přidá se sloupec                                                                                                                                                                                                                                |
| E1  | Příjemci plánovaných exportů         | Jen aktivní uživatelé s právem na data (kontrola při uložení i při spuštění); **každý dostane export podle svých oprávnění**, ne podle autora plánu. Externí adresy (účetní mimo systém) nejsou možné: účetní bez účtu by dostal data bez kontroly práv. Řešení: založit účetní jako uživatele s rolí `accountant`                               |
| E2  | Doba uchování a velikost exportů     | Hotový soubor 7 dní (`exports.retentionDays`), pak se smaže (záznam o exportu zůstává). E-mailová příloha do 8 MB, jinak odkaz. Strop 50 000 řádků (PDF 5 000); soubor se drží v paměti workeru                                                                                                                                                  |
| E3  | ISDOC proti oficiálnímu XSD          | Generátor je napsaný podle specifikace ISDOC 6.0.2 z paměti a ověřený testem struktury; **neprošel validací oficiálním XSD ani importem do účetního programu** (soubor v repu není, bez sítě). Nejistá místa: `TaxCategory` (PDP), `Details` (název banky, BIC), `BuildingNumber`, `PaidAmount`. Před ostrým nasazením vyzkoušet import u účetní |
| E4  | DPH ze záloh v podkladech DPH        | Zálohové faktury jsou z podkladů vynechané; zálohový řádek v konečné faktuře základ snižuje. Systém nevystavuje daňový doklad k přijaté platbě, takže DPH ze záloh se v podkladech nemusí objevit. Rozhodnout s účetní                                                                                                                           |
| E5  | Cizí měna v účetních exportech       | Kurz systém nezná: ISDOC jde s měnou dokladu a kurzem 1, v podkladech DPH se měny nesčítají ani nepřepočítávají                                                                                                                                                                                                                                  |
| E6  | PNG snímek nástěnky                  | Vzniká v prohlížeči (SVG `foreignObject`), bez těžké knihovny; nepodporuje cizí obrázky a v některých prohlížečích mírně liší písmo. PDF je spolehlivá varianta pro poradu                                                                                                                                                                       |

## Nové (CRM, [docs/CRM.md](CRM.md))

Rozhodnuto výchozím chováním při zahájení vývoje (2026-10-13); změna je vždy snadná. Q-CRM1 je převzato z analýzy Pipedrive jako potvrzené zadáním majitele.

| #      | Otázka                                  | Výchozí chování                                                                                                                                                                              |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-CRM1 | Je deal samostatný objekt?              | Ne. Deal = zakázka ve fázích Poptávka a Nabídka, výhra = přechod do Přípravy, nic se nekopíruje                                                                                              |
| Q-CRM2 | Více nástěnek?                          | Jedna nástěnka (pipeline `job/default`), typ zakázky je pole. Víc nástěnek přidáme, až je klient bude chtít                                                                                  |
| Q-CRM3 | Výchozí stavy obchodu                   | Nová poptávka → Kontaktováno → Obhlídka → Nabídka v přípravě → Nabídka odeslána → Jednání, s pravděpodobnostmi 10/20/35/50/65/80 % a hnitím 3/5/7/5/10/7 dní. Klient upraví v Nastavení      |
| Q-CRM4 | Aktivita = úkol jádra?                  | Ne, vlastní entita `crm_activity` (typ, čas, délka, výsledek, víc vazeb). `core.task` zůstává pro jednoduché úkoly; aktivity jsou ve vrstvě kalendáře a v ICS, do Inboxu „Moje úkoly“ nejdou |
| Q-CRM5 | Detail leadu                            | Pop-up nad nástěnkou s adresou `?record=<id>` (ne stránka, ne boční panel jako v analýze), nahoře pás fází jako šipky                                                                        |
| Q-CRM6 | Název a id modulu                       | Zobrazuje se „CRM“, interní id zůstává `poptavky`; přejmenování balíčku a oprávnění je pozdější práce                                                                                        |
| Q-CRM7 | Meta Lead Ads, kalendář, e-mail, import | Mimo rozsah (fáze 2). Příjem leadů: ručně, webový formulář (webhook), později n8n/Make; e-mail jen adresa pro přeposílání; import z Pipedrive jen na požádání                                |
