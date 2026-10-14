# OPSYS: interní systém agentury OP Digital

OPSYS je interní systém agentury OP Digital pro Ondřeje (vlastník) a Patrika (partner). Staví se z jádra `rebar` (Next.js + Drizzle +
PostgreSQL, pnpm monorepo), které se nepřepisuje: co specifikace nechce, se odstraní, co chce, se v jádru postaví podle jeho vzorů.
Klient `clients/opsys` je jediná instance (`branding.name = "OPSYS"`); zadání a rozbor jsou v [docs/opsys/](docs/opsys/00-ZADANI.md).

> **Stav (rozběh):** stavební moduly jádra (stroje, sklad, realizace, fakturace), rozpočty a náklady zakázek, schvalování, sdílení
> s investorem a terminál řemeslníka jsou odstraněné. Zůstaly kontakty, zakázky (jen kostra), poptávky (CRM), docházka a kalendář; ty se
> přepracovávají podle specifikace. Průběh a odchylky: [docs/opsys/E-rozbehovy-log.md](docs/opsys/E-rozbehovy-log.md).

> `rebar` je **interní pracovní název** jádra (obor balíčků `@rebar/*`, databáze `rebar_dev`). Uživatelům se nezobrazuje (UI, e-maily, PDF, URL, chyby). Viditelný název systému je vždy `branding.name` z konfigurace klienta.

## Dokumentace

| Dokument                                                                                                 | Pro koho a o čem                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                                                             | přehled systému, moduly, tok dat a požadavku, datový model, nasazení (diagramy)                                    |
| [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md)                                                           | 4 úrovně úprav pro klienta, jak napsat rozšíření, jak přidat modul, jak založit klienta                            |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                                                                 | nová instance na VPS krok za krokem (DNS, instalace, e-mail, zálohy, první přihlášení)                             |
| [docs/RUNBOOK.md](docs/RUNBOOK.md)                                                                       | provoz: aktualizace, rollback, obnova, výpadek, plný disk, rotace tajemství, incident, předání klientovi           |
| [docs/SECURITY.md](docs/SECURITY.md)                                                                     | model hrozeb, oprávnění, 2FA, audit, tajemství, síť, zálohy, hlášení incidentu                                     |
| [docs/DASHBOARDY.md](docs/DASHBOARDY.md)                                                                 | vlastní nástěnky: widgety, datové zdroje a oprávnění, metriky modulů, výchozí sady klienta, TV režim               |
| [docs/EXPORTY.md](docs/EXPORTY.md)                                                                       | exporty seznamů (CSV, XLSX, PDF), fronta, šablony, plány, exporty z nástěnek, ISDOC a podklady DPH                 |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md)                                                               | výkonové cíle a jejich měření (1 vCPU / 4 GB)                                                                      |
| [CHANGELOG.md](CHANGELOG.md)                                                                             | historie změn                                                                                                      |
| [docs/adr/](docs/adr/)                                                                                   | rozhodnutí o architektuře (ADR 001–027)                                                                            |
| [docs/AUDIT.md](docs/AUDIT.md)                                                                           | audit dema (fáze 0): co převzít, přepsat, zahodit                                                                  |
| [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md)                                                         | otevřené a rozhodnuté otázky (např. Q5 licence a předání)                                                          |
| [docs/ZAKAZKA.md](docs/ZAKAZKA.md), [docs/CRM.md](docs/CRM.md), [docs/UI-SPACING.md](docs/UI-SPACING.md) | pracovní dokumenty: modul Zakázky, CRM (obchod nad zakázkou), systém mezer v UI                                    |
| [docs/opsys/](docs/opsys/00-ZADANI.md)                                                                   | OPSYS: zadání, rozbor jádra, audit modulů, digest specifikace, plán a [log rozběhu](docs/opsys/E-rozbehovy-log.md) |
| [docs/INDEX.md](docs/INDEX.md)                                                                           | rozcestník ke všem dokumentům                                                                                      |
| [docs/reference/](docs/reference/README.md)                                                              | reference generovaná z kódu (entity, příkazy, oprávnění, databáze, trasy, API); neupravuje se ručně                |
| [docs/moduly/](docs/moduly/_sablona.md)                                                                  | vyprávěcí dokumentace modulů (toky, stavy, pravidla, omezení)                                                      |
| [docs/DOCS-PROCES.md](docs/DOCS-PROCES.md)                                                               | jak se dokumentace udržuje přesná: definice „hotovo“, kontrola driftu, týdenní audit                               |

## Rychlý start (vývoj)

Vyžaduje Node ≥ 22, pnpm (`corepack enable`) a PostgreSQL 17 (lokálně `pnpm db:up` spustí oddělený cluster OPSYS na portu 5434 v `~/.local/share/opsys-pg17`; na macOS s Homebrew `postgresql@17`. Port, adresář a socket jdou změnit proměnnými `REBAR_PG_PORT`, `REBAR_PG_DATA`, `REBAR_PG_SOCKET_DIR`).

```bash
pnpm install
pnpm db:up                                   # cluster OPSYS na portu 5434: databáze rebar_dev, rebar_test, rebar_e2e
cp .env.example .env.local                   # upravit hodnoty (AUTH_SECRET, APP_ENCRYPTION_KEY, OWNER_*)
ln -s ../../.env.local apps/web/.env.local
pnpm db:migrate                              # migrace, práva aplikační role, fronty
pnpm db:seed                                 # role, pipeline, číselníky, řady, DPH a první uživatel z OWNER_*
PORT=3100 pnpm dev                           # http://localhost:3100 (APP_URL v .env.local musí odpovídat)
pnpm worker                                  # v druhém terminálu: e-maily, náhledy fotek, push, úklid
```

Přihlášení: e-mail a heslo z `OWNER_EMAIL` / `OWNER_PASSWORD` v `.env.local`. Majitel má povinné 2FA (QR kód do autentikační aplikace při prvním přihlášení).
Bez nastaveného SMTP se e-maily (pozvánky, reset hesla) vypisují v konzoli workeru včetně odkazu.
Klient `clients/opsys` je výchozí (`CLIENT=opsys`). Minimální demo data (tři uživatelé podle rolí a ukázkové firmy) nasype `pnpm demo:seed` do prázdné databáze; popis je v [clients/opsys/README.md](clients/opsys/README.md).

## Příkazy

| Příkaz                                         | Co dělá                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm install`                                 | závislosti                                                                                                         |
| `pnpm db:up` / `pnpm db:down`                  | lokální PostgreSQL 17 na portu 5434 (databáze `rebar_dev`, `rebar_test`, `rebar_e2e`)                              |
| `pnpm db:migrate`                              | migrace + práva aplikační role + fronty (pod uživatelem migrací)                                                   |
| `pnpm db:seed`                                 | výchozí data klienta a první uživatel z `OWNER_*`                                                                  |
| `pnpm db:generate`                             | nová migrace jádra z úprav schématu (moduly: `pnpm --filter @rebar/<id> db:generate`)                              |
| `pnpm db:reset`                                | smaže celý lokální cluster (všechny vývojové a testovací databáze) a vytvoří ho znovu                              |
| `pnpm demo:seed`                               | minimální demo data OPSYS: demo uživatelé podle rolí a ukázkové firmy (jen klient `opsys`; `--help`)               |
| `pnpm dev`                                     | vývojový server (`CLIENT=opsys` výchozí)                                                                           |
| `pnpm worker`                                  | úlohy na pozadí (e-maily, náhledy, úklid, heartbeat)                                                               |
| `pnpm build`                                   | produkční build (standalone) pro klienta `CLIENT`                                                                  |
| `pnpm check`                                   | formátování + lint + typecheck + dokumentace z kódu + testy (jednotkové i proti DB) + kontrola konfigurací klientů |
| `pnpm format` / `pnpm lint` / `pnpm typecheck` | jednotlivé kroky kontroly                                                                                          |
| `pnpm test` / `pnpm test:unit`                 | Vitest (integrační testy potřebují `pnpm db:up`)                                                                   |
| `pnpm test:e2e`                                | Playwright (postaví aplikaci, port 3101, vyžaduje migrovanou DB)                                                   |
| `pnpm test:e2e:local`                          | totéž proti samostatné DB `rebar_e2e` (vývojová data zůstanou nedotčená)                                           |
| `pnpm test:crawl`                              | procházecí testy proti běžícímu serveru                                                                            |
| `pnpm check:fresh` / `pnpm check:fresh:push`   | procházecí testy proti čerstvé produkční instanci jako v CI (bez klíčů VAPID i s nimi; po `pnpm build`)            |
| `pnpm perf:check`                              | měření výkonu (dotazy, plány, počet dotazů; viz docs/PERFORMANCE.md)                                               |
| `pnpm config:check`                            | ověří `config.ts` všech klientů a jejich sestavu modulů                                                            |
| `pnpm client:new <slug> [--name "Název"]`      | nový klient ze šablony                                                                                             |
| `pnpm vapid:generate`                          | klíče pro Web Push (VAPID)                                                                                         |
| `pnpm docs:generate` / `pnpm docs:check`       | přegeneruje referenci z kódu (`docs/reference/`) / ověří, že odpovídá kódu (součást `pnpm check`)                  |
| `pnpm docs:coverage` / `pnpm docs:status`      | pokrytí popisy exportů po balíčcích / sekce vyprávění s TODO (viz docs/DOCS-PROCES.md)                             |

Integrační testy používají databázi `rebar_test`; paralelní běhy oddělí `REBAR_TEST_DB_NAME=jiny_nazev pnpm test`.

## Struktura

```
apps/web/                 Next.js aplikace (shell, routing, skládá moduly)
packages/core/            platforma: konfigurace, moduly, DB, auth + 2FA, oprávnění, audit, soubory, fronta, e-mail, health (viz ADR 007–009)
packages/ui/              design system a data-driven UI (tabulka, kanban, detail záznamu)
packages/modules/<id>/    kontakty · zakazky · poptavky · dochazka · kalendar (stav po rozběhu; další moduly podle docs/opsys/D-plan-a-kontrakty.md)
clients/_template/        šablona klienta (vždy platná)
clients/<slug>/           config.ts · branding/ · seed/ · extensions/
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

## Nový klient

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
- Modul nesmí importovat jiný modul; spolupráce jde přes poskytovatele, sloty a události ([ADR 006](docs/adr/006-vrstvy-balicku.md)).
- Oprávnění se kontrolují v datové vrstvě, ne jen v UI ([ADR 007](docs/adr/007-opravneni-v-datove-vrstve.md)).
- Migrace jsou jen dopředné a zpětně kompatibilní.
- Conventional Commits (`feat(zakazky): …`), jedna logická změna na commit; změny zapisuj do [CHANGELOG.md](CHANGELOG.md).
- Tajné klíče nikdy do repozitáře; v repu je jen `.env.example`.
