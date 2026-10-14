# Trasy aplikace

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (soubory `page` a `route` v `apps/web/src/app`, manifesty modulů a soubory se serverovými akcemi (`"use server"`)). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Aplikace je Next.js (App Router). Dynamické části adresy jsou v hranatých závorkách; skupina tras v závorkách (např. `(app)`) se do adresy nepromítá, ale sdílí rozložení (přihlášená část aplikace).

## Stránky

| Adresa | Skupina | Soubor | Popis |
| --- | --- | --- | --- |
| `/` | `app` | `apps/web/src/app/(app)/page.tsx` | Úvodní stránka po přihlášení: co vyžaduje pozornost, dlaždice zapnutých modulů podle oprávnění a moje úkoly. |
| `/[...path]` | `app` | `apps/web/src/app/(app)/[...path]/page.tsx` | Seznamy a detaily všech entit z registru: `/zakazky` je seznam, `/zakazky/<id>` detail. Adresy určují entity samy (`listPath`), takže nový modul nepotřebuje vlastní stránky. |
| `/inbox` | `app` | `apps/web/src/app/(app)/inbox/page.tsx` |  |
| `/nastaveni` | `app` | `apps/web/src/app/(app)/nastaveni/page.tsx` |  |
| `/nastaveni/ciselniky` | `app` | `apps/web/src/app/(app)/nastaveni/ciselniky/page.tsx` |  |
| `/nastaveni/dph` | `app` | `apps/web/src/app/(app)/nastaveni/dph/page.tsx` |  |
| `/nastaveni/email` | `app` | `apps/web/src/app/(app)/nastaveni/email/page.tsx` |  |
| `/nastaveni/exporty` | `app` | `apps/web/src/app/(app)/nastaveni/exporty/page.tsx` | Exporty dostupné každému přihlášenému; které záložky se ukážou, určují oprávnění. |
| `/nastaveni/firma` | `app` | `apps/web/src/app/(app)/nastaveni/firma/page.tsx` |  |
| `/nastaveni/moduly` | `app` | `apps/web/src/app/(app)/nastaveni/moduly/page.tsx` | Přehled modulů: co systém umí, které moduly má tento klient zapnuté, jaká oprávnění přidávají a kde je najít. Zapínání a vypínání za běhu tu záměrně není (viz ADR 019): sestava modulů je v konfiguraci klienta. |
| `/nastaveni/nastenky` | `app` | `apps/web/src/app/(app)/nastaveni/nastenky/page.tsx` |  |
| `/nastaveni/pravidla-upozorneni` | `app` | `apps/web/src/app/(app)/nastaveni/pravidla-upozorneni/page.tsx` | Pravidla upozornění firmy: které události se hlásí, komu, kudy a jakým textem; povinné události, tiché hodiny. |
| `/nastaveni/rady` | `app` | `apps/web/src/app/(app)/nastaveni/rady/page.tsx` |  |
| `/nastaveni/role` | `app` | `apps/web/src/app/(app)/nastaveni/role/page.tsx` |  |
| `/nastaveni/stavy` | `app` | `apps/web/src/app/(app)/nastaveni/stavy/page.tsx` |  |
| `/nastaveni/ucet` | `app` | `apps/web/src/app/(app)/nastaveni/ucet/page.tsx` | Můj účet: profil, změna hesla, přihlášená zařízení a odkaz na dvoufázové ověření. Dostupné každému přihlášenému. |
| `/nastaveni/upozorneni` | `app` | `apps/web/src/app/(app)/nastaveni/upozorneni/page.tsx` | Moje upozornění: zařízení, co chci dostávat, tiché hodiny, protokol doručení. Dostupné každému přihlášenému (i v terminálu). |
| `/nastaveni/uzivatele` | `app` | `apps/web/src/app/(app)/nastaveni/uzivatele/page.tsx` |  |
| `/nastaveni/vlastni-pole` | `app` | `apps/web/src/app/(app)/nastaveni/vlastni-pole/page.tsx` |  |
| `/nastaveni/zabezpeceni` | `app` | `apps/web/src/app/(app)/nastaveni/zabezpeceni/page.tsx` |  |
| `/obnova-hesla` |  | `apps/web/src/app/obnova-hesla/page.tsx` |  |
| `/overeni` |  | `apps/web/src/app/overeni/page.tsx` |  |
| `/pozvanka/[token]` |  | `apps/web/src/app/pozvanka/[token]/page.tsx` |  |
| `/prihlaseni` |  | `apps/web/src/app/prihlaseni/page.tsx` |  |
| `/tv/[id]` |  | `apps/web/src/app/tv/[id]/page.tsx` | Celoobrazovkový režim nástěnky pro televizi v kanceláři: bez navigace, data se sama obnovují. Přihlášení je běžné (cookie); po vypršení relace widgety ohlásí, že je nutné se znovu přihlásit. |
| `/ui` |  | `apps/web/src/app/ui/page.tsx` | Přehled komponent pro vývoj (v produkci neexistuje; e2e sestavení ho zapíná přes `UI_SHOWCASE=1`). |
| `/ukoly` | `app` | `apps/web/src/app/(app)/ukoly/page.tsx` |  |
| `/zapomenute-heslo` |  | `apps/web/src/app/zapomenute-heslo/page.tsx` |  |

## Route handlery (API)

| Adresa | Metody | Soubor | Popis |
| --- | --- | --- | --- |
| `/api/auth/[...all]` | `GET`, `POST` | `apps/web/src/app/api/auth/[...all]/route.ts` |  |
| `/api/dashboards/evaluate` | `POST` | `apps/web/src/app/api/dashboards/evaluate/route.ts` | Vyhodnotí jeden widget. Widgety se načítají souběžně (každý vlastní požadavek), takže pomalý nebo chybný widget ostatní nezdrží ani nerozbije: chyba je součástí odpovědi (`ok: false`), ne stavový kód 5xx. |
| `/api/dashboards/export` | `POST` | `apps/web/src/app/api/dashboards/export/route.ts` | Export z nástěnky: data jednoho widgetu do CSV / XLSX nebo snímek celé nástěnky do PDF. Obsah se vždy počítá znovu s oprávněními přihlášeného, takže export neobsahuje nic, co by uživatel na nástěnce neviděl. |
| `/api/export/[entity]` | `POST` | `apps/web/src/app/api/export/[entity]/route.ts` | Export seznamu entity (CSV, XLSX, PDF). Malý export se vrací rovnou jako stream, velký (nad limitem klienta) nebo vyžádaný na pozadí se zařadí do fronty (odpověď 202 s číslem exportu) a hotový soubor čeká v „Moje exporty“. Oprávnění (čtení či `permissions.export` entity, skryté atributy, rozsah „jen moje“) hlídá datová vrstva. |
| `/api/exports/[id]/file` | `GET` | `apps/web/src/app/api/exports/[id]/file/route.ts` | Hotový export z „Moje exporty“ ke stažení. Jen jeho autor, jen do uplynutí doby uchování. |
| `/api/files` | `POST` | `apps/web/src/app/api/files/route.ts` | Nahrání souboru (multipart: `file` + volitelně `entityType`, `entityId`, `kind`, `takenAt`, `lat`, `lng`). |
| `/api/files/[id]` | `GET` | `apps/web/src/app/api/files/[id]/route.ts` | Typy, které smí prohlížeč zobrazit přímo (obrázky a PDF); vše ostatní se stahuje. |
| `/api/health` | `GET` | `apps/web/src/app/api/health/route.ts` | Stav systému pro monitoring. Chráněno tokenem (`Authorization: Bearer <HEALTH_TOKEN>`). |
| `/api/health/live` | `GET` | `apps/web/src/app/api/health/live/route.ts` | Živost pro Docker a reverzní proxy: bez tokenu, bez podrobností (jen „běží a dostane se k databázi“). Podrobný stav je v `/api/health` za tokenem. |
| `/api/intake/poptavky` | `POST` | `apps/web/src/app/api/intake/poptavky/route.ts` | Přečte tělo požadavku nejvýš do `max` bajtů; delší tělo se zahodí (`null`), aniž by se načetlo celé do paměti. |
| `/api/invitations/accept` | `POST` | `apps/web/src/app/api/invitations/accept/route.ts` | Přijetí pozvánky (bez přihlášení): jméno a heslo. Omezeno na 10 pokusů za 10 minut z jedné adresy. |
| `/api/kalendar/feed/[token]` | `GET` | `apps/web/src/app/api/kalendar/feed/[token]/route.ts` | Odběr kalendáře (iCalendar) podle tajného tokenu v adrese, bez přihlášení: Google, Apple a Outlook nemají jak se přihlásit. V databázi je jen otisk tokenu; špatný token je stejně „nenalezeno“ jako neexistující modul. |
| `/api/push/opened` | `POST` | `apps/web/src/app/api/push/opened/route.ts` | Service worker po ťuknutí na push označí upozornění za přečtené (zvoneček se zmenší, ostatní zařízení uživatele si tentýž push zavřou při dalším otevření aplikace). Bez přihlášení se nic nestane: upozornění se jen otevře. |
| `/api/push/snooze` | `POST` | `apps/web/src/app/api/push/snooze/route.ts` | Akce „Odložit“ na push: stejné upozornění se za hodinu připomene znovu (jen majiteli upozornění). |
| `/api/push/subscription` | `GET`, `POST`, `DELETE` | `apps/web/src/app/api/push/subscription/route.ts` | Stav push upozornění přihlášeného: je zapnutý server, veřejný klíč a počet jeho zařízení. |
| `/pwa-icon/[size]` | `GET` | `apps/web/src/app/pwa-icon/[size]/route.ts` | Ikona aplikace pro telefon: barva a první písmeno názvu z nastavení klienta (bez nahraných souborů). |

## Trasy modulů

Stránky seznamů a detailů vzniklé z registru entit a stránky z manifestů modulů obsluhuje společná trasa `[...path]` (viz stránky výše). Které jsou dostupné, závisí na zapnutých modulech a oprávněních.

| Adresa | Druh | Modul | Entita / název | Oprávnění |
| --- | --- | --- | --- | --- |
| `/kontakty/firmy` | seznam | kontakty | `company` | `kontakty.read` |
| `/kontakty/firmy/<id>` | detail | kontakty | `company` | `kontakty.read` |
| `/kontakty/osoby` | seznam | kontakty | `person` | `kontakty.read` |
| `/kontakty/osoby/<id>` | detail | kontakty | `person` | `kontakty.read` |
| `/zakazky` | seznam | zakazky | `job` | `zakazky.read` |
| `/zakazky/<id>` | detail | zakazky | `job` | `zakazky.read` |
| `/zakazky/sablony` | stránka modulu | zakazky | Šablony zakázek | `zakazky.read` |
| `/poptavky` | seznam | poptavky | `inquiry` | `poptavky.read` |
| `/poptavky/<id>` | detail | poptavky | `inquiry` | `poptavky.read` |
| `/crm/aktivity` | seznam | poptavky | `crm_activity` | `poptavky.read` |
| `/crm/aktivity/<id>` | detail | poptavky | `crm_activity` | `poptavky.read` |
| `/crm/poznamky` | seznam | poptavky | `crm_note` | `poptavky.read` |
| `/crm/poznamky/<id>` | detail | poptavky | `crm_note` | `poptavky.read` |
| `/crm/typy-aktivit` | seznam | poptavky | `crm_activity_type` | `poptavky.read` |
| `/crm/typy-aktivit/<id>` | detail | poptavky | `crm_activity_type` | `poptavky.read` |
| `/crm` | stránka modulu | poptavky | CRM | `poptavky.read` |
| `/crm/dnes` | stránka modulu | poptavky | Moje dnešní práce | `poptavky.read` |
| `/poptavky/prijem` | stránka modulu | poptavky | Příjem poptávek | `poptavky.intake` |
| `/poptavky/import` | stránka modulu | poptavky | Import poptávek | `poptavky.write` |
| `/dochazka/zaznamy` | seznam | dochazka | `time_entry` | `dochazka.read` |
| `/dochazka/zaznamy/<id>` | detail | dochazka | `time_entry` | `dochazka.read` |
| `/dochazka` | stránka modulu | dochazka | Docházka | `dochazka.own` nebo `dochazka.read` |
| `/kalendar/udalosti` | seznam | kalendar | `event` | `kalendar.read` |
| `/kalendar/udalosti/<id>` | detail | kalendar | `event` | `kalendar.read` |
| `/kalendar/zdroje` | seznam | kalendar | `calendar_resource` | `kalendar.read` |
| `/kalendar/zdroje/<id>` | detail | kalendar | `calendar_resource` | `kalendar.read` |
| `/kalendar` | stránka modulu | kalendar | Kalendář | `kalendar.read` |

## Serverové akce

Funkce v souborech s direktivou `"use server"` volá rozhraní aplikace přímo. Oprávnění a validaci hlídá každá akce uvnitř (viz [ADR 007](../adr/007-opravneni-v-datove-vrstve.md)).
