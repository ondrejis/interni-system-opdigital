# AUDIT dema — fáze 0 (podklad pro core „rebar“)

> Stav: **k odsouhlasení** · datum: 2026-10-08 · zdroj: `opdigital-knowledge-base/demo/` (větev `dev`, commit `4dc3abb`, v2 fáze 0–6)
> Metoda: pouze čtení. Demo jsem nezměnil. Prošel jsem schéma DB, všechny server moduly (`src/server/*`, `src/lib/*`), vzorek stránek a UI
> komponent, migrace, deploy soubory, obě specifikace a obchodní kontext v `client-knowledge-base/systemy/_proces/`.
> Ověřeno čtením kódu, **ne spuštěním**. Výkonové nálezy jsou proto odvozené z dotazů a indexů, nezměřené.

---

## 0. Shrnutí

**Demo je dobrý zdroj obchodní logiky, špatný základ kódu.** Doménové znalosti (docházka, skladové jádro, ekonomika zakázky, intervaly strojů,
připomínky) jsou promyšlené a stojí za převzetí. Platforma pod nimi je ale postavená na jiných předpokladech, než co zadání chce od core.

Pět nálezů, které určují zbytek plánu:

1. **Oprávnění jsou jen na úrovni funkce, ne záznamu.** Kdo má `jobs.view`, vidí všechny zakázky (včetně údajů klienta) a najde je i hledáním. „Moje zakázky“ je jen filtr v URL
   (`zakazky/page.tsx`, `moje` param). Zadání chce „montér vidí jen své zakázky“ vynucené v datové vrstvě. Tohle se musí postavit od základu.
2. **Žádná generická vrstva entit.** Každá obrazovka má vlastní dotaz, vlastní filtr a vlastní formulář (24 tisíc řádků, 47 stránek, 98 server actions).
   Tabulka s inline editací, vlastní pole, uložené pohledy, kanban a Cmd+K z promptu vyžadují **registr entit a atributů**. To je největší nová práce, v demu k ní nic není.
3. **Datový model nesplňuje principy 4.5 zadání:** `serial` ID místo UUID v7, žádný soft delete, `created_by` jen na 9 tabulkách z 48 a `updated_by` na jediné,
   peníze v celých korunách (sklad v `numeric` čtený jako JS `number`), stavy a fáze natvrdo v kódu, audit jako volný text.
4. **Chybí celé oblasti zadání:** 2FA, soubory a fotky, PDF, ARES, vlastní pole, komentáře a zmínky, pipeline v DB, uložené pohledy, testy (0), CI (žádné), health, zálohy, error tracking.
5. **Nasazení dema je opak toho, co chce zadání:** build na serveru (`docker compose up --build`), `next start` místo standalone, migrace pod vlastníkem DB,
   noční mazání a znovunaplnění dat cronem, veřejné demo heslo.

Jedna **architektonická kolize v samotném zadání**, kterou je potřeba rozhodnout před fází 1 (detail v §11, otázka Q1):
zadání chce jednu semver image v GHCR **a zároveň** klientská rozšíření jako kód v `clients/<slug>/extensions/` kompilovaný do aplikace. Obojí najednou nejde.

**Co od vás potřebuju:** odpovědi na otázky v §12. Blokující jsou Q1–Q5, zbytek mají výchozí řešení, které půjde později změnit.

---

## 1. Rozsah dema v číslech

| Položka | Hodnota |
|---|---|
| Zdrojové řádky (`src`, `scripts`, `drizzle`, bez JSON) | ~24 200 (z toho `seed.ts` 1 216, `schema.ts` 868, `calendar-view.tsx` 1 061) |
| Stránky (`page.tsx`) | 47 |
| Server actions (exportované async funkce v `"use server"`, včetně pár čtecích) | 98 |
| Tabulky | 48 (z toho 4 Better Auth) |
| Migrace | 8 (`0000_init` … `0007_calendar_v2`) |
| Transakce (`db.transaction`) | 13 míst, jen v 6 souborech |
| `revalidatePath` | 84 volání, 7× s `"/", "layout"` (celá aplikace) |
| Testy / CI / lint (kromě `tsc`) | **0 / žádné / žádný** |
| Commity | 15, od 2026-09-30 |

Závislosti (`package.json`): Next 16.3, React 19.3, TypeScript 7, Tailwind 4, Better Auth 1.7, Drizzle 0.45, `postgres` (postgres-js), Zod 4,
`react-aria-components` + `@untitledui/icons`, `@dnd-kit/core`, `date-fns`, `nodemailer`, `web-push`. **Nepoužito:** Radix/shadcn, TanStack, cmdk, lucide, sharp, PDF knihovna, pg-boss.

---

## 2. Moduly a obrazovky dema

Pracovní název modulu = cílový modul core (viz §6). `LOC` je přibližně celý modul včetně UI.

| Modul dema | Route | Co dělá | Klíčové soubory |
|---|---|---|---|
| **Přehled** | `/` | Dlaždice podle role: moje docházka, úkoly, pipeline, zakázky, neuhrazené faktury, „Vyžaduje pozornost“, rezervace strojů | `(app)/page.tsx` 395 ř., `server/attention.ts` |
| **CRM** | `/crm` | Kanban leadů (dnd-kit), detail v popupu, další krok, prohra s důvodem, vlastník, převod na zakázku (vytvoří 3 fáze + orientační rozpočet 35/25/7/10/3 %) | `crm/*`, `server/leads.ts` |
| **Klienti** | `/klienti`, `/klienti/[id]` | Adresář osob a firem, detail s leady, zakázkami a fakturami | `klienti/*`, `server/clients.ts` |
| **Zakázky** | `/zakazky`, `/zakazky/[id]` | Seznam + faktury (záložky), detail s 9 záložkami: přehled/Gantt, ekonomika, vícepráce, deník, materiál, stroje, faktury, úkoly, aktivita | `zakazky/*`, `server/jobs.ts`, `jobs-v2.ts` (388 ř.), `job-economics.ts`, `job-queries.ts` |
| **Faktury** | v zakázkách | Zálohová/průběžná/vyúčtování, koncept → vystaveno → uhrazeno, DPH sazba na faktuře, číselná řada | `server/jobs.ts`, `zakazky/invoices-table.tsx` |
| **Docházka** | `/dochazka/*` | Týdenní mřížka, zápis od–do nebo hodiny, odeslat → schválit/vrátit, uzávěrka měsíce, výkazy + CSV, statistiky, připomínka chybějícího zápisu | `server/time.ts`, `time-queries.ts`, `lib/time.ts` (svátky, fond), `dochazka/*` |
| **Sklad** | `/sklad/*` | Karty, umístění (sklad/dílna/vozidlo/stavba), příjemka/výdejka/převodka/vratka/inventurní rozdíl, vážený průměr, objednávky u dodavatelů, inventury, minima | `server/stock-engine.ts` (jádro), `stock.ts`, `stock-queries.ts` |
| **Stroje a vozidla** | `/stroje/*` | Karty, kniha jízd, motohodiny, tankování + spotřeba, servis + intervaly, STK/pojištění/známka, rezervace s kolizemi, závady (→ úkol) | `server/fleet.ts` (416 ř.), `fleet-queries.ts`, `lib/fleet.ts` |
| **Kalendář** | `/kalendar` | Měsíc/týden/den/seznam/zdroje, opakování, účastníci, připomenutí, vrstvy (fáze, úkoly, absence, rezervace, termíny), ICS odběr, import cizí iCal adresy jako „obsazeno“ | `kalendar/calendar-view.tsx` (1 061 ř.), `server/events.ts`, `calendar*.ts`, `lib/calendar.ts`, `api/kalendar/[token]` |
| **Úkoly** | `/ukoly` | Vlastní/přidělené, vazba na lead nebo zakázku, priorita, termín | `server/tasks.ts`, `ukoly/*` |
| **Nastavení** | `/nastaveni/*` | Můj profil (push, zařízení), firma, uživatelé + karta zaměstnance, role (matice), moduly, e-mail (SMTP), parametry (pracovní doba, číselné řady), historie změn, odeslané e-maily, systém (běhy cronu), demo data | `nastaveni/*`, `server/settings.ts`, `users.ts`, `system.ts` |
| **Platforma** | — | Auth, upozornění (zvoneček + Web Push), hledání ⌘K, PWA manifest + service worker, cron registr | `lib/auth.ts`, `lib/notify.ts`, `server/notifications.ts`, `server/search.ts`, `server/cron/*`, `public/sw.js` |

**Co demo záměrně nemá** (potvrzuje `specifikace-v1` §0.2 a `v2` §9): soubory a fotky, PDF, 2FA, klientský portál, ARES, vlastní pole,
napojení na účetnictví, offline režim, píchačka s polohou, položkový rozpočet/nabídka, předávací protokol.

---

## 3. Datový model dema a jeho problémy

### 3.1 Tabulky podle oblastí

- **Identita:** `user`, `session`, `account`, `verification` (Better Auth), `role`, `login_event`
- **Obchod:** `client`, `lead`, `job`, `job_phase`, `job_member`, `job_cost`, `job_change`, `site_diary`, `invoice`
- **Práce:** `task`, `time_entry`, `time_lock`
- **Sklad:** `supplier`, `warehouse`, `stock_item`, `stock_level`, `stock_doc`, `stock_doc_line`, `purchase_order`, `purchase_order_line`, `stock_count`, `stock_count_line`
- **Stroje:** `asset`, `asset_log`, `asset_fuel`, `asset_service`, `asset_interval`, `asset_reservation`, `asset_defect`
- **Kalendář:** `event`, `event_attendee`, `calendar_feed`, `calendar_import`, `external_event`
- **Platforma:** `activity` (audit + poznámky + časová osa v jedné tabulce), `company_settings` (1 řádek), `app_setting` (klíč → JSON), `email_outbox`, `notification`, `push_subscription`, `cron_run`, `reminder_sent`

### 3.2 Problémy (číslované kvůli odkazům)

| # | Problém | Kde | Dopad na core |
|---|---|---|---|
| D1 | `serial` ID (int) všude, `activity.entity_id` je `text` | `schema.ts` | UUID v7 podle zadání; ID prozrazují počty záznamů |
| D2 | `created_by` má 9 tabulek (`job_cost`, `job_change`, `site_diary`, `task`, `purchase_order`, `stock_count`, `stock_doc`, `asset_service`, `asset_reservation`), `updated_by` jen `app_setting`. Chybí u `client`, `lead`, `job`, `invoice`, `event`, `supplier`, `asset`, `time_entry`. `updated_at` chybí u `invoice`, `task`, `event` a většiny tabulek skladu a strojů | `schema.ts` | Zadání 4.5 chce všechno na všech |
| D3 | Žádný soft delete. 16 míst s `db.delete` na obchodních datech (lead, úkol, docházka, událost, koncept faktury, fáze, vícepráce, ruční náklad, deník, členové týmu, jízdy, tankování, intervaly, rezervace), celkem 29 volání | `server/*` | Obnova smazaného je nemožná |
| D4 | Peníze: `job.value`, `invoice.amount`, `job_cost.amount` v celých Kč; sklad `numeric(14,2/4)` čtený přes `mode: "number"` (JS float); `withVat` = `Math.round(amount*(1+rate/100))` | `schema.ts`, `format.ts:96` | Zadání: haléře jako integer + kód měny. Sklad potřebuje decimal (viz §7.3) |
| D5 | Stavy/fáze/zdroje/typy jsou `text` s hodnotami natvrdo v `lib/constants.ts` (`LEAD_STAGES`, `JOB_STATUSES`…) a ve Zod `z.enum([...])` v actions. Žádné CHECK ani FK | `constants.ts`, `leads.ts:15` | Zadání: pipeline konfigurovatelná v DB |
| D6 | Chybějící FK: `lead.job_id`, `job.lead_id`, `asset_service.interval_id`; `user.role_id` nullable | `schema.ts` | Integrita |
| D7 | `activity` míchá audit, poznámky uživatelů a události časové osy. Poznámka k leadu/zakázce **je řádek auditu** (`action: "note"`), takže ji nejde upravit, smazat, ani zmínit uživatele. Staré/nové hodnoty se neukládají, jen věta (`message`) | `action.ts:30`, `jobs.ts:92` | Rozdělit na `audit_log` a `comment` |
| D8 | Audit se zapisuje **po** změně a mimo transakci (`logActivity` po `db.update`). Selže-li zápis, změna zůstane bez stopy. Audit pokrývá jen část mutací (docházka, sklad, stroje, události, úkoly ho většinou nemají) | `server/*` | Audit musí být atomický a úplný |
| D9 | Úkoly se vážou jen přes `lead_id`/`job_id` (dva nullable FK). Událost stejně | `schema.ts` | Zadání: polymorfní vazba `entity_type + entity_id` |
| D10 | Nastavení jsou dvě různá úložiště: `company_settings` (sloupce) a `app_setting` (JSON). Tajné hodnoty v `app_setting` jsou šifrované, ale klíč je odvozen z `BETTER_AUTH_SECRET` | `schema.ts:382,789`, `crypto.ts` | Sjednotit |
| D11 | `job.budget` je JSONB se 5 pevnými kategoriemi, ne řádky. Žádné položky nabídky/rozpočtu | `schema.ts:156` | Zadání: „rozpočet / položky“ u zakázky |
| D12 | `supplier` je samostatná tabulka vedle `client`; stejná firma nemůže být klient i dodavatel | `schema.ts` | Jedna entita `company` s rolemi |
| D13 | Indexy chybí na většině FK a filtrovaných sloupců: `invoice.job_id`, `job.client_id`, `job.status`, `job_phase.job_id`, `task.job_id/lead_id/due_date`, `event.starts_at/owner_id`, `job_member.user_id`, `time_entry.status`. `pg_trgm` se instaluje v `migrate.ts`, ale **žádný trigramový ani GIN index neexistuje** | `drizzle/*.sql` | Viz P1–P3 |
| D14 | Číslování dokladů = `count(*)+1` v roce + smyčka „zkus další, dokud číslo neexistuje“ pod advisory lockem. Smazání dokladu nebo přechod roku může způsobit díru, ruční vzor může kolidovat | `settings.ts:97`, `stock-engine.ts:358` | Zadání: atomicky, bez děr → `number_series` |
| D15 | `time_entry.start_time/end_time` jsou `text` („07:00“), ne `timestamptz`. Záznamy se mohou překrývat | `schema.ts:452` | Pro píchačku a kontrolu překryvů potřeba časové razítko |
| D16 | `invoice.type` v komentáři `deposit | final`, ve Zodu a UI i `partial`. Faktura nemá položky ani platby (jen `paid_at`), žádné částečné úhrady | `schema.ts:260`, `jobs.ts:119` | Přepsat |
| D17 | Opakování událostí (`event.recurrence` = `daily|weekdays|weekly|monthly`) je jen podmnožina RRULE; vlastní parser iCal 157 ř. s dokumentovanými omezeními (BYDAY s více dny, jiné TZID) | `lib/calendar.ts`, `specifikace-v2` §8 | Zvážit knihovnu |

---

## 4. Technologie, auth, soubory, PDF, e-maily

| Oblast | Jak je to v demu | Poznámka |
|---|---|---|
| **Auth** | Better Auth, e-mail + heslo (scrypt), sessions v DB, 7 dní / obnova po 24 h, rate limit 8/min na přihlášení a 3/min na reset, `disableSignUp`, hook blokuje deaktivované a zapisuje `login_event` | Rate limit je Better Auth default (paměť procesu). **Žádné 2FA, žádná složitost hesla kromě min. 8 znaků, žádný idle timeout** |
| **Pozvánky** | Admin vytvoří uživatele s náhodným heslem a pošle „reset hesla“ odkaz s platností **1 hodina** | Pozvánka tedy vyprší za hodinu. Pro klienty nepoužitelné (viz S11) |
| **Oprávnění** | `role.permissions text[]`, katalog 30 klíčů v `lib/permissions.ts`, `getCurrentUser()` načte role při každém requestu (`cache`), vypnutý modul odebere oprávnění s prefixem | Dobrý nápad s prefixem vypnutého modulu. Kontrola je v `page.tsx` a na začátku každé action, ne v dotazech |
| **Validace** | Zod 4 v actions, `formToObject(FormData)`, české hlášky přes `z.config(z.locales.cs())` | Vzor je dobrý. Část actions bere surové argumenty (`id: number`) bez Zod |
| **Soubory** | **Žádné.** Žádný upload, žádné fotky, žádné přílohy | Celé nové |
| **PDF** | **Žádné.** „Tisk“ skladového dokladu = CSS `print` v prohlížeči | Celé nové (`@react-pdf/renderer`) |
| **E-mail** | `nodemailer`, SMTP z DB (šifrované heslo) nebo z `.env`, vždy se zapíše do `email_outbox` včetně celého textu | Odesílá se synchronně v requestu. **Reset odkazy s tokeny jsou v `email_outbox.text` čitelné v UI** (S3) |
| **Push** | Web Push (VAPID), service worker `public/sw.js` bez cache, zvoneček v DB, odběr per zařízení, mazání po 404/410 | Dobře udělané, `notify()` nikdy nevyhodí chybu. Převzít |
| **Plánované úlohy** | `GET /api/cron` s Bearer tokenem, volá ho cron hostitele každých 5 min přes `docker compose exec wget`; 8 úloh; deduplikace přes `reminder_sent` | Nahradit pg-boss |
| **Hledání** | `searchAll()` – až 10 paralelních dotazů `unaccent(coalesce(col::text,'')) ILIKE unaccent('%q%')` | Sekvenční skeny, viz P2 |
| **Nasazení** | `docker compose up -d --build` **na serveru**, `next start`, migrace i seed při startu kontejneru pod vlastníkem DB, Nginx Proxy Manager, cron v `/etc/cron.d`, `pg_dump` na disk + 14 dní retence | Viz §8, §9 |
| **UI** | Untitled UI styl, `react-aria-components`, ikony `@untitledui/icons`, **pravidlo „žádný text pod 16 px“** vynucené v `globals.css` a skriptem `check:font` | Přímý rozpor s hustotou Attio (13–14 px), viz §11 |
| **Sdílení na klienta** | Název „Demo firma s.r.o.“ natvrdo na 19 místech v 11 souborech (auth `appName`, e-maily, manifest, ICS `PRODID`, push, UI) | Core musí brát vše z konfigurace |

---

## 5. Co demo dělá dobře (stojí za zachování)

- **`stock-engine.ts`** — jediné místo, které mění zásoby; transakce, `FOR UPDATE` na kartě, kontrola dostupnosti, vratka nejvýše do vydaného množství, vážený průměr, sloučení stejných položek. Seed používá stejné jádro, takže demo data jsou konzistentní.
- **Princip „záznam nese zakázku“** → ekonomika zakázky se skládá sama (`job-economics.ts`): docházka × snímek hodinové sazby, výdejky − vratky, provoz strojů × interní sazba + palivo, ruční náklady, vícepráce → marže.
- **Snímek hodinového nákladu** při zápisu docházky (`time_entry.hourly_cost`) — pozdější změna sazby nezmění historii.
- **Docházka:** stavový automat koncept → odesláno → schváleno/vráceno, uzávěrka měsíce, fond pracovní doby se svátky (`czechHolidays` včetně Velikonoc), kontrola 24 h/den.
- **Stroje:** intervaly „co nastane dřív“ (km/mth nebo měsíce), spotřeba mezi plnými nádržemi, závada → úkol, kolize rezervací.
- **Připomínky bez duplicit** (`claimReminder`) a stupňování 30/7 dní/po termínu.
- **Web Push** celý řetězec včetně iOS „Přidat na plochu“, úklid mrtvých odběrů.
- **`runAction`/`UserError`/`PermissionError`** — jasný kontrakt, co uživatel smí vidět jako chybu.
- **Moduly vypínané nastavením** s odebráním oprávnění (`session.ts`).
- **SSRF ochrana** při stahování iCal (jen https, kontrola privátních IP, ruční přesměrování s re-validací, limity 10 s / 5 MB) — nápad dobrý, provedení má mezeru (S6).
- **Realistická česká demo data** (`seed-data.ts`, `seed.ts`) — hodnotný zdroj pro `clients/demo`.
- **Obchodní kontext** v `_proces/01-co-chapu.md` potvrzuje, že moduly v2 pokrývají, co chtěl Plzeňský bagr (docházka z mobilu, tankování, stroje, marže, vícepráce).

---

## 6. Verdikty: převzít / přepsat / zahodit

**Převzít** = logiku a pravidla přenést (často do nového kódu); **Přepsat** = obchodní záměr zachovat, implementaci nahradit; **Zahodit** = do core nepatří.

### 6.1 Platforma

| Část dema | Verdikt | Důvod a cíl |
|---|---|---|
| Better Auth (konfigurace, hooky, rate limit, session) | **Převzít** + rozšířit | Zůstává (zadání). Přidat `twoFactor` plugin, idle timeout, vlastní generátor UUID v7 (`advanced.database.generateId`), samostatné `invitation` |
| `role.permissions text[]` + katalog `permissions.ts` | **Přepsat** | `role_permission(role, permission, scope)`; katalog se skládá z manifestů modulů. Scope `all` / `own` pro záznamy |
| `requirePagePermission` / `requireActionPermission` / `can()` | **Přepsat** | Oprávnění přesunout do datové vrstvy (`ctx` + repozitáře). Kontrola na stránce zůstane jen jako UX přesměrování |
| `runAction`, `UserError`, `PermissionError`, `formToObject` | **Převzít** vzor | Typovaný `defineAction({ permission, input: zod, handler })` sjednotí kontrolu, validaci, audit a revalidaci |
| `activity` tabulka | **Přepsat** | Rozdělit na `audit_log` (strukturované diffy, append-only) a `comment` (poznámky, @zmínky). Časová osa je jejich sloučený pohled |
| `app_setting`, `company_settings` | **Přepsat** | Jedno `setting` s typovaným Zod schématem per klíč a cache; firma jako setting |
| `crypto.ts` (AES-256-GCM, formát `v1:iv:tag:data`) | **Převzít**, upravit klíč | Samostatný `APP_ENCRYPTION_KEY` + id klíče pro rotaci (S5) |
| `mail.ts`, `email_outbox` | **Přepsat** | Odesílání přes frontu, šablony v češtině, `email_log` bez tokenů v těle (S3). Nodemailer zůstává |
| `notify.ts`, `notification`, `push_subscription`, `sw.js` | **Převzít** | Web Push držet (pro terén je to klíčové). Odesílání přes frontu místo `await` v requestu |
| `cron/registry.ts`, `/api/cron`, `reminder_sent`, `cron_run` | **Přepsat** | pg-boss: plánované joby, `singletonKey` místo `reminder_sent`, historie běhů v pg-boss. Žádný HTTP endpoint s tajemstvím |
| Číslování (`formatNumber`, `nextDocNumber`, advisory locky) | **Přepsat** | `number_series` s atomickým `UPDATE … RETURNING`; vzor jako v demu (`{YYYY}`, `{NNN}`) převzít |
| Moduly zap/vyp (`MODULES` const, `app_setting.modules`) | **Přepsat** | Manifest modulu + konfigurace klienta. Nápad odebrat oprávnění vypnutého modulu převzít |
| `search.ts` (10× ILIKE) | **Přepsat** | Centrální `search_document` s trigramy/tsvector (§7.2), politika oprávnění po výběru kandidátů |
| `command-menu.tsx` | **Přepsat** | `cmdk` + akce + kontextové akce |
| `attention.ts` + dashboard `page.tsx` | **Přepsat** UI, **převzít** dotazy a pravidla | Moduly dodají „attention providery“ a widgety přes manifest; core je jen skládá podle role |
| **Demo režim** (rychlé přihlášení, veřejné heslo, `resetDemoData`, noční seed) | **Zahodit** z core | 5 výskytů `DEMO_MODE`. Přesun do `clients/demo` (seed skript + volitelný reset), nikdy do produkční cesty |
| `seed.ts` + `scripts/seed-data.ts` | **Přepsat** strukturu, **převzít** data | Core seed: role, pipeline, číselníky. Demo seed: data v `clients/demo/seed/` |
| UI kit `components/ui/*` (Untitled UI + react-aria) | **Přepsat** | Nový design system v `packages/ui`. Ikony `lucide`. Zvážit react-aria pro datum/combobox (Q9) |
| `check-font-size.mjs` + pravidlo 16 px | **Zahodit** | Nahradit design tokeny a lintem; pro mobilní terén zůstane min. 16 px jen tam (§11) |
| Téma světlý/tmavý (no-FOUC skript + CSS proměnné) | **Převzít** princip | Tokeny v `packages/ui` |
| PWA `manifest.ts`, `icon.tsx`, `sw.js` | **Převzít** základ | Rozšířit o frontu nahrávání fotek a docházky při slabém signálu |
| Docker/compose/cron/`pack.sh`/`nasazeni/` | **Zahodit** | Zadání §10 je jiný model (image z CI, Caddy, worker, restic). Převzít jen poučení (healthchecky, `mem_limit`, DB bez portu ven) |
| Pevný text „Demo firma s.r.o.“ (19×) | **Zahodit** | Branding z konfigurace klienta; test na interní název |

### 6.2 Moduly

| Modul dema → modul core | Verdikt | Co přenést / co změnit |
|---|---|---|
| CRM `lead` → **poptavky** | **Přepsat** | Pipeline a stavy v DB, generický kanban, pozice karet jako zlomkový index (ne `position` int přečíslovaný po jednom v transakci). **Převzít** pravidla: prohra vyžaduje důvod, vyhraný lead nejde vrátit, převod na zakázku jedním krokem |
| `client` + `supplier` → **kontakty** | **Přepsat** | `company` (role: klient/dodavatel/subdodavatel) + `person`; ARES; vazby. Dnešní `client.type = person` → `person` bez firmy |
| `job`, `job_member`, `job_cost`, `job_change` → **zakazky** | **Přepsat** model, **převzít** logiku | Položky/rozpočet jako řádky (D11), vícepráce a ruční náklady převzít, ekonomika přes „cost providery“ (viz §7.4) |
| `job_phase`, Gantt, `site_diary` → **realizace** | **Přepsat** | Harmonogram a deník převzít (včetně baseline, závislostí, předvyplnění deníku z docházky), Gantt znovu (pracovní dny a svátky místo kalendářních dnů; demo to uvádí jako známé omezení). Nově předávací protokol, vady |
| `invoice` → **fakturace** | **Přepsat** | Položky, platby (částečné úhrady), haléře, PDF, export adaptéry. **Převzít**: koncept lze smazat, vystavenou jen stornovat dobropisem; upozornění po splatnosti |
| `time_entry`, `time_lock`, výkazy → **dochazka** | **Převzít** logiku, přepsat UI | Stavový automat, uzávěrka, fond, svátky, snímek sazby. Nově: píchačka (`started_at/ended_at timestamptz`), mobile-first |
| `stock_*`, `warehouse`, `purchase_order*` → **sklad** | **Převzít** engine i model | Decimal místo float (ADR), `stock_level` zůstává materializované. UI přepsat |
| `asset*` → **stroje** | **Převzít** model i pravidla | Intervaly, spotřeba, rezervace, závady. `kniha jízd` soukromé jízdy (`private`) zachovat |
| `event*`, ICS, import → **kalendar** | **Převzít** logiku | Navrhuji jako 9. modul (Q6). SSRF oprava (S6) |
| `task` → **platforma** | **Přepsat** | Polymorfní vazba, „Moje úkoly“ v shellu |
| Uživatelé + karta zaměstnance → **core** | **Přepsat** | `user` jen identita, `employee` zvlášť (HR údaje včetně `hourly_cost`), viditelné jen s oprávněním |

---

## 7. Návrh cílového datového modelu jádra

Konvence pro všechny tabulky (ADR 002): `id uuid` (v7, generuje aplikace), `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` (soft delete),
peníze jako `bigint` v haléřích + `currency char(3)`, enumy jako `text` + `CHECK` odvozený z jednoho zdroje v kódu, ale **stavy obchodních procesů jako řádky v `pipeline_stage`**.

### 7.1 Platforma (`packages/core`)

| Skupina | Tabulky | Poznámky |
|---|---|---|
| Identita | `user`, `session`, `account`, `verification`, `two_factor`, `invitation`, `login_event` | Better Auth + plugin. `invitation`: `token_hash`, platnost 7 dní, `role_id`, `invited_by` |
| Lidé | `employee` (1:1 `user`): osobní číslo, typ poměru, úvazek, `hourly_cost_minor`, nástup, řidičské skupiny, pozice, telefon | Zpřístupněno jen s `employees.read`. Používá docházka, stroje, zakázky |
| RBAC | `role` (`key`, `name`, `is_system`, `require_2fa`), `role_permission` (`role_id`, `permission`, `scope` = `all`/`own`) | Katalog oprávnění z manifestů. Jedna role na uživatele (jako v demu) |
| Audit | `audit_log`: `id`, `occurred_at`, `actor_id`, `actor_kind` (`user`/`system`/`agency`), `action`, `entity_type`, `entity_id`, `changes jsonb` (`[{field, old, new}]`), `summary`, `request_id`, `ip` | Zapisuje se v téže transakci jako změna. DB role aplikace má jen INSERT a SELECT. Detail záznamu čte z indexu `(entity_type, entity_id, occurred_at)` |
| Komunikace | `comment` (`entity_type`, `entity_id`, `author_id`, `body`, `mentions uuid[]`, `edited_at`), `notification` (`user_id`, `kind`, `title`, `body`, `url`, `entity_*`, `read_at`), `push_subscription` | Zmínky generují notifikace |
| Úkoly | `task`: název, popis, `assignee_id`, `due_at`, `priority`, `done_at`, `entity_type`/`entity_id` (nullable) | Polymorfní vazba |
| Soubory | `file` (`storage_key`, `name`, `mime`, `size`, `sha256`, `thumb_key`, `uploaded_by`), `attachment` (`file_id`, `entity_type`, `entity_id`, `kind`, `taken_at`, `geo` volitelně) | Abstrakce úložiště (disk → S3) |
| Konfigurace | `setting` (`key`, `value jsonb`, `updated_by`), `pipeline` (`entity_type`, `key`), `pipeline_stage` (`name`, `color`, `position`, `kind` = `open`/`won`/`lost`/`done`), `lookup_list` + `lookup_item` (číselníky), `number_series` (`key`, `pattern`, `year`, `last_value`), `vat_rate` (`code`, `rate_bp`, `valid_from`), `document_template` | `next_number(key, date)` v transakci vrací číslo bez děr |
| Vlastní pole | `custom_field_def` (`entity_type`, `key`, `label`, `type`, `options`, `required`, `position`, `visible_in_table`) + sloupec `custom jsonb` na každé entitě s vlastními poli, GIN index | Filtr/řazení přes `custom->>'key'` s typovým přetypováním |
| Pohledy | `saved_view`: `entity_type`, `name`, `owner_id`, `shared`, `favorite`, `config jsonb` (typ pohledu, filtry, řazení, seskupení, sloupce) | |
| Hledání | `search_document`: `entity_type`, `entity_id`, `title`, `subtitle`, `search_text` (bez diakritiky), `tsv`, GIN trigram + GIN tsvector | Aktualizuje servisní vrstva v téže transakci; politika oprávnění se aplikuje po výběru kandidátů |
| Provoz | `email_log` (příjemce, šablona, stav, chyba, entita; **bez** tajných odkazů), pg-boss (vlastní schéma `pgboss`) | |

### 7.2 Registr entit a atributů (klíč k UI ze sekce 7)

Každá entita (`job`, `inquiry`, `company`, `invoice`, `asset`, …) se v manifestu popíše jednou:

```ts
defineEntity({
  key: "job", table: jobs, label: { one: "Zakázka", many: "Zakázky" },
  attributes: [ { key: "number", type: "text", filter: true, sort: true, ... },
                { key: "stage",  type: "status", pipeline: "job", ... },
                { key: "value",  type: "currency", aggregate: ["sum"], ... }, /* + vlastní pole z DB */ ],
  scope: (ctx) => /* SQL predikát pro scope "own", např. manager_id = ctx.user.id OR member */,
  search: (row) => ({ title: row.number + " " + row.title, subtitle: ... }),
})
```

Z registru se generuje: sloupce tabulky a inline editory podle typu atributu, filtry, řazení, seskupení se součty, uložené pohledy, kanban podle pole `status`,
detail záznamu (pravý panel atributů), CSV/XLSX export, hledání v Cmd+K a oprávnění na úrovni záznamu. Vlastní pole se do registru přidávají za běhu z `custom_field_def`.
**Tohle je nová práce bez předobrazu v demu a drží celý redesign.** Odhad rizika v §11.

### 7.3 Domény (moduly)

| Modul | Tabulky | Změna oproti demu |
|---|---|---|
| **kontakty** | `company` (`name`, `ico`, `dic`, adresa, `web`, `roles text[]`, `ares_checked_at`, `owner_id`, `custom`), `person` (jméno, e-mail, telefon, `company_id`, funkce) | Nahrazuje `client` a `supplier` |
| **poptavky** | `inquiry` (název, `company_id`, `person_id`, `stage_id`, `source` (lookup), `expected_value_minor`, `owner_id`, `next_step`, `next_step_at`, `lost_reason` (lookup), `converted_job_id`, `rank` zlomkový index), `inquiry_intake` (log příchozích webhooků/formulářů) | Pipeline v DB; příjem ručně/formulář/webhook |
| **zakazky** | `job` (`number` ze série, `company_id`, `person_id`, `inquiry_id`, `stage_id`, `value_minor`, `address`, `start/end_date`, `manager_id`, `custom`), `job_member`, `job_estimate_line` (druh, množství, jednotka, cena, sazba DPH, nákladová cena), `job_cost`, `job_change` | Rozpočet = řádky; kategorie rozpočtu se odvozují; `job_document` přes `attachment` |
| **realizace** | `job_phase` (vč. baseline, skutečnost, závislost, odpovědná osoba), `site_diary`, `handover_protocol` (+ `handover_item`, podpis jako `file`), `defect` | Fáze se přesouvají z „zakázky“, protokol a vady nové |
| **fakturace** | `invoice` (číslo ze série, druh = `proforma`/`advance`/`final`/`credit_note`, `job_id`, `company_id`, data, `status`, součty v haléřích, `variable_symbol`, `pdf_file_id`), `invoice_line`, `payment` (částečné úhrady), `export_batch` | Položky, platby, PDF, adaptéry Pohoda/Fakturoid/iDoklad |
| **dochazka** | `time_entry` (+ `started_at`, `ended_at`, `source` = `manual`/`clock`, `hourly_cost_minor`), `time_lock` | Píchačka; převzít schvalování |
| **sklad** | `warehouse`, `stock_item`, `stock_level`, `stock_doc`, `stock_doc_line`, `purchase_order`, `purchase_order_line`, `stock_count`, `stock_count_line` | Dodavatel = `company`. Množství `numeric(14,3)`, jednotková cena `numeric(14,4)` (výjimka z „haléře“ pro vážený průměr, ADR), součty řádků a dokladu v haléřích. Počty se v kódu drží jako decimal řetězce, ne `number` |
| **stroje** | `asset`, `asset_log`, `asset_fuel`, `asset_service`, `asset_interval`, `asset_reservation`, `asset_defect` | Převzít, doplnit audit a soft delete |
| **kalendar** *(navržený 9. modul)* | `event`, `event_attendee`, `calendar_feed` (**hash** tokenu), `calendar_import`, `external_event` | Viz Q6. Kalendářní *pohled* nad jakýmkoli datumovým atributem je v UI core |

### 7.4 Vazby mezi moduly přes sloty, ne importy

V demu `job-economics.ts` přímo importuje `stock-queries` a `fleet-queries`, `attention.ts` obsahuje SQL ze čtyř modulů, `search.ts` zná všechny tabulky.
Vypnutý modul tak zanechává stopy a zadání (4.3) tohle zakazuje. Proto manifest nabízí:

- **`economics.costProviders`** — sklad, stroje a docházka dodají náklady zakázky (`{ category, amountMinor, source }`); zakázky je jen sečtou.
- **`record.tabs`** — záložky na detailu (Materiál, Stroje, Faktury, Výkazy).
- **`dashboard.attention`** a **`dashboard.widgets`** — pozornost a dlaždice podle role.
- **`calendar.layers`** — fáze, absence, rezervace, termíny STK, splatnosti.
- **`jobs.schedules`** — pg-boss úlohy modulu (připomínky).
- **`search.documents`** — co se indexuje.
- **`events`** (`job.created`, `stock.issued`…) — pro rozšíření klienta.

---

## 8. Bezpečnostní nálezy

Závažnost: **K** kritická (nelze nasadit), **V** vysoká, **S** střední, **N** nízká. Všechny nálezy se týkají dema; v core je řeší návrh v pravém sloupci.

| # | Zn. | Nález | Kde | Řešení v core |
|---|---|---|---|---|
| S1 | **V** | **Žádná autorizace na úrovni záznamu.** `jobs.view` ukáže všechny zakázky, `getJobDetail(id)` neověřuje členství, `addJobNote`/`saveDiary` stačí `jobs.view` na libovolné `jobId`. „Moje zakázky“ je jen volitelný filtr. Hledání vrací všechny zakázky komukoli s `jobs.view` | `zakazky/page.tsx`, `job-queries.ts`, `jobs.ts:92`, `search.ts` | Scope `own`/`all` v `role_permission`; `ctx.scope(entity)` je povinný argument každého repozitáře; testy na montéra/mistra |
| S2 | **V** | **Žádné 2FA**, heslo min. 8 znaků, žádný idle timeout. Rate limit je v paměti procesu | `auth.ts` | TOTP povinné pro majitele a admina; idle timeout v nastavení; rate limit do DB |
| S3 | **V** | **Odkazy na reset hesla (s tokenem) se ukládají v čitelné podobě do `email_outbox.text` a zobrazují v UI** každému s `audit.view`. Ten tak může převzít cizí účet | `mail.ts:47`, `nastaveni/emaily/page.tsx` | `email_log` bez těla s tajemstvími; odkazy jen v odeslaném e-mailu |
| S4 | **V** | **Veřejné demo heslo a rychlé přihlášení** za každou roli včetně administrátora; `resetDemoData` a noční cron `seed.ts` smažou firemní data. Chrání to jen `DEMO_MODE=true` | `login-form.tsx`, `settings.ts:159`, `deploy/cron-demo-system` | Do core nepatří. Jen `clients/demo`, nikdy v produkčním image |
| S5 | **S** | Šifrovací klíč se odvozuje z `BETTER_AUTH_SECRET`. Rotace secretu zneplatní SMTP heslo i iCal adresy | `crypto.ts:10` | Samostatný `APP_ENCRYPTION_KEY`, prefix `v1:` už existuje, přidat id klíče |
| S6 | **S** | **SSRF u importu iCal:** DNS se ověří (`lookup`) a `fetch` pak překládá znovu, takže DNS rebinding projde. IPv6 kontrola je prefixová (např. `2001:db8::`, `::ffff:` jen přes prefix) | `calendar-sync.ts:22,40` | Připojit se na ověřenou IP (`undici` `connect.lookup`), blokovat všechny nevěřejné rozsahy IPv4/IPv6 knihovnou |
| S7 | **S** | Žádné bezpečnostní hlavičky ani CSP v aplikaci (`next.config.ts` je jen `poweredByHeader:false`). Spoléhá se na Nginx Proxy Manager | `next.config.ts` | Caddy + CSP s nonce, HSTS, Referrer-Policy, X-Frame-Options |
| S8 | **S** | **Audit není odolný:** zápis po změně a mimo transakci; pokrývá jen část mutací; aplikační uživatel může `UPDATE/DELETE` na `activity`; mazání dat je tvrdé | `action.ts:30`, `server/*` | `audit_log` atomicky, INSERT-only role, soft delete |
| S9 | **S** | **Aplikace běží pod vlastníkem DB** (`POSTGRES_USER=demo`) a migrace i `seed` startují v kontejneru aplikace | `docker-compose.yml`, `docker-start.sh` | Dva DB uživatelé: `migrator` (jednorázový krok) a `app` s minimálními právy |
| S10 | **N** | `/api/cron` porovnává tajemství operátorem `!==` (ne v konstantním čase) a úlohy spouští HTTP vstup. Bez `CRON_SECRET` endpoint vždy vrací 401, takže se tiše nespustí žádná připomínka | `api/cron/route.ts` | Plánovač přes pg-boss, žádný HTTP vstup |
| S11 | **S** | **Pozvánka = reset hesla s platností 1 hodina.** Uživatel, který e-mail otevře druhý den, nemá jak vstoupit; admin pak sahá po `setTemporaryPassword` (sdělení hesla osobně) | `auth.ts:32`, `users.ts:102` | `invitation` s platností 7 dní. Dočasné heslo nahradit novým odkazem; admin nesmí obejít 2FA |
| S12 | **N** | `getUserOptions()` posílá každému uživateli plná pole oprávnění všech aktivních lidí | `queries.ts:498` | Vracet jen `id`, `name`, `color` |
| S13 | **N** | Tajný ICS token je v URL a v DB v čitelné podobě, bez expirace | `calendar_feed`, `api/kalendar/[token]` | Ukládat hash, zobrazit jen při vytvoření |
| S14 | **N** | `setTemporaryPassword` dovolí administrátorovi nastavit heslo jinému administrátorovi bez druhého faktoru | `users.ts:102` | Zrušit, nahradit odkazem; změna role/hesla admina vyžaduje re-autentizaci |
| S15 | **N** | Chyby jdou do `console.error`, žádný error tracking, žádné maskování osobních údajů | `action.ts:22` | GlitchTip/Sentry s `beforeSend` scrubbingem |
| S16 | **N** | Image obsahuje celý zdroj, `node_modules` včetně dev závislostí a `tsx` pro běh; build probíhá na serveru | `Dockerfile` | `output: standalone`, jen produkční závislosti, image z CI |
| S17 | **N** | Změna e-mailu uživatele nevyžaduje potvrzení (`emailVerified` se nepoužívá) | `users.ts:63` | Potvrzení nového e-mailu |

Pozitivní: `server-only` na citlivých modulech, Zod na vstupu, scrypt hash z Better Auth, session se maže při deaktivaci, ochrana před odebráním posledního admina, generická odpověď u zapomenutého hesla, `Origin` kontrola Better Auth + Next server actions.

---

## 9. Výkonové nálezy

Všechno níže je odvozeno z kódu, ne změřeno. Změřím v fázi 6 na stroji 1 vCPU / 4 GB.

| # | Nález | Kde | Dopad |
|---|---|---|---|
| P1 | **Seznam zakázek bez stránkování.** `getJobsList` se 6 korelovanými poddotazy na řádek (fakturováno, uhrazeno, po splatnosti, změny, průběh, zpoždění) se na stránce zavolá **dvakrát** (`allJobs` a podruhé s filtry) plus `getInvoicesList({})` všech faktur. Filtrování částečně v JS | `zakazky/page.tsx:20,48`, `job-queries.ts:12` | Lineární růst, zbytečné dvojí zpracování. Při 10 000 zakázkách nepoužitelné |
| P2 | **Hledání = sekvenční sken.** Až 10 dotazů `unaccent(coalesce(col::text,'')) ILIKE …` na neindexovaných sloupcích. `unaccent` není `IMMUTABLE`, takže jde indexovat jen přes obalovou funkci; `pg_trgm` je nainstalované, ale bez indexu | `search.ts` | Odezva roste s daty; cíl Cmd+K do 150 ms není splnitelný |
| P3 | **Chybějící indexy** (D13). Např. `invoice.job_id` (každý detail zakázky), `job_phase.job_id`, `task.job_id`, `event.starts_at` (kalendář), `time_entry.status` (schvalování) | `drizzle/*.sql` | Sekvenční skeny |
| P4 | **N+1 v cronu:** úloha `job-budget` volá `getJobEconomics()` pro každou aktivní zakázku (~7 dotazů) a pak dotaz per kategorie. Podobně `fleet-deadlines` načítá všechny intervaly a filtruje v JS | `cron/jobs.ts:180,146` | Běží každých 5 min |
| P5 | **Celá aplikace se po mutaci znovu vyrenderuje na serveru.** 84× `revalidatePath`, 7× na `"/", "layout"`. Žádná klientská cache dat, žádné optimistické aktualizace. Odezva závisí na RSC roundtripu | `server/*` | Přímo proti cíli „odezva do 100 ms“ (viz §11, R2) |
| P6 | **Stránky načítají vše pro klienta**: `getUserOptions()` na většině stránek, `getClientOptions()` (všichni klienti) pro formuláře | `queries.ts` | Roste s počtem klientů |
| P7 | **Čísla jako JS `number`** u peněz a množství (sklad) → zaokrouhlovací chyby (`round()` v `stock-engine`) | `stock-engine.ts:333`, `schema.ts:482` | Viz D4 |
| P8 | **Kanban přečísluje `position` po jednom** v transakci při každém přesunu | `leads.ts:116` | Zápis O(n) na přesun |
| P9 | Build image na serveru, `next start` bez standalone | `Dockerfile`, `DEPLOY.md` | Špičky CPU/RAM na 1 vCPU, pomalé nasazení |
| P10 | Odesílání push/e-mailu **synchronně v requestu** (`await notify()` v actions, timeout push 8 s) | `lib/notify.ts`, `server/*` | Uživatel čeká na cizí službu |

Slabě podporuje cíle: aplikace má `mem_limit: 768m`, DB `512m`, takže rozpočet 2,5 GB RAM z §8 zadání je realistický.

---

## 10. Pokrytí Definition of Done: funkce dema → core

Každá funkce má v core ekvivalent, nebo je vynechání zdůvodněné. Pokud nesouhlasíte s vynecháním, řeknete mi v Q-otázkách.

| Funkce dema | Cíl v core | Poznámka |
|---|---|---|
| Přihlášení, reset hesla, deaktivace, odhlášení ze všech zařízení, historie přihlášení | core/auth | + 2FA, pozvánky |
| Matice oprávnění rolí | core/rbac + admin | Navíc scope `own`/`all` |
| Uživatelé, karta zaměstnance | core/employee | |
| Moduly zap/vyp | manifest + config | |
| SMTP v aplikaci + test e-mailu | core/mail + admin | |
| Parametry: pracovní doba, sazby, číselné řady | core/settings, `number_series` | + DPH sazby, branding |
| Firma | core/settings | |
| Historie změn (audit) | core/audit + časová osa | Strukturované diffy |
| Odeslané e-maily | `email_log` | Bez tajných odkazů (S3) |
| Plánované úlohy + stránka Systém | pg-boss + admin „Systém“ + `/api/health` | |
| Upozornění: zvoneček + Web Push | core/notifications | Inbox ze zadání |
| Hledání ⌘K | core/search + cmdk | + akce |
| Přehled podle role + „Vyžaduje pozornost“ | core/dashboard (widgety z modulů) | |
| CRM kanban, detail, prohra, převod na zakázku | poptavky | |
| Klienti | kontakty | + ARES, osoby |
| Zakázky: seznam, detail, tým | zakazky | |
| Fáze, Gantt s tažením, baseline, návaznosti | realizace | Pracovní dny |
| Rozpočet, ekonomika, vícepráce, ruční náklady | zakazky | Řádky místo JSONB |
| Stavební deník (předvyplnění z docházky) | realizace | |
| Faktury (zálohová, průběžná, vyúčtování), úhrady | fakturace | + PDF, platby, export |
| Docházka: týden, schvalování, uzávěrka, výkazy, statistiky, CSV | dochazka | + píchačka |
| Sklad: karty, umístění, doklady, objednávky, inventury, minima | sklad | |
| Stroje: karty, kniha jízd, tankování, servis, intervaly, termíny, rezervace, závady | stroje | |
| Kalendář: pohledy, zdroje, opakování, účastníci, připomenutí, vrstvy | kalendar + generický kalendářní pohled | Q6 |
| ICS odběr, import iCal | kalendar | S6, S13 |
| Úkoly | core/tasks | Polymorfní |
| Web Push zapnutí na zařízení + test | core/notifications | |
| PWA manifest, ikony | apps/web | + terénní UI |
| Téma světlý/tmavý | packages/ui | |
| CSV exporty (výkazy, sklad, jízdy, palivo) | registr entit → CSV/XLSX | |
| **Rychlé přihlášení za role, demo heslo, reset demo dat** | **vynecháno z core** | Jen `clients/demo` (S4) |
| **Pravidlo 16 px + `check:font`** | **vynecháno** | Nahrazeno tokeny; terén min. 16 px (§11) |
| **Google obousměrný kalendář** | **vynecháno** | V demu jen „příprava“; vyžaduje Google Cloud projekt (Q8) |
| **`nasazeni/`, `pack.sh`, cron v `/etc/cron.d`** | **vynecháno** | Nahrazeno §10 zadání |

---

## 11. Rizika a doporučené odchylky od zadání

Zadání respektuji. Níže jsou místa, kde jeho přesné znění naráží na realitu a doporučuju upravit — nebo je to potřeba vědět dopředu.

**R1. Jedna semver image × klientská rozšíření v `clients/<slug>/extensions/` (blokující, Q1).**
Zadání chce `build image → GHCR s tagem verze` (jeden artefakt) a zároveň rozšíření jako zdrojový kód v monorepu, napojený přes háčky. Next.js kompiluje kód do image,
takže rozšíření klienta A musí být součástí buildu. Možnosti:
- **(A) Image per klient:** CI matrix staví `ghcr.io/<org>/rebar-<slug>:vX.Y.Z` z monorepa s build argumentem `CLIENT=<slug>`. Jednoduché, pár klientů zvládne; každé vydání jádra znamená N buildů.
- **(B) Jedna image + za běhu načítané rozšíření** (předkompilovaný JS balíček v připojeném adresáři). Jedna image pro všechny, ale vlastní plugin loader, jiný model oprávnění a bezpečnosti.
- **(C) Klientský repozitář mimo monorepo**, závislý na publikovaných balíčcích `@rebar/*` (privátní registr v GHCR). Nejčistší izolace a předání klientovi, nejvíc režie.

*Doporučení:* **(A)** na start (do ~5 klientů), architekturu háčků držet tak, aby šla přejít na (C). Zapíšu jako ADR 001.

**R2. „Odezva do 100 ms“ s Next.js Server Components.**
Demo po každé změně renderuje stránku na serveru (P5). Pocit Attio vyžaduje klientskou cache dat a optimistické aktualizace. Navrhuji: RSC pro první načtení,
**TanStack Query** pro data tabulek/detailů (hydratace ze serveru), mutace přes server actions s optimistickým zápisem do cache. TanStack Query **není v zadaném stacku**, přidání potřebuje váš souhlas (Q7).
Poznámka: OPSIS (`opdigital-knowledge-base/opsys/`) stejný cíl řeší SPA bez SSR. Pro core držím Next podle zadání a tuhle cache přidávám.

**R3. Registr entit je největší nová práce.** Tabulka s inline editací, filtry, seskupením, vlastními poli a uloženými pohledy nad 8 moduly je řádově víc než samotné moduly. Doporučuju fázi 3 a 4 řezat tak, aby registr vznikl **na dvou entitách** (kontakty, zakázky) a ostatní moduly se napojovaly postupně.

**R4. Rozpor „16 px“ × „13–14 px“.** Demo má 16 px jako tvrdé pravidlo (cílovka jsou starší lidé v terénu). Attio-styl chce 13–14 px. Navrhuji: **desktop kancelář 13–14 px, mobilní terénní UI min. 16 px a dotykové plochy 44 px** (zadání 7.10 to už říká). Potvrdit v Q10.

**R5. Rozpor v příkladu Cmd+K.** Zadání uvádí „sklad“ = „šklad“ *ne*, ale „zakazka“ = „zakázka“ *ano*. S `unaccent` na obou stranách se „šklad“ i „sklad“ budou shodovat. Asymetrii (diakritika v dotazu zúží výsledky) umím zařídit řazením, ne vyloučením. Výchozí chování: obě strany bez diakritiky.

**R6. Radix nemá combobox ani datepicker.** Zadání: Radix + shadcn. Pro výběr záznamu a datum potřebuju `cmdk` (v zadání) a kalendář (`react-day-picker`, nová závislost). Alternativa je ponechat `react-aria-components` pro tyto dva prvky. Q9.

**R7. Servisní přístup agentury.** Role „admin agentury“ je z pohledu klienta (jeho data, jeho server, GDPR) zásadní. Navrhuji: výchozí vypnuto, aktivace klientem na omezenou dobu, povinné 2FA, plný záznam v `audit_log` s `actor_kind = agency`, vypnutelné. Q4.

**R8. Vlastnictví kódu × sdílené jádro.** Obchodní kontext (`_proces/01-co-chapu.md`): „systém je 100 % klienta, kód lze dál rozvíjet i jinde“. Jádro v GHCR image a rozšíření v monorepu to nesplní automaticky; RUNBOOK „předání klientovi při ukončení správy“ musí obsahovat zdrojový kód, licenci a build. Licence jádra je právní otázka (Q5).

**R9. UUID v7 v PostgreSQL 17.** PG 17 nemá `uuidv7()` (přišlo v 18). Generuje aplikace (balíček `uuid` ≥ 10). Bez dopadu na zadání, jen informace.

**R10. Hardcoded stavy v Zodu.** Konfigurovatelné pipeline znamenají, že Zod `z.enum([...])` v actions nahradí validace proti DB (`pipeline_stage`). Vyžaduje načtení stavů při validaci.

**Poznámka k pracovnímu prostředí (mimo rozsah core):** `client-knowledge-base/systemy/demo/` je druhý klon stejného repa (stejné remotes, stejný commit). Hrozí úprava špatné kopie a porušuje pravidlo „každá věc má jedno místo“. Doporučuju jednu z kopií nahradit odkazem. Neřeším bez vašeho pokynu.

---

## 12. Otevřené otázky na vás

**Blokující (nutné před fází 1):**

| # | Otázka | Moje výchozí volba, pokud neodpovíte |
|---|---|---|
| **Q1** | Jak spojit semver image s klientskými rozšířeními? (R1: A / B / C) | **A** – image per klient z CI matrix |
| **Q2** | Kde bude repo? Navrhuji `opdigital-knowledge-base/rebar/` (vedle dema, **mimo** git dema, aby push nespustil auto-deploy), později vlastní GitHub repo `ondrejis/rebar`. Jméno repa a organizace? | `opdigital-knowledge-base/rebar/`, `git init` ve fázi 1, GitHub repo privátní, vytvoří se až na váš pokyn |
| **Q3** | Smím v zadaném stacku doplnit **TanStack Query** (R2) a **uuid** (UUID v7)? | Ano, oboje, s ADR |
| **Q4** | Servisní přístup agentury: model z R7 (vypnuto, časově omezeno, auditováno), nebo jiný? | R7 |
| **Q5** | Licence a předání: co klient dostane při ukončení správy (zdroj jádra + rozšíření, image, návod)? Má jádro licenci „proprietární, klientovi udělena nevýhradní“? | Zapíšu do RUNBOOKu jako návrh a označím k právní kontrole |

**Neblokující (mají výchozí řešení):**

| # | Otázka | Výchozí volba |
|---|---|---|
| Q6 | Přidat **kalendar** jako 9. modul (události, ICS odběr/import)? V zadání §6 chybí. | Ano |
| Q7 | Web Push držet v core? (v zadání jen „notifikace v aplikaci“, ale pro terén klíčové) | Ano, volitelné konfigurací |
| Q8 | Obousměrný Google kalendář: odložit na později (potřebuje Google Cloud projekt)? | Odložit, ICS stačí |
| Q9 | Datum/combobox: přidat `react-day-picker`, nebo ponechat `react-aria-components` jen pro tyto prvky? | `react-day-picker` + `cmdk` |
| Q10 | Typografie: desktop 13–14 px, mobil terén min. 16 px? (R4) | Ano |
| Q11 | Peníze ve skladu: součty v haléřích, jednotková cena `numeric(14,4)` jako zdokumentovaná výjimka z „celé číslo v haléřích“? | Ano (ADR 003) |
| Q12 | Jedna role na uživatele (jako v demu), nebo více rolí? | Jedna role |
| Q13 | Jazykové varianty UI pro ukrajinské pracovníky (Plzeňský bagr zmiňuje)? Slovník z §7.11 to umožní. | Jen čeština, struktura i18n připravena |
| Q14 | Píchačka: ukládat polohu (GPS) při příchodu/odchodu? GDPR a souhlas zaměstnance | Ne ve výchozím stavu, volitelné per klient |
| Q15 | Zálohy restic: čí S3 účet (klientův, nebo agentury)? Cena a vlastnictví dat | Klientův účet |
| Q16 | ARES: veřejné API (bez klíče), s cache v DB a respektováním limitů – souhlasíte? | Ano |
| Q17 | Pokud `KB_PATH` (`client-knowledge-base/systemy/`) má být zdrojem SOP: čtu `_proces/` a klientské specifikace (Thermodo, NIKK). Je tam i další, co mám číst? | Čtu jen `_proces/` a README klientů |

---

## 13. Návrh dalšího postupu po schválení

| Fáze | Obsah | Výstup |
|---|---|---|
| 1 | Monorepo, pnpm, TypeScript strict, lint (vč. pravidla proti klientským podmínkám v jádru), Vitest/Playwright kostra, `docs/adr/` (ADR 001 klientské instance, 002 konvence modelu, 003 peníze a množství), manifest modulu (typy), konfigurace klienta s Zod validací při startu | Prázdná, ale bootující aplikace + CI skeleton |
| 2 | Platforma: auth + 2FA + pozvánky, RBAC se scope, `ctx` a repozitáře, audit, soubory, pg-boss, nastavení, číselné řady, vlastní pole (model), health | Testy oprávnění (montér × faktury) |
| 3 | Design system + app shell + registr entit; první entity **kontakty** a **zakázky**, tabulka s inline editací, filtry, pohledy, detail s panelem, Cmd+K | Vertikální řez, na kterém se ladí UX |
| 4 | Moduly po jednom (poptávky → realizace → fakturace → docházka → sklad → stroje → kalendář), mobilní terén | Každý modul: manifest, migrace, testy, ekvivalenty z §10 |
| 5 | Dockerfile (standalone), Compose, `install.sh`/`update.sh`/`backup.sh`/`restore*.sh`, GitHub Actions, GHCR | Instalace na čistý Ubuntu 24.04 |
| 6 | E2E, výkon na 1 vCPU / 4 GB, dokumentace, `clients/demo` s realistickými daty | Definition of Done |

Dokud neodpovíte na Q1–Q5, **nezakládám monorepo ani `git init`**. Vytvořil jsem jen tuto složku s dokumentem a stručný `_kontext.md`.
