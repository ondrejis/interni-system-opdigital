# Changelog

Všechny významné změny jádra. Formát vychází z [Keep a Changelog](https://keepachangelog.com/cs/1.1.0/), commity z [Conventional Commits](https://www.conventionalcommits.org/cs/v1.0.0/).
Verzování: `0.x` až do prvního ostrého nasazení, pak [semver](https://semver.org/lang/cs/) (`vX.Y.Z`; tag spouští vydání image každého klienta, viz [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

> **Stav verzí:** žádná verze zatím nebyla nasazena ani otagována (`git tag` je prázdný). Vývoj dosud probíhal po fázích zadání; níže je historie seskupená podle nich.
> První tag bude `v0.1.0` při prvním nasazení na testovací server; do té doby se vše průběžně zapisuje do sekce Unreleased.

## [Unreleased]

### Přidáno

- **CRM nad zakázkou** ([ADR 027](docs/adr/027-crm-nad-zakazkou.md), [docs/CRM.md](docs/CRM.md)): obchodní nástěnka ve stylu Pipedrive nad zakázkami ve fázích Poptávka a Nabídka. Stránka `/crm` s pohledy Nástěnka, Seznam, Prognóza (po měsících podle předpokládaného uzavření, vážené hodnoty) a Archiv, filtrem vlastníka a uloženými pohledy včetně čištění dat; karty s ikonou další aktivity, hnitím a váženými součty sloupců, cílové sloupce Vyhráno a Prohráno, zkratky. **Detail zakázky v pop-upu** (`?record=<id>`) s pásem fází jako šipky a dny ve stavu, výhrou a ztrátou nezávisle na fázi (důvod z číselníku, znovuotevření, archiv), sledujícími, účastníky, pravou pracovní plochou (aktivita / poznámka / hovor, Další kroky, historie s filtry). Aktivity (`crm_activity`, typy, odškrtnutí s nabídkou další, kalendářní vrstva a ICS, upozornění, denní přepočet hnití), pravděpodobnost a hnití u stavů pipeline (jádro, migrace `0011`), pravidla „povinné od stavu“, historie stavů. Schránka poptávek (kvalifikace s kontrolou duplicit a doplněním z ARES, zamítnutí, import CSV, příjem z webu s UTM a ochranou), rychlé zadání poptávky s první aktivitou, firmy a osoby (typ, mateřská firma, štítky, telefony a e-maily s typem, detail s časovou osou a obchody), sloučení duplicit (`kontakty.merge`), stránka „Moje dnešní práce“, metriky a upozornění. Obecné prvky v `@rebar/ui`: `PipelineStepper`, `RecordDialog`, rozšíření kanbanu z modulu. Zobrazený název modulu je CRM, interní id zůstává `poptavky`.

- **Vlastní nástěnky a kompletní exporty** ([ADR 025](docs/adr/025-vlastni-nastenky.md), [ADR 026](docs/adr/026-exporty-fronta-plany.md), [docs/DASHBOARDY.md](docs/DASHBOARDY.md), [docs/EXPORTY.md](docs/EXPORTY.md)): nástěnky z widgetů
  (KPI se srovnáním období, sloupcový, skládaný, čárový, časová řada, koláč a donut, tabulka top N, seznam, souhrn podle stavu, měřidlo vůči cíli) nad entitami z registru a dotazovacím enginem (`aggregateRecords`: filtr → agregace → seskupení
  po atributu nebo období v Europe/Prague → řazení a limit) a pojmenovanými metrikami modulů (`dashboardMetrics`, 19 metrik: marže, nevyfakturováno, faktury po splatnosti, cashflow proti plánu, hodiny, využití lidí a strojů…). Data se filtrují
  oprávněními a rozsahem řádků v datové vrstvě (mistr ani montér nedostane součty bez práva, ani úpravou widgetu), mezipaměť 30 s na uživatele, časový limit 8 s, chyba jednoho widgetu nerozbije nástěnku. Mřížka s přetahováním
  (dnd-kit) a změnou velikosti, na telefonu jeden sloupec; osobní, sdílené a výchozí nástěnky pro role (včetně „domů“), klonování, pořadí v přepínači, filtry (období, zakázka, osoba) v URL, režim pro TV (`/tv/<id>`), verzovaná definice (`schemaVersion`,
  migrace). Výchozí sady Majitel, Kancelář, Mistr, Účetní v `config.ts` (`dashboards.defaults`, `standardDashboards`), role `accountant` (`ACCOUNTANT_ROLE`) a demo uživatel. Lehké SVG grafy bez knihovny (`packages/ui/src/charts`).
  Exporty: CSV, XLSX a PDF každého seznamu (dialog: aktuální pohled / vše, sloupce, název souboru), velké exporty přes frontu (`export.run`, Moje exporty, expirace a úklid), šablony (sdílené v týmu), plánované exporty (denně/týdně/měsíčně v Europe/Prague,
  příjemci jen s právem na data, idempotence, odhlášení, log), audit a záznam každého exportu, export dat widgetu (CSV, XLSX) a nástěnky (PDF, PNG), oddělovač CSV podle klienta (`exports.csvDelimiter`), ochrana před CSV/Excel injection
  (opraven i klientský export vybraných řádků), datumové atributy nad sloupci s časem se porovnávají podle místního dne. Fakturace: ISDOC 6.0.2 (vydané i přijaté), podklady DPH (CSV, XLSX) a rozšířený balík pro účetní.
  Oprávnění `dashboards.write`, `dashboards.manage`, `exports.schedule`, `exports.manage`; Nastavení → Nástěnky a Exporty. Migrace `0010_dashboards_exports` (`dashboard`, `dashboard_share`, `dashboard_pref`, `export_template`, `export_schedule`, `export_run`),
  úlohy `export.run`, `export.schedule.tick`, `export.cleanup`. Testy: jednotkové, integrační (`dashboards`, `exports-center`, `dashboard-metrics`, `accounting-exports`) a procházecí `dashboardy-*`, `exporty-*`.
- **Upozornění: katalog událostí a spolehlivé doručování** ([ADR 024](docs/adr/024-katalog-upozorneni.md), [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md)): typovaný katalog událostí (klíč, český popis, příjemci, závažnost, kanály, šablona s odkazem), moduly
  ho doplňují přes manifest (`notifications`) a vyvolávají `notify()` v transakci změny; pravidla firmy v `clients/<klient>/config.ts` (`notifications`) a v Nastavení → Pravidla upozornění (zapnutí, povinné události, příjemci, kanály, text s náhledem,
  tiché hodiny, souhrn doručování); předvolby uživatele v Nastavení → Upozornění (událost × kanál, shrnutí, tiché hodiny, zařízení, zkušební upozornění, protokol doručení, návody pro iOS a Android). Doručování přes frontu pg-boss
  (outbox v transakci, `LISTEN` po commitu, opakování s backoffem, idempotence, sloučení bouřky, souhrnná zpráva, limit, TTL a urgency podle závažnosti, úklid mrtvých odběrů 404/410, protokol bez tajemství). Plánované události (ranní přehled úkolů a stavby,
  termíny fází, zapomenutý odchod, chybějící příchod, splatnosti, revize, kalendář) jsou idempotentní a správné přes změnu času. Obsah push se skládá pro každého příjemce podle oprávnění (bez práva na záznam se neposílá, částky jen s oprávněním).
  Service worker: akce „Odložit“, přechod v otevřeném okně bez načtení znovu, označení za přečtené po klepnutí, odznak, obnova odběru po rotaci; přečtení v Inboxu zavře push. Odběr se ruší při odhlášení a deaktivaci účtu.
  Migrace `0009_notifications` (`notification_delivery`, `notification_pref`, sloupce upozornění a odběrů), úlohy `notification.dispatch`, `notification.taskDigest`, `notification.cleanup`. Starý `push.deliver` zrušen.
- **Mobilní terminál řemeslníka** ([ADR 023](docs/adr/023-terminal-remeslnika.md), [docs/TERMINAL.md](docs/TERMINAL.md)): samostatné mobilní rozhraní na `/t` (velké dotykové prvky, jedna ruka, bez tabulek,
  spodní lišta nejvýš pěti položek). Role `worker` se po přihlášení dostane rovnou do terminálu a kancelářské stránky ji přesměrují na `/t` (guard na serveru, test projde všechny stránky); mistr, kancelář a vedení
  ho otevřou jako náhled. Dlaždice jsou rozšiřitelný registr (`terminalWidgets` v manifestu a `ModuleUi`): Docházka, Dnes na stavbě (adresa a navigace, kontakty na místě, dnešní práce), Moje úkoly, Deník s fotkou,
  Materiál (rychlý výdej), Závada a poznámka, Stroje; dlaždice vypnutého modulu nebo bez oprávnění se nezobrazí a server její příkaz odmítne. Konfigurace per klient (`terminal` v `config.ts`, zod) a v Nastavení →
  Terminál řemeslníka (pořadí, přejmenování, zapnutí, role, povinná zakázka a fotka; uloženo v `setting` s verzí a migrací). Zápisová fronta v telefonu (IndexedDB) s jednorázovým provedením (`opId`, tabulka `terminal_op`),
  viditelným „čeká na odeslání“, českou hláškou při konfliktu a časem ťuknutí (`at`) u docházky; PWA manifest `/t/manifest.webmanifest`, instalace na plochu, stránka „Jste offline“ v `sw.js`.
  Příkazy `core.tasks.*`, `dochazka.terminal.summary`, `zakazky.terminal.sites`, `realizace.terminal.*`, `sklad.terminal.items` (v matici rolí; žádné ceny). Demo: úkoly řemeslníků na dnešek.
  Testy: jednotkové (registr, konfigurace, fronta), integrační (idempotence, oprávnění, konflikty) a procházecí `terminal-*` (telefon 375 × 812, přístupnost, bez přetoku, cíle 44 px, práce bez signálu).
- **Můj účet** (Nastavení → Můj účet, každý přihlášený): změna hesla (současné heslo, indikátor síly, omezení pokusů, odhlášení ostatních zařízení, audit bez hesel), profil (jméno, telefon),
  přihlášená zařízení (odhlásit jedno nebo všechna ostatní), nové záložní kódy 2FA po zadání hesla; povinné 2FA nejde vypnout. Správce u uživatele: „Poslat odkaz pro nové heslo“ (bez SMTP
  jednorázový odkaz k předání) a „Odhlásit všude“. Přímé endpointy Better Auth pro změnu hesla a profilu jsou vypnuté. Procházecí test `ucet-heslo`.
- **Dotažení po QA a UX:** kompaktní hlavička zakázky (čtyři čísla v jednom řádku, dva řádky v kartě); smazání firmy, osoby a zakázky s vazbami se odmítne větou s počty
  (`deleteBlockers` modulů, [OPEN-QUESTIONS P1](docs/OPEN-QUESTIONS.md)); mazání v kalendáři, strojích a uložených pohledech potvrzuje `ConfirmDialog` místo nativního `confirm`;
  tankování pod známý stav tachometru se odmítne; vratka ze zakázky se oceňuje cenou původního výdeje a váženě přepočte průměr skladu; správce upravující cizí událost zůstane
  účastníkem, vlastní události mají v přeplněném dni přednost; seznam zakázek v poptávce a nabídce ukazuje cenu nabídky (sloupec „Cena (smluvní / nabídky)“); neplatné kódování adresy
  vrací českou stránku 400 (`apps/web/src/proxy.ts`).
- **Kontrola rolí, mobilu a přístupnosti** ([ADR 021](docs/adr/021-kontrola-roli-mobilu-a-pristupnosti.md)): částky se z upozornění vynechají pro mistra a montéra, stránky Nastavení bez oprávnění jsou „nenalezeno“, chybové stránky s kódem chyby, české věty pro chyby databáze, meze hodnot (`min`, `max`), mobilní rozložení, `@axe-core/playwright` a procházecí testy `role-*`, `mobil-*`, `okraje-*`, `pristupnost`.
- **Kontrola obchodního řetězce** (procházecí testy `obchod-*`): kontakty, poptávky, zakázky ve všech fázích, rozpočet, změny, náklady, fakturace (záloha, soupis, konečná, zádržné, dobropis, PDP), schvalování a odkaz pro investora s ručně spočítanými částkami.
  Opraveno: záložka Osoby u firmy; převod prohrané poptávky na zakázku zakázal i server; první úprava po otevření zakázky už nekončí kolizí („Záznam mezitím někdo změnil“, přepočet souhrnu neposouvá `updated_at`);
  dialog přechodu fáze po úpravě údaje neukazuje starou blokaci; dialog „Nový záznam“ neztrácí rozepsaný text; po „Přidat položku“/„Přidat oddíl“ z nabídky v rozpočtu je editor zaostřený;
  „Nová změna z řádku“ otevře záložku Změny; název změny napsaný těsně před odesláním se uloží dřív než zámek; hromadné odeslání faktur nad 50 dokladů vysvětlí limit; hlavička nabídky ukazuje cenu nabídky místo 0 Kč.
- **Konfigurace v administraci** ([ADR 019](docs/adr/019-konfigurace-v-administraci.md)): Nastavení → Stavy a pipeline, Číselníky, Vlastní pole (výchozí hodnota, skrytí), Číselné řady (živý náhled vzoru), Sazby DPH, Moduly (přehled), E-maily (SMTP, ověření spojení, zkušební e-mail).
- **Exporty:** tlačítko Export v každém seznamu (XLSX nebo CSV, celá filtrovaná sada podle viditelných sloupců, `POST /api/export/<klíč entity>`).
- **E-mail faktur:** akce „Odeslat e-mailem“ a „Poslat upomínku“ na faktuře, texty e-mailů v Nastavení fakturace; e-maily jdou frontou a odesílá je worker.
- Události pro rozšíření klienta se opravdu oznamují: `zakazky.created` se vyvolá při vzniku každé zakázky (ručně i převodem poptávky) přes nové `emitEvent`/`setEventEmitter`/`createEventEmitter`
  v `@rebar/core/module-server`; chyba rozšíření akci nezruší. Příklad háčku ve šabloně klienta je pokrytý integračním testem (`tests/extensions.int.test.ts`).
- Provoz: `install.sh` a `update.sh` mají `--dry-run` (vypíše plán, nic nespouští); `docker-compose.yml` předává `APP_ENCRYPTION_KEYS` (rotace šifrovacího klíče); CI má job `compose-smoke`
  (celé nasazení v compose, skutečná záloha a zkouška obnovy resticem).
- Testy: matice oprávnění pro všechny role (`tests/security-matrix.int.test.ts`), konfigurace v administraci (`tests/konfigurace.int.test.ts`).
- Dokumentace: `docs/ARCHITECTURE.md`, `docs/CUSTOMIZATION.md`, `docs/RUNBOOK.md`, `docs/SECURITY.md`, tento `CHANGELOG.md`; obnovené `README.md` a `docs/DEPLOYMENT.md`; test dokumentace `tests/docs.test.ts`
  (existence dokumentů, relativní odkazy a kotvy, příkazy `pnpm`, cesty, interní název).

### Změněno

- Příkazy docházky `dochazka.clock.in`, `.break` a `.out` přijímají volitelný čas ťuknutí `at` (zápis odložený bez signálu); `requireCtx` přesměruje roli jen pro terminál na `/t`.
- Oznamování událostí rozšířením (`emit`) přesunuto z `apps/web/src/server/services.ts` do jádra (`createEventEmitter`), aby šlo testovat bez aplikace.
- Zapínání a vypínání modulů zůstává v `clients/<slug>/config.ts` (nasazením), Nastavení → Moduly je přehled (ADR 019).

## Zakázka jako kořen a ladění UI (2026-10-09)

### Přidáno

- **Zakázka jako kořen systému** ([ADR 015](docs/adr/015-zakazka-jako-koren.md)–[018](docs/adr/018-detail-zakazky-denik-investor.md)): životní cyklus s fázemi a přechody (hooky kontrol a automatiky), rozpočet po verzích, objektech a oddílech s marží a „původní → aktuální“,
  náklady s párováním na oddíly a plán vs. skutečnost, objednávky, přijaté faktury, změny (ZBV) se schválením, soupisy provedených prací, pravidla schvalování s limitem, zádržné,
  přenesená daňová povinnost, zamykání dokladů, šablony zakázek (`feat(zakazky)`).
- Detail zakázky s hlavičkou o čtyřech číslech a nejvýš osmi záložkami; stavební deník jako sběrné místo dne (počasí z Open-Meteo, pracovníci z docházky, materiál s nákladem, podpis, tisk);
  odkaz pro investora jen ke čtení bez cen; montér nevidí ceny.
- Procházecí testy proti běžícímu serveru (`pnpm test:crawl`).

### Změněno

- Přepracované UI: seskupená navigace, záznam na stránce místo bočního panelu, tabulky na celou šířku a karty na telefonu, nový harmonogram, nové přihlášení a Nastavení, jednotný systém mezer ([docs/UI-SPACING.md](docs/UI-SPACING.md)).

### Opraveno

- Číslování zakázek přeskočí obsazená čísla; skryté skupiny záložek nevytékají do lišty.
- Repozitář přejmenován na `stavebni-system-core`.

## Fáze 5 — nasazení a provoz (2026-10-08)

### Přidáno

- Docker: jedna image na klienta (aplikace, worker, nástroje), `docker-compose.yml` (Caddy s HTTPS a bezpečnostními hlavičkami, PostgreSQL jen ve vnitřní síti, zálohování restic, Beszel), [ADR 014](docs/adr/014-nasazeni-a-provoz.md).
- `install.sh` (Ubuntu 24.04, idempotentní), `update.sh` (záloha, migrace, automatický návrat), `backup.sh`, `restore.sh`, `restore-test.sh` s měsíční zkouškou obnovy do health.
- Release podle tagu `vX.Y.Z` do GHCR, Renovate, hlídání velikosti JS v CI, kontrola nasazení v testech (`tests/deploy.test.ts`, `tests/backup-tool.int.test.ts`).

### Opraveno

- Opakované pokusy a diagnostika CI workflow.

## Fáze 4 — moduly a terénní UI (2026-10-08)

### Přidáno

- Všech devět modulů: kontakty, poptávky (převod na zakázku, příjem z webu), zakázky (rozpočet, náklady, vícepráce), realizace (harmonogram s Ganttem, deník, předávací protokol, vady),
  fakturace (PDF s QR platbou, platby, dobropisy, export), docházka (píchačka, výkazy, schvalování, uzávěrka), sklad (doklady, objednávky, inventura), stroje (kniha jízd, tankování, servis, rezervace, závady), kalendář (zdroje, vrstvy, ICS) ([ADR 012](docs/adr/012-moduly-prikazy-a-poskytovatele.md)).
- Přehled podle role (pozornost + dlaždice), spodní navigace na telefonu, fotky z terénu s komprimací a frontou, PWA a Web Push ([ADR 013](docs/adr/013-push-a-pwa.md)).
- Příkazy a poskytovatelé modulů, příznaky `noCreate`/`noDelete` u entit, pracovní dny a svátky.

### Opraveno

- Výběr fotek nečte živý `FileList` až po vymazání pole; delší limity e2e na CI.

## Fáze 3 — design system, app shell a registr entit (2026-10-08)

### Přidáno

- Registr entit s dotazovacím enginem (filtry, řazení, seskupení, součty, inline úprava, hledání bez diakritiky), datová tabulka s virtualizací, kanban, detail záznamu, uložené pohledy, Cmd+K, Inbox, Moje úkoly ([ADR 010](docs/adr/010-registr-entit-a-ui.md), [ADR 004](docs/adr/004-klientska-cache-dat.md)).
- Design system `@rebar/ui` ([ADR 011](docs/adr/011-design-system.md)), Nastavení: uživatelé a pozvánky, role s maticí oprávnění, firma a vzhled.

## Fáze 2 — platforma jádra (2026-10-08)

### Přidáno

- Databáze (Drizzle, UUID v7, migrace pod samostatným uživatelem, aplikační role bez DDL), autentizace (argon2id, 2FA TOTP, pozvánky, reset hesla, omezení počtu pokusů, klouzavé odhlášení),
  oprávnění s rozsahem all/own v datové vrstvě, audit v transakci ([ADR 007](docs/adr/007-opravneni-v-datove-vrstve.md), [ADR 008](docs/adr/008-audit-a-tajemstvi.md)).
- Komentáře se zmínkami, úkoly, upozornění, soubory a fotky s kontrolou obsahu, nastavení se šifrovanými tajemstvími, pipeline, číselníky, číselné řady bez děr, DPH, vlastní pole, zaměstnanci.
- Fronta úloh pg-boss, e-maily přes frontu bez tajemství v logu, health a heartbeat, error tracking se scrubbingem ([ADR 009](docs/adr/009-fronta-uloh-a-migrace.md)), seed klienta a výchozí role, ochrana CSRF.
- Přihlášení s 2FA, pozvánky a obnova hesla v aplikaci, worker.

## Fáze 1 — kostra monorepa a tooling (2026-10-08)

### Přidáno

- pnpm monorepo, TypeScript strict, ESLint s vrstvami, Prettier, Vitest ([ADR 005](docs/adr/005-typescript-7-a-eslint.md), [ADR 006](docs/adr/006-vrstvy-balicku.md)).
- Konfigurace klienta s validací Zodem, manifesty modulů, aplikace Next.js 16 s výběrem klienta při buildu ([ADR 001](docs/adr/001-klientske-instance.md)).
- Šablona klienta, demo klient, `pnpm client:new` a `pnpm config:check`, hlídače pravidel jádra (`tests/guards.test.ts`), CI v GitHub Actions.

## Fáze 0 — audit dema (2026-10-08)

### Přidáno

- [docs/AUDIT.md](docs/AUDIT.md) (verdikty převzít / přepsat / zahodit, cílový datový model, nálezy), [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md), ADR 001–003.

[Unreleased]: https://github.com/ondrejis/stavebni-system-core/commits/main
