# Výkon

Cílový stroj je VPS s **1 vCPU / 4 GB RAM** (zadání §8). Tento dokument říká, co je změřené, jak se to měří a **co se lokálně ověřit nedá**.

## Cíle

| Cíl                                              | Rozpočet na serveru                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Seznam s 50 řádky se načte do 1 s                | dotaz + oprávnění + odpověď do **300 ms** (zbytek je síť a vykreslení)  |
| Interakce v tabulce do 100 ms                    | inline úprava, řazení, filtr: serverová část do 100 ms, UI optimistické |
| LCP přihlášené stránky pod 1,5 s na cílovém VPS  | měří se Lighthouse na VPS (níže)                                        |
| Aplikace + PostgreSQL + worker do cca 2,5 GB RAM | `mem_limit` v `deploy/docker-compose.yml`, měření RSS níže              |

## Skript `pnpm perf:check`

`scripts/perf-check.ts` vytvoří samostatnou databázi **`rebar_perf`** (nikdy ne vývojovou ani testovací), nasype syntetická data
a změří serverové latence. Skončí s kódem 1, když některé měření překročí rozpočet nebo počet dotazů.

```sh
pnpm db:up                       # lokální PostgreSQL (port 5433)
pnpm perf:check --reset          # zahodí a znovu nasype (~10 s), pak změří
pnpm perf:check                  # jen měření (data už jsou)
pnpm perf:check --explain        # + EXPLAIN ANALYZE dotazů nad 5 ms a sekvenční čtení velkých tabulek
pnpm perf:check --queries        # vypíše dotazy každého měření (hledání N+1)
pnpm perf:check --runs=30 --scale=0.5 --json
```

**Syntetická data (měřítko 1):** 20 000 zakázek, 30 000 firem a 20 000 osob (dohromady 50 000), 100 000 řádků docházky,
52 000 nákladů, 20 000 vydaných a 10 000 přijatých faktur, 5 000 skladových karet, 20 000 upozornění, 100 000 auditních záznamů,
index hledání Cmd+K (70 000 dokumentů), rozpočty 300 zakázek a jedna velká zakázka s **1 000 položkami v 10 oddílech** a 2 000 náklady.
Sype se přes `generate_series` pod uživatelem migrací, takže je to rychlé.

**Měří se** (po třech zahřívacích průchodech, 15 opakování, p50 / p95): seznam 50 řádků se součty, filtr + řazení, hledání bez diakritiky,
seskupení, seznam v rozsahu „jen moje“ (mistr), seznam firem a osob, faktury, docházka, souhrn velké zakázky, strom rozpočtu,
náklady zakázky, Přehled (majitel i mistr), Cmd+K, upozornění, měsíční přehled docházky.

### Naměřeno lokálně (MacBook, Apple Silicon, PostgreSQL 17 bez Dockeru)

Měření č. 1 v klidu stroje, p95 v ms, dotazů na jednu operaci:

| Měření                                        |  p50 |  p95 | rozpočet | dotazů |
| --------------------------------------------- | ---: | ---: | -------: | -----: |
| zakázky: seznam 50 řádků + součty             |  4,0 |  7,7 |      300 |      4 |
| zakázky: filtr fáze + řazení podle nákladů    |  7,3 |  9,2 |      300 |      4 |
| zakázky: hledání bez diakritiky               |  6,4 |  8,4 |      300 |      4 |
| zakázky: seskupení podle stavu se součty      |  4,7 |  6,2 |      300 |      1 |
| zakázky: seznam mistra („jen moje“)           |  3,3 |  4,2 |      300 |      4 |
| firmy: seznam 50 řádků                        |  1,9 |  2,3 |      300 |      2 |
| firmy: hledání („novak“)                      |  4,6 |  5,3 |      300 |      2 |
| osoby: seznam 50 řádků                        |  1,6 |  2,7 |      300 |      3 |
| faktury: seznam 50 řádků + součty             |  4,1 | 11,2 |      300 |      4 |
| docházka: seznam 50 řádků                     |  8,6 | 11,5 |      300 |      4 |
| velká zakázka: souhrn (ekonomika)             | 15,2 | 16,5 |      500 |     18 |
| velká zakázka: strom rozpočtu (1 000 položek) | 16,0 | 22,1 |      500 |      9 |
| velká zakázka: náklady (2 000 řádků)          | 20,9 | 29,8 |      500 |     13 |
| Přehled (pozornost + dlaždice), majitel       | 63,1 | 78,2 |      800 |     58 |
| Přehled, mistr                                | 19,6 | 34,4 |      800 |     32 |
| Cmd+K hledání napříč entitami                 | 17,2 | 18,8 |      300 |      2 |
| upozornění: nepřečtené + seznam               |  3,3 |  3,8 |      150 |      2 |
| docházka: měsíční přehled všech lidí          |  9,4 | 10,8 |      500 |      4 |

Měření č. 2, **produkční build** (Next standalone), HTTP z příkazové řádky, čtyři souběžní uživatelé na 20 000 zakázkách, 40 s, stroj vytížený
jinými úlohami (load average 5–17): seznam zakázek p50 26 / p95 87 ms, souhrn velké zakázky 49 / 95 ms, strom rozpočtu 53 / 111 ms, Cmd+K 23 / 54 ms,
seskupení 19 / 46 ms, stránka (HTML) 32 / 81 ms; 60 požadavků za sekundu, 0 chyb. Hledání ve firmách mělo v tomto buildu p50 223 ms
(build vznikl **před** opravou hledání níže; na serveru je teď p50 5 ms).

### Co měření našlo a co se opravilo

- **Hledání v tabulce nepoužívalo trigramové indexy.** Dotaz obaloval sloupec do `coalesce(…, '')`, index `lower(f_unaccent(name))` ho proto
  nikdy nevyužil, takže každé hledání bylo sekvenční čtení tabulky (firmy: 140 ms p50, zakázky 48 ms při 20–30 tisících řádků, úměrně víc na VPS).
  Engine (`packages/core/src/entities/engine.ts`, `whereOf`) teď porovnává `lower(f_unaccent(sloupec))` bez `coalesce` (NULL nic nenajde,
  význam hledání je stejný). Migrace `*_trgm_hledani` přidaly trigramové indexy na ostatní prohledávané textové sloupce velkých tabulek
  (firmy, osoby, zakázky, faktury, přijaté faktury, sklad, poznámka docházky). Výsledek: firmy 140 → 5 ms, zakázky 48 → 6 ms.
- **N+1 ve frontě schvalování:** popis čekajících objednávek a přijatých faktur četl záznamy po jednom; teď jedním dotazem (`inArray`).
- **Bundle:** manifesty modulů importovaly kořen `@rebar/core`, který táhne validaci konfigurace (zod, asi 90 kB gzip) do JavaScriptu každé stránky.
  Moduly teď importují lehký vstup `@rebar/core/manifest`; test `tests/modules.test.ts` to hlídá. Kalendář pro výběr data
  (`react-day-picker` + čeština z `date-fns`) se načítá líně až při prvním otevření.
- **Paměť aplikace:** bez omezení haldy rostla RSS aplikace při zátěži na 735–925 MB, s `NODE_OPTIONS=--max-old-space-size=640` zůstala na 380–460 MB
  při stejné propustnosti. V `docker-compose.yml` má `app` nově `command: node --max-old-space-size=640 …` (limit kontejneru je 1 GB).

### Žádné N+1 (test)

`tests/query-count.int.test.ts` měří počet SQL dotazů operace nad malým a pak nad velkým množstvím dat (+120 zakázek, +300 položek rozpočtu,
+300 nákladů) a vyžaduje, aby se **počet dotazů nezměnil**: seznam entity (50 řádků, součty, seskupení, rozsah „jen moje“, hledání, Cmd+K),
Přehled majitele i mistra, strom rozpočtu, souhrn, náklady, objednávky a změny zakázky. Nový příkaz s dotazem ve smyčce přes řádky tak test shodí.
Smyčky `await` s dotazem, které v kódu zůstaly, jsou zápisy (dávky do ~500 řádků), seed a úlohy na pozadí.

## Paměť (změřeno lokálně, produkční build)

| Proces                                                       | RSS                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| aplikace (Next standalone), klid po startu                   | 270 MB                                                                         |
| aplikace při zátěži (4 souběžní, 40–70 s), bez omezení haldy | 735 až 925 MB                                                                  |
| aplikace při zátěži, `--max-old-space-size=640`              | 380 až 460 MB                                                                  |
| worker (`tsx scripts/worker.ts`)                             | 96 až 150 MB                                                                   |
| PostgreSQL 17 (lokální výchozí nastavení, 16 spojení)        | postmaster ~4 MB, backend 5 až 40 MB (součet RSS je zkreslený sdílenou pamětí) |

Rozpočet v `deploy/docker-compose.yml`: caddy 128 MB, app 1 GB, worker 512 MB, postgres 1,25 GB (`shared_buffers` 512 MB), backup 256 MB, beszel 64 MB.
Při běžném provozu (aplikace s omezenou haldou, worker, databáze s 512 MB sdílené paměti) vychází reálná spotřeba kolem **1,5 až 2 GB**, tedy pod cílem 2,5 GB.
Skutečný součet se musí změřit na VPS (viz níže).

## Bundle JavaScriptu

`node scripts/bundle-report.mjs` (po produkčním buildu) vypíše velikost JS z `apps/web/.next/static`; rozpočet 700 kB gzip (CI ho hlídá).
Stav před úsporou: 616 kB gzip v 40 souborech; největší jsou sdílený chunk se zodem (178 kB), chunk s komponentami (radix, cmdk, sonner; 177 kB) a React DOM (70 kB).
Po přechodu na `@rebar/core/manifest` a línému kalendáři má produkční build 42 souborů a **553,4 kB gzip** (1813,6 kB surově), tedy o 63 kB méně než dřív (616,4 kB). Rozpočet je 700 kB.
Další kandidáti, kdyby rozpočet tlačil: `qrcode` (jen nastavení 2FA, je to samostatná trasa), `@dnd-kit` (tabulka i kanban ho potřebují, zůstává).

## Jak změřit cíle na cílovém VPS

Lokálně se cíle **nedají ověřit**: stroj má řádově rychlejší procesor a disk než 1 vCPU VPS. Po prvním nasazení se musí změřit:

1. **Serverové latence** (v kontejneru aplikace, proti skutečné databázi; nic se nesype):
   ```sh
   docker compose exec app sh -c 'DATABASE_URL=$DATABASE_URL node_modules/.bin/tsx scripts/perf-check.ts --measure-only --runs=30'
   ```
   Měří se nad daty, která na instanci jsou (u nové instance jsou skoro prázdná). Pro zátěžovou zkoušku na VPS dočasně vytvořte
   druhou databázi `rebar_perf` (`CREATE DATABASE`, migrace `pnpm db:migrate` s `DATABASE_MIGRATE_URL`) a pusťte `pnpm perf:check --reset`
   s `PERF_DB_HOST=postgres:5432 PERF_ADMIN_URL=… PERF_MIGRATE_URL=…`; po zkoušce ji zahoďte.
2. **LCP přihlášené stránky** (Lighthouse z jiného počítače, přihlašovací cookie z prohlížeče):
   ```sh
   npx lighthouse https://system.klient.cz/zakazky --only-categories=performance --form-factor=desktop \
     --throttling-method=devtools --extra-headers '{"Cookie":"better-auth.session_token=…"}' \
     --chrome-flags="--headless" --output=json --output-path=lcp.json
   ```
   Cíl: LCP pod 1,5 s, TBT pod 200 ms; opakovat třikrát a brát medián. Stejně pro `/`, detail zakázky a kanban.
3. **Paměť** (po hodině běžného používání): `docker stats --no-stream` a `free -m`; součet `app + worker + postgres + caddy` do 2,5 GB.
   Při překročení nastavit `NODE_OPTIONS=--max-old-space-size=…` pro `app` a snížit `shared_buffers`.
4. **Zátěž tabulky:** `pnpm perf:check` s `--scale=0.2` na VPS (4 000 zakázek) je reálnější než 20 000; sledovat p95 proti rozpočtům v tabulce výše
   vynásobeným tipovaným poměrem výkonu (1 vCPU VPS bývá 3 až 6× pomalejší než vývojový stroj).

## Omezení měření (upřímně)

- Žádné číslo výše není z cílového stroje. Odhad: serverové p95 vyjde na VPS 3 až 6× víc než lokálně, tedy seznamy do ~50 ms, hledání do ~40 ms,
  Přehled majitele do ~400 ms; to ještě splňuje cíl 1 s, ale **je to odhad**, ne měření.
- Měří se server, ne prohlížeč: LCP, vykreslení tabulky, interakce do 100 ms a velikost přenesených dat se na VPS musí změřit Lighthouse
  a ručně (zátěžové zkoušky s vykreslením v prohlížeči se lokálně nedělaly).
- Lokální PostgreSQL má jiné nastavení než `deploy/postgres/postgresql.conf` (menší `shared_buffers`, bez Dockeru); disk VPS může být výrazně pomalejší
  u dotazů, které nejsou v paměti (první průchody po restartu).
- Zátěž byla čtyři souběžní uživatelé; konkurenci desítek uživatelů najednou na 1 vCPU je potřeba ověřit (propustnost výše je ~60 požadavků za sekundu na stroji s vysokým vytížením).
- Přenos po síti a komprese (Caddy: zstd/gzip) se nezapočítávají.
- Úloha `zakazky.summary.refresh` (denní přepočet souhrnů všech zakázek) se při 20 000 zakázkách na VPS musí změřit zvlášť (běží ve workeru, nezdržuje uživatele).

## Pravidla pro vývojáře

- Data načítej na serveru po stránkách (`limit` ≤ 200), nikdy celou tabulku; součty a seskupení v SQL.
- Dotaz ve smyčce přes řádky je chyba; použij `inArray`, spojení (`join`) nebo jeden agregační dotaz a doplň případ do `tests/query-count.int.test.ts`.
- Nový filtrovaný nebo řazený sloupec na velké tabulce = index (B-tree; u textového hledání trigramový `lower(f_unaccent(sloupec))` bez `coalesce`).
- Těžká knihovna na klientu (graf, editor, PDF) patří za `React.lazy` / `dynamic import`; manifesty modulů a UI modulů nesmí importovat `@rebar/core` ani `zod`.
- Před sloučením většího zásahu do dotazů pusť `pnpm perf:check`.
