# Ukázkový klient „Demo firma s.r.o.“

Fiktivní stavební firma s realistickými českými daty pro prezentace a testování celého systému. Všechny firmy, osoby, IČO,
telefony a e-maily jsou vymyšlené (IČO je formálně platné, ale nepatří žádné skutečné firmě). Interní název jádra se v datech nikde neobjevuje.

## Nasazení dat

```sh
pnpm db:up            # lokální PostgreSQL (jen vývoj)
pnpm db:migrate       # schéma
pnpm db:seed          # výchozí data klienta (role, pipeline, číselníky, řady, vlastník z OWNER_*)
pnpm demo:seed        # demo data
```

`demo:seed` bere stejné proměnné prostředí jako `db:seed` (`DATABASE_URL`, `APP_URL`, `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `FILES_DIR`;
lokálně z `.env.local`) a trvá několik sekund. Data vznikají **příkazy a entitami modulů** (číslování z řad, hooky fází, audit, souhrny
zakázek, zámky), takže jsou konzistentní jako při ruční práci. Všechna data jsou **relativní k dnešku** (termíny, deník, docházka za poslední
tři týdny, splatnosti), takže jsou při každém nasazení čerstvá.

| Příkaz                      | Co dělá                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm demo:seed`            | Nasadí data do databáze bez zakázek a kontaktů. Když už tam data jsou, nic nepřepíše a vysvětlí, co dělat.                              |
| `pnpm demo:seed --reset`    | Smaže dřívější demo data a nasadí je znovu. Smaže jen demo: odmítne to, pokud jsou v databázi záznamy, které nejsou označené jako demo. |
| `pnpm demo:seed --wipe`     | Smaže **všechna** obchodní data (jen lokální vývojová databáze!) a nasadí demo data. Vzdálenou databázi odmítne.                        |
| `pnpm demo:seed --keep-2fa` | Ponechá povinné 2FA rolí (viz níže).                                                                                                    |
| `pnpm demo:seed --quiet`    | Bez průběžného výpisu.                                                                                                                  |

Mazání (`--reset`, `--wipe`) potřebuje `DATABASE_MIGRATE_URL` (připojení pod vlastníkem schématu; aplikační role nesmí `TRUNCATE`).
Smaže zakázky, kontakty, faktury, sklad, stroje, kalendář, úkoly, komentáře, upozornění, soubory i auditní záznamy. **Zůstanou** uživatelé,
role, nastavení, číselníky, pipeline, sazby DPH a číselné řady: řada zakázek tedy pokračuje za dosavadními čísly (po `--wipe` ve vývojové
databázi nezačíná od `Z-2026-001`). Demo data jsou označená `custom.demo = true` a značkou v nastavení (`demo-seed`); přerušený seed jde
znovu spustit s `--reset`.

Bezpečnostní pojistky: `NODE_ENV=production` seed odmítne (výjimka `DEMO_SEED_ALLOW_PRODUCTION=1` pro ukázkovou instanci), `--wipe` odmítne
nelokální databázi (výjimka `DEMO_SEED_ALLOW_REMOTE_WIPE=1`), klient musí být `demo`.

## Přihlášení

Hesla jsou **testovací hodnoty jen pro ukázkového klienta** (nejsou tajemství; zdroj je `clients/demo/seed/users.ts`, v přihlašovací
obrazovce se nezobrazují). Všichni uživatelé mají stejné heslo `Demo-heslo-2026`.

| Role                          | E-mail                        | Jméno            | Co uvidí                                                                 |
| ----------------------------- | ----------------------------- | ---------------- | ------------------------------------------------------------------------ |
| Majitel / vedení              | `majitel@demo-firma.example`  | Tomáš Veselý     | všechno, schvaluje bez limitu, Přehled „vyžaduje pozornost“              |
| Kancelář                      | `kancelar@demo-firma.example` | Lucie Marešová   | obchod, rozpočty, faktury, objednávky, schvaluje do 50 000 Kč            |
| Mistr / stavbyvedoucí         | `mistr@demo-firma.example`    | Pavel Kratochvíl | své zakázky (hala, pekárna, hřiště), deník, tým, docházka týmu; bez cen  |
| Mistr / stavbyvedoucí (druhý) | `mistr2@demo-firma.example`   | Radek Zeman      | své zakázky (zateplení, střecha, penzion, ordinace); bez cen             |
| Montér / pracovník v terénu   | `monter@demo-firma.example`   | Jiří Dvořáček    | zakázky, kde je v týmu, deník, docházka, sklad (výdej), vozidla; bez cen |
| Montér / pracovník v terénu   | `monter2@demo-firma.example`  | Martin Holub     | totéž pro své zakázky                                                    |

**Mobilní terminál řemeslníka:** montéři (`monter@…`, `monter2@…`, role Montér) se po přihlášení dostanou rovnou do terminálu (`/t`): docházka
(příchod, přestávka, odchod), dnešní zakázky s navigací a kontakty, moje úkoly, deník s fotkou, výdej materiálu, hlášení závady a stroje. Do
kancelářského rozhraní se nedostanou. Mistři a ostatní si terminál otevřou v menu (Terminál řemeslníka) jako náhled. Nejlépe se zkouší v telefonu
nebo v okně prohlížeče široce 375 px (vývojářské nástroje, mobilní zobrazení). Co se v terminálu ukazuje, nastavuje klient v `config.ts` a správce
v Nastavení → Terminál řemeslníka (viz `docs/TERMINAL.md`). Seed řemeslníkům zakládá dnešní úkoly; docházka za dnešek zůstává prázdná, aby šel ukázat příchod.

Do aplikace se přihlásíte také jako vlastník instalace z `db:seed` (`OWNER_EMAIL`); ten vidí stejná data a dostane několik úkolů.

### 2FA

Produkční klienti mají 2FA u vedení povinné (`security.require2faRoles`, role `owner` a `admin`). Aby šel ukázkový klient předvést bez
telefonu s autentikační aplikací, `demo:seed` u rolí demo uživatelů **vypne povinné 2FA** (`role.require_2fa = false`); přihlásí se jen
e-mailem a heslem. Je to jen pro demo: nikdy nespouštějte `demo:seed` nad instancí se skutečnými daty. Přepínač `--keep-2fa` povinné 2FA
ponechá (pak se uživatel po prvním přihlášení musí zaregistrovat 2FA). Pozor: `pnpm db:seed` povinné 2FA vlastníkovi zapíná zpátky;
ve vývojové databázi ho vypnete příkazem
`psql "$DATABASE_URL" -c "update role set require_2fa=false where key='owner'"`.

## Co data obsahují

- **Firmy a osoby:** 25 firem (investoři, stavebniny, elektro, instalatéři, půjčovna techniky, střechy, okna, subdodavatelé), 16 kontaktních osob.
- **Poptávky:** nové, v kvalifikaci, s odeslanou nabídkou, ve vyjednávání, ztracená a dvě převedené na zakázky.
- **14 zakázek ve všech fázích** (čísla `Z-RRRR-NNN` podle řady):

  | Fáze         | Zakázka                                                                                                                                                                                                                                 |
  | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Poptávka ×2  | Půdní vestavba bytového domu Nad Parkem; Rekonstrukce koupelny (obě převedené z poptávky)                                                                                                                                               |
  | Nabídka ×2   | Přístavba kancelářské budovy (odeslaná před třemi týdny bez odpovědi); Fasáda a zateplení SBD Západ (rozpracovaná)                                                                                                                      |
  | Příprava ×2  | Novostavba rodinného domu Havlíkovi (záloha vystavená, objednávky); Rekonstrukce ordinace                                                                                                                                               |
  | Realizace ×4 | Dostavba skladové haly B (přenesená daňová povinnost, zádržné, zpožděná fáze, faktura po splatnosti); Zateplení bytového domu; Rekonstrukce pekárny (změny ve všech stavech, nespárované náklady); Výměna střechy (překročený rozpočet) |
  | Předání      | Rekonstrukce penzionu (rozpracovaný protokol, otevřené vady, jedna po termínu)                                                                                                                                                          |
  | Záruka       | Víceúčelové hřiště (záruka brzy končí, drženo zádržné)                                                                                                                                                                                  |
  | Uzavřeno     | Oprava fasády dílny (vše vyfakturováno a zaplaceno)                                                                                                                                                                                     |
  | Prohráno     | Zahradní domek a pergola (cena)                                                                                                                                                                                                         |

- **Rozpočty** (objekty, oddíly, položky s nákladovou i prodejní cenou; u realizace původní vs. aktuální po schválených změnách), **změny**
  (koncept, ke schválení, schválená), **soupisy prací** (rozpracovaný, ke schválení, vyfakturovaný, uhrazený), **objednávky**, **přijaté faktury**
  (koncept, ke schválení, schválená, uhrazená; rozpad na oddíly), **vydané faktury** (záloha, dílčí ze soupisu, konečná, uhrazená, po splatnosti,
  s PDP, se zádržným), **harmonogramy** (fáze s postupem), **stavební deník** (počasí, pracovníci, stroje, materiál s cenou, vady, fotky, podpis),
  vady a předávací protokoly, odkaz pro investora haly (adresu vypíše seed).
- **Docházka:** tři týdny pro šest lidí (starší týdny schválené, předchozí týden ke schválení, aktuální rozpracovaný; dovolená a nemoc).
- **Sklad:** 19 skladových karet, čtyři umístění (sklad, dílna, vozidlo, stavba), příjemky, výdeje na zakázky, převodka, vratka, objednávky
  dodavatelům, rozpracovaná inventura; jedna položka pod minimem.
- **Stroje a vozidla:** šest strojů (dodávky, osobní auto, sklápěč, minibagr, válec), kniha jízd, tankování, servisy a intervaly, rezervace,
  nahlášená závada; STK jedné dodávky končí do tří týdnů.
- **Kalendář:** události (opakovaná porada vedení, kontrolní dny, obhlídky, předání), zdroje (místnost, plošina), rezervace zdrojů.
- **Úkoly, komentáře, upozornění v Inboxu, uložené pohledy** (Zakázky s problémem, Dodavatelé, Faktury po splatnosti, Pod minimem, kanban poptávek).
- Údaje o vystavovateli faktur (Nastavení › Údaje o firmě) se doplní, jen když nejsou vyplněné.

Některé zakázky jsou záměrně „nehotové“, aby Přehled ukázal, co vyžaduje pozornost: faktura po splatnosti, nabídka bez odpovědi, záruka
končící do 60 dní, zakázka se semaforem „problém“, schvalování čekající na majitele, nespárované náklady, otevřené vady, STK, položka pod minimem.

### Známá omezení dat

- Čísla vydaných faktur se přidělují postupně, jak se zakázky nasazují, takže nejsou striktně chronologická (zakázky vznikají jedna po druhé,
  ne podle kalendáře). Čísla jsou jedinečná a bez děr.
- Číselná řada je po letech: doklady jsou datované v běžném roce (spuštění v prvních týdnech roku přesune nejstarší vystavení na 2. ledna).
- Fotky v deníku a podpisy jsou jednoduché vygenerované obrázky, ne skutečné fotografie. Počasí je zadané ručně (seed nevolá externí služby).
- E-maily a push upozornění seed neodesílá; starší upozornění v Inboxu jsou označená jako přečtená.

## Testy

`tests/demo-seed.int.test.ts` (vlastní testovací databáze, název je v hlavičce testu) spustí seed a ověří počty, součty zakázek proti rozpočtu a fakturám,
číslování bez děr, viditelnost podle rolí (montér nevidí ceny), přihlášení bez 2FA a opakované nasazení:

```sh
pnpm exec vitest run tests/demo-seed.int.test.ts   # s nastavenou testovací databází podle hlavičky testu
```

Procházecí test obrazovek nad nasazenými daty (vývojový server na 3100): `pnpm test:crawl demo-data`.

## Soubory

- `config.ts`: konfigurace klienta, `seed/index.ts`: výchozí role (spouští `db:seed`).
- `seed/users.ts`: demo uživatelé a heslo; `seed/contacts.ts`: firmy a osoby; `seed/budgets.ts`: rozpočty;
  `seed/stories-*.ts`: příběhy zakázek; `seed/operations.ts`: sklad, stroje, kalendář, úkoly, docházka;
  `seed/run.ts`: orchestrace; `seed/reset.ts`: mazání; `seed/kit.ts`, `seed/docs.ts`, `seed/field.ts`, `seed/jobs.ts`: pomocníci.
- `../../scripts/demo-seed.ts`: příkaz `pnpm demo:seed`; `../../scripts/lib/demo-services.ts`: sestavení služeb (moduly, registr entit, příkazy).
