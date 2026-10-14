# OPSIS 01 – Architektura a tech stack

Oct 7, 2026 · @Ondřej Dvořák

## Tech stack

OPSIS je TypeScript monorepo: React SPA na frontendu, Hono API na Node.js, PostgreSQL přes Drizzle. Za loginem nemá server-side rendering žádnou výhodu. Rychlost dělá klientská cache, přednačítání a optimistické updaty, stejný princip jako Linear. Verze knihoven: vždy poslední stabilní v době založení repozitáře, zamčené v lockfile.

| Vrstva | Volba | Proč |
| --- | --- | --- |
| Jazyk | TypeScript (strict) všude | sdílené typy a Zod schémata mezi frontendem a API |
| Balíčky | pnpm workspaces + Turborepo | rychlé buildy, sdílené balíčky |
| Frontend build | Vite + React | okamžitý dev server, malé produkční bundly, code-splitting po routách |
| Routing | TanStack Router | typované routy, přednačítání dat při najetí myší (`preload: 'intent'`), search params jako stav filtrů |
| Data | TanStack Query | cache, optimistické mutace, invalidace, persistovaná cache v IndexedDB pro okamžitý start |
| Tabulky a seznamy | TanStack Table + TanStack Virtual | tisíce řádků bez zasekávání |
| UI primitiva | Radix UI přes shadcn/ui (kód ve vlastním repu, přestylovaný podle dokumentu 04) | přístupnost a klávesnice zdarma, plná kontrola nad vzhledem |
| Styly | Tailwind CSS v4 s tokeny z dokumentu 04 v `@theme` | jeden zdroj tokenů, žádné ad-hoc hodnoty |
| Command palette | cmdk | Cmd+K hledání a příkazy |
| Drag & drop | dnd-kit | kanban obchodů a zakázek, řazení |
| Dashboard grid | react-grid-layout | přetahování a změna velikosti widgetů |
| Formuláře | React Hook Form + Zod | stejná validace na klientu i serveru |
| Grafy | Recharts, přestylované tokeny | jednoduché grafy na dashboardu a ve financích |
| Rich text | Tiptap | poznámky a popisy, ukládané jako JSON + plain text pro hledání |
| Datumy | date-fns s locale `cs` | formátování podle českých zvyklostí |
| API server | Hono na Node.js (LTS) | malý, rychlý, typovaný RPC klient (`hono/client`) bez generování kódu |
| Validace | Zod (`@hono/zod-validator`) | vstupy API a ingest webhooků |
| Databáze | PostgreSQL (poslední stabilní) s rozšířeními `pg_trgm`, `unaccent`, `citext` | fulltext bez diakritiky, fuzzy hledání |
| ORM | Drizzle ORM + drizzle-kit | SQL-first, čitelné migrace, typy ze schématu |
| Auth | Better Auth (e-mail + heslo, TOTP 2FA, záložní kódy, správa relací) | hotové a auditované, běží nad stejnou DB |
| Fronta úloh | pg-boss (fronta v Postgresu) | žádný Redis navíc; synchronizace, ARES, Meta, opakované úlohy |
| Realtime | Server-Sent Events + Postgres `LISTEN/NOTIFY` | dva uživatelé, jednosměrné invalidace stačí |
| Testy | Vitest (unit, integrační proti testovací DB), Playwright (klíčové toky) | rychlé a spolehlivé |
| Kvalita kódu | Biome (lint + format) | jeden rychlý nástroj |
| Provoz | Docker Compose na Hostinger VPS za Traefikem | stávající infrastruktura |

**Zvážené a zamítnuté**

- **Next.js:** SSR a server components přidávají síťovou cestu ke každé navigaci a za loginem nic nepřinášejí.
- **Local-first sync engine (Zero, ElectricSQL, Convex):** nejrychlejší možná odezva, ale vyšší složitost a menší zralost pro AI agenta. Datová vrstva je schovaná za vlastními hooky (`useDeals`, `useProject`…), takže přechod je později možný bez přepisu UI.
- **Supabase / Firebase:** zbytečná závislost; vlastní Postgres na VPS je levnější a plně pod kontrolou.

## Architektura

Všechna data jdou přes jedno API. Jeho servisní vrstva jako jediná čte a zapisuje do databáze, takže oprávnění, viditelnost a activity log nejde obejít.

&#91;embedded content: architektura OPSIS · prohlížeč, API, databáze, externí služby\]

n8n volá zpět na `/api/ingest` (ID složek Disku, leady z Meta). Workery volají externí služby přímo a výsledky ukládají přes servisní vrstvu jako aktér `job`.

## Struktura repozitáře a konvence

Jeden repozitář `opsis` se dvěma aplikacemi a třemi sdílenými balíčky. Frontend a API sdílí schémata, typy a pravidla oprávnění, takže stejné pravidlo nikdy nežije na dvou místech.

```
opsis/
├─ apps/
│  ├─ web/                 # React SPA (Vite)
│  │  ├─ src/routes/       # TanStack Router, soubor = routa
│  │  ├─ src/features/     # deals/, clients/, projects/, tasks/, finance/ …
│  │  │                    #   každá: api.ts (hooky), components/, views/
│  │  ├─ src/components/ui # přestylované shadcn komponenty (dokument 04)
│  │  └─ src/lib/          # query client, shortcuts, formatters (cs-CZ)
│  └─ api/                 # Hono server
│     ├─ src/routes/       # HTTP vrstva, jen validace a volání služeb
│     ├─ src/services/     # business logika + oprávnění + activity log
│     ├─ src/jobs/         # pg-boss workery (sync, ARES, Meta, domény…)
│     ├─ src/integrations/ # google/, meta/, ares/, fakturoid/, n8n/
│     └─ src/ingest/       # příchozí webhooky (n8n)
├─ packages/
│  ├─ db/                  # Drizzle schéma, migrace, seed
│  ├─ shared/              # Zod schémata, enumy, typy, formátování peněz
│  └─ permissions/         # definice funkcí, matice, viditelnost (čisté funkce)
├─ docker/                 # Dockerfile, compose, Traefik labely
└─ docs/                   # tato specifikace v Markdownu
```

**Konvence**

- Kód, DB a API anglicky; UI texty česky v `apps/web/src/i18n/cs.ts` (jeden jazyk, ale texty na jednom místě).
- Tabulky v množném čísle snake\_case (`deals`, `project_payments`), sloupce snake\_case, TypeScript camelCase.
- ID jsou UUID v7 (řaditelné podle času), generované v aplikaci.
- Peníze jsou `bigint` v haléřích (`amount_halere`), formátování jen ve sdíleném helperu `formatCzk()`.
- Data bez času jsou typ `date`; okamžiky `timestamptz`; časová zóna aplikace `Europe/Prague`.
- Měkké mazání: `deleted_at`; koš s obnovou 30 dní, pak trvalé smazání jobem.
- API: REST-ish přes Hono RPC (`GET /api/deals`, `PATCH /api/deals/:id`), seznamy s keyset stránkováním (`cursor`), filtry v jednotném formátu (dokument 03, Filtry).
- Chyby: jednotný tvar `{ error: { code, message, fields? } }`, česká hláška pro UI.
- Commity podle Conventional Commits, každá fáze ve vlastní větvi s PR.

## Autentizace, 2FA a bezpečnost

OPSIS běží na veřejné doméně, takže přihlášení je jediná brána k datům klientů. 2FA je povinné pro každý účet a registrace zvenku neexistuje.

**Přihlášení**

1. Účty zakládá jen Owner pozvánkou (jednorázový odkaz platný 48 h). Veřejná registrace je vypnutá.
2. Při prvním přihlášení si uživatel nastaví heslo (min. 12 znaků, kontrola proti seznamu uniklých hesel) a TOTP aplikaci (Google Authenticator, 1Password apod.). Dostane 10 záložních kódů.
3. Bez dokončeného 2FA se nedostane dál než na obrazovku nastavení 2FA.
4. Relace: HTTP-only, `Secure`, `SameSite=Lax` cookie; platnost 30 dní s prodlužováním při aktivitě; „Důvěřovat tomuto zařízení“ přeskočí TOTP na 30 dní.
5. Přehled aktivních relací v profilu s možností odhlásit jednotlivá zařízení; Owner může odhlásit kohokoli.
6. Volitelně passkey jako druhý faktor (v2).

**Ochrana**

- Rate limiting přihlášení: 5 pokusů / 15 min na účet a IP, poté zpoždění.
- Hesla hashovaná (Argon2id nebo výchozí bezpečný algoritmus Better Auth).
- Ochrana CSRF (same-origin API pod `/api`, kontrola `Origin`).
- Bezpečnostní hlavičky: CSP bez `unsafe-inline` skriptů, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- Tokeny integrací (Google, Meta, Fakturoid) šifrované v DB (AES-256-GCM, klíč jen v env).
- Ingest endpointy pro n8n chráněné HMAC podpisem těla (`X-Opsis-Signature`) a sdíleným tajemstvím; ověřování časové značky proti replay (±5 min).
- Každé přihlášení, neúspěšný pokus, změna 2FA a změna oprávnění jde do activity logu (kategorie `security`).
- Aplikace neindexovatelná (`robots.txt` disallow, `noindex`).

## Engine oprávnění a viditelnosti

Oprávnění mají dvě nezávislé vrstvy: **co uživatel smí dělat** (matice funkcí) a **které záznamy vidí** (viditelnost). Obě vrstvy žijí v balíčku `packages/permissions` jako čisté funkce a API je vynucuje vždy na serveru. Frontend je používá jen ke skrytí tlačítek.

**Vrstva 1: matice funkcí**

Každá funkce má klíč `modul.akce`. Owner má implicitně vše. Partnerovi se ukládá množina zapnutých klíčů v tabulce `user_permissions`.

| Modul | Klíče | Výchozí pro Partnera |
| --- | --- | --- |
| Obchody | `deals.view`, `deals.create`, `deals.edit`, `deals.delete`, `deals.export` | vše kromě `delete`, `export` |
| Organizace a kontakty | `contacts.view`, `contacts.create`, `contacts.edit`, `contacts.delete`, `contacts.export` | vše kromě `delete`, `export` |
| Klienti | `clients.view`, `clients.edit`, `clients.archive` | `view`, `edit` |
| Zakázky | `projects.view`, `projects.create`, `projects.edit`, `projects.delete`, `projects.manage_members` | vše kromě `delete` |
| Úkoly a aktivity | `tasks.view`, `tasks.create`, `tasks.edit`, `tasks.delete` | vše |
| Poznámky | `notes.view`, `notes.create`, `notes.edit`, `notes.delete` | vše |
| Finance | `finance.view`, `finance.payments_write`, `finance.splits_edit`, `finance.settlements_write` | `view`, `payments_write` |
| Hodiny | `time.view_all`, `time.log` | vše |
| Kalendář | `calendar.view`, `calendar.write` | vše |
| Reklama | `ads.view`, `ads.manage_accounts` | `view` |
| Šablony e-mailů | `email_templates.view`, `email_templates.manage` | vše |
| Activity log | `activity.view` | zapnuto |
| Nastavení | `settings.pipelines`, `settings.custom_fields`, `settings.templates`, `settings.tags`, `settings.integrations`, `settings.users` | `pipelines`, `custom_fields`, `templates`, `tags` |
| Jen pro Ondřeje | `owner.hosting`, `owner.domains`, `owner.email_library`, `owner.recurring_invoices` | vypnuto |

Matice v UI: řádek = funkce, sloupec = uživatel, přepínač v buňce. Změna se projeví do 5 s (invalidace relace přes SSE). Seznam klíčů je jediný zdroj pravdy v `packages/permissions/features.ts`; nový modul bez klíčů neprojde CI testem.

**Vrstva 2: viditelnost záznamů**

- Každý dotaz na hlavní entity prochází funkcí `scopeVisible(query, user)`. U Ownera nedělá nic. U ostatních přidá `WHERE visibility = 'shared'` a u entit s rodičem i kontrolu rodiče (např. úkol soukromé zakázky).
- Rodičovská viditelnost se při změně propisuje do dětí v transakci (sloupec `visibility` je denormalizovaný kvůli rychlosti). Zpětné zveřejnění rodiče zveřejní děti, které nebyly soukromé samy o sobě (sloupec `visibility_source` = `own` | `inherited`).
- Agregace (součty pipeline, dashboard, saldo, počty v sidebaru) používají stejný scope. Partner nikdy nevidí číslo, které obsahuje soukromá data.
- Hledání, activity log a SSE události filtrují stejně; událost o soukromém záznamu se Partnerovi vůbec neodešle.
- Externista (budoucí): scope = jen záznamy, kde je členem zakázky nebo řešitelem úkolu.

**Povinné testy**: pro každý endpoint seznamu, detailu, hledání a agregace test, že Partner nedostane soukromý záznam Ownera ani jeho příspěvek do součtu.

## Výkon

Cíl je, aby uživatel na nic nečekal: obrazovky s daty v cache se ukážou okamžitě a každá úprava se projeví dřív, než odpoví server. Rozpočty níže jsou závazné a měří se v CI (Lighthouse CI + vlastní měření přes `performance.mark`).

| Metrika | Rozpočet |
| --- | --- |
| Přechod mezi obrazovkami s daty v cache | < 100 ms do vykreslení |
| Přechod na novou obrazovku (data se načítají) | skeleton do 50 ms, data p95 < 300 ms |
| Odezva na úpravu (inline edit, přetažení v kanbanu) | okamžitě (optimisticky), potvrzení serveru p95 < 200 ms |
| Cmd+K hledání | výsledky p95 < 150 ms od posledního znaku (debounce 80 ms) |
| API seznamy (50 řádků) | p95 < 120 ms na serveru |
| První načtení aplikace (studená cache, 4G) | interaktivní < 2 s |
| Opakované otevření (teplá cache) | data z IndexedDB < 300 ms, pak tichá revalidace |
| JS bundle shellu | < 220 kB gzip; každý modul jako lazy chunk |

**Techniky (povinné)**

1. **Přednačítání při záměru.** Najetí myší nebo fokus na odkaz spustí načtení dat routy (`preload: 'intent'`). Klávesové šipky v seznamu přednačítají detail sousedního řádku.
2. **Optimistické mutace.** Každá úprava nejdřív změní cache, při chybě se vrátí a ukáže toast s možností opakovat.
3. **Persistovaná cache.** TanStack Query cache uložená v IndexedDB (bez soukromých dat po odhlášení: vymazat při logoutu).
4. **Stale-while-revalidate.** Seznamy `staleTime` 30 s, detaily 10 s, číselníky (pipeline, uživatelé, štítky) 10 min; realtime události invalidují přesně dotčené klíče.
5. **Virtualizace** každého seznamu nad 100 řádků.
6. **Keyset stránkování**, žádný `OFFSET`. Počty pro sidebar a filtry počítat zvlášť a cachovat.
7. **Indexy**: na všech cizích klíčích, na `(visibility, deleted_at)`, na stavech a datech používaných ve filtrech; GIN trigram index pro hledání (dokument 02).
8. **Žádné vodopády.** Detail záznamu načte hlavní data jedním dotazem; vedlejší panely (timeline, aktivity) paralelně.
9. **Fonty a ikony**: Inter jako variabilní WOFF2 s preloadem, ikony stromově otřesené (jen použité Lucide ikony).

## Realtime, background joby a activity log

Když Patrik přesune obchod, Ondřej to vidí do 2 s bez obnovení stránky. Pomalé a opakované práce běží ve frontě mimo HTTP požadavek.

**Realtime**

- Servisní vrstva po commitu transakce pošle `NOTIFY opsis_events` s payloadem `{ entity, id, action, visibility, actorId }`.
- API drží jedno spojení `LISTEN` a události rozesílá přes SSE (`GET /api/events`) přihlášeným klientům. Před odesláním aplikuje viditelnost.
- Klient podle `entity` a `id` invaliduje příslušné query klíče. Vlastní události (stejné `actorId` a relace) ignoruje, protože už má optimistický stav.
- Při výpadku spojení se klient znovu připojí s exponenciálním odstupem a po obnovení invaliduje vše aktivní.

**Background joby (pg-boss)**

| Job | Spouštění | Co dělá |
| --- | --- | --- |
| `ares.lookup` | na vyžádání | načte subjekt z ARES, uloží do cache 24 h |
| `n8n.deliver` | po události | doručí odchozí webhook do n8n, retry 5× s odstupem (1 min → 1 h) |
| `gcal.sync` | push notifikace + každých 5 min | inkrementální synchronizace kalendářů (v2) |
| `gcal.renew_watch` | denně | obnoví push kanály Google před expirací (v2) |
| `meta.insights` | denně 6:00 + ručně | stáhne spend a výsledky za posledních 7 dní (v2) |
| `retainer.generate` | 1. den v měsíci 5:00 | vytvoří plánované platby retainerů na aktuální měsíc |
| `domains.check` | denně 7:00 | přepočítá stavy expirace domén a hostingů (v2) |
| `invoices.prepare` | denně 7:00 | připraví návrhy ročních faktur X dní před obnovou (v3) |
| `trash.purge` | denně 3:00 | trvale smaže záznamy v koši starší 30 dní |
| `backup.verify` | týdně | ověří, že poslední záloha jde obnovit do dočasné DB |

**Activity log**

- Zapisuje servisní vrstva ve stejné transakci jako změnu. Nic se nezapíše mimo ni.
- Záznam: `actor_user_id` (nebo `actor_system` = `n8n` | `job` | `google`), `action` (`create`, `update`, `delete`, `restore`, `stage_change`, `won`, `lost`, `visibility_change`, `login` …), `entity_type`, `entity_id`, `changes` (JSON `{ pole: [před, po] }`), `context` (např. `deal_id` pro úkol), `ip`, `user_agent`, `created_at`.
- Záznamy jsou neměnné: žádné API pro úpravu ani mazání; tabulka bez `UPDATE`/`DELETE` práv pro aplikační DB roli.
- Citlivá pole (tokeny, hesla) se do `changes` nikdy nezapisují.
- Timeline každého záznamu = jeho activity log + aktivity, poznámky a platby, seřazené podle času.

## Integrace

OPSIS mluví s pěti službami. Google Disk řídí n8n, ostatní integrace volá OPSIS přímo. Každá integrace má v Nastavení → Integrace stav (připojeno / chyba / poslední synchronizace) a tlačítko „Otestovat“.

| Služba | Směr | Kdo volá | Fáze |
| --- | --- | --- | --- |
| ARES | čtení údajů o firmě podle IČO | OPSIS API | MVP |
| Google Disk | vytvoření, přejmenování, archivace složek | OPSIS → n8n → Disk, n8n vrací ID | MVP |
| Meta Lead Ads | příjem leadů | Meta → n8n → OPSIS | v2 |
| Meta Marketing API | spend a výsledky kampaní | OPSIS job | v2 |
| Google Kalendář | obousměrná synchronizace | OPSIS API + push notifikace | v2 |
| Fakturoid (Ondřej) | vytvoření ročních faktur | OPSIS API | v3 |
| n8n obecně | odchozí události pro vlastní automatizace | OPSIS → n8n | MVP |

### ARES

- Endpoint REST API ARES pro ekonomické subjekty podle IČO (`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}`; agent ověří aktuální dokumentaci).
- Při zadání 8místného IČO (kontrola mod 11) se do 2 s předvyplní název, sídlo (ulice, obec, PSČ), DIČ, právní forma. Uživatel vidí, co se změní, a potvrdí.
- Tlačítko „Aktualizovat z ARES“ na kartě firmy; uložit `ares_synced_at`. Cache odpovědí 24 h. Výpadek ARES nesmí blokovat uložení.

### Google Disk přes n8n

OPSIS pošle webhook, n8n vytvoří složky ve Shared Drive podle šablony, kterou mu OPSIS pošle v payloadu, a zavolá zpět s ID složek. Workflow v n8n je tak generický a strukturu složek mění Ondřej v Nastavení OPSIS.

| Událost (OPSIS → n8n) | Kdy | Co n8n udělá |
| --- | --- | --- |
| `drive.client.create` | firma dostane stav klienta, nebo ruční „Vytvořit složku“ | kořenová složka klienta + `00 Klient` + složky aktivních služeb |
| `drive.client.add_service` | klientovi přibude služba | dovytvoří chybějící složku služby |
| `drive.project.create` | vznikne zakázka | složka zakázky ve složce služby + podsložky podle typu |
| `drive.client.rename` | změna názvu klienta | přejmenuje kořenovou složku |
| `drive.client.archive` / `restore` | stav Bývalý / zpět | přesune do `Archiv` / zpět |

Payload: `{ eventId, event, client: { id, name, ico, folderId? }, project?: { id, code, name, type, startDate }, structure: { … }, callbackUrl }`. Callback `POST /api/ingest/drive` s `{ eventId, status: 'ok' | 'error', folders: { root?, services?: { web?, marketing?, systems? }, project? }, error? }`.

OPSIS ukládá ID složek, nikdy cesty, takže přejmenování v Disku nic nerozbije. Tlačítko „Otevřít Disk“ otevře `https://drive.google.com/drive/folders/{id}` v nové kartě. Dokud callback nepřijde, tlačítko ukazuje stav „Vytváří se…“; po chybě nebo 10 min bez odpovědi „Zkusit znovu“. Struktura složek je v dokumentu 03.

### Meta Lead Ads (v2)

- n8n přijme lead z Meta a pošle `POST /api/ingest/leads` s `{ source: 'meta', leadgenId, formId, campaignId, adsetId, adId, pageId, createdTime, fields: { fullName, email, phone, companyName, … }, raw }`.
- Idempotence podle `leadgenId`. Kontakt se páruje podle e-mailu nebo telefonu (normalizovaný E.164); firma podle názvu nebo IČO, jinak se založí nová.
- Vznikne obchod v pipeline podle mapování formuláře (Nastavení → Integrace → Meta; výchozí pipeline „Obchody“), ve fázi „Nová poptávka“, se zdrojem `meta` a ID kampaně, sady a reklamy.

### Meta Marketing API (v2)

- Přístup přes system user token z Business Manageru (šifrovaně v DB), seznam reklamních účtů se načte a Owner u každého určí, jestli patří OP Digital, nebo klientovi (a které zakázce).
- Job `meta.insights` stahuje denní data na úrovni kampaně, sady a reklamy: spend, zobrazení, kliky, leady (akce typu lead). Ukládá se do `ad_insights_daily`; posledních 7 dní se přepisuje kvůli zpětným korekcím Meta.
- Propojení s leady přes `campaign_id` / `ad_id` → CPL podle kampaně, náklad na vyhraný obchod.

### Google Kalendář (v2)

- Jedna OAuth aplikace v Google Workspace (interní). Každý uživatel připojí svůj účet sám; scope pro události a seznam kalendářů.
- Uživatel zvolí, které kalendáře OPSIS zobrazuje, a jeden výchozí, kam zapisuje.
- OPSIS → Google: úkol typu schůzka nebo hovor s časem vytvoří událost; ID úkolu v `extendedProperties.private.opsisTaskId`. Změna a smazání se propíší.
- Google → OPSIS: push notifikace (`events.watch`) + inkrementální sync přes `syncToken`; záloha polling 5 min. Události z Google se zobrazují v kalendáři OPSIS; k obchodu nebo klientovi je jde připojit ručně, nebo automaticky podle e-mailu účastníka shodného s kontaktem.
- Konflikty: vyhrává novější změna (porovnání `updated` a `etag`); každá synchronizační změna jde do logu s aktérem `google`.
- Pozvánky účastníkům se posílají jen při zapnutém přepínači u schůzky (`sendUpdates`).

### Fakturoid (v3, jen Ondřej)

- API v3 Fakturoidu s OAuth client credentials. Odběratel se páruje podle IČO, jinak se v Fakturoidu založí.
- Systém faktury jen připraví jako návrh v OPSIS; teprve po potvrzení Ondřejem vznikne faktura ve Fakturoidu a její číslo a odkaz se uloží zpět.

### Odchozí události pro n8n

V Nastavení → Integrace jde zaregistrovat webhook URL a vybrat události: `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost`, `client.status_changed`, `project.created`, `project.phase_changed`, `project.completed`, `task.created`, `task.completed`, `payment.created`, `payment.paid`. Payload = událost + aktuální stav záznamu; podpis HMAC; doručení přes job `n8n.deliver` s retry a logem doručení. Soukromé záznamy Ownera se posílají jen na webhooky označené „jen Owner“.

## Provoz

OPSIS běží jako tři kontejnery na stávajícím Hostinger VPS za Traefikem: `web` (statické soubory SPA), `api` (Hono + workery pg-boss) a `db` (PostgreSQL, jen ve vnitřní síti). SPA i API jsou na jedné doméně, API pod `/api`, takže cookies fungují bez CORS.

**Deployment**

- Doména: subdoména na doméně agentury (doplnit), HTTPS přes Let's Encrypt v Traefiku.
- CI (GitHub Actions): lint, typecheck, testy, build Docker image, push do registry; nasazení `docker compose pull && up -d` přes SSH. Migrace se spustí před startem nové verze API (`drizzle-kit migrate`); migrace musí být zpětně kompatibilní s běžící verzí.
- Prostředí: `development` (lokálně, Docker Compose), `production`. Staging není nutný, testovací DB pro CI ano.

**Zálohy**

- `pg_dump` každou noc ve 2:00, šifrované (age nebo GPG), uložené mimo VPS (S3-kompatibilní úložiště, např. Backblaze B2), retence 30 denních + 12 měsíčních.
- WAL archivace pro obnovu k bodu v čase je volitelná (v2).
- Týdenní job ověří obnovu zálohy do dočasné databáze.

**Monitoring**

- Chyby frontendu i API: Sentry (nebo self-hosted GlitchTip).
- Dostupnost: Uptime Kuma na `/api/health` (kontroluje DB a frontu).
- Strukturované logy API (pino, JSON), rotace v Dockeru.
- Stránka Nastavení → Systém (jen Owner): verze, stav fronty, poslední zálohy, chybné doručení webhooků.

**Proměnné prostředí**

```
DATABASE_URL=postgresql://opsis:***@db:5432/opsis
APP_URL=https://opsis.<doména>
AUTH_SECRET=***
ENCRYPTION_KEY=***            # AES-256-GCM pro tokeny integrací
N8N_WEBHOOK_URL=***           # cíl událostí Disku
N8N_SIGNING_SECRET=***        # HMAC pro odchozí i příchozí
GOOGLE_CLIENT_ID=***          # v2
GOOGLE_CLIENT_SECRET=***      # v2
META_APP_ID=***               # v2
META_APP_SECRET=***           # v2
FAKTUROID_CLIENT_ID=***       # v3
FAKTUROID_CLIENT_SECRET=***   # v3
SENTRY_DSN=***
BACKUP_S3_ENDPOINT=***
BACKUP_S3_BUCKET=***
BACKUP_S3_KEY=***
BACKUP_S3_SECRET=***
BACKUP_ENCRYPTION_KEY=***
```

Tajemství jsou jen v env na serveru a v GitHub Secrets, nikdy v repozitáři ani v databázi v čitelné podobě.
