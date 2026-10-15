# Trasy aplikace

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (soubory `page` a `route` v `apps/web/src/app`, manifesty modulů a soubory se serverovými akcemi (`"use server"`)). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Aplikace je Next.js (App Router). Dynamické části adresy jsou v hranatých závorkách; skupina tras v závorkách (např. `(app)`) se do adresy nepromítá, ale sdílí rozložení (přihlášená část aplikace).

## Stránky

| Adresa | Skupina | Soubor | Popis |
| --- | --- | --- | --- |
| `/` | `app` | `apps/web/src/app/(app)/page.tsx` | Úvodní adresa: přesměruje na Přehled. Kdo Přehled nesmí vidět (např. externí spolupracovník bez oprávnění), jde na svůj účet (cíle jsou pevné adresy aplikace). |
| `/[...path]` | `app` | `apps/web/src/app/(app)/[...path]/page.tsx` | Seznamy a detaily všech entit z registru: `/zakazky` je seznam, `/zakazky/<id>` detail. Adresy určují entity samy (`listPath`), takže nový modul nepotřebuje vlastní stránky. |
| `/historie` | `app` | `apps/web/src/app/(app)/historie/page.tsx` | Globální historie změn: každá změna dat, integrací a bezpečnostní události s filtry (kdo, typ záznamu, akce, období, kategorie), hledáním a před → po u polí. Čtení jde výhradně přes `auditReadScope` (partner nevidí historii soukromých záznamů, bezpečnostní události vidí jen své). Historii nejde upravit ani smazat. Filtry jsou v adrese (jde ji poslat). |
| `/inbox` | `app` | `apps/web/src/app/(app)/inbox/page.tsx` |  |
| `/kos` | `app` | `apps/web/src/app/(app)/kos/page.tsx` | Koš: smazané záznamy 30 dní; obnova vrátí i podřízené záznamy, trvalé smazání jen s právem `trash.purge`. |
| `/nastaveni` | `app` | `apps/web/src/app/(app)/nastaveni/page.tsx` |  |
| `/nastaveni/ciselniky` | `app` | `apps/web/src/app/(app)/nastaveni/ciselniky/page.tsx` |  |
| `/nastaveni/dph` | `app` | `apps/web/src/app/(app)/nastaveni/dph/page.tsx` |  |
| `/nastaveni/email` | `app` | `apps/web/src/app/(app)/nastaveni/email/page.tsx` |  |
| `/nastaveni/exporty` | `app` | `apps/web/src/app/(app)/nastaveni/exporty/page.tsx` | Exporty dostupné každému přihlášenému; které záložky se ukážou, určují oprávnění. |
| `/nastaveni/finance` | `app` | `apps/web/src/app/(app)/nastaveni/finance/page.tsx` | Nastavení → Finance: základ salda vyrovnání (zaplacené / vystavené) a výchozí rozdělení nových zakázek. |
| `/nastaveni/firma` | `app` | `apps/web/src/app/(app)/nastaveni/firma/page.tsx` |  |
| `/nastaveni/google-disk` | `app` | `apps/web/src/app/(app)/nastaveni/google-disk/page.tsx` | Nastavení → Google Disk: stav napojení na n8n, test, strom složek klienta a typů zakázek, poslední požadavky. |
| `/nastaveni/google-kalendar` | `app` | `apps/web/src/app/(app)/nastaveni/google-kalendar/page.tsx` | Nastavení → Google Kalendář: připojení vlastního účtu, zobrazované kalendáře, kalendář pro zápis, stav synchronizace. |
| `/nastaveni/integrace` | `app` | `apps/web/src/app/(app)/nastaveni/integrace/page.tsx` | Nastavení → Integrace: webhooky do n8n (adresa, události, podpis, test, doručení a ruční opakování), příchozí požadavky z n8n (tajemství, zdroje, protokol) a panely dalších integrací (ARES, Meta, Fakturoid) ze slotu `settings.integrations`. |
| `/nastaveni/moduly` | `app` | `apps/web/src/app/(app)/nastaveni/moduly/page.tsx` | Přehled modulů: co systém umí, které moduly má tento klient zapnuté, jaká oprávnění přidávají a kde je najít. Zapínání a vypínání za běhu tu záměrně není (viz ADR 019): sestava modulů je v konfiguraci klienta. |
| `/nastaveni/nastenky` | `app` | `apps/web/src/app/(app)/nastaveni/nastenky/page.tsx` |  |
| `/nastaveni/pravidla-upozorneni` | `app` | `apps/web/src/app/(app)/nastaveni/pravidla-upozorneni/page.tsx` | Pravidla upozornění firmy: které události se hlásí, komu, kudy a jakým textem; povinné události, tiché hodiny. |
| `/nastaveni/rady` | `app` | `apps/web/src/app/(app)/nastaveni/rady/page.tsx` |  |
| `/nastaveni/role` | `app` | `apps/web/src/app/(app)/nastaveni/role/page.tsx` |  |
| `/nastaveni/stavy` | `app` | `apps/web/src/app/(app)/nastaveni/stavy/page.tsx` |  |
| `/nastaveni/stitky` | `app` | `apps/web/src/app/(app)/nastaveni/stitky/page.tsx` | Štítky záznamů: názvy, barvy a rozsah použití (které entity je nabízejí), společné pro celý systém. |
| `/nastaveni/system` | `app` | `apps/web/src/app/(app)/nastaveni/system/page.tsx` | Nastavení → Systém (jen vlastník): stav systému (zdraví, heartbeat, verze), zálohy a zkouška obnovy, velikost databáze, fronty úloh, chyby integrací a chybná doručení webhooků, odkaz do Koše. Žádné e-maily ani upozornění: stav se čte, když stránku někdo otevře. |
| `/nastaveni/ucet` | `app` | `apps/web/src/app/(app)/nastaveni/ucet/page.tsx` | Profil: údaje a avatar, změna hesla, přihlášená a důvěryhodná zařízení, odkaz na dvoufázové ověření. Dostupné každému přihlášenému. |
| `/nastaveni/upozorneni` | `app` | `apps/web/src/app/(app)/nastaveni/upozorneni/page.tsx` | Moje upozornění: zařízení, co chci dostávat, tiché hodiny, protokol doručení. Dostupné každému přihlášenému (i v terminálu). |
| `/nastaveni/uzivatele` | `app` | `apps/web/src/app/(app)/nastaveni/uzivatele/page.tsx` |  |
| `/nastaveni/vlastni-pole` | `app` | `apps/web/src/app/(app)/nastaveni/vlastni-pole/page.tsx` |  |
| `/nastaveni/vzhled` | `app` | `apps/web/src/app/(app)/nastaveni/vzhled/page.tsx` | Vzhled: motiv, hustota řádků a úvodní stránka po přihlášení. Osobní nastavení každého uživatele. |
| `/nastaveni/zabezpeceni` | `app` | `apps/web/src/app/(app)/nastaveni/zabezpeceni/page.tsx` |  |
| `/obchody` | `app` | `apps/web/src/app/(app)/obchody/page.tsx` | Obchody: board a seznam (OBC-B). Statická trasa předběhne generický seznam entity `deal` (`[...path]`), protože board potřebuje zóny Vyhráno a Prohráno, hlavičky sloupců a rychlé založení; detail `/obchody/<id>` zůstává generický. |
| `/obnova-hesla` |  | `apps/web/src/app/obnova-hesla/page.tsx` |  |
| `/overeni` |  | `apps/web/src/app/overeni/page.tsx` |  |
| `/pozvanka/[token]` |  | `apps/web/src/app/pozvanka/[token]/page.tsx` |  |
| `/prehled` | `app` | `apps/web/src/app/(app)/prehled/page.tsx` | Přehled (PRE-01 až PRE-07): osobní přehledy z widgetů a přepínač mezi nimi („Den“, „Finance“…). Při prvním otevření dostane uživatel kopie výchozí sady své role (u Ondřeje a Patrika „Den“ a „Finance“) a pak si je upravuje sám v režimu Upravit. Statická trasa předběhne zástupnou stránku modulu (`[...path]`); `/` sem přesměruje. |
| `/prihlaseni` |  | `apps/web/src/app/prihlaseni/page.tsx` |  |
| `/reklama` | `app` | `apps/web/src/app/(app)/reklama/page.tsx` | Reklamní účty (REK-B, REK-11): statická trasa předběhne generický seznam entity `ad_account` (`[...path]`), protože seznam ukazuje útratu za měsíc, vlastníka účtu a stav synchronizace a má tlačítko Obnovit. Detaily `/reklama/<id>` a `/reklama/kampane/<id>` zůstávají generickým záznamem entity s kartami z modulu. |
| `/start` |  | `apps/web/src/app/start/page.tsx` | Cíl po přihlášení a ověření druhého faktoru: přenese uložený vzhled (motiv, hustotu) do tohoto prohlížeče a přesměruje na úvodní stránku zvolenou ve Vzhledu. Nedostupná nebo žádná volba = Přehled, bez přístupu na Přehled vlastní účet. |
| `/tv/[id]` |  | `apps/web/src/app/tv/[id]/page.tsx` | Celoobrazovkový režim nástěnky pro televizi v kanceláři: bez navigace, data se sama obnovují. Přihlášení je běžné (cookie); po vypršení relace widgety ohlásí, že je nutné se znovu přihlásit. |
| `/ui` |  | `apps/web/src/app/ui/page.tsx` | Přehled komponent pro vývoj (v produkci neexistuje; e2e sestavení ho zapíná přes `UI_SHOWCASE=1`). |
| `/zakazky` | `app` | `apps/web/src/app/(app)/zakazky/page.tsx` | Zakázky: seznam, board podle stavu a plná tabulka (board podle fází je na `/zakazky/faze`). Má přednost před obecným seznamem entit. |
| `/zakazky/faze` | `app` | `apps/web/src/app/(app)/zakazky/faze/page.tsx` | Board zakázek podle fází jednoho typu (`?typ=web\|marketing\|systemy`). |
| `/zakazky/sablony` | `app` | `apps/web/src/app/(app)/zakazky/sablony/page.tsx` | Nastavení → Šablony zakázek (seznam). Má přednost před obecným seznamem entity `job_template`. |
| `/zakazky/sablony/[id]` | `app` | `apps/web/src/app/(app)/zakazky/sablony/[id]/page.tsx` | Editor jedné šablony zakázky (fáze, úkoly, plánované platby). |
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
| `/api/ingest/[source]` | `POST` | `apps/web/src/app/api/ingest/[source]/route.ts` | Příchozí požadavky od n8n (Google Disk, Meta leady): `POST /api/ingest/<zdroj>`. Bez přihlášení, chráněno podpisem: hlavička `X-Opsys-Signature: t=<unix>,v1=<hex HMAC-SHA256(tajemství, t + "." + tělo)>`, časová značka ±5 minut (tajemství se spravuje v Nastavení → Integrace). Idempotence a zápis do `inbound_event` řeší `processIngest`. Omezení počtu požadavků: 120 za minutu z jedné adresy; tělo nejvýš 512 kB. CSRF se tu neuplatňuje (nejde o prohlížeč, požadavek bez platného podpisu se odmítne). |
| `/api/invitations/accept` | `POST` | `apps/web/src/app/api/invitations/accept/route.ts` | Přijetí pozvánky (bez přihlášení): jméno a heslo. Omezeno na 10 pokusů za 10 minut z jedné adresy. |
| `/api/kalendar/google/callback` | `GET` | `apps/web/src/app/api/kalendar/google/callback/route.ts` | Návrat ze souhlasu Google Kalendáře (OAuth). Přihlášený uživatel; `state` je zašifrovaný a patří jemu, takže cizí návrat nikoho nepřipojí. Po uložení účtu přesměruje zpět do Nastavení → Google Kalendář (`?google=ok\|denied\|error`). |
| `/api/kalendar/google/webhook` | `POST` | `apps/web/src/app/api/kalendar/google/webhook/route.ts` | Push kanál Google Kalendáře (veřejná trasa, volá ji Google). Ochrana: kanál musí existovat a tajný token kanálu (`X-Goog-Channel-Token`) musí sedět; omezení počtu požadavků na kanál. Trasa jen zařadí synchronizaci kalendáře, nic nečte ani nemění. Body Google neposílá. |
| `/api/push/opened` | `POST` | `apps/web/src/app/api/push/opened/route.ts` | Service worker po ťuknutí na push označí upozornění za přečtené (zvoneček se zmenší, ostatní zařízení uživatele si tentýž push zavřou při dalším otevření aplikace). Bez přihlášení se nic nestane: upozornění se jen otevře. |
| `/api/push/snooze` | `POST` | `apps/web/src/app/api/push/snooze/route.ts` | Akce „Odložit“ na push: stejné upozornění se za hodinu připomene znovu (jen majiteli upozornění). |
| `/api/push/subscription` | `GET`, `POST`, `DELETE` | `apps/web/src/app/api/push/subscription/route.ts` | Stav push upozornění přihlášeného: je zapnutý server, veřejný klíč a počet jeho zařízení. |
| `/api/realtime` | `GET` | `apps/web/src/app/api/realtime/route.ts` | Proud změn pro prohlížeč (SSE, SPOL-18): na změnu záznamu u druhého uživatele přijde signál (typ a id, ne data) do zlomku sekundy a klient zneplatní dotazy. Zdrojem je PostgreSQL `LISTEN/NOTIFY` (jedno spojení na proces). Soukromé záznamy se tomu, kdo je nesmí vidět, neposílají; data si klient dotáhne přes engine s viditelností. Při výpadku prohlížeč spojení obnoví sám (EventSource), případně přejde na polling. |
| `/pwa-icon/[size]` | `GET` | `apps/web/src/app/pwa-icon/[size]/route.ts` | Velikosti ikony; `maskable` = 512 px s písmenem v bezpečné zóně (Android ji ořízne do kruhu nebo „squircle“). |

## Trasy modulů

Stránky seznamů a detailů vzniklé z registru entit a stránky z manifestů modulů obsluhuje společná trasa `[...path]` (viz stránky výše). Které jsou dostupné, závisí na zapnutých modulech a oprávněních.

| Adresa | Druh | Modul | Entita / název | Oprávnění |
| --- | --- | --- | --- | --- |
| `/kontakty/firmy` | seznam | kontakty | `company` | `kontakty.read` |
| `/kontakty/firmy/<id>` | detail | kontakty | `company` | `kontakty.read` |
| `/kontakty/osoby` | seznam | kontakty | `person` | `kontakty.read` |
| `/kontakty/osoby/<id>` | detail | kontakty | `person` | `kontakty.read` |
| `/kontakty/firmy/nova` | stránka modulu | kontakty | Nová organizace | `kontakty.create` |
| `/kontakty/osoby/novy` | stránka modulu | kontakty | Nový kontakt | `kontakty.create` |
| `/klienti` | stránka modulu | klienti | Klienti | `klienti.read` |
| `/zakazky` | seznam | zakazky | `job` | `zakazky.read` |
| `/zakazky/<id>` | detail | zakazky | `job` | `zakazky.read` |
| `/zakazky/sablony` | seznam | zakazky | `job_template` | `zakazky.read` |
| `/zakazky/sablony/<id>` | detail | zakazky | `job_template` | `zakazky.read` |
| `/obchody` | seznam | obchody | `deal` | `obchody.read` |
| `/obchody/<id>` | detail | obchody | `deal` | `obchody.read` |
| `/ukoly/vse` | seznam | ukoly | `task` | `ukoly.read` |
| `/ukoly/vse/<id>` | detail | ukoly | `task` | `ukoly.read` |
| `/poznamky` | seznam | ukoly | `note` | `ukoly.read` |
| `/poznamky/<id>` | detail | ukoly | `note` | `ukoly.read` |
| `/ukoly/typy/zaznamy` | seznam | ukoly | `task_type` | `ukoly.read` |
| `/ukoly/typy/zaznamy/<id>` | detail | ukoly | `task_type` | `ukoly.read` |
| `/ukoly` | stránka modulu | ukoly | Moje úkoly | `ukoly.read` |
| `/ukoly/typy` | stránka modulu | ukoly | Typy aktivit | `ukoly.types` |
| `/poznamky/samostatne` | stránka modulu | ukoly | Poznámky | `ukoly.read` |
| `/kalendar` | stránka modulu | kalendar | Kalendář | `kalendar.read` |
| `/hodiny/zaznamy` | seznam | hodiny | `time_entry` | `hodiny.read` |
| `/hodiny/zaznamy/<id>` | detail | hodiny | `time_entry` | `hodiny.read` |
| `/hodiny` | stránka modulu | hodiny | Hodiny | `hodiny.read` |
| `/finance/platby` | seznam | finance | `payment` | `finance.read` |
| `/finance/platby/<id>` | detail | finance | `payment` | `finance.read` |
| `/finance/vyrovnani/zapisy` | seznam | finance | `settlement` | `finance.read` |
| `/finance/vyrovnani/zapisy/<id>` | detail | finance | `settlement` | `finance.read` |
| `/finance` | stránka modulu | finance | Platby a rozdělení | `finance.read` |
| `/finance/vyrovnani` | stránka modulu | finance | Vyrovnání | `finance.read` |
| `/finance/prehledy` | stránka modulu | finance | Přehledy | `finance.read` |
| `/reklama` | seznam | reklama | `ad_account` | `reklama.read` |
| `/reklama/<id>` | detail | reklama | `ad_account` | `reklama.read` |
| `/reklama/kampane` | seznam | reklama | `ad_campaign` | `reklama.read` |
| `/reklama/kampane/<id>` | detail | reklama | `ad_campaign` | `reklama.read` |
| `/sablony-emailu` | seznam | sablony-emailu | `email_template` | `sablony-emailu.read` |
| `/sablony-emailu/<id>` | detail | sablony-emailu | `email_template` | `sablony-emailu.read` |
| `/muj-prostor/hosting/vse` | seznam | muj-prostor | `recurring_service` | `muj-prostor.hosting` |
| `/muj-prostor/hosting/vse/<id>` | detail | muj-prostor | `recurring_service` | `muj-prostor.hosting` |
| `/muj-prostor/domeny/vse` | seznam | muj-prostor | `web_domain` | `muj-prostor.domains` |
| `/muj-prostor/domeny/vse/<id>` | detail | muj-prostor | `web_domain` | `muj-prostor.domains` |
| `/muj-prostor/knihovna/vse` | seznam | muj-prostor | `email_library_item` | `muj-prostor.email_library` |
| `/muj-prostor/knihovna/vse/<id>` | detail | muj-prostor | `email_library_item` | `muj-prostor.email_library` |
| `/muj-prostor/faktury/vse` | seznam | muj-prostor | `recurring_invoice` | `muj-prostor.recurring_invoices` |
| `/muj-prostor/faktury/vse/<id>` | detail | muj-prostor | `recurring_invoice` | `muj-prostor.recurring_invoices` |
| `/muj-prostor/hosting` | stránka modulu | muj-prostor | Hosting a údržba | `muj-prostor.hosting` |
| `/muj-prostor/domeny` | stránka modulu | muj-prostor | Domény | `muj-prostor.domains` |
| `/muj-prostor/knihovna` | stránka modulu | muj-prostor | E-mailová knihovna | `muj-prostor.email_library` |
| `/muj-prostor/faktury` | stránka modulu | muj-prostor | Opakované faktury | `muj-prostor.recurring_invoices` |
| `/muj-prostor/soukrome` | stránka modulu | muj-prostor | Soukromé | `muj-prostor.private_overview` |
| `/prehled` | stránka modulu | prehled | Přehled | `prehled.read` |

## Serverové akce

Funkce v souborech s direktivou `"use server"` volá rozhraní aplikace přímo. Oprávnění a validaci hlídá každá akce uvnitř (viz [ADR 007](../adr/007-opravneni-v-datove-vrstve.md)).
