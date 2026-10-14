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
