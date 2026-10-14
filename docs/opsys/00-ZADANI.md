# OPSYS — společné zadání pro všechny agenty (čti jako první)

> Interní systém agentury OP Digital pro Ondřeje (vlastník) a Patrika (partner). Název systému **OPSYS** (ve starých specifikacích „OPSIS“ — v kódu, UI a dokumentaci používej OPSYS).
> Staví se **ze stávajícího jádra Rebar** (Next.js + Drizzle + PostgreSQL, pnpm monorepo). Systém se nestaví od nuly a nemění se jeho architektura: co spec nechce, se odstraní, co chce, se v jádru postaví podle jeho vzorů.

## Zdroje a pořadí autority

| Soubor | Co to je |
|---|---|
| `docs/specifikace/00-logicka-specifikace-funkci.md` | **hlavní autorita** (2026-10-13), logika všech funkcí a fáze MVP/v2/v3 |
| `docs/specifikace/13-funkcni-specifikace.md`, `12-datovy-model.md` | starší, podrobnější (obrazovky, tabulky); platí, co neodporuje 00 |
| `docs/specifikace/11-architektura-tech-stack.md`, `10-…`, `14-design-system.md` | **architektura a stack z nich NEPLATÍ** (Vite/Hono se nepoužije). Design: platí design system jádra (`packages/ui`) |
| `docs/opsys/A-core-inventura.md` | jak se staví modul, co jádro umí, kde jsou sdílená místa |
| `docs/opsys/B-audit-modulu.md` | co z modulů původního jádra odstranit / přepracovat / znovupoužít |
| `docs/opsys/C-digest-specifikace.md` | **246 číslovaných požadavků (ID), rozpory R-xx s rozhodnutími „PŘEDPOKLAD“, doménový model, akceptační scénáře AS-xx** |
| `docs/opsys/D-plan-a-kontrakty.md` | plán modulů, vlastnictví souborů, veřejná API mezi moduly, události (vznikne po těchto analýzách; je závazný) |
| `../system-core/` (sourozenecká složka) a git commit `b709d86` | **původní, nezměněné jádro** — zdroj kódu k znovupoužití (`git show b709d86:cesta`). Do `../system-core` nikdy nezapisuj |

Při rozporu: 00 → D → 13 → 12 → C → A/B. Rozpor nahlas v reportu, netipuj; kde C uvádí PŘEDPOKLAD, platí.

## Rozhodnutí (platí pro všechny)

1. **Nic není nasazeno** → migrace se mohou přepisovat; každý modul smí svůj `drizzle` adresář zahodit a vygenerovat znovu (`db:generate`), pokud je jeho vlastníkem. Na konci se vše zkontroluje na čisté DB.
2. **Žádné notifikace** (e-mail, push, Telegram, zvonek) — spec je výslovně nechce. Moduly neregistrují události upozornění. Upozornění jsou jen vizuální (odznaky u položek menu, červené řádky). Platformní kód push/notifikací se nemaže, jen se nepoužívá.
3. **Jazyk:** UI, dokumentace a komentáře česky; identifikátory v kódu podle konvence jádra (anglicky nebo česky stejně jako okolí). Řídí se `eslint`/`prettier` jádra.
4. **Obor balíčků zůstává `@rebar/*`** (aby šly změny z core přebírat). Viditelný název systému je `branding.name = "OPSYS"` v `clients/opsys/config.ts`. V UI, e-mailech, PDF, URL ani chybách se nikdy neukazuje „rebar“.
5. **Klient `opsys`** (`clients/opsys`) nahrazuje `clients/demo` (demo data stavební firmy se do OPSYS nepřebírají). Nasazuje se jedna instance pro OP Digital.
6. **Peníze** jako minor units + měna `CZK`. Nikdo není plátce DPH → žádné DPH v logice.
7. **Soukromé záznamy** (`is_private`, zámek) — vlastník Ondřej vidí vše, Patrik nikdy nic soukromého (seznamy, hledání, kalendář, přehled, historie změn, součty, počty, exporty, webhooky). Vynucuje se **centrálně v jádru** (engine scope), ne ručně v modulech. Co patří pod soukromý záznam (úkoly, poznámky, platby, hodiny soukromé zakázky), je soukromé automaticky.
8. **Automatizace** (Google Disk, Meta leady, e-maily) jdou přes **n8n webhooky**; OPSYS jen posílá události ven a přijímá příchozí požadavky. Skutečné napojení na Google/Meta/ARES/Fakturoid se píše jako adaptér s rozhraním + **stub/fake pro testy**; reálné klíče se nikdy neukládají do repa (viz `.env.example`, nastavení se šifrovanými tajemstvími).
9. Nestav nic, co je ve spec v sekci „Co OPSIS nedělá“ (Leads Inbox, builder automatizací, sync Gmailu, auto follow-upy, notifikace, vystavování faktur — kromě v3 Fakturoid —, import dat, ukládání hesel klientů, generátor nabídek, Asana).

## Pravidla práce paralelních agentů (sdílený pracovní strom!)

- Všichni agenti pracují **ve stejné složce** `systemy/interni-system-opdigital`. Proto: **vlastníš jen soubory, které ti D přidělí** (typicky `packages/modules/<tvůj-modul>/**` + trasy `apps/web/src/app/**/<tvůj-modul>`, tvé testy a `docs/moduly/<tvůj-modul>.md`). Cizí soubory nepřepisuj. Sdílené soubory (registry, navigace, `pnpm-lock.yaml`, `docs/reference/**`) po předpřípravě **nemění nikdo** kromě integrátora; potřebuješ-li změnu, napiš ji do `docs/opsys/ZADOSTI.md` (jeden řádek: kdo → komu → co).
- **Nikdy nespouštěj `git commit/push/checkout/stash/reset/clean`** — commity dělá jen koordinátor. `git status`/`git diff` smíš (v pracovním stromu jsou i cizí změny).
- **Neinstaluj závislosti** (`pnpm add/install`) sám; potřebuješ-li knihovnu, zapiš ji do `docs/opsys/ZADOSTI.md`. (Výjimka: agent pověřený přípravou a integrací.)
- Kontroly **jen na svém balíčku**: `pnpm --filter @rebar/<modul> typecheck`, `pnpm exec vitest run <cesta>`, `pnpm exec eslint <cesta>`. Celý `pnpm check` neřeš (fakticky padá kvůli rozpracovaným cizím modulům) — pustí ho integrátor. `docs:generate` / `docs:refresh` nepouštěj.
- Databáze pro testy: lokální PostgreSQL clusteru OPSYS (port **5434**, data `~/.local/share/opsys-pg17`) přes `REBAR_PG_PORT=5434 REBAR_PG_DATA=$HOME/.local/share/opsys-pg17 sh scripts/dev-db.sh up`; `.env.local` je nastavený na ni. **Nikdy nesahej na port 5433** (cluster původního jádra).
- Každý soubor integračních testů má vlastní DB (kopie šablony) — můžeš testy pouštět paralelně s ostatními.
- Pravidla jádra, která zastaví build, když je zapomeneš: záznam každého příkazu v `tests/support/security-probes.ts`, veřejné trasy v `tests/security-static.test.ts` (`PUBLIC`), `docs/moduly/<id>.md` pro každý modul. (Detaily v A §5.)
- Piš **testy ke každé pravidlové logice** (čisté funkce nejdřív: rozdělení plateb, saldo, hnití, ARES parser, normalizace telefonu, parsování rychlého úkolu…) a **e2e** (Playwright) pro hlavní tok modulu.
- Po dokončení: aktualizuj `docs/moduly/<id>.md` (co modul dělá, stavy, pravidla, omezení), a vrať report ≤ 30 řádků: co je hotovo (po ID požadavků z C), co **není** hotovo a proč, co jsi předpokládal, žádosti pro ostatní, jak ověřit.
- Žádné tajné hodnoty v kódu ani v reportu.
- Definice „hotovo“: všechny požadavky tvého modulu s fází MVP/v2/v3 jsou implementované **včetně UI**, mají testy, `typecheck` + `eslint` tvého balíčku jsou zelené a modul se dá zapnout v `clients/opsys/config.ts` a otevřít v aplikaci.

## Doplněk pro vlny stavby modulů (po S1, tag `opsys-s1`)

- **Stav:** kostra (S0), schémata a entity všech modulů + migrace jádra `0013_opsys` (S1) a čistá logika plateb (`finance/src/logic`, FIN-A) jsou hotové. Moduly mají schéma, entity a manifest; **logika, příkazy, UI, trasy a testy jsou na tobě**. Schéma, které ti S1 založil, je kontrakt: **přidávat sloupce a tabulky smíš (jen ty jako vlastník modulu, vlastní migrace přegeneruj `pnpm --filter @rebar/<id> db:generate`), přejmenovat a mazat to, na co se odkazují jiné moduly, ne.** Odchylky od D, které S1 udělal, jsou v `docs/opsys/E-rozbehovy-log.md` (sekce S1) — přečti.
- **Starý kód k znovupoužití:** `packages/_donor/{poptavky,dochazka,kalendar,zakazky,kontakty}` (mimo workspace, jen čtení a kopírování do svého modulu) a `../system-core`. Původní kód uprav na nová jména/entity, nekopíruj slepě (stavební logika odpadá).
- **Soukromí:** dokud C1 nedodá engine, `visibility` na entitách je jen typ; piš kód tak, aby volal `privateScope`/`setVisibility`/`assertAssignable` z D §5.1 (pokud ještě neexistují, použij `no-op` z kontraktů). Dotazy mimo registr entit (widgety, metriky, služby, vrstvy, `ClientTabProvider`) musí viditelnost respektovat sám (D §5.4).
- **Značky připravenosti** (koordinátor sleduje soubory a podle nich spouští navazující agenty): jakmile máš hotové `src/contract.ts` (zod vstupy/výstupy příkazů) + `src/api.ts` + stub příkazy/služby, které půjdou volat z jiných modulů („M1“ — dělej to **jako první, brzy**), vytvoř prázdný soubor `docs/opsys/ready/<tvé-ID>-M1` (např. `ZAK-A-M1`). Při úplném dokončení vytvoř `docs/opsys/ready/<tvé-ID>-DONE`.
- **Sdílený strom, souběžní agenti:** kontroluj jen svůj balíček (`pnpm --filter @rebar/<id> typecheck`, `pnpm exec vitest run <tvé cesty>`, `pnpm exec eslint <tvé cesty>`, `pnpm exec prettier --check <tvé cesty>`). Když typecheck padá kvůli cizímu rozpracovanému kódu, ověř, že je to cizí příčina, a pokračuj. Nikdy cizí kód neopravuj; zapiš žádost do `docs/opsys/ZADOSTI.md`. Souběžně se v DB (cluster 5434) spouští testy dalších agentů — používej `REBAR_TEST_DB_NAME` nebo výchozí per-file DB jádra, nikdy `db:reset` (smazalo by DB ostatním) a nespouštěj dev server na portu jiném než přiděleném (`PORT=3<10..49>` podle pořadí v D §4: C1=3110 … zvol port odvozený od svého ID, např. součet ASCII kódů mod 80 + 3100) a po práci ho ukonči.
- **Hotovo = i UI a e2e.** Tvoje vlastní e2e spec(y) napiš (`apps/web/e2e/<modul>*.spec.ts`), ale Playwright pouštěj jen pokud je to rozumně rychlé a samostatné; jinak označ v reportu „napsáno, neběželo“. Neprodukuj falešné „zelené“.
- **Report** (≤ 30 řádků): hotová ID požadavků, nehotová + proč, PŘEDPOKLADY, žádosti pro ostatní (už zapsané v ZADOSTI), jak ověřit, soubory mimo tvoje přidělené cesty, které jsi musel změnit.
