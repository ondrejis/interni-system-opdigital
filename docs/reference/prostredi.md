# Proměnné prostředí a konfigurace

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (validační schéma `envSchema` (`apps/web/src/server/env.ts`), `clientConfigSchema`, `.env.example` a použití `process.env` ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Proměnné prostředí nastavují instanci (databáze, adresa, tajemství); konfigurace klienta (`clients/<slug>/config.ts`) určuje moduly, branding a zabezpečení. Postup nasazení je v [DEPLOYMENT](../DEPLOYMENT.md), vzor v `.env.example`.

## Proměnné prostředí aplikace

Ověřuje je `loadEnv` při startu; špatné nastavení aplikaci nenastartuje a vypíše všechny chyby. „Povinná“ znamená, že schéma odmítne chybějící hodnotu. Podmínky, které závisejí na kombinaci proměnných nebo na produkčním režimu, kontroluje navíc samotná funkce `loadEnv` (viz `apps/web/src/server/env.ts`).

| Proměnná | Typ | Povinná | Hodnoty | Výchozí | Omezení | Popis |
| --- | --- | --- | --- | --- | --- | --- |
| `APP_ALLOW_HTTP` | ano/ne | ne |  | `false` |  | Jen pro automatické testy: povolí http:// v produkčním režimu. V provozu se nikdy nenastavuje. |
| `APP_ENCRYPTION_KEY` | text | ne |  |  |  | Šifrování tajných nastavení v DB (heslo SMTP…). Přesně 32 bajtů v base64. Rotace: APP_ENCRYPTION_KEYS="2:&lt;nový&gt;,1:&lt;starý&gt;" |
| `APP_ENCRYPTION_KEYS` | text | ne |  |  |  |  |
| `APP_URL` | url | ano |  |  |  | Veřejná adresa aplikace (odkazy v e-mailech, kontrola původu požadavků). |
| `APP_VERSION` | text | ne |  | `0.0.0-dev` |  |  |
| `AUTH_SECRET` | text | ano |  |  | alespoň 32 znaků | Tajemství, unikátní pro každou instanci (openssl rand -base64 32) |
| `BACKUP_STATUS_FILE` | text | ne |  |  |  |  |
| `DATABASE_URL` | text | ano |  |  | vzor `^postgres(ql)?:\/\/` | Připojení pod uživatelem s minimálními právy (bez DDL). |
| `FILES_DIR` | text | ne |  | `./.data/files` |  | Úložiště souborů (mimo veřejnou složku) a stav zálohy zapisovaný zálohovacím skriptem. Ve vývoji použijte ABSOLUTNÍ cestu (např. /cesta/k/repu/.data/files): web běží v apps/web a worker/seed v kořeni repa, relativní cesta by tak mířila do dvou různých složek (worker pak nenajde nahrané fotky a nevytvoří náhledy). |
| `HEALTH_TOKEN` | text | ne |  |  | alespoň 16 znaků | Token pro GET /api/health (alespoň 16 znaků) a adresa heartbeatu agentury (volitelné) |
| `HEARTBEAT_URL` | url | ne |  |  |  |  |
| `NODE_ENV` | enum | ne | `development`, `test`, `production` | `development` |  |  |
| `SENTRY_DSN` | url | ne |  |  |  | Error tracking kompatibilní s GlitchTip (volitelné) |
| `VAPID_PRIVATE_KEY` | text | ne |  |  |  |  |
| `VAPID_PUBLIC_KEY` | text | ne |  |  |  | Klíče pro push upozornění (`pnpm vapid:generate`). Bez nich se push nenabízí. |
| `VAPID_SUBJECT` | text | ne |  |  |  |  |

## Další proměnné čtené v kódu

Proměnné mimo validační schéma aplikace (migrace, seed, testy, výkonové a procházecí testy, sestavení). Nejsou součástí provozní konfigurace aplikace, pokud není uvedeno jinak.

| Proměnná | Popis z `.env.example` | Kde se čte |
| --- | --- | --- |
| `BUNDLE_BUDGET_KB` |  | `scripts/bundle-report.mjs` |
| `CI` |  | `apps/web/playwright.config.ts` |
| `CLIENT` | Vyber klienta: složka v clients/ (při buildu i za běhu). Image se staví per klient. | `apps/web/next.config.ts`, `apps/web/src/server/bootstrap.ts`, `scripts/db-migrate.ts`, `scripts/db-seed.ts` a dalších 3 |
| `CRAWL_BASE_URL` |  | `apps/web/e2e-crawl/platforma-prihlaseni.crawl.spec.ts`, `apps/web/e2e-crawl/ucet-heslo.crawl.spec.ts`, `apps/web/playwright.crawl.config.ts` |
| `CRAWL_EMAIL` |  | `apps/web/e2e-crawl/login.setup.ts`, `apps/web/e2e-crawl/routes.crawl.spec.ts` |
| `CRAWL_OUTPUT_DIR` |  | `apps/web/playwright.crawl.config.ts` |
| `CRAWL_PARTNER_EMAIL` |  | `apps/web/e2e-crawl/routes.crawl.spec.ts` |
| `CRAWL_PARTNER_PASSWORD` |  | `apps/web/e2e-crawl/routes.crawl.spec.ts` |
| `CRAWL_PASSWORD` |  | `apps/web/e2e-crawl/login.setup.ts`, `apps/web/e2e-crawl/routes.crawl.spec.ts` |
| `DATABASE_APP_ROLE` |  | `scripts/db-migrate.ts` |
| `DATABASE_MIGRATE_URL` | Migrace běží jako samostatný krok pod vlastníkem schématu (pnpm db:migrate), nikdy za běhu aplikace | `apps/web/e2e/reklama.spec.ts`, `scripts/db-migrate.ts` |
| `DEV_SEED_NO_2FA` |  | `scripts/dev-seed.ts` |
| `E2E_2FA_EMAIL` |  | `apps/web/e2e/auth-2fa.spec.ts`, `apps/web/e2e/global-setup.ts` |
| `E2E_2FA_PASSWORD` |  | `apps/web/e2e/auth-2fa.spec.ts`, `apps/web/e2e/global-setup.ts` |
| `E2E_APP_EMAIL` |  | `apps/web/e2e/auth.setup.ts`, `apps/web/e2e/global-setup.ts`, `apps/web/e2e/kalendar.setup.ts`, `apps/web/e2e/mobil.setup.ts` |
| `E2E_APP_PASSWORD` |  | `apps/web/e2e/auth.setup.ts`, `apps/web/e2e/global-setup.ts`, `apps/web/e2e/kalendar.setup.ts`, `apps/web/e2e/mobil.setup.ts` |
| `E2E_EMAIL` |  | `apps/web/e2e/auth.spec.ts`, `apps/web/e2e/global-setup.ts` |
| `E2E_PASSWORD` |  | `apps/web/e2e/auth.spec.ts`, `apps/web/e2e/global-setup.ts` |
| `E2E_SHOTS` |  | `apps/web/e2e-crawl/dashboardy-mobil.mobile.spec.ts`, `apps/web/e2e-crawl/dashboardy-sestaveni.crawl.spec.ts`, `apps/web/e2e-crawl/exporty-mobil.mobile.spec.ts`, `apps/web/e2e/entities.spec.ts` a dalších 1 |
| `E2E_SHUFFLE_READY` |  | `apps/web/playwright.shuffle.config.ts` |
| `FAKTUROID_MODE` | Opakované faktury v Můj prostor: `fake` = vestavěný Fakturoid bez sítě (jen lokální vývoj a e2e, v provozu nikdy; ostré přístupy se zadávají v Nastavení → Integrace a ukládají se šifrovaně). | `apps/web/e2e/muj-prostor-faktury.spec.ts`, `packages/modules/muj-prostor/src/invoices/fakturoid/index.ts` |
| `GITHUB_STEP_SUMMARY` |  | `scripts/bundle-report.mjs` |
| `KALENDAR_FAKE_GOOGLE` |  | `apps/web/e2e/kalendar.spec.ts`, `apps/web/playwright.kalendar.config.ts` |
| `MOBIL_URL` |  | `apps/web/playwright.mobil.config.ts` |
| `NEXT_DIST_DIR` |  | `apps/web/next.config.ts`, `scripts/bundle-report.mjs` |
| `NEXT_RUNTIME` |  | `apps/web/src/instrumentation.ts` |
| `OWNER_EMAIL` | První uživatel (jen pro pnpm db:seed) | `apps/web/e2e-crawl/login.setup.ts` |
| `OWNER_PASSWORD` |  | `apps/web/e2e-crawl/login.setup.ts` |
| `PASSWORD_BREACH_CHECK` | Kontrola uniklých hesel při nastavení hesla (k-anonymní dotaz na api.pwnedpasswords.com, posílá se jen 5 znaků SHA-1). `off` ji vypne (offline pravidla pro sílu hesla běží vždy). | `packages/core/src/auth/password-policy.ts` |
| `PATH` |  | `tests/backup-restic.int.test.ts`, `tests/backup-tool.int.test.ts` |
| `PDF_FONTS_DIR` |  | `packages/core/src/pdf/render.ts` |
| `PERF_ADMIN_URL` |  | `scripts/perf-check.ts` |
| `PERF_DATABASE_URL` |  | `scripts/perf-check.ts` |
| `PERF_DB_HOST` |  | `scripts/perf-check.ts` |
| `PERF_DB_NAME` |  | `scripts/perf-check.ts` |
| `PERF_MIGRATE_URL` |  | `scripts/perf-check.ts` |
| `QASEC_DUMP` |  | `tests/private-paths.int.test.ts` |
| `REBAR_PG_PORT` | Lokální vývoj: cluster PostgreSQL pro OPSYS (scripts/dev-db.sh; výchozí port 5434, nikdy 5433) | `scripts/perf-check.ts` |
| `TZ` |  | `packages/core/src/time/dates.test.ts` |
| `UI_SHOWCASE` |  | `apps/web/src/app/ui/page.tsx` |

## Konfigurace klienta (`clients/<slug>/config.ts`)

Typovaná a validovaná Zodem při startu (`clientConfigSchema`, `defineClientConfig`). Změna znamená nové sestavení image. Přehled úrovní úprav je v [CUSTOMIZATION](../CUSTOMIZATION.md).

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `slug` | text | ano |  | vzor `^[a-z0-9]+(-[a-z0-9]+)*$` | Složka v `clients/` — kebab-case, bez diakritiky. |
| `branding` | objekt | ano |  |  |  |
| `branding.name` | text | ano |  | délka ≥ 2 | Název systému, jak ho vidí uživatelé klienta (UI, e-maily, PDF, manifest PWA). |
| `branding.shortName` | text | ano |  | délka 2–20 |  |
| `branding.accentColor` | text | ano |  | vzor `^#[0-9a-fA-F]{6}$` |  |
| `branding.logo` | text | ne |  |  | Cesta k logu relativně ke složce `branding/` klienta. |
| `branding.supportEmail` | e-mail | ne |  |  |  |
| `locale` | objekt | ne |  | výchozí `{}` |  |
| `locale.locale` | text | ne |  | výchozí `"cs-CZ"` |  |
| `locale.timezone` | text | ne |  | výchozí `"Europe/Prague"` |  |
| `locale.currency` | text | ne |  | délka 3; výchozí `"CZK"` |  |
| `modules` | pole (enum) | ano | `kontakty`, `klienti`, `disk`, `zakazky`, `obchody`, `ukoly`, `kalendar`, `hodiny`, `finance`, `reklama`, `sablony-emailu`, `muj-prostor`, `prehled` | počet ≥ 1 | Zapnuté moduly. Závislosti kontroluje `resolveModules`. |
| `security` | objekt | ne |  | výchozí `{}` |  |
| `security.idleTimeoutMinutes` | celé číslo | ne |  | hodnota 5–43200; výchozí `480` | Odhlášení po neaktivitě (minuty; relace se při aktivitě prodlužuje). Nejvýše 30 dní. |
| `security.require2faRoles` | pole (text) | ne |  | výchozí `["owner","admin"]` | Klíče rolí, pro které je 2FA povinné. |
| `navigation` | objekt | ne |  | výchozí `{}` | Navigace: pořadí sekcí postranního panelu (sekce, které tu nejsou, jdou za nimi v pořadí modulů). |
| `navigation.groupOrder` | pole (text) | ne |  | výchozí `[]` |  |
| `notifications` | objekt | ne |  | výchozí `{}` | Pravidla upozornění klienta: výchozí kanály, příjemci a texty událostí, tiché hodiny, časy shrnutí. Správce je dál upravuje v Nastavení; klíče událostí jsou v katalogu (`docs/NOTIFICATIONS.md`). |
| `notifications.events` | slovník (klíč → hodnota) | ne |  | výchozí `{}` |  |
| `notifications.events.*` | objekt | ne |  |  |  |
| `notifications.events.*.enabled` | ano/ne | ne |  |  |  |
| `notifications.events.*.mandatory` | ano/ne | ne |  |  |  |
| `notifications.events.*.severity` | enum | ne | `normal`, `urgent` |  |  |
| `notifications.events.*.channels` | objekt | ne |  |  |  |
| `notifications.events.*.channels.push` | ano/ne | ne |  |  |  |
| `notifications.events.*.channels.bell` | ano/ne | ne |  |  |  |
| `notifications.events.*.channels.email` | ano/ne | ne |  |  |  |
| `notifications.events.*.recipients` | pole (text) | ne |  | počet ≤ 20 |  |
| `notifications.events.*.title` | text | ne |  | délka 1–160 |  |
| `notifications.events.*.body` | text | ne |  | délka ≤ 400 |  |
| `notifications.quietHours` | objekt | ne |  | výchozí `{"enabled":true,"start":"20:00","end":"06:00"}` |  |
| `notifications.quietHours.enabled` | ano/ne | ano |  |  |  |
| `notifications.quietHours.start` | text | ano |  | vzor `^([01]\d\|2[0-3]):[0-5]\d$` |  |
| `notifications.quietHours.end` | text | ano |  | vzor `^([01]\d\|2[0-3]):[0-5]\d$` |  |
| `notifications.digestTimes` | pole (text) | ne |  | počet 1–4; výchozí `["07:00","16:00"]` |  |
| `dashboards` | objekt | ne |  | výchozí `{}` | Vlastní nástěnky: zapnutí a výchozí sady pro role (zakládají se při instalaci a aktualizaci, jen když chybí). |
| `dashboards.enabled` | ano/ne | ne |  | výchozí `true` |  |
| `dashboards.defaults` | pole objektů | ne |  | počet ≤ 40; výchozí `[]` |  |
| `dashboards.defaults[].key` | text | ano |  | vzor `^[a-z0-9][a-z0-9-]{1,40}$` |  |
| `dashboards.defaults[].name` | text | ano |  | délka 1–60 |  |
| `dashboards.defaults[].role` | text | ano |  | délka 1–60 |  |
| `dashboards.defaults[].home` | ano/ne | ne |  |  |  |
| `dashboards.defaults[].definition` | libovolné | ano |  |  |  |
| `exports` | objekt | ne |  | výchozí `{}` | Exporty: zapnutí, formát CSV, plánované exporty a doba uchování souborů. |
| `exports.enabled` | ano/ne | ne |  | výchozí `true` |  |
| `exports.csvDelimiter` | enum | ne | `;`, `,` | výchozí `";"` | Oddělovač CSV: `;` pro českou verzi Excelu (výchozí), `,` pro anglickou / import do jiných systémů. |
| `exports.scheduled` | ano/ne | ne |  | výchozí `true` | Plánované exporty (denně / týdně / měsíčně e-mailem nebo do „Moje exporty“). |
| `exports.syncMaxRows` | celé číslo | ne |  | hodnota 100–20000; výchozí `5000` | Nejvíc řádků, které se exportují hned při stažení; větší exporty se zpracují na pozadí. |
| `exports.retentionDays` | celé číslo | ne |  | hodnota 1–90; výchozí `7` | Jak dlouho zůstává hotový export ke stažení v „Moje exporty“ (dny). |
| `agency` | objekt | ne |  | výchozí `{}` |  |
| `agency.serviceAccess` | enum | ne | `off`, `on_request` | výchozí `"off"` | Servisní přístup agentury: výchozí vypnuto, zapíná klient na omezenou dobu. |
| `agency.serviceAccessMaxHours` | celé číslo | ne |  | hodnota 1–168; výchozí `24` | Max. délka jednoho povolení servisního přístupu (hodiny). |
