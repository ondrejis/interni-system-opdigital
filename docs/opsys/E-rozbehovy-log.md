# OPSYS – E: log rozběhu (odstranění stavebních modulů, klient `opsys`, lokální vývoj)

Stav: hotovo (2026-10-14). Provedl agent „Rozběh“ podle `B-audit-modulu.md` §7, kroky 0–7. Nic není commitnuté. Původní jádro je v `../system-core` a v commitu `b709d86`.

## 1. Jak spustit lokálně

```sh
sh scripts/dev-db.sh up        # nebo `pnpm db:up`: cluster OPSYS, port 5434, data ~/.local/share/opsys-pg17, socket /tmp/opsys-pg
pnpm db:migrate                # schéma všech zapnutých modulů (čte .env.local)
pnpm db:seed                   # role (owner, partner, externista), pipeline, číselníky, řady, vlastník z OWNER_*
pnpm demo:seed                 # volitelně: 3 demo uživatelé a ukázkové firmy a osoby (--reset | --wipe)
PORT=3100 pnpm dev             # http://localhost:3100
pnpm worker                    # úlohy na pozadí
```

- `.env.local` (gitignorovaný, mode 600) je vytvořený z `.env.example` s lokálně generovanými hodnotami (`AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `HEALTH_TOKEN`, `OWNER_PASSWORD`; `OWNER_EMAIL=dvorak@opdigital.cz`). Hodnoty nejsou nikde v dokumentech.
- Cluster: `REBAR_PG_PORT` (výchozí **5434**), `REBAR_PG_DATA` (výchozí `~/.local/share/opsys-pg17`), `REBAR_PG_SOCKET_DIR` (výchozí `/tmp/opsys-pg`), `PG_BIN`. Port 5433 (cluster původního jádra) se nikde nepoužívá: výchozí port je v `scripts/dev-db.sh`, `scripts/e2e-local.sh`, `scripts/fresh-instance-check.sh`, `scripts/perf-check.ts`, `packages/core/src/testing/global-setup.ts` a `.env.example` změněný na 5434.
- Databáze a role zůstaly pod interními jmény `rebar_dev`, `rebar_test`, `rebar_e2e`, `rebar_app`, `rebar_migrator` (jsou součástí testů, CI a deploye; viditelný název je jen `branding.name`).
- Testy: `pnpm test` (nebo `pnpm exec vitest run --project unit|integration`); paralelní běhy `REBAR_TEST_DB_NAME=rebar_test_x pnpm exec vitest run <cesta>`.

## 2. Co bylo smazáno / změněno (po krocích B §7)

| Krok | Co |
|---|---|
| 0 příprava | `eslint.config.mjs` čte moduly z `packages/modules/*` (smazání modulu lint nerozbije). Jádro přestalo znát moduly: `DEFAULT_ROLES` je jen systémová role `owner`, `ACCOUNTANT_ROLE` a `standardDashboards` (`core/dashboards/defaults.ts`) pryč, `MONEY_PERMISSIONS = ["finance.read"]`. Navigace je data-driven: `NavItem.bottom` (spodní lišta mobilu z manifestů) a `config.navigation.groupOrder` (pořadí sekcí). `(app)/page.tsx` bez zakázek, deníku a píchačky, `mobile-nav.tsx` bez Foto, `home-clock.tsx` smazán. `findContactDuplicates` a normalizace e-mailu/telefonu/IČO přesunuty z CRM do `@rebar/kontakty` (`kontakty/src/duplicates.ts`, příkaz `crm.contact.duplicates` → `kontakty.duplicates`; `poptavky/crm/deals/duplicates.ts` je jen re-export). |
| 1 stroje | modul, `tests/stroje.int.test.ts`, vazby v testech. |
| 2 sklad | modul, `tests/sklad.int.test.ts`, číselné řady `sklad.*` (`series-labels.ts` má jen `zakazky.cislo`). |
| 3 realizace | modul, `tests/realizace.int.test.ts`, `tests/detail-zakazky.int.test.ts`, `app/tisk/denik`, slot `DiaryPrefillProvider` v jádru a jeho poskytovatel v docházce. |
| 4 fakturace | modul, 5 tras `api/fakturace/*`, testy `fakturace*`, `accounting-exports`, `review-wave-c`; z `export.int.test.ts` zůstaly obecné exporty; `settings` odkaz „Faktury a dokumenty“; `notifications/money.ts`. |
| 5 poptávky ↔ rozpočet | `crm/deals/transitions.ts` už nečte rozpočet (`budgetItem`, `budgetVersion`); hodnota obchodu je `job.valueMinor` (atribut `value`), ne `sumContract` (úprava v `crm/views/*`, `board/*`, `today`, `inbox/contacts`, `deals/recompute`). |
| 6 zakázky | smazáno `share`, `statements`, `changes`, `orders`, `approvals`, `budget`, `costs`, `terminal*.ts`, `economics`, `notifications` (všech 9 událostí), `team.ts` (`notifyJobTeam`), `schedule.ts` (cron „Zakázka dnes začíná“), `metrics.ts` (5 metrik ekonomiky), `detail/kpis.ts`, investor (`app/investor`, `api/investor`, `server/investor.ts`), `api/zakazky/[id]/nabidka/pdf`, `nastaveni/schvalovani`, `docs`/`CostProvider`/`JobInvoicingProvider`/`setJobFinanceProviders` v jádru. Schéma `job`: pryč `vat_mode`, `retention_bp`, `site_lat/lng`, všechny `sum_*`; tabulky zbyly `job`, `job_member`, `job_stage_history`, `job_participant`, `job_template`. Migrace modulu **přegenerovány od nuly** (`drizzle/0000_init.sql`). Oprávnění: `zakazky.read`, `zakazky.write`, `zakazky.finance` (nahradilo `economics`; chrání atribut `value` a `crmWeighted`); pryč `budget`, `approve`, `approve_all`, `share`. Šablony: payload jen `tasks` a `roles`, příkazy chrání `zakazky.write`. Detail: hlavička bez KPI, přehled s kartou týmu a poptávky. |
| 7 terminál | `packages/core/src/terminal`, `packages/ui/src/terminal`, `app/(terminal)/t`, `server/terminal*.ts`, `nastaveni/terminal`, `public/t-offline.html`, dlaždice dochazky (`terminal.ts`, `terminal-ui.tsx`, příkaz `dochazka.terminal.summary`), `config.terminal`, `manifest.terminalWidgets`, `ModuleUi.terminalWidgets`, `allowTerminalOnly`/`isTerminalOnly`, tabulka `terminal_op` (nová core migrace `0012_drop_terminal_op`), `docs/TERMINAL.md`, service worker (zůstal jen úklid starých cache `terminal-offline-*`). |

Dále: `clients/demo` smazán, vznikl `clients/opsys` (viz §3); `clients/_template` je generická kostra (moduly `kontakty`, `zakazky`); `CLIENT=opsys` výchozí v `.env.example`, `deploy/`, Dockerfile, CI, skriptech.

## 3. Klient `opsys`

- `clients/opsys/config.ts`: `branding.name = "OPSYS"`, moduly `kontakty, zakazky, poptavky, dochazka, kalendar`, `navigation.groupOrder` (Práce, CRM, Realizace, Finance, Marketing, Můj prostor), `security.require2faRoles = ["owner", "partner"]`, bez konfigurace upozornění a terminálu.
- `clients/opsys/seed/index.ts`: role `owner` (systémová), `partner`, `externista` s oprávněními zapnutých modulů (klíče mimo katalog se ignorují).
- `clients/opsys/dashboards.ts`: výchozí nástěnky Majitel a Partner (jen vestavěné bloky a entita `job`).
- Demo seed (`clients/opsys/seed/{run,reset,kit,world,users,contacts,ico,dates}.ts`, `scripts/demo-seed.ts`, `scripts/lib/demo-services.ts`): jen 3 uživatelé (owner, partner, externista; testovací heslo je konstanta v `seed/users.ts`, ne tajemství) a 3 firmy s osobami přes entity kontaktů. Reset a počty tabulek se zjišťují z databáze (přežijí přejmenování tabulek `inquiry` → `deal`). `tests/demo-seed.int.test.ts` ho ověřuje na čerstvé DB.

## 4. Testy a fixtury (kde to teď je)

- `tests/support/security-fixture.ts` skládá sestavu po modulech z `tests/support/fixture/{kontakty,zakazky,poptavky,dochazka,kalendar}.ts` (smazání nebo přepracování modulu = úprava jednoho souboru a jednoho řádku). Lidé: `owner`, `partner`, `externistaA`, `externistaB`; zakázka A patří externistovi A, B externistovi B.
- `tests/support/security-probes.ts` skládá `PROBES` z `tests/support/probes/<modul>.ts`. Matice `tests/security-matrix.int.test.ts` je přepsaná na role OPSYS (příkazy, entity, rozsah „jen moje“, soubory a komentáře, export, kalendářní import); nový příkaz bez probe ji shodí.
- Smazané testy: `dashboard-metrics.int.test.ts` (metriky ekonomiky, fakturace, strojů, skladu), `terminal*.ts`, testy odstraněných modulů, `detail-zakazky`, `review-wave-c`; zmenšené: `export`, `public-surface`, `query-count`, `delete-blockers`, `dashboards`, `exports-center`, `dochazka`, `zakazky/*` int testy.
- `docs.test.ts` nekontroluje pracovní dokumenty `docs/opsys/` a `docs/specifikace/` (mluví o jádru Rebar a o postupu prací).
- E2E: smazané specy odstraněných modulů a celý demo-závislý `e2e-crawl` (zůstaly platformní: dashboardy, exporty, nastavení, přihlášení, účet, kontakty, poptávky, smoke); `e2e/prehled.spec.ts` přepsán (spodní navigace z manifestů). `e2e-crawl/roles.ts` smazán. **E2E ani crawl jsem nespouštěl** (potřebují build a čerstvý server); `apps/web/e2e-shuffled/` je gitignorovaná generovaná kopie a nechal jsem ji být.

## 5. Odchylky od B a co jsem nechal (zadání: „co nejde bezpečně odstranit, nech a zapiš“)

- `job.address`, `job.site_city`, `job.warranty_*`, `job.color`, `job.source_inquiry_id`, `crm_*` sloupce a pevné fáze (`PhaseKey`, `lifecycle/*`, hooky `lifecycle.*`) **zůstaly**: používá je CRM (`poptavky`) a pipeline; odstraní je přepracování modelu zakázky/obchodů (B krok 8–9).
- Hodnota obchodu je teď `job.valueMinor` (atribut `value`, oprávnění `zakazky.finance`); `crmWeighted` je odvozená z ní. Až vznikne `deal`, má vlastní hodnotu.
- Zakázkové událostí upozornění jsem smazal všechny (9). Události ostatních zachovaných modulů (`dochazka` 7, `kalendar` 4, `poptavky` 9, jádro `task.*`) **zůstaly** (jsou jejich), stejně jako platforma notifikací a push; tabulka v `docs/NOTIFICATIONS.md` odpovídá kódu (test `notifications-docs`). Rozhodnutí o jejich zrušení (B §10.1) je na majiteli.
- `PhotoDialog`/`usePendingUploads` (`packages/ui/src/data/photo-capture.tsx`) zůstaly v UI (generická offline fronta fotek); nic je dnes nepoužívá.
- DPH (`core/config-data/vat.ts`, `/nastaveni/dph`, `VatRatesProvider`) a `core/pdf` zůstaly (B: odstranit později); `scripts/docs`, `qrcode` apod. beze změny.
- `kontakty.ares` má oprávnění `["kontakty.write","poptavky.write","zakazky.write"]` (zachované moduly).
- Probes a fixture zakázek odpovídají dnešnímu příkazovému rozhraní zakázek (`team.*`, `phase.preview`, `transition`, `template.*`); `zakazky.transition` testuje přechod do fáze `handover`.
- Dochazka: píchačka (`ClockCard`, `dochazka.clock.*`) a schvalování zůstaly (rozhodne agent Hodiny); smazány jen dlaždice terminálu, náklad práce pro zakázky (`costProviders`) a předvyplnění deníku.
- `docs/ARCHITECTURE.md`, `SECURITY.md`, `PERFORMANCE.md`, `RUNBOOK.md`, `ZAKAZKA.md`, `CRM.md`, `EXPORTY.md`, `adr/*` a `docs/moduly/*.md` zachovaných modulů mají **zastaralé vyprávěcí části** (stavební příklady, rozpočty, faktury): opravil jsem jen to, co hlídají testy (odkazy, cesty, katalog upozornění); přepsání je úkol integrátora.

## 6. Zbylé moduly (řádky `src`, z toho testy) a stav kontrol

| Modul | Řádků | Z toho testy |
|---|---:|---:|
| kontakty | 2 626 | 571 |
| zakazky (kostra) | 4 754 | 1 629 |
| poptavky (CRM) | 21 623 | 4 746 |
| dochazka | 3 516 | 231 |
| kalendar | 3 882 | 612 |

Původně 9 modulů a ~97 tis. řádků modulů; po rozběhu 5 modulů a ~36 tis. řádků.

Zelené po dokončení: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (113 souborů, 1 235 testů: jednotkové i integrační proti DB na 5434), `pnpm docs:check`, `pnpm docs:coverage --check`, `pnpm config:check`, tedy celé `pnpm check`. Ověřeno také: `pnpm db:migrate`, `pnpm db:seed`, `pnpm demo:seed`, `PORT=3100 pnpm dev` (přihlášení demo majitele přes API, stránky `/`, `/zakazky`, `/kontakty/firmy`, `/crm`, `/kalendar`, `/dochazka`, `/ukoly`, `/inbox`, `/nastaveni/*` vrací 200 a v HTML není „rebar“; manifest PWA a titulek jsou „OPSYS“), `pnpm perf:check --scale=0.02`.

Červené nebo neověřené: Playwright `test:e2e` a `test:crawl` (nespouštěno, potřebují build a běžící server); `docs/INDEX.md` a `docs/reference/**` je nutné po každé změně kódu znovu vygenerovat (`pnpm docs:refresh`), po přidání `docs/opsys/D-plan-a-kontrakty.md` také.

Poznámky: `pnpm demo:seed` vypíná povinné 2FA rolím `owner`, `partner`, `externista` (jen v lokální databázi; `--keep-2fa` ho ponechá), takže se tím vypne i pro skutečného vlastníka z `db:seed`; v produkci se seed nespouští. `.prettierignore` nově vynechává `docs/opsys/` a `docs/specifikace/`.

---

# S0: kostra OPSYS (2026-10-14)

Provedl agent S0 Skeleton podle `D-plan-a-kontrakty.md` §3.2, kroky 1–8. Nic není commitnuté; koordinátor commitne a otaguje `opsys-s0`. Po S0 smí S1 (schema-freeze) začít hned.

## S0.1 Co vzniklo

- **13 modulů** v pořadí `MODULE_IDS` z D §1.1: `kontakty, klienti, disk, zakazky, obchody, ukoly, kalendar, hodiny, finance, reklama, sablony-emailu, muj-prostor, prehled`. Nových 10 balíčků (`packages/modules/<id>`) má `package.json` (exporty `.`, `./schema`, `./server`, `./ui`, `./api`; závislosti jádra a `dependsOn`; Tiptap v `ukoly`, `sablony-emailu`, `muj-prostor`), `tsconfig.json`, `drizzle.config.ts` (`schema: ["./src/schema.ts", "./src/schema/*.ts"]`), **úplný manifest** (navigace s `group` a `order`, oprávnění s českými popisky, `dependsOn`, `pages`), prázdné `src/{schema,entities,commands,contract,api,server}.ts` a `src/ui.tsx` se zástupnými stránkami (`Placeholder` z `@rebar/ui`). Rozdělené moduly mají oblasti s `index.ts`: `obchody/{deals,ui}`, `ukoly/{tasks,notes,ui}`, `finance/{logic,data,ui}`, `reklama/{meta,ui}`, `muj-prostor/{hosting,domains,library,invoices,private}` (každá oblast má `index.ts` se serverovou `area`, `ui/` a `muj-prostor/*/ui.tsx` s `areaUi`; `server.ts` skládá `mergeServers`, `ui.tsx` `mergeModuleUi`). `zakazky/{core,ui}` a `kalendar/{google,ui}` jsou prázdné **nezapojené** oblasti (stará kód zůstává v `server.ts`/`ui.tsx` do ZAK-A/KAL-A).
- `kontakty`, `zakazky`, `kalendar`: nový manifest podle §1.2 (navigace: CRM → Organizace 30, Kontakty 40; Realizace → Zakázky 10; Práce → Kalendář 20), `api.ts` a `contract.ts` doplněné, `./api` v exportech; `kontakty` má nová oprávnění `create, delete, export, ares`, `zakazky` `create, delete, export, templates` (`zakazky.finance` zůstala).
- **Donoři:** `packages/_donor/{poptavky,dochazka}` (celý kód, bez `node_modules`), `_donor/tests` (jejich testy + původní matice oprávnění v `tests/security/`, fixtury a probes), `_donor/web` (`intake-poptavky-route.ts`), `_donor/e2e*` (specy CRM, docházky a poptávek), `_donor/docs` (`poptavky.md`, `dochazka.md`), `_donor/README.md`. Mimo workspace, mimo `tsc`, ESLint, Prettier a Vitest (`vitest.config.ts`, `eslint.config.mjs`, `.prettierignore`).
- **Platforma** (`packages/core`): `@rebar/core/contracts` (`types, phone, events, services, client-card, email-vars, slots`: D §2.1–2.3, 2.5) a `@rebar/core/events` (`emitDomain`, `setDomainEvents`); rozšířené `ModuleServer` (`services, contributions, eventHandlers, ingests, navBadges, privatePaths`, `entities` smí obsahovat `extendEntity`), `ModuleDeps.services` (`get`, `optional`, `all`), `createModuleDeps`, `mergeServers` (zřetězí `eventHandlers`, spojí `services` a `contributions`), `defineIngest`, `EntityDef` (`visibility, systemFields, children, quickFilters, searchLoad`: jen typy), `extendEntity` + `applyEntityExtensions`, `writeSystemFields` (plná implementace: kontrola deklarace, audit, reindex), `visibilityColumns()` a `visibilityIndex()` v `@rebar/core/db`, `NavItem.order`, nová core oprávnění (`private.read, activity.read, activity.export, trash.read, trash.purge, settings.pipelines|custom_fields|tags|integrations`), `createStubServices` v `@rebar/core/testing`, `<Slot>`, `useSlotComponents`, `mergeModuleUi`, `PaletteAction`, `ModuleUi.slots/paletteActions` a `Placeholder` v `@rebar/ui`. Nová závislost jen `libphonenumber-js` (core) a Tiptap balíčky (moduly).
- **Aplikace:** `modules.ts`, `modules-ui.ts`, `modules-server.ts` (13 modulů, `COMMAND_PREFIXES` prázdné, `SERVICE_OWNERS`, bez `PHASE_LIST`), `package.json`, `next.config.ts`, `tests/package.json`; `services.ts` a `scripts/worker.ts` skládají `ModuleDeps` s `services` a registrují obsluhy událostí. Shell: ikony (`building, folder, wallet, scale, megaphone, mail-template, vault, layout-dashboard, google-drive`), řazení položek podle `order`, odznaky z `navBadges` (`tone` warning/danger), patička Historie (`activity.read`) a Koš (`trash.read`), `top` navigace prázdná (OPSYS nemá Inbox ani core „Moje úkoly“), `/` přesměruje na `/prehled` (bez oprávnění na `/nastaveni/ucet`), mobilní lišta Hledat, Klienti, Obchody, Moje úkoly, Více (`bottom: true` mají jen klienti, obchody, úkoly), sekce Nastavení data-driven (`module`, `feature`; bez Upozornění, Pravidel upozornění a DPH), zástupné stránky `/historie`, `/kos`, `/nastaveni/{stitky,finance,google-disk,integrace,google-kalendar,vzhled,system}`, zástupné stránky modulů pro každou položku navigace a `/ukoly/typy`.
- **Klient `opsys`:** `config.ts` (13 modulů, `notifications` prázdné), `seed/roles.ts` + `seed/index.ts` (role `owner`, `partner` podle NAS-02, `external` prázdná), `dashboards.ts` beze změny. Demo seed (`seed/{run,reset,kit,users,world,contacts,dates,ico}.ts`, `scripts/demo-seed.ts`, `scripts/lib/demo-services.ts`, `tests/demo-seed.int.test.ts`, skript `demo:seed`) smazán; dev data píše SEED (S2).
- **Testy:** `tests/support/probes/{<modul>.ts,index.ts}` (13 souborů + `shared.ts`, `PROBES`; `security-probes.ts` zrušen), `tests/support/security-fixture.ts` jen s lidmi `owner`/`partner`/`external` a `ctxOf`, `security-matrix.int.test.ts` zredukovaná (brána příkazů, úplnost probes, matice rolí; datové části `it.todo`), `private-matrix.int.test.ts` a `private-paths.int.test.ts` jako `describe.skip` kostry, `PUBLIC` a CSRF výjimky v `security-static.test.ts` doplněny o `ingest/[source]` a `kalendar/google/webhook`, `modules.test.ts` upraven na 13 modulů; nové testy `phone`, `email-vars`, `extend`, `events`, `modules/server`, `db/migrations` (jádro) a `tests/platform-s0.int.test.ts`. `docs/opsys/ZADOSTI.md` a `docs/opsys/ready/` založeny.
- **Dokumentace:** `docs/moduly/<id>.md` pro 10 nových modulů (`pnpm docs:scaffold`), `docs:refresh`, tabulka katalogu v `docs/NOTIFICATIONS.md` zkrácena na události, které kód má, `README.md`, `CHANGELOG.md`, `clients/opsys/README.md`, `docs/CUSTOMIZATION.md` a `docs/OPEN-QUESTIONS.md` zbaveny odkazů na `demo:seed`, `poptavky` a `clients/demo`.

## S0.2 Odchylky od D a rozhodnutí

1. **Název migrační tabulky:** `migrationSources` nahrazuje pomlčku v id modulu podtržítkem (`__drizzle_migrations_muj_prostor`, `…_sablony_emailu`); oprávnění `^muj-prostor\.[a-z_]+$` i předpony příkazů a metrik s pomlčkou fungují bez úprav (test v `modules.test.ts` ověřuje tvar). Pomlčkové id jinde problém nedělá.
2. **Role `external`** (D) nahradila `externista`; `owner` dostává i `account.self`, které není v katalogu (matice ho vynechává). `partner` má podle **NAS-02** (autorita nad D) úkoly, hodiny, kalendář a šablony e-mailů **včetně mazání**; D v závorce vypisuje „vše kromě `*.delete`“. `kontakty.merge` už nemá (dřív měl). Navíc drží přechodné klíče starého kódu: `zakazky.finance`, `kalendar.resources`, `tasks.read`, `tasks.assign` (core `task` zruší C1).
3. **Entity v manifestech nových modulů nejsou** (`entities` doplní S1). Každá zástupná stránka (`pages` + `ui.pages`) musí zmizet, jakmile modul dodá entitu se stejným `listPath` (`tests/modules.test.ts`/`apps/web/src/modules.test.ts`): `/klienti` je vlastní stránka, ostatní (`/obchody`, `/ukoly`, `/hodiny`, `/finance`, `/reklama`, `/sablony-emailu`, `/ukoly/typy`, `/muj-prostor/*`) se nahradí entitami nebo skutečným UI. Core stránka `/ukoly` (core `task`) zatím zastiňuje stránku modulu `ukoly`; zmizí v C1.
4. **`kontakty/api`:** dosavadní `findContactDuplicates` (hledání podle IČO, e-mailu, telefonu) se jmenuje `matchContactDuplicates` (server export i `kontaktyApi`); funkce `findContactDuplicates` s podpisem z D §2.4 je stub `NotImplementedError` (KON ji implementuje). Příkaz `kontakty.ares` má oprávnění `kontakty.ares`, `kontakty.write`, `obchody.write`, `zakazky.write`.
5. **`zakazky`:** z navigace zmizela podpoložka Šablony (stránka `/zakazky/sablony` a její oprávnění `zakazky.read` zůstaly), `./phases` a `export * from lifecycle/phases` odstraněny, `bottom` pryč. **`kalendar`:** z navigace pryč Události a Zdroje (entity a jejich adresy zůstaly do KAL-A). Upozornění modulu `kalendar` (4 události) a platformní katalog (task, comment) zůstaly: rozhodnutí o jejich zrušení je na KAL-A/INT; `docs/NOTIFICATIONS.md` odpovídá kódu.
6. **Testovací sestava:** D chtěla `security-fixture.ts` jen s uživateli. Testy platformy, které potřebují data zakázek (`dashboards.int`, `exports-center.int`, `query-count.int`), běží dál nad **přechodnou starou sestavou** `tests/support/legacy/` (vlastní role owner/partner/externista, zakázky, kontakty, kalendář); smaže ji nová sestava z C1/QA-SEC. Původní matice oprávnění je v `packages/_donor/tests/security/`.
7. **`ModuleJobDeps.services`** je nepovinné (worker ho vyplňuje); `emitDomain` má navíc `meta.actor` (n8n, Google, Meta, úlohy) a `setDomainEvents` jako registraci obsluh (web, worker).
8. **`phoneSearchKeys`** vrací jediný klíč: posledních devět číslic (kratší číslo celé, méně než tři číslice nic); hledaný text C3 normalizuje stejně a hledá podčástí. `toE164(raw, cc = "CZ")`: číslo s `00` se čte jako `+`.
9. **Generátor dokumentace:** `scripts/docs/sections/moduly.ts` odkazuje na `prikazy/jadro.md` jen když platforma nějaké příkazy má (po odstranění terminálu jich nemá a odkaz byl rozbitý).
10. Ověření pomlčky: tabulka záznamu migrací se nikde jinde nepoužívá (`rg drizzle_migrations`), takže jiné změny nebyly potřeba.

## S0.3 Co S1 (schema-freeze) musí vědět

- Každý modul má prázdný `src/schema.ts` (`export {}`); velké moduly přidávají `src/schema/<část>.ts` (`drizzle.config.ts` čte oba). Pro `kontakty`, `zakazky` a `kalendar` zůstává **starý** `schema.ts` a `drizzle/` (včetně `crm_*` sloupců a tabulek `job_*`, `event*`): podle D §1.2 je přepíše S1 a smí `rm -rf drizzle && pnpm --filter @rebar/<id> db:generate`. Nové moduly nemají `drizzle/`, takže se v migracích přeskočí.
- Jádro: poslední migrace je `0012_drop_terminal_op` (ne `0011`), nová jádrová migrace z D §5.5 bude tedy `0013_opsys` (INT je stejně squashne). `visibilityColumns()`, `visibilityIndex()` a `pk()`/`audit()`/`minor()` jsou v `@rebar/core/db`.
- `entities.ts` nových modulů exportuje `entities: readonly EntityDef[]` (už zapojené v `server.ts`); po přidání entity doplň klíč do `manifest.entities`, odstraň odpovídající zástupnou stránku (viz S0.2 bod 3) a přidej `privatePaths` tam, kde modul ručně čte data.
- Příkazy se zapisují do `commands.ts`; **každý příkaz potřebuje probe** v `tests/support/probes/<modul>.ts` (`P`, `F` ze `shared.ts`), jinak padá `tests/security-matrix.int.test.ts`.
- Veřejné funkce mezi moduly: `kontakty`, `zakazky` a `obchody` mají `api.ts` podle D §2.4 (`NotImplementedError`); ostatní `export {}`. Služby (`ServiceMap`) se registrují v `server.ts` pod `services` (`SERVICE_OWNERS` hlídá vlastníka); do testů `createStubServices`.
- `visibility`, `systemFields`, `children`, `quickFilters`, `searchLoad` na `EntityDef` jsou zatím jen typy: engine je ignoruje do C1/C3. `writeSystemFields` ale už funguje (názvy vlastností tabulky nebo sloupců), `extendEntity` také.
- Pomlčkové id (`muj-prostor`, `sablony-emailu`) funguje; v kódu používej `"muj-prostor"` jako klíč a identifikátory `mujProstor`.
- Co zatím nefunguje a **ne**patří S1: `docs:check` mimo S0 (S1 smí generovat), e2e a crawl (staré specy zůstaly, např. `e2e/konfigurace.spec.ts` odkazuje na `/poptavky`; `scripts/fresh-instance-check.sh` stále očekává demo uživatele), `perf-check` (stará data).

## S0.4 Stav kontrol (lokální cluster na 5434)

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (jednotkové i integrační: 95 souborů), `pnpm docs:check`, `pnpm docs:coverage --check` a `next build` jsou zelené; `pnpm db:reset && pnpm db:migrate && pnpm db:seed` projde na čisté databázi (13 modulů, prázdné kostry se přeskočí); `PORT=3100 pnpm dev` jako vlastník: `/` přesměruje na `/prehled`, všech 34 zkoušených adres (nav, Nastavení, Historie, Koš, `/ukoly/typy`) vrací 200 a v HTML není „rebar“. Playwright se nespouštěl. V lokální DB je pro vlastníka a partnera vypnuté povinné 2FA (jen vývojový cluster, kvůli ověření přihlášení; `db:seed` ho znovu zapne při novém seedu role jen u nových rolí).
