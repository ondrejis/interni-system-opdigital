# Podklad pro SECURITY.md (kostra faktů)

Stav k 2026-10-09, agent „Bezpečnost a výkon“. Finální dokument je `docs/SECURITY.md`; tady jsou jen ověřená fakta a odkazy na testy.

## 1. Model hrozeb (krátce)

| Kdo / co                                     | Co chce                                                | Čím ho zastavujeme                                                                               |
| -------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Zaměstnanec s nižší rolí (montér, mistr)     | vidět ceny, sazby, marže, faktury, cizí zakázky a lidi | oprávnění v datové vrstvě, skryté atributy, maskování odpovědí příkazů, rozsah „jen moje“        |
| Neověřený návštěvník internetu               | uhodnout účet, token, klíč; zahltit                    | rate limity, jednotná odpověď, 256bitové tokeny (v DB jen SHA-256), nenalezeno = nenalezeno      |
| Cizí web (CSRF, clickjacking, XSS)           | provést akci jménem přihlášeného                       | kontrola původu (server actions i route handlery), CSP, `frame-ancestors 'none'`, React escapuje |
| Uživatel, který zadá adresu (kalendář, push) | donutit server volat interní síť (SSRF)                | povolený seznam hostitelů pro push, bezpečné stahování kalendáře (viz 5)                         |
| Únik zálohy / logů / error trackingu         | tajemství a osobní údaje                               | šifrovaná tajemství v DB, scrubbing logů a událostí, zálohy šifrované (restic)                   |
| Chyba v závislosti                           | vzdálené spuštění kódu                                 | `pnpm audit`, Renovate týdně, image jen z CI, běh bez roota                                      |

Mimo model: kompromitovaný server nebo správce databáze (superuživatel), fyzický přístup, kompromitovaný počítač majitele.

## 2. Kde se kontrolují oprávnění

1. **Brána příkazu** (`apps/web/src/server/command-gate.ts`, volá ji `runCommand`): stačí kterékoli z uvedených oprávnění. Příkaz bez oprávnění vyžaduje jen přihlášení a data hlídá handler.
2. **Datová vrstva** (ADR 007): `assertEntityAccess`, `scopedWhere`, `scopeOf`, entity engine (`can(read/write/delete)` pro konkrétní záznam, `visibleTo` skrývá atributy s `permission`).
3. **Handler příkazu**: u příkazů s oprávněním „jen čtení“ nebo bez oprávnění (docházka, fáze, deník, kalendář) kontroluje záznam a vlastníka sám.
4. **Maskování peněz**: sklad (`prices.ts`, `sklad.write` nebo `zakazky.economics`), stroje (`costs.ts`, `stroje.write` nebo `zakazky.economics`), docházka (náklady jen `zakazky.economics`), zakázky (`canSeeMoney`).
5. UI oprávnění jen zobrazuje; není to jediná kontrola.

Rozsah „jen moje“ u **docházky**: mistr (`dochazka.read/approve = own`) vidí, zapisuje a schvaluje docházku jen **svého týmu**: sebe a lidi, kteří zapsali hodiny na zakázky, které mistr smí vidět (`teamUserIds`). Cizí člověk se tváří jako neexistující (`NotFoundError`).

## 3. Automatické testy oprávnění (jak číst, jak rozšířit)

- `tests/security-matrix.int.test.ts` (+ `tests/support/security-fixture.ts`, `security-probes.ts`, `scan.ts`): výchozí role `owner`, `office`, `foreman`, `worker` z `DEFAULT_ROLES`, dvě zakázky (A: mistr A + montér A, B: cizí) se všemi druhy peněz s „podpisovými“ částkami.
  - **každý registrovaný příkaz musí mít probe** v `security-probes.ts`, jinak test padá (nový příkaz = nutné zařazení);
  - brána příkazu × 4 role; mistr a montér nedostanou příkazy s ekonomikou, fakturací, rozpočtem, nastavením;
  - každý příkaz dostupný mistrovi a montérovi se spustí nad vlastní zakázkou (odpověď se skenuje na peníze podle podpisových částek i podle názvů polí `*Minor`, `price`, `rate`, `margin`…) a nad cizí zakázkou / cizím záznamem (musí skončit `PermissionError` nebo `NotFoundError`);
  - každá entita × role: čtení, úprava, vytvoření, smazání, obnovení;
  - výslovné scénáře ze zadání: montér nevidí faktury ani přijaté faktury, nevidí cizí výkazy, mistr nevidí cizí zakázky (seznam, detail, hledání, export), API a seznamy nevrací peněžní atributy bez `zakazky.economics`, časová osa zakázky neukáže peníze, přehled neukáže peníze, soubory a komentáře cizí zakázky nejdou;
  - kladné kontroly (kancelář a majitel peníze vidí), aby skener nebyl slepý.
- `tests/public-surface.int.test.ts`: interní název v e-mailech, PDF (faktura, nabídka), iCal, veřejné stránce investora; PDF smí vyrobit jen oprávněný; nabídka bez nákladů; neplatný / zrušený token investora = `null`.
- `tests/auth-hardening.int.test.ts`: stejná odpověď pro existující a neexistující účet (přihlášení, obnova hesla), 3 žádosti o obnovu za minutu, odkaz na obnovu jednou, hesla jako argon2id.
- `tests/query-count.int.test.ts`: žádné N+1 (též výkon).
- `tests/security-static.test.ts`: hlavičky v Caddyfile, ochrana každého route handleru, zakázané vzory, tajemství v repu, klientská logika v jádru.
- Spouštění: `REBAR_TEST_DB_NAME=rebar_test_sec pnpm exec vitest run tests/security-matrix.int.test.ts …` (desítky sekund).

## 4. Nalezené a opravené úniky oprávnění

| Úniku podléhalo                                                                                                                             | Kdo to viděl                                                                                                     | Oprava                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Docházka: `week`, `month`, `save`, `delete`, `reviewWeek`, `approvals`, `report` bral `dochazka.approve: own` jako „všichni“                | mistr: výkazy, absence (nemoc, lékař) a **hodinové náklady všech lidí**, mohl zapisovat a schvalovat za kohokoli | tým mistra (`teamUserIds`), `NotFoundError` pro cizí; `report` a absence ve kalendáři jen za tým                  |
| `dochazka.report` vracel `costMinor` každému schvalovateli                                                                                  | mistr (sazba × hodiny)                                                                                           | jen `zakazky.economics`                                                                                           |
| Sklad: průměrná cena, poslední cena, hodnota zásob, ceny dokladů a objednávek, dlaždice „Hodnota skladu“, atributy `stock_item`/`stock_doc` | montér, mistr (`sklad.read: all`)                                                                                | `maskPrices` v příkazech, atributy s `permission: sklad.write`, dlaždice jen s cenami, UI skrývá sloupce          |
| Stroje: cena tankování, náklady servisu, interní sazba, pořizovací cena                                                                     | montér, mistr (`stroje.read: all`)                                                                               | `maskCosts`, atributy `internalRate`, `purchasePrice` s `permission: stroje.write`, UI skrývá sloupce             |
| Časová osa zakázky (audit) nesla částky (náklad, schválení, změny, faktury) a změny skrytých atributů                                       | mistr, montér na své zakázce                                                                                     | `visibleAudit`: změny skrytých atributů se vynechají, záznamy s částkou v textu se skryjí bez `zakazky.economics` |
| Zádržné zakázky (`retentionBp`) bez `permission`                                                                                            | mistr, montér                                                                                                    | `permission: zakazky.economics`                                                                                   |
| Názvy cizích zakázek v popiscích (fronta docházky, skladové pohyby, rezervace strojů, událost v kalendáři)                                  | kdokoli s čtením sklad/stroje/kalendář                                                                           | `visibleRecordTitles` (jen záznamy, které aktér smí vidět) místo `recordTitles`                                   |

Zbývá vědomě: `jobId` (neuhádnutelné UUID) zůstává v odpovědích tankování a událostí kalendáře; název a data zakázky se neprozradí. Vlastní pole (custom fields) nemají oprávnění per pole, proto do nich nepatří peníze zakázek.

## 5. Hlavičky, CSRF, limity (co přesně platí)

**Caddy** (`deploy/caddy/Caddyfile`, test `tests/security-static.test.ts`):
`Strict-Transport-Security: max-age=31536000; includeSubDomains`; `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy: camera=(self), microphone=(), geolocation=(self), payment=()`; `-Server`;
CSP: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.
**Bez `unsafe-eval`** a bez cizích zdrojů. `'unsafe-inline'` ve `script-src` zůstává, protože Next.js (hydratace) a skript motivu jsou inline; kompenzují ho: React escapuje všechna data, `dangerouslySetInnerHTML` jen pro konstantní CSS a skript motivu (hlídá test), `object-src`/`base-uri`/`form-action` omezeny. Přechod na nonce je možný přes proxy Next.js, zatím se nedělal.
**Nové:** veřejné cesty (`/api/intake/*`, `/api/auth/*`, `/api/invitations/*`, `/api/push/*`) mají v Caddy limit těla **256 KB**, zbytek 30 MB (nahrání souboru je do 25 MB).
Odpovědi se soubory: `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, inline jen obrázky (JPEG/PNG/WebP/GIF) a PDF, SVG a HTML se nenahrávají; typ souboru se pozná podle obsahu.

**CSRF:** server actions kontroluje Next.js (cizí `Origin` → „Invalid Server Actions request“, ověřeno proti běžící aplikaci); route handlery s mutací volají `sameOriginOrFail` (chybí `Origin` i `Referer` = odmítnout); Better Auth kontroluje původ sám; příjem poptávek chrání Bearer klíč a nemá cookie. Test projde všechny `route.ts`.

**Rate limity (DB, pevné okno):** přihlášení 8/min/IP, žádost o obnovu hesla 3/min, nastavení hesla 5/min, TOTP 8/min, záložní kód 5/min, ostatní auth 120/min; pozvánka 10 pokusů/10 min; příjem poptávek 60/min/IP; odběr kalendáře 120/min/IP; veřejná stránka investora a její soubory 120/min/IP; nahrávání 120/min/uživatel. IP se bere z `X-Forwarded-For`, který Caddy přepisuje adresou spojení; **bez Caddy před aplikací je hlavička padělatelná**.
Omezení jen podle IP: útok z mnoha adres proti jednomu účtu omezen není (kompenzace: povinné 2FA pro vedení, argon2id).

**Tokeny:** odkaz pro investora 32 B náhody (43 znaků), odběr kalendáře 24 B, pozvánka 7 dní jednorázová; v DB jen SHA-256 (nebo šifrované); neplatný, zrušený i prošlý je stejně „nenalezeno“. Přihlášení / obnova hesla neprozradí existenci účtu (stejná odpověď).

**Nahrávání:** velikost ≤ 25 MB, typ podle obsahu a shoda s příponou, jen obrázky, PDF, Office, TXT, CSV; název souboru se čistí; práva ke čtení se ověřují při každém stažení.

**SSRF:** import kalendáře (`kalendar/src/safe-fetch.ts`): jen `https` na 443, bez přihlašovacích údajů, adresa se ověřuje při připojení (`lookup`) i při přesměrování (max 3), blokuje loopback, privátní, link-local, CGNAT, multicast, IPv6 zabalené IPv4; 10 s, 5 MB. Push: povolený seznam hostitelů (FCM, Mozilla, Apple, Windows). Počasí: pevný seznam hostitelů Open-Meteo. PDF: pdfmake bez přístupu k souborům a síti.

**Otevřená přesměrování:** žádná z parametru (test). **XSS:** žádné `innerHTML` z dat; e-maily escapují HTML. **SQL:** jen přes Drizzle / parametrizované `sql`; `sql.raw`/`.unsafe` jen na třech místech s ověřeným vstupem (test hlídá seznam).

## 6. Tajemství, závislosti, logy

- **Sken repozitáře** (`git grep` + celá historie `git log -p`, 56 commitů, vzory pro klíče AWS/GitHub/Google/Slack, soukromé klíče, `AUTH_SECRET=`…): nic nalezeno. Testy: `tests/security-static.test.ts` (sken sledovaných souborů při každém běhu).
- `.env.example` (kořen) a `deploy/.env.example` mají **tajná pole prázdná** (kořenový vzor dřív nesl ukázkový `AUTH_SECRET`; opraveno). V produkci aplikace **odmítne nastartovat** s ukázkovým `AUTH_SECRET` (`zmen-me`, `changeme`…).
- **`pnpm audit --prod`** (2026-10-09): 0 kritických, 0 vysokých, **1 střední**: `esbuild` ≤ 0.24.2 (GHSA-67mh-4wv8-2f99, vývojový server esbuild) přes `better-auth > drizzle-kit > @esbuild-kit/esm-loader`. Zdůvodnění: jde o nástroj pro generování migrací, vývojový server esbuild se za běhu nespouští ani nevystavuje. Řešení: sledovat aktualizaci `drizzle-kit`/`better-auth` (Renovate).
- **Logy a chyby:** neočekávaná chyba uživateli vrací jen „Něco se nepovedlo“; do logu a do error trackingu jde přes `scrubText`/`scrubError`: skryje se `params:` z chyb ORM (obsahuje hesla, otisky, osobní údaje), přihlašovací údaje v adrese, `klíč=hodnota` pro heslo/token/cookie/Bearer, e-maily, telefony, dlouhé tokeny, UUID (testy v `scrub.test.ts`). Sentry nesbírá uživatele, hlavičky, těla ani query string.
- Worker bez SMTP v produkci nevypisuje do logu obsah e-mailu (odkazy na obnovu hesla / pozvánku), jen příjemce a předmět.

## 7. Interní název a klientská logika

- Interní název se v kódu vyskytuje jen jako `@rebar/*` a `INTERNAL_NAME` (`tests/guards.test.ts`, teď včetně `.js`); nově i soubory klientů (`clients/**`), veřejné soubory (service worker, manifest), e-maily, PDF faktury a nabídky, iCal a veřejná stránka investora (`tests/security-static.test.ts`, `tests/public-surface.int.test.ts`).
- Klientská podmínka v jádru: `slug ===`, `client ===`, `switch (…slug)`, `process.env.CLIENT`, `NEXT_PUBLIC_BUILT_FOR_CLIENT`, cesty do `clients/` mimo alias (`tests/security-static.test.ts` + starší `guards.test.ts`); povolen je jen `bootstrap.ts` a schéma konfigurace.

## 8. Hlášení a řešení incidentu (návrh postupu)

1. Hlášení: e-mail na bezpečnostní kontakt agentury (info@opdigital.cz), v předmětu „Bezpečnost“; kdo nález zjistí, nic nemaže a nezveřejňuje.
2. Do 1 pracovního dne: potvrdit, určit závažnost (únik dat / zneužití účtu / dostupnost).
3. Omezit: odebrat roli nebo deaktivovat účet, zrušit relace (`Nastavení › Uživatelé › Odhlásit všude`), zrušit odkazy pro investora a odběry kalendáře, změnit `AUTH_SECRET` (odhlásí všechny) a `HEALTH_TOKEN`; při úniku `APP_ENCRYPTION_KEY` rotace klíčů (`docs/RUNBOOK.md`).
4. Vyšetřit: auditní stopa (`audit_log`, jen přidávání), historie přihlášení (`login_event`), log Caddy.
5. Obnovit z ověřené zálohy, opravit příčinu, přidat regresní test do `tests/security-matrix.int.test.ts`.
6. Oznámit klientovi bez zbytečného odkladu; při úniku osobních údajů do 72 hodin úřadu (GDPR čl. 33) a dotčeným osobám.

## 9. Doporučení, která zatím nejsou

- Nonce místo `'unsafe-inline'` v CSP; `Cross-Origin-Opener-Policy`/`Cross-Origin-Resource-Policy`.
- Omezení přihlášení i podle účtu (nejen IP) a zamykání účtu.
- Oprávnění per vlastní pole.
- CAPTCHA/honeypot na veřejném příjmu poptávek (zatím jen klíč + limit 60/min/IP).

## 10. Změny proti stavu v kódu (pro SECURITY.md)

Nové: limit těla 256 KB na veřejných cestách (Caddy); odmítnutí ukázkového `AUTH_SECRET` v produkci; `scrubText` skrývá `params:`, URL s heslem, `klíč=hodnota`, Bearer; `captureError` loguje očištěný text; worker neloguje obsah e-mailů v produkci; maskování cen (sklad, stroje, docházka); tým mistra v docházce; `visibleAudit` v časové ose; `visibleRecordTitles`; `@rebar/core/manifest`; `command-gate.ts`; trigramové indexy (výkon); testy v seznamu výše.
