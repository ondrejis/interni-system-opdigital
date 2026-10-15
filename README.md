# OPSYS: interní systém agentury OP Digital

OPSYS je interní systém agentury OP Digital pro Ondřeje (vlastník) a Patrika (partner). Staví se z jádra `rebar` (Next.js + Drizzle +
PostgreSQL, pnpm monorepo), které se nepřepisuje: co specifikace nechce, se odstraní, co chce, se v jádru postaví podle jeho vzorů.
Klient `clients/opsys` je jediná instance (`branding.name = "OPSYS"`); zadání a rozbor jsou v [docs/opsys/](docs/opsys/00-ZADANI.md).

> **Stav (po integraci, 2026-10-15):** postaveno všech 13 modulů (kontakty, klienti, Disk, zakázky, obchody, úkoly, kalendář, hodiny, finance,
> reklama, šablony e-mailů, Můj prostor, přehled), soukromé záznamy vlastníka, koš, historie, Cmd+K, realtime, příjem z n8n a mobilní verze.
> Stavební moduly původního jádra jsou odstraněné. `pnpm format:check`, `lint`, `typecheck`, `docs:check`, `config:check` a `pnpm test` jsou zelené,
> `pnpm build` prochází. **Neověřeno:** Playwright e2e, Docker a reálné integrace (Google, Meta, ARES, Fakturoid, n8n). Co zbývá a co má potvrdit vlastník:
> [docs/opsys/F-otevrene-body.md](docs/opsys/F-otevrene-body.md). Průběh a odchylky: [docs/opsys/E-rozbehovy-log.md](docs/opsys/E-rozbehovy-log.md).

> `rebar` je **interní pracovní název** jádra (obor balíčků `@rebar/*`, databáze `rebar_dev`). Uživatelům se nezobrazuje (UI, e-maily, PDF, URL, chyby). Viditelný název systému je vždy `branding.name` z konfigurace klienta.

## Dokumentace

| Dokument                                                                                                                 | Pro koho a o čem                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                                                             | přehled systému, moduly, tok dat a požadavku, datový model, nasazení (diagramy)                                                                              |
| [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md)                                                                           | úrovně úprav klienta, jak napsat rozšíření, jak přidat modul, jak založit klienta                                                                            |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                                                                                 | nasazení OPSYS na VPS krok za krokem (DNS, instalace, OAuth adresy, n8n, zálohy, první přihlášení)                                                           |
| [docs/RUNBOOK.md](docs/RUNBOOK.md)                                                                                       | provoz: aktualizace, rollback, obnova, výpadek, plný disk, rotace tajemství, n8n, incident                                                                   |
| [docs/SECURITY.md](docs/SECURITY.md)                                                                                     | model hrozeb, oprávnění, 2FA, audit, tajemství, síť, zálohy, hlášení incidentu                                                                               |
| [docs/DASHBOARDY.md](docs/DASHBOARDY.md)                                                                                 | vlastní nástěnky: widgety, datové zdroje a oprávnění, metriky modulů, výchozí sady klienta, TV režim                                                         |
| [docs/EXPORTY.md](docs/EXPORTY.md)                                                                                       | exporty seznamů (CSV, XLSX, PDF), fronta, šablony, plány, exporty z nástěnek, ISDOC a podklady DPH                                                           |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md)                                                                               | výkonové cíle a jejich měření (1 vCPU / 4 GB)                                                                                                                |
| [CHANGELOG.md](CHANGELOG.md)                                                                                             | historie změn                                                                                                                                                |
| [docs/adr/](docs/adr/)                                                                                                   | rozhodnutí o architektuře (ADR 001–027 historická, [ADR 028](docs/adr/028-opsys-z-jadra-rebar.md) = OPSYS)                                                   |
| [docs/AUDIT.md](docs/AUDIT.md)                                                                                           | audit dema (fáze 0): co převzít, přepsat, zahodit (historie)                                                                                                 |
| [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md)                                                                         | otevřené a rozhodnuté otázky                                                                                                                                 |
| [docs/UI-SPACING.md](docs/UI-SPACING.md), [docs/MOBIL.md](docs/MOBIL.md), [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) | systém mezer v UI, mobil a PWA, platforma upozornění (OPSYS ji nepoužívá)                                                                                    |
| [docs/_archiv/](docs/_archiv/ZAKAZKA.md)                                                                                 | dokumenty původního stavebního jádra nahrazené OPSYS (zakázka jako kořen, CRM nad zakázkou)                                                                  |
| [docs/opsys/](docs/opsys/00-ZADANI.md)                                                                                   | OPSYS: zadání, rozbor jádra, digest specifikace, plán, kontrakty C1/C3, [log](docs/opsys/E-rozbehovy-log.md), [otevřené body](docs/opsys/F-otevrene-body.md) |
| [docs/INDEX.md](docs/INDEX.md)                                                                                           | rozcestník ke všem dokumentům                                                                                                                                |
| [docs/reference/](docs/reference/README.md)                                                                              | reference generovaná z kódu (entity, příkazy, oprávnění, databáze, trasy, API); neupravuje se ručně                                                          |
| [docs/moduly/](docs/moduly/_sablona.md)                                                                                  | vyprávěcí dokumentace modulů (toky, stavy, pravidla, omezení)                                                                                                |
| [docs/DOCS-PROCES.md](docs/DOCS-PROCES.md)                                                                               | jak se dokumentace udržuje přesná: definice „hotovo“, kontrola driftu, týdenní audit                                                                         |

## Rychlý start (vývoj)

Vyžaduje Node ≥ 22, pnpm (`corepack enable`) a PostgreSQL 17 (lokálně `pnpm db:up` spustí oddělený cluster OPSYS na portu 5434 v `~/.local/share/opsys-pg17`; na macOS s Homebrew `postgresql@17`. Port, adresář a socket jdou změnit proměnnými `REBAR_PG_PORT`, `REBAR_PG_DATA`, `REBAR_PG_SOCKET_DIR`).

```bash
pnpm install
pnpm db:up                                   # cluster OPSYS na portu 5434: databáze rebar_dev, rebar_test, rebar_e2e
cp .env.example .env.local                   # upravit hodnoty (AUTH_SECRET, APP_ENCRYPTION_KEY, OWNER_*)
ln -s ../../.env.local apps/web/.env.local
pnpm db:migrate                              # migrace, práva aplikační role, fronty
pnpm db:seed                                 # role, pipeline, typy aktivit, šablony zakázek, řady a první uživatel z OWNER_*
pnpm dev:seed                                # volitelně (jen lokálně): fiktivní klienti, obchody, zakázky, platby a dva vývojoví uživatelé
PORT=3100 pnpm dev                           # http://localhost:3100 (APP_URL v .env.local musí odpovídat)
pnpm worker                                  # v druhém terminálu: e-maily, náhledy fotek, push, úklid
```

Přihlášení: e-mail a heslo z `OWNER_EMAIL` / `OWNER_PASSWORD` v `.env.local`. 2FA je povinné pro všechny (QR kód do autentikační aplikace při prvním přihlášení).
Bez nastaveného SMTP se e-maily (pozvánky, reset hesla) vypisují v konzoli workeru včetně odkazu.
Klient `clients/opsys` je výchozí (`CLIENT=opsys`). `pnpm dev:seed` (jen `NODE_ENV=development` a lokální databáze) založí smyšlená data a uživatele `owner.dev@opsys.test` a
`partner.dev@opsys.test`; jejich hesla jsou v gitignorovaném `.data/dev-credentials-<databáze>.txt`. Podrobně [clients/opsys/README.md](clients/opsys/README.md).
Paralelní práci s vlastní databází (bez `db:reset` a bez zásahu do `rebar_dev`) zajistí vlastní databáze a proměnné `DATABASE_URL` a `DATABASE_MIGRATE_URL`.

## Příkazy

| Příkaz                                         | Co dělá                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install`                                 | závislosti                                                                                                                     |
| `pnpm db:up` / `pnpm db:down`                  | lokální PostgreSQL 17 na portu 5434 (databáze `rebar_dev`, `rebar_test`, `rebar_e2e`)                                          |
| `pnpm db:migrate`                              | migrace + práva aplikační role + fronty (pod uživatelem migrací)                                                               |
| `pnpm db:seed`                                 | výchozí data klienta (role, pipeline, typy aktivit, šablony zakázek, řady) a první uživatel z `OWNER_*`                        |
| `pnpm db:generate`                             | nová migrace jádra z úprav schématu (moduly: `pnpm --filter @rebar/<id> db:generate`)                                          |
| `pnpm db:reset`                                | smaže celý lokální cluster (všechny vývojové a testovací databáze) a vytvoří ho znovu                                          |
| `pnpm dev`                                     | vývojový server (`CLIENT=opsys` výchozí)                                                                                       |
| `pnpm worker`                                  | úlohy na pozadí (e-maily, náhledy, úklid, heartbeat)                                                                           |
| `pnpm build`                                   | produkční build (standalone) pro klienta `CLIENT`                                                                              |
| `pnpm check`                                   | formátování + lint + typecheck + dokumentace z kódu + testy (jednotkové i proti DB) + kontrola konfigurací klientů             |
| `pnpm format` / `pnpm lint` / `pnpm typecheck` | jednotlivé kroky kontroly                                                                                                      |
| `pnpm test` / `pnpm test:unit`                 | Vitest (integrační testy potřebují `pnpm db:up`)                                                                               |
| `pnpm test:e2e`                                | Playwright (postaví aplikaci, port 3101, vyžaduje migrovanou DB)                                                               |
| `pnpm test:e2e:local`                          | totéž proti samostatné DB `rebar_e2e` (vývojová data zůstanou nedotčená); `E2E_FRESH=1` ji před během zahodí a založí znovu    |
| `pnpm dev:seed`                                | fiktivní vývojová data a vývojoví uživatelé (jen lokálně, po `db:migrate` a `db:seed`)                                         |
| `pnpm test:crawl`                              | procházecí testy proti běžícímu serveru                                                                                        |
| `pnpm check:fresh` / `pnpm check:fresh:push`   | čerstvá databáze, migrace, seed, `dev:seed`, produkční server a procházení navigace pro vlastníka i partnera (po `pnpm build`) |
| `pnpm perf:check`                              | měření výkonu (dotazy, plány, počet dotazů; viz docs/PERFORMANCE.md)                                                           |
| `pnpm config:check`                            | ověří `config.ts` všech klientů a jejich sestavu modulů                                                                        |
| `pnpm client:new <slug> [--name "Název"]`      | nový klient ze šablony                                                                                                         |
| `pnpm vapid:generate`                          | klíče pro Web Push (VAPID)                                                                                                     |
| `pnpm docs:generate` / `pnpm docs:check`       | přegeneruje referenci z kódu (`docs/reference/`) / ověří, že odpovídá kódu (součást `pnpm check`)                              |
| `pnpm docs:coverage` / `pnpm docs:status`      | pokrytí popisy exportů po balíčcích / sekce vyprávění s TODO (viz docs/DOCS-PROCES.md)                                         |

Integrační testy používají databázi `rebar_test`; paralelní běhy oddělí `REBAR_TEST_DB_NAME=jiny_nazev pnpm test`.

**Čistá databáze pro e2e:** `E2E_FRESH=1 pnpm test:e2e:local` (zahodí a založí `rebar_e2e`, pak migrace a Playwright; globální nastavení založí tři nové uživatele s náhodným e-mailem,
takže se databáze během běhů nezanáší). Bez `E2E_FRESH` se použije stávající `rebar_e2e` a zakládají se další uživatelé; po několika bězích ji proto raději zahoďte.
Procházení navigace na lokálním serveru: `pnpm build && pnpm check:fresh` (vlastní databáze `rebar_fresh`, port 3102).

## Struktura

```
apps/web/                 Next.js aplikace (shell, routing, skládá moduly)
packages/core/            platforma: konfigurace, moduly, DB, auth + 2FA, oprávnění, audit, soubory, fronta, e-mail, health (viz ADR 007–009)
packages/ui/              design system a data-driven UI (tabulka, kanban, detail záznamu)
packages/modules/<id>/    kontakty · klienti · disk · zakazky · obchody · ukoly · kalendar · hodiny · finance · reklama · sablony-emailu · muj-prostor · prehled
clients/_template/        šablona klienta (vždy platná)
clients/opsys/            config.ts · branding/ · seed/ (role, pipeline, vývojová data) · dashboards.ts (jediná instance)
deploy/                   Docker, compose, Caddy, install/update/backup/restore skripty (viz docs/DEPLOYMENT.md)
scripts/                  worker, migrace, seed, nový klient, kontrola konfigurací
tests/                    testy napříč repem (hlídače pravidel, kontrola klientů, nasazení, dokumentace)
docs/                     dokumentace a rozhodnutí (ADR)
```

## Rozhraní (UI)

- `packages/ui` — design system (tokeny, komponenty, app shell) a **data-driven UI**: `EntityList` (tabulka, kanban, pohledy, filtry), `RecordView` (stránka záznamu), `CreateDialog`. Neznají Next.js ani server actions; aplikace jim předá `EntityApi` (`apps/web/src/lib/entity-api.ts`).
- Seznam a detail pro každou entitu z registru vzniká sám na adrese `listPath` (`apps/web/src/app/(app)/[...path]`). Nový modul tedy nepotřebuje vlastní stránky, jen popis entity (`defineEntity`).
- Ukázka komponent: `/ui` (jen ve vývoji). Zkratky v aplikaci: klávesa `?`, hledání a příkazy `Cmd/Ctrl+K`.
- Rozhodnutí: [ADR 010](docs/adr/010-registr-entit-a-ui.md), [ADR 011](docs/adr/011-design-system.md).

## Nový klient (jiná instance)

OPSYS je jediná instance (`clients/opsys`). Šablona klienta zůstala pro případ další instalace:

```bash
pnpm client:new stavby-novak --name "Stavby Novák"
pnpm install
# upravit clients/<slug>/config.ts (moduly, branding, zabezpečení)
pnpm config:check
CLIENT=stavby-novak pnpm build
```

Image se staví per klient ([ADR 001](docs/adr/001-klientske-instance.md)), za běhu se klient nemění. Podrobně: [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md), nasazení [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Pravidla

- Jádro nesmí obsahovat podmínku na konkrétního klienta (hlídá `tests/guards.test.ts`).
- Modul nesmí importovat jiný modul; spolupráce jde přes služby, příspěvky, sloty a doménové události z `@rebar/core/contracts` ([ADR 006](docs/adr/006-vrstvy-balicku.md), [ADR 028](docs/adr/028-opsys-z-jadra-rebar.md)).
- Soukromé záznamy vlastníka vynucuje jádro (engine entit); dotaz mimo engine musí použít `privateScope` a být v `privatePaths` modulu.
- Oprávnění se kontrolují v datové vrstvě, ne jen v UI ([ADR 007](docs/adr/007-opravneni-v-datove-vrstve.md)).
- Migrace jsou jen dopředné a zpětně kompatibilní.
- Conventional Commits (`feat(zakazky): …`), jedna logická změna na commit; změny zapisuj do [CHANGELOG.md](CHANGELOG.md).
- Tajné klíče nikdy do repozitáře; v repu je jen `.env.example`.
