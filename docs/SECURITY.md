# Bezpečnost

Model hrozeb, místa kontroly, tajemství, síť, zálohy, závislosti a postup při incidentu. Pro vývojáře a správce agentury a pro technicky zdatného klienta.
Provozní postupy (rotace tajemství, incident krok za krokem) jsou v [RUNBOOK](RUNBOOK.md), architektura v [ARCHITECTURE](ARCHITECTURE.md). Podrobná fakta a seznam opravených úniků oprávnění: [security-notes.md](security-notes.md).

## 1. Co chráníme a před kým

Systém obsahuje obchodní data klienta (zakázky, ceny, marže, faktury), osobní údaje zaměstnanců a zákazníků (kontakty, docházka, hodinové náklady) a fotky ze staveb.
Je dostupný z internetu na jedné adrese, každý klient má vlastní server a databázi (single-tenant, [ADR 001](adr/001-klientske-instance.md)), takže chyba jednoho klienta se nepřenáší na druhé.

| Hrozba                                         | Hlavní opatření                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Uhodnuté nebo odcizené heslo                   | argon2id, min. 12 znaků, 2FA (TOTP) povinné pro všechny, omezení počtu pokusů, historie přihlášení                           |
| Zaměstnanec vidí, co nemá (ceny, cizí výkazy)  | oprávnění s rozsahem „vše / jen moje“ **v datové vrstvě**, testy oprávnění pro role (§3)                                     |
| Podvržený požadavek z cizí stránky (CSRF)      | kontrola původu požadavku u mutací, cookies `SameSite`, `Secure` přes HTTPS                                                  |
| Vložení škodlivého kódu (SQL, XSS)             | Zod validace všech vstupů, dotazy jen přes ORM nebo parametrizované, CSP, zákaz SVG/HTML v nahraných souborech               |
| Nahraný škodlivý soubor                        | typ se pozná podle obsahu (ne přípony), limit velikosti 25 MB, soubory leží mimo veřejnou složku a stahují se přes oprávnění |
| Únik tajemství z databáze nebo zálohy          | tajemství v DB šifrovaná AES-256-GCM, zálohy šifrované (restic), tajemství jen v `.env` s právy 600                          |
| Únik osobních údajů přes logy a error tracking | scrubbing událostí, e-maily s tajným odkazem bez těla v `email_log`, tajné hodnoty maskované v auditu                        |
| Útok na server z internetu                     | firewall (22/80/443), fail2ban, automatické bezpečnostní aktualizace OS, databáze jen ve vnitřní síti, kontejnery bez root   |
| Zranitelnost v závislosti                      | `pnpm audit` v CI, Renovate, zafixované verze, image se staví v CI                                                           |
| Chybný zásah administrátora nebo vývojáře      | audit každé změny ve stejné transakci, soft delete, zálohy s ověřenou obnovou                                                |
| Zneužití přístupu agentury                     | servisní přístup agentury je ve výchozím stavu vypnutý, zapíná ho klient na omezenou dobu (`agency.serviceAccess`)           |

Mimo rozsah: fyzický přístup k serveru poskytovatele (důvěra v poskytovatele VPS), kompromitace zařízení uživatele (malware v telefonu), sociální inženýrství.

## 2. Autentizace a 2FA

Implementace: Better Auth nad vlastní databází (`packages/core/src/auth/`), role a oprávnění jsou naše (`rbac`).

- **Účty vznikají jen pozvánkou** (žádná veřejná registrace). Pozvánka platí 48 hodin, v databázi je jen SHA-256 otisk tokenu a přijmout ji jde jednou ([ADR 008](adr/008-audit-a-tajemstvi.md)).
- **Heslo:** argon2id (19 MiB, 2 průchody), délka 12–128 znaků. Reset hesla odkazem platným hodinu a po resetu se zruší všechny relace.
- **Změna hesla (Nastavení → Můj účet):** vyžaduje současné heslo, nové musí být jiné a splnit stejné minimum jako u pozvánky a resetu. Omezení pokusů 6 za 10 minut na uživatele (databáze; správné i špatné pokusy).
  Po změně se zruší všechny ostatní relace, aktuální zůstane. Audit (`change_password`, `change_password_failed`) nikdy neobsahuje hodnotu hesla ani otisk. Better Auth endpointy `/change-password`, `/set-password`, `/update-user`,
  `/change-email` a `/delete-user` jsou vypnuté, takže změny jdou jen přes naše akce s auditem a omezením pokusů.
- **Přihlášená zařízení:** uživatel vidí jen svá (prohlížeč a systém z user agentu, poslední aktivita, zkrácená IP bez poslední části) a může jedno nebo všechna ostatní odhlásit; vše do auditu (`revoke_session`, `revoke_sessions`).
- **Odkaz pro nové heslo od správce** (`users.manage`, majitele jen majitel): s nastaveným SMTP odejde e-mailem. **Bez SMTP** dostane správce jednorázový odkaz (platí hodinu, starší odkazy uživatele se zneplatní), který předá sám;
  heslo správce nikdy nevidí ani nenastavuje a po jeho použití se uživatel odhlásí všude, 2FA zůstává v platnosti. V auditu je jen to, že odkaz vznikl (`password_reset_link`), ne jeho obsah. Je to vědomá výjimka z pravidla
  „odkaz se v administraci neukazuje“ ([ADR 008](adr/008-audit-a-tajemstvi.md)): bez SMTP by jinak nebylo možné obnovit přístup; riziko (správce uživatele převezme, nemá-li 2FA) kryje audit a to, že 2FA mají vedoucí role povinně.
- **2FA (TOTP)** s jednorázovými záložními kódy. Je **povinné pro všechny uživatele** (`twoFactorPolicy: "all"`; `security.require2faRoles` rozhoduje jen u politiky „podle rolí“). Uživatel, který ho ještě nemá,
  dostane omezenou relaci (`restriction = "2fa_setup"`) a smí jen nastavit 2FA ([ADR 007](adr/007-opravneni-v-datove-vrstve.md)). Při povinném 2FA si ho uživatel **nemůže vypnout** (server odmítne `/two-factor/disable`);
  ostatní ho vypnou po zadání hesla. Nové záložní kódy (po zadání hesla) zneplatní všechny dosavadní; obojí jde do auditu (`regenerate_backup_codes`, `disable_2fa`), bez hodnot kódů.
- **Omezení počtu pokusů** (databáze, sdílená všemi procesy), za minutu: přihlášení 8, žádost o reset hesla 3, reset 5, ověření TOTP 8, záložní kód 5, nové záložní kódy 5, zapnutí a vypnutí 2FA 5; ostatní auth endpointy 120.
  Počítá se podle adresy klienta, kterou nastavuje Caddy (`X-Forwarded-For` se přepisuje, klient si ji podvrhnout nemůže). Další citlivé endpointy (příjem poptávek, nahrávání) mají vlastní limity (`consumeRateLimit`).
- **Relace** jsou v databázi, klouzavé odhlášení po neaktivitě (`security.idleTimeoutMinutes`, výchozí 480 min; OPSYS má 30 dní, relace se při aktivitě prodlužuje, absolutní strop 90 dní). Kontrola uniklých hesel (k-anonymní dotaz na `api.pwnedpasswords.com`, odchází jen 5 znaků SHA-1) jde vypnout `PASSWORD_BREACH_CHECK=off`. Deaktivovaný uživatel se nepřihlásí; administrátor může zrušit relace uživatele.
- **Historie přihlášení** (`login_event`): úspěšná i neúspěšná přihlášení s IP a prohlížečem.
- **Odkazy bez přihlášení** (odkaz pro investora, odběr kalendáře ICS, klíč pro příjem poptávek): tajný náhodný token (odkaz pro investora má 32 bajtů), v databázi jen otisk (SHA-256), zrušitelný, s omezením počtu požadavků; neplatný, zrušený
  a prošlý odkaz jsou stejně „nenalezeno“. Odkaz pro investora nikdy nevrací ceny ([ADR 018](adr/018-detail-zakazky-denik-investor.md)).

## 3. Kde se kontrolují oprávnění

**V datové vrstvě, ne jen v UI a ne jen v middleware** ([ADR 007](adr/007-opravneni-v-datove-vrstve.md)). Skrytí tlačítka v rozhraní je pohodlí; server odmítne vše, co aktér nesmí.

1. **Kontext.** Každá služba dostává `Ctx` (aktér s oprávněními, databáze nebo transakce, `requestId`, IP). Kontext vzniká na jednom místě z cookie (`resolveCtx`), úlohy na pozadí používají `systemCtx`.
2. **Vstupní body.** Server action přes `defineAction` a příkaz modulu přes `runCommand` ověří oprávnění vstupního bodu a vstup schématem Zod, než se spustí handler.
3. **Záznam.** `assertCan` (jeden záznam) a `scopedWhere` (seznamy) vynucují rozsah **all** (všechny záznamy) a **own** (vlastní a přidělené). Záznam, který aktér nesmí vidět, se tváří jako neexistující (`NotFoundError`).
   Komentáře, úkoly a soubory se řídí politikou záznamu, ke kterému patří. Hledání Cmd+K dofiltruje výsledky podle oprávnění.
4. **Citlivá data (maskování peněz).** Ceny, marže a sazby vidí jen držitel `zakazky.economics`; montér je nevidí ani v odkazech, tisku a deníku. Ve skladu (průměrná a poslední cena, hodnota zásob, ceny dokladů) a ve strojích
   (cena tankování, servis, interní sazba, pořizovací cena) je vidí jen `sklad.write`, `stroje.write` nebo `zakazky.economics`; odpovědi příkazů se maskují a atributy mají `permission`, takže je nevrací seznamy, export ani hledání.
   Náklady z docházky vidí jen `zakazky.economics`. Časová osa zakázky (audit) částky a změny skrytých atributů bez `zakazky.economics` skrývá. Sazby zaměstnanců jen `employees.read`.
   Rozsah „jen moje“ u **docházky**: mistr vidí, zapisuje a schvaluje docházku jen svého týmu (sebe a lidi, kteří zapsali hodiny na jeho zakázky); cizí člověk se tváří jako neexistující. Vlastní pole nemají oprávnění per pole, proto do nich nepatří peníze zakázek.
5. **Vypnutý modul.** Oprávnění mimo katalog zapnutých modulů se při načtení aktéra zahodí; systémová role majitele dostane všechna oprávnění katalogu.
6. **Hlídání v testech.** Testy oprávnění pro jednotlivé role běží proti skutečné databázi v každém modulu (`*.int.test.ts`, např. „montér nevidí faktury“, „montér nevidí cizí výkazy“, `tests/security-matrix.int.test.ts`);
   `apps/web/src/server/command-gate.ts` má oprávnění příkazů samostatně testovatelné; `tests/guards.test.ts` hlídá, že jádro neobsahuje klientskou logiku.
   Hlavní jištění je `tests/security-matrix.int.test.ts` (podrobně [security-notes.md](security-notes.md) §3): **každý registrovaný příkaz musí mít probe**, jinak test padá; příkazy se spouštějí pro role `owner`, `office`,
   `foreman`, `worker` nad vlastní i cizí zakázkou a odpovědi se skenují na peněžní částky; každá entita × role (čtení, úprava, vytvoření, smazání, obnovení). Dále `tests/public-surface.int.test.ts` (interní název a ceny ve veřejných výstupech),
   `tests/auth-hardening.int.test.ts` (stejná odpověď pro existující a neexistující účet), `tests/query-count.int.test.ts` a `tests/security-static.test.ts` (hlavičky, ochrana route handlerů, tajemství v repu).

## 4. Audit

Každý zápis vytvoří řádek v `audit_log` **ve stejné transakci** jako změna: selže-li audit, vrátí se i změna ([ADR 008](adr/008-audit-a-tajemstvi.md)).
Záznam má aktéra (`user` / `system` / `agency`), akci, entitu, strukturovaný diff `[{pole, původní, nové}]`, `requestId` a IP. Tajná pole (heslo, token, klíč, záložní kódy) se maskují.
Aplikační databázová role má na `audit_log` jen `INSERT` a `SELECT` (hlídá to test proti skutečné databázi), takže aplikace ani případný útočník přes aplikaci historii nepřepíše.
Poznámky a komentáře nejsou audit. Historii změn vidí role s oprávněním `audit.read`. Schválený doklad je zamčený; úprava = vrácení do konceptu, které se zapíše do auditu.

## 5. Tajemství

- **Jen v `.env`** na serveru (práva 600), unikátní pro každou instanci; install.sh je generuje. V repozitáři je jen vzor `.env.example`; test hlídá, že neobsahuje skutečná tajemství (`tests/deploy.test.ts`).
- **Každý kontejner dostane jen své:** aplikace a worker nedostanou heslo k záloze ani superuživatele databáze, záloha nezná klíče aplikace.
- **Tajemství v databázi** (heslo SMTP, adresy kalendářů) jsou šifrovaná AES-256-GCM samostatným klíčem `APP_ENCRYPTION_KEY`, ne odvozeným z `AUTH_SECRET`, s identifikátorem klíče pro rotaci
  (`APP_ENCRYPTION_KEYS`). Do auditu ani do administrace se nedostanou v čitelné podobě.
- **E-maily s tajným odkazem** (pozvánka, reset hesla): v `email_log` je jen příjemce, šablona, předmět a stav, nikdy tělo; ve frontě jsou proměnné šablony zašifrované a dokončená úloha se po 10 minutách maže.
- **Produkce odmítne nastartovat s ukázkovým `AUTH_SECRET`** (`zmen-me`, `changeme`…); `.env.example` má tajná pole prázdná, repozitář i historie jsou proti vzorům tajemství skenované (`tests/security-static.test.ts`).
- **Klíče a hesla se nikdy nepíšou do chatu, ticketu ani repozitáře.** Kopie `.env` patří do správce hesel agentury.
- Rotace všech tajemství: [RUNBOOK](RUNBOOK.md) §6.

## 6. Síť a hlavičky (Caddy)

- Do světa vede **jen Caddy** (porty 80, 443); aplikace, worker a databáze nemají otevřené porty. Databáze je ve vnitřní síti bez přístupu k internetu. Firewall `ufw` povoluje 22, 80, 443; SSH chrání fail2ban.
- **HTTPS automaticky** (Let's Encrypt), HTTP se přesměruje. Caddy **přepisuje** `X-Forwarded-For` a `X-Real-IP` adresou připojení (omezení počtu pokusů podle IP) a omezuje tělo požadavku na 30 MB (nahrávání souborů a exporty), u veřejných a přihlašovacích cest (`/api/intake`, `/api/auth`, `/api/invitations`, `/api/push`) jen na 256 KB.
- **Hlavičky** nastavuje Caddy (`deploy/caddy/Caddyfile`, test ověřuje jejich přítomnost):

  | Hlavička                    | Hodnota                                                                                                                                                                              |
  | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`                                                                                                                                                |
  | `Content-Security-Policy`   | `default-src 'self'` s výjimkami jen pro vlastní zdroje (`img-src data: blob:`, inline skripty a styly Next.js), `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'` |
  | `X-Frame-Options`           | `DENY`                                                                                                                                                                               |
  | `X-Content-Type-Options`    | `nosniff`                                                                                                                                                                            |
  | `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                                                                                    |
  | `Permissions-Policy`        | kamera a poloha jen pro vlastní stránku (fotky z terénu), mikrofon a platby zakázány                                                                                                 |

- **Zdraví a monitoring:** `/api/health` je chráněné tokenem (porovnání v konstantním čase), `/api/health/live` vrací jen „běží“. Heartbeat a chyby neodnášejí osobní údaje (scrubbing: bez uživatele, IP, cookies, hlaviček, těl požadavků, e-mailů a tokenů).
- **Upozornění ([NOTIFICATIONS](NOTIFICATIONS.md) §8):** obsah push se skládá pro každého příjemce podle jeho oprávnění (příjemce bez práva na záznam nic nedostane, částky jen s oprávněním), odběr patří přihlášenému uživateli a po odhlášení nebo deaktivaci účtu se ruší, klíče VAPID jsou jen v prostředí serveru a protokol doručení neobsahuje adresy odběrů, klíče ani texty zpráv. Odesílá výhradně worker.
- **Odchozí požadavky** mají omezení proti SSRF: import cizích kalendářů (https, kontrola adresy při připojení i přesměrování), push služby (jen známé hosty), počasí do stavebního deníku (pevně povolené hostitele).
- **Databáze:** migrace běží pod samostatným uživatelem (`migrator`, vlastník schématu); aplikace i worker pod rolí `app` bez práva měnit schéma. Kód migrací není součástí běžící aplikace.
- **Image:** vícestupňový build, běh bez práv roota, healthcheck, pevné verze základních image. Sestavuje se jen v CI, na serveru se nebuilduje.

## 7. Zálohy

- Denní `pg_dump` a soubory do restic repozitáře v S3 kompatibilním úložišti klienta, **šifrovaně** heslem `RESTIC_PASSWORD`; retence 30 denních a 12 měsíčních, týdenní kontrola integrity.
- **Měsíční zkouška obnovy** do dočasné databáze s kontrolou počtu záznamů; výsledek je ve `/api/health` a heartbeatu (starší než 45 dní nebo neúspěšná = `degraded`).
- Záloha neobsahuje `.env`; klíče a `RESTIC_PASSWORD` se zálohují zvlášť ve správci hesel (viz [RUNBOOK](RUNBOOK.md) §3).
- Úložiště záloh patří klientovi; klíč k němu má jen zálohovací kontejner.

## 8. Závislosti a vývoj

- **CI** (`.github/workflows/ci.yml`): formát, lint, typy, testy včetně integračních proti PostgreSQL 17, kontrola konfigurací klientů, `pnpm audit --prod --audit-level high`, build, velikost JS, e2e, sestavení image. Release podle tagu `vX.Y.Z` znovu spouští celé CI.
- **Renovate** (`renovate.json`): týdně v pondělí seskupené aktualizace; hlavní verze zvlášť a po ručním schválení; PostgreSQL major nikdy automaticky; bezpečnostní aktualizace kdykoli.
- **Zafixované verze** v `package.json` a `pnpm-lock.yaml`; instalace v CI s `--frozen-lockfile`.
- **Stav `pnpm audit --prod` (2026-10-09):** žádná kritická ani vysoká zranitelnost, **1 střední** (`esbuild` přes `drizzle-kit`, nástroj pro generování migrací, jehož vývojový server se za běhu nespouští). CI blokuje od úrovně high; střední se sleduje do aktualizace `drizzle-kit`.
- **Logy a chyby:** uživatel dostane obecnou hlášku; do logu a error trackingu jde text přes `scrubText`/`scrubError`, který skrývá `params:` z chyb ORM, přihlašovací údaje v adrese, páry `klíč=hodnota` pro heslo/token/cookie/Bearer, e-maily, telefony, dlouhé tokeny a UUID.
  Worker bez SMTP v produkci nevypisuje obsah e-mailů (odkazy na reset hesla ani pozvánky), jen příjemce a předmět.
- **Pravidla kódu:** validace Zodem na serveru, žádné SQL skládané z řetězců, oprávnění v datové vrstvě, žádná klientská logika v jádru, vrstvy balíčků hlídá ESLint.
- Pro každou novou funkci: test oprávnění pro dotčené role ([CUSTOMIZATION](CUSTOMIZATION.md) §1, úroveň 4).

## 9. Hlášení a řešení incidentu

**Jak hlásit.** Podezření na zranitelnost nebo incident hlaste přímo správci instance (agentura), ne přes veřejný ticket a ne e-mailem s tajnými údaji uvnitř.
Kontakt: obecný kontakt agentury `info@opdigital.cz` s předmětem „Bezpečnost“; konkrétní bezpečnostní kontakt (e-mail a telefon) se doplní při nasazení do [RUNBOOK](RUNBOOK.md) §7 (zástupný údaj).
Uveďte, co jste viděli, kdy, na jaké adrese a na jakém účtu; zachovejte důkazy (snímky obrazovky), nic nemažte.

**Jak se řeší.** Postup krok za krokem je v [RUNBOOK](RUNBOOK.md) §7: zaznamenat, izolovat (deaktivace účtu, zrušení relací, rotace tajemství, v krajním případě odpojení serveru), zajistit stav (záloha, logy),
zjistit rozsah (audit, historie přihlášení, logy), odstranit příčinu a obnovit důvěru (rotace, aktualizace, případně obnova ze zálohy), oznámit klientovi a případně úřadu (u osobních údajů do 72 hodin od zjištění
oznamuje správce údajů, tedy klient; agentura jako zpracovatel pomáhá), sepsat zprávu a poučení.

**Co se z incidentu vždy opraví:** příčina v kódu nebo postupu, test, který by ji zachytil, a záznam v `CHANGELOG.md` (u zranitelnosti bez technických podrobností, dokud nejsou opravené všechny instance).

## 10. Známá omezení

- CSP drží `'unsafe-inline'` ve `script-src` (Next.js hydratace a skript motivu jsou inline); bez `unsafe-eval` a bez cizích zdrojů. Přechod na nonce zatím není. Chybí `Cross-Origin-Opener-Policy`/`Cross-Origin-Resource-Policy`.
- Omezení přihlášení je jen podle IP (útok z mnoha adres proti jednomu účtu omezen není; kompenzace: povinné 2FA pro všechny a argon2id); zamykání účtu není. Příchozí požadavky z n8n (`/api/ingest/*`) chrání podpis HMAC a limit počtu požadavků.
- Aplikace nemá offline režim ani šifrování dat v klidu na úrovni databáze; šifrování disku řeší poskytovatel VPS.
- Odhlášení po neaktivitě i ochrana přihlášení jsou nastavené konzervativně, ale detekce neobvyklého přihlášení (nová země, nové zařízení) není součástí.
- Instalace na čistém Ubuntu, skutečný restic a image se zatím neověřily na reálném serveru ([DEPLOYMENT](DEPLOYMENT.md)).
- Odložené otázky (licence a předání při ukončení správy aj.): [OPEN-QUESTIONS](OPEN-QUESTIONS.md).
