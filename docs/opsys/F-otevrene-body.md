# OPSYS: F: otevřené body po integraci

Stav k 2026-10-15, napsal agent INT. Co zbývá po triáži `ZADOSTI.md`, co se neověřovalo a co má potvrdit vlastník. Žádná tajemství.

## 1. Odložené položky

Odkazy `F-n` jsou i v `ZADOSTI.md` (sloupec Co, „ODLOŽENO (INT)“).

| ID | Co | Proč odloženo | Kde |
| --- | --- | --- | --- |
| F-1 | Doménové události `contact.merged`, `lead.received`/`lead.failed`, `settlement.created/canceled`, `calendar.*` a služby `contacts.findByEmails`, `tasks.applyCalendarTimes`/`attendeeEmails` | Není to malá úprava: každá událost potřebuje emitenta, handlery (obchody a klienti po sloučení kontaktů) a testy, služby mění kontrakty (`contracts/`). Nic v MVP je nepotřebuje: lead je vidět jako `deal.created` a v `inbound_event`, kalendář čte data za rozhraními | `packages/core/src/contracts/{events,services}.ts` |
| F-2 | Hook `ModuleUi.createForm` (ARES a kontrola podobného názvu v generickém „Nový“) | Kontakty mají vlastní stránky `/kontakty/firmy/nova` a `/kontakty/osoby/novy` | `packages/ui/src/data/module-ui.tsx` |
| F-3 | Hook `recordTabFilter` pro skrývání prázdných záložek klienta | Dočasně to dělá `klienti/src/ui/hide-tabs.tsx` úpravou DOM (křehké, ale funguje) | `klienti`, `packages/ui` |
| F-4 | Předvyplnění klienta z `?klient=<id>` v „Nová zakázka“ a „Nový obchod“ (z karty klienta) | Dialog se otevře prázdný; je to ruční výběr klienta navíc | `zakazky/src/ui`, `obchody/src/ui/board-page.tsx` |
| F-5 | `Avatar` se zkratkou jména a barvou uživatele (`short_name`, `avatar_color`) | Kosmetika; pro Nastavení je hotová `apps/web/src/components/user-avatar.tsx` | `packages/ui` |
| F-6 | `ClientTabProvider` bez parametru `deps` | Disk kvůli soukromí čte tabulku `company` přímo; změna kontraktu | `contracts/client-card.ts`, `disk/src/contributions.ts` |
| F-7 | Přepsání seznamu entity z modulu (`ModuleUi.entityList`) | Obchody používají statickou trasu `/obchody`, která funguje | `apps/web/src/app/(app)/obchody` |
| F-8 | Widget Příjmy tento měsíc: vystaveno a plánováno (metriky `finance.income_issued`, `finance.income_planned`) | Zobrazuje se jen zaplaceno; vyžaduje metriky ve financích a úpravu `prehled/src/presets.ts` | `finance`, `prehled` |
| F-9 | Týdenní (NFR-12) místo měsíční zkoušky obnovy | Rozhodnutí vlastníka, viz §3 | `deploy/scripts/backup-tool.sh`, `core/health/health.ts` |
| F-10 | Lead z Meta se páruje se soukromou firmou nebo osobou a vzniká sdílený obchod pod soukromým záznamem | Rozhodnutí vlastníka, viz §3 | `reklama/src/meta/ingest.ts`, `kontakty/api` |
| F-11 | Mobil 375 px: Nový kontakt (stlačená pole, UUID organizace), filtry a záložky úkolů, týden hodin jako karty, skrýt nápovědu klávesy C, „Přidat šablona e-mailu“ (akuzativ štítku entity), dotykové cíle pod 44 px | Vylepšení použitelnosti, ne chyby funkce; nutné ověřit na zařízení | `docs/MOBIL.md`, moduly `kontakty`, `ukoly`, `hodiny`, `zakazky`, `sablony-emailu` |
| F-12 | e2e kalendáře s `fake-google` (`playwright.kalendar.config.ts`) zapojit do CI | e2e se v tomto kole nespouštělo | `.github/workflows/ci.yml`, `apps/web/e2e/kalendar.spec.ts` |
| F-13 | Zbylé crawl specifikace v `apps/web/e2e-crawl` (kromě `routes.crawl.spec.ts`) a e2e specifikace v `apps/web/e2e` | Pocházejí z původního jádra nebo od modulových agentů a nikdo je v OPSYS neověřil; viz §2 | `apps/web/e2e*` |
| F-14 | Squash migrací do jednoho `0000_init` na balíček | Záměrně neprovedeno (riziko ručního SQL v jádru); nic není nasazeno, takže to jde před prvním nasazením. Na čisté databázi všechny migrace projdou a `drizzle-kit generate` nehlásí změny v žádném balíčku | `packages/core/drizzle`, `packages/modules/*/drizzle` |
| F-15 | Stránky a kód DPH (`/nastaveni/dph`, `VatRatesProvider`, tabulka `vat_rate`, `core/config-data/vat.ts`) a stránky pravidel upozornění zůstaly v jádru | Nejsou v nabídce Nastavení a seed sazby nezakládá; smazání je zbytečné riziko pro přebírání změn z jádra | `apps/web/src/app/(app)/nastaveni/{dph,pravidla-upozorneni,upozorneni}` |
| F-16 | `finance/src/data/settlements.ts` (`sql.raw`) | Posuzuje QA-SEC | `finance` |

## 2. Neověřeno (v tomto kole se nespouštělo)

- **Playwright e2e** (`apps/web/e2e/*.spec.ts`, AS-01 až AS-15, mobil): nespuštěno. Opravený je jen `auth.setup.ts` (po 2FA se čeká na `/prehled`), `global-setup.ts` (třetí účet `E2E_2FA_*`), `playwright.config.ts` (`FAKTUROID_MODE=fake`, užší `testMatch` projektu `setup`) a titulek v `smoke.spec.ts`. Specifikace modulů mohou obsahovat staré texty nebo předpoklady.
- **Procházení navigace** proběhlo: čistá databáze, `db:migrate`, `db:seed`, `dev:seed`, `pnpm build`, produkční server (standalone) a nový test `apps/web/e2e-crawl/routes.crawl.spec.ts` (vlastník i partner, každá položka postranního panelu a Nastavení bez 404, 5xx a výjimek). Ručně navíc detaily záznamů (firma, osoba, obchod, zakázky, platba, úkol, poznámka, šablona zakázky, hosting). Partner vidí 404 jen u stránek, na které nemá oprávnění (Můj prostor, administrace Nastavení), a ty se mu v nabídce nezobrazují.
- **Docker, `docker-compose.yml`, Caddy**: image se nestavěl, `caddy validate` neběželo; kontrola je jen testy nad textem souborů.
- **Reálné integrace** (Google Disk přes n8n, Google Kalendář OAuth, Meta Ads a Lead Ads, ARES, Fakturoid): neověřeno, v testech jsou falešní klienti. Šablony `deploy/n8n/*.json` nebyly naimportovány do živého n8n.
- **Záloha a obnova** (restic, zkouška obnovy) na serveru; PWA a mobilní vzhled na skutečných zařízeních; `pnpm perf:check` (cíle Cmd+K p95 ≤ 150 ms, seznam p95 ≤ 120 ms).
- **`pnpm check:fresh`** (skript `scripts/fresh-instance-check.sh`) byl přepsán na `dev:seed` a nový crawl a jednou proběhl (průchod bez klíčů VAPID); průchod s VAPID neběžel.
- Výsledek v logu serveru při crawlu: jedna `Error: aborted` (zrušený požadavek při přechodu stránky), jinak čisto.

## 3. Rozhodnutí, která má potvrdit vlastník

1. **Zmínka v komentáři** (`comment.mention`, platforma upozornění v jádru): spec chce „žádné notifikace“, proto je událost v `clients/opsys/config.ts` vypnutá (`enabled: false`). Alternativa: celý kód notifikací z jádra smazat (zvonek, push, předvolby). Ponechání je bezpečnější pro přebírání změn z jádra.
2. **2FA pro všechny** (`twoFactorPolicy: "all"`): platí i pro vývojové účty; přepínač `dev:seed --no-2fa` byl zrušen (jen varování), 2FA nejde vypnout ani lokálně; vývojář projde nastavením TOTP (automaticky `e2e-crawl/login.ts`). Relace trvá 30 dní s prodlužováním (strop 90), pozvánka 48 h.
3. **Lead z Meta se soukromou organizací** (F-10): nepárovat na soukromé záznamy, nebo obchod založit soukromý?
4. **Zkouška obnovy** týdně (NFR-12) nebo měsíčně (implementováno, výchozí 1. den v 04:30; starší než 45 dní = stav `degraded`)?
5. **Squash migrací před prvním nasazením** (F-14): doporučení udělat ho jednou, těsně před nasazením, a hned ověřit čistou databázi i `pnpm check:fresh`.
6. **Meta bez OAuth:** napojení je dlouhodobý token systémového uživatele Business Manageru (zadává se v Nastavení → Integrace → Meta); OAuth přesměrování se nestavělo. Je to záměr?
7. **Čištění zbytků jádra** (F-15): smazat DPH a pravidla upozornění z `apps/web`, nebo nechat?
8. **Role `external`** (externí spolupracovník) nemá žádné oprávnění ani uživatele; majitel je přidělí podle potřeby.
9. **Vývojová data** (`pnpm dev:seed`) jsou fiktivní a běží jen na lokální databázi; jejich výchozí uživatelé a hesla jsou v gitignorovaném `.data/dev-credentials-<databáze>.txt`.
