# Provozní příručka (runbook)

Postupy pro správce OPSYS (jedna instance pro OP Digital). Všechny příkazy se spouštějí **na serveru OPSYS jako root** ve složce instalace (výchozí `/opt/system`), pokud není uvedeno jinak:

```bash
ssh root@opsys.opdigital.cz
cd /opt/system
```

Vysvětlení, co kde běží: [DEPLOYMENT](DEPLOYMENT.md) a [ARCHITECTURE](ARCHITECTURE.md) §7. Bezpečnost: [SECURITY](SECURITY.md).
`docker compose` vždy spouštěj ve složce `/opt/system` (tam je `docker-compose.yml` a `.env`); služby se jmenují `caddy`, `app`, `worker`, `postgres`, `backup`.

> **Co je a co není ověřeno.** Skripty v `deploy/scripts/` jsou otestované automaticky (syntaxe, logika, zálohovací nástroj proti skutečnému PostgreSQL s napodobeninou resticu,
> `--dry-run` instalace a aktualizace). **Instalace na čistém Ubuntu, skutečný restic a Docker image se na serveru dosud nezkoušely**; při prvním nasazení projdi postupy níže
> na testovacím VPS, než je použiješ na ostrém.

## Obsah

1. [Aktualizace](#1-aktualizace)
2. [Návrat na předchozí verzi (rollback)](#2-návrat-na-předchozí-verzi-rollback)
3. [Obnova ze zálohy](#3-obnova-ze-zálohy-a-zkouška-obnovy)
4. [Výpadek](#4-výpadek)
5. [Plný disk](#5-plný-disk)
6. [Rotace tajemství a hesel](#6-rotace-tajemství-a-hesla)
7. [Bezpečnostní incident](#7-bezpečnostní-incident)
8. [Fronta úloh](#8-fronta-úloh)
9. [Vypnutí a zapnutí modulu](#9-vypnutí-a-zapnutí-modulu)
10. [Obnova přístupu majitele](#10-obnova-přístupu-majitele)
11. [n8n: tajemství webhooků a ingestu, výpadek n8n](#11-n8n-tajemství-webhooků-a-ingestu-výpadek-n8n)

## 1. Aktualizace

Novou verzi vyrobí CI po vytvoření tagu `vX.Y.Z` (image `ghcr.io/ondrejis/interni-system-opdigital-opsys:vX.Y.Z`, zálohovací image a balíček `deploy-vX.Y.Z.tgz`). Na serveru se nikdy nebuilduje.

1. Přečti změny verze v `CHANGELOG.md` (zvlášť položky o migracích a o změně konfigurace).
2. Nanečisto: `./scripts/update.sh v1.1.0 --dry-run` vypíše plán a nic nemění.
3. Spusť aktualizaci:

   ```bash
   ./scripts/update.sh v1.1.0
   ```

   Skript: záloha → stažení image → migrace → zápis `APP_TAG` do `.env` a restart → kontrola zdraví → **při selhání automatický návrat** na předchozí verzi.
   Přepínače: `--skip-backup` (jen když záloha právě proběhla), `--force` (nasadí i běžící verzi znovu), `--dry-run`.

4. Výstup je i v `/opt/system/logs/update-*.log`. Úspěch končí řádkem „Aktualizace na … hotová (stav systému: ok|degraded)“.
5. Ověř: `curl -fsS https://opsys.opdigital.cz/api/health/live` a přihlášení do aplikace.
6. Pokud verze mění provozní soubory (`docker-compose.yml`, `Caddyfile`, skripty), rozbal `deploy-vX.Y.Z.tgz` z vydání na GitHubu a přepiš jimi soubory v `/opt/system` (kromě `.env`, `logs/`, `.state/`) **před** krokem 3.
   Aktualizace skriptem mění jen verzi image.

Aktualizace způsobí výpadek desítek sekund (restart `app` a `worker`); zero-downtime nasazení se nedělá.

## 2. Návrat na předchozí verzi (rollback)

**Automaticky** ho udělá `update.sh`, když nová verze nenaběhne do 3 minut nebo `/api/health` vrátí `fail`. Migrace jsou jen dopředné a zpětně kompatibilní (expand → contract,
[ADR 009](adr/009-fronta-uloh-a-migrace.md)), takže starší aplikace běží i nad novějším schématem.

**Ručně** (nová verze běží, ale chová se špatně):

1. Zjisti předchozí verzi: `cat .state/previous_tag`.
2. `./scripts/update.sh "$(cat .state/previous_tag)" --skip-backup` (záloha těsně předtím už existuje z aktualizace).
3. Ověř zdraví jako v kroku 1.5 výše.

Když aplikace po aktualizaci **poškodila data** (ne jen se chová špatně), samotný návrat verze nestačí: pokračuj obnovou ze zálohy (kapitola 3) pořízené před aktualizací.
Řádek „Záloha před aktualizací“ je v logu aktualizace.

## 3. Obnova ze zálohy a zkouška obnovy

Záloha: kontejner `backup` denně (výchozí 02:30) udělá `pg_dump` a spolu se složkou souborů ji uloží do restic repozitáře (S3 úložiště mimo server, šifrovaně).
Retence: 30 denních a 12 měsíčních snapshotů. **Soubor `.env` v záloze není** — viz upozornění níže.

### Obnova

1. Rozhodni, který snapshot: `docker compose exec backup restic snapshots` (bez argumentu se obnoví nejnovější).
2. Spusť obnovu:

   ```bash
   ./scripts/restore.sh                # nejnovější snapshot
   ./scripts/restore.sh <id-snapshotu>  # konkrétní snapshot
   ```

   Skript vyžaduje potvrzení opsáním adresy systému (přepínač `--yes` ho přeskočí), **udělá zálohu současného stavu** (`--no-pre-backup` ji přeskočí), zastaví `app` a `worker`,
   obnoví databázi i soubory, spustí migrace (obnoví práva aplikační role) a spustí systém. Výstup je v `logs/restore-*.log`.
   Databázi skript **zahodí a založí znovu** (jako zkouška obnovy; `pg_restore --clean` neumí zahodit dělené tabulky fronty úloh), proto musí být `app` a `worker` zastavené
   — skript to dělá sám — a záloha současného stavu před obnovou je pojistka, kdyby se obnova nepovedla.

3. Ověř přihlášení, poslední záznamy a soubory (fotky). Co vzniklo po pořízení snapshotu, je ztraceno.

### Obnova na novém serveru (původní je nedostupný)

1. Připrav nové VPS a DNS ([DEPLOYMENT](DEPLOYMENT.md)), spusť `install.sh` **bez** `--owner-email`, ale s `--restic-repository`, `--aws-key`, `--aws-secret` a `--restic-password` původní instance.
2. **Do `/opt/system/.env` vlož původní `AUTH_SECRET` a `APP_ENCRYPTION_KEY`** (z uložené kopie `.env`) a `docker compose up -d app worker`. S novými klíči by nešlo dešifrovat
   uložená tajemství (heslo SMTP, adresy kalendářů) ani 2FA uživatelů.
3. `./scripts/restore.sh`.

> **Zálohuj `.env` zvlášť.** Obsahuje klíče, bez kterých obnovená data nejsou plně použitelná (`AUTH_SECRET`, `APP_ENCRYPTION_KEY`, heslo k restic repozitáři `RESTIC_PASSWORD`).
> Ulož jeho kopii do správce hesel agentury; bez `RESTIC_PASSWORD` se záloha neobnoví vůbec.

### Zkouška obnovy

Měsíčně (výchozí 1. dne v 04:30) ji spustí kontejner `backup` sám (noční záloha běží v 02:30): obnoví poslední zálohu do dočasné databáze, porovná počty záznamů v tabulkách se zálohou a databázi smaže.
Výsledek je vidět v **Nastavení → Systém → Zálohy** (poslední záloha, snapshot, velikost, počet záloh, výsledek zkoušky), v `/api/health` (`backup.restoreTest`) a v heartbeatu; zkouška starší než 45 dní nebo neúspěšná zhorší stav na `degraded`.

Ručně: `./scripts/restore-test.sh`. Úspěch končí řádkem „Zkouška obnovy v pořádku: obnoveno N tabulek, počty záznamů sedí“.
Zkouška neověřuje, že aplikace nad obnovenými daty nastartuje; to ověř při ostré obnově (krok 3).

## 4. Výpadek

1. **Co nefunguje.** Z vlastního počítače: `curl -sS -o /dev/null -w '%{http_code}\n' https://opsys.opdigital.cz/api/health/live` (200 = běží a vidí databázi).
   Podrobný stav (token je `HEALTH_TOKEN` v `.env`):

   ```bash
   curl -fsS -H "Authorization: Bearer $(grep '^HEALTH_TOKEN=' .env | cut -d= -f2)" https://opsys.opdigital.cz/api/health
   ```

   Odpověď obsahuje `status` (`ok` / `degraded` / `fail`), databázi, disk, zálohu a zkoušku obnovy, zpoždění fronty a seznam `problems`.

2. **Server samotný:** `ssh` neodpovídá → konzole VPS v administraci poskytovatele (Hostinger), restart serveru; po startu se služby spustí samy (`restart: unless-stopped`).
3. **Služby:** `docker compose ps`; co není `running`/`healthy`, projdi v logu.
4. **Logy** (každá služba má rotaci 3 × 10 MB):

   ```bash
   docker compose logs --tail=200 app
   docker compose logs --tail=200 worker
   docker compose logs --tail=100 caddy postgres backup
   ls -t logs/ | head        # logy aktualizací a obnov
   ```

   Chyby aplikace jdou i do error trackingu (`SENTRY_DSN`, GlitchTip) s odstraněnými osobními údaji.

5. **Typické příčiny:**

   | Příznak                                       | Postup                                                                                                                                          |
   | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
   | `app` se restartuje, v logu chyba konfigurace | špatná hodnota v `.env` nebo neplatná konfigurace `clients/opsys`; aplikace při startu vypíše všechny chyby, oprav a `docker compose up -d app` |
   | `app` hlásí jiného klienta                    | proměnná `CLIENT` v `.env` není `opsys` nebo neodpovídá image (`APP_IMAGE`)                                                                     |
   | Caddy nezískal certifikát                     | DNS nemíří na server nebo jsou zavřené porty 80/443 (`ufw status`)                                                                              |
   | databáze nenaběhla                            | `docker compose logs postgres`; plný disk (kapitola 5)                                                                                          |
   | `degraded`, záloha je stará                   | `docker compose logs backup`; chybí `RESTIC_REPOSITORY`, přihlašovací údaje k úložišti, nebo nejde spojení                                      |
   | e-maily nechodí                               | kapitola 8 (fronta), nastavení SMTP v administraci, `email_log`                                                                                 |
   | po aktualizaci nejde nic                      | kapitola 2                                                                                                                                      |

6. **Heartbeat.** Worker jednou za hodinu pošle `POST` na `HEARTBEAT_URL` (instance, verze, stav). Když heartbeaty přestanou chodit, monitoring agentury hlásí výpadek:
   zkontroluj `worker` (`docker compose ps worker`, log), nejde-li o výpadek celého serveru.
7. Po obnovení provozu zapiš příčinu a opatření (zákazník, čas, délka, příčina) do interního deníku provozu.

## 5. Plný disk

`/api/health` hlásí `degraded` při méně než 15 % volného místa a `fail` při méně než 5 %.

1. Zjisti, co zabírá místo:

   ```bash
   df -h /
   docker system df
   du -sh /var/lib/docker/volumes/system_* 2>/dev/null
   ```

   (Volumes se jmenují podle projektu `system`: `system_pgdata` databáze, `system_files` nahrané soubory a fotky.)

2. **Staré image** (po aktualizacích): `docker image prune -f`. Aktualizace to dělá sama; po delší době `docker image prune -af` smaže všechny nepoužívané image.
3. **Logy Dockeru** jsou omezené na 3 × 10 MB na službu. Systémové logy: `journalctl --vacuum-size=200M`.
4. **Zálohovací pracovní složka:** `docker compose exec backup du -sh /work`; při selhané záloze může zůstat dump.
5. **Soubory a fotky** (`system_files`) rostou s provozem. Když nestačí disk, zvětši VPS u poskytovatele (a souborový systém: `resize2fs`) nebo vyčisti Koš a staré přílohy. Soubory se nemaž ručně z volumes.
6. **Databáze:** neřeš ručním mazáním tabulek. Velikost: `docker compose exec postgres psql -U postgres -d system -c "select pg_size_pretty(pg_database_size('system'))"`.
7. Po uvolnění místa ověř `/api/health` a že proběhla poslední záloha (`backup.lastSuccessAt`).

## 6. Rotace tajemství a hesla

Tajemství jsou v `/opt/system/.env` (práva 600). Aplikace dostává jen to, co potřebuje; po každé změně `.env` se musí dotčené služby **znovu vytvořit** (`docker compose up -d <služba>`, ne `restart`).
Po rotaci aktualizuj kopii `.env` ve správci hesel.

| Tajemství                       | Co se stane při změně                                                         | Postup |
| ------------------------------- | ----------------------------------------------------------------------------- | ------ |
| `HEALTH_TOKEN`                  | monitoring agentury musí dostat nový token                                    | 6.1    |
| `APP_ENCRYPTION_KEY(S)`         | šifrování tajemství v databázi (heslo SMTP, adresy kalendářů); bez ztráty dat | 6.2    |
| `AUTH_SECRET`                   | odhlásí všechny a znehodnotí nastavené 2FA (viz níže)                         | 6.3    |
| `DB_*_PASSWORD`                 | hesla databázových rolí (`migrator`, `app`, superuživatel)                    | 6.4    |
| `RESTIC_PASSWORD`, `AWS_*`      | přístup k záloze                                                              | 6.5    |
| `VAPID_*`                       | OPSYS push nepoužívá (nemá notifikace), klíče jsou prázdné                    | 6.6    |
| tajemství n8n (ingest, webhook) | callback Disku a leady, odchozí webhooky; spravuje se v aplikaci              | 11     |
| heslo uživatele                 | —                                                                             | 6.7    |

**6.1 `HEALTH_TOKEN`:** `NEW=$(openssl rand -hex 24)`, nahraď `HEALTH_TOKEN=` v `.env`, `docker compose up -d app worker`, předej `NEW` monitoringu.

**6.2 Šifrovací klíč** ([ADR 008](adr/008-audit-a-tajemstvi.md)): nový klíč se přidá jako první, starý zůstane, aby šla dešifrovat stará data; data se přešifrují při dalším uložení.

1. `openssl rand -base64 32` → nový klíč.
2. V `.env` nastav `APP_ENCRYPTION_KEYS=2:<nový>,1:<starý z APP_ENCRYPTION_KEY>` (první je aktuální).
3. `docker compose up -d app worker`; ověř, že se aplikace spustila a odeslání e-mailu funguje.

`docker-compose.yml` proměnnou `APP_ENCRYPTION_KEYS` do kontejnerů `app` a `worker` předává (vzor je v `deploy/.env.example`); nastavená má přednost před `APP_ENCRYPTION_KEY`. Rotace se na serveru zatím nezkoušela.

**6.3 `AUTH_SECRET`:** podepisuje cookies relací a šifruje tajné klíče 2FA. Změna proto odhlásí všechny uživatele a **jejich nastavené 2FA přestane fungovat** (odvozeno z kódu `packages/core/src/auth/create-auth.ts`,
na serveru neověřeno). Dělej ji jen při podezření na únik: nová hodnota `openssl rand -base64 32` do `.env`, `docker compose up -d app worker`, a pak uživatelům s 2FA
vynuť nové nastavení (administrátor jim v Nastavení → Uživatelé resetuje přístup / pošle odkaz pro obnovu hesla; po přihlášení systém vyžádá nastavit 2FA znovu).

**6.4 Hesla databáze.** Role vznikají jen při prvním vytvoření databáze, proto se heslo mění i v databázi:

1. nové heslo bez `/`, `+`, `=` (skládá se do adresy připojení): `NEW=$(openssl rand -base64 36 | tr -d '/+=\n' | cut -c1-32)`;
2. `docker compose exec postgres psql -U postgres -c "ALTER ROLE system_app PASSWORD '$NEW'"` (uživatel `system_migrator` obdobně; názvy jsou v `.env`: `DB_APP_USER`, `DB_MIGRATOR_USER`);
3. nahraď `DB_APP_PASSWORD=` (resp. `DB_MIGRATOR_PASSWORD=`) v `.env`;
4. `docker compose up -d app worker backup` (zálohování používá heslo role migrací).

Heslo superuživatele (`DB_SUPERUSER_PASSWORD`) se mění `ALTER ROLE postgres PASSWORD '…'` a v `.env`; na hesle se nic dalšího nezakládá.

**6.5 Záloha.** `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`: vytvoř nový klíč v úložišti záloh, změň v `.env`, `docker compose up -d backup`, ověř `./scripts/backup.sh`, starý klíč zruš.
`RESTIC_PASSWORD`: do repozitáře přidej nové heslo (`docker compose exec backup restic key add`), změň v `.env`, `docker compose up -d backup`, ověř `./scripts/restore-test.sh` a teprve potom starý klíč odeber (`restic key list`, `restic key remove <id>`).

**6.6 VAPID:** OPSYS push upozornění nepoužívá, `VAPID_*` zůstávají prázdné; rotace se netýká. Tajemství n8n jsou v části 11.

**6.7 Heslo uživatele.** Nastavení → Uživatelé → uživatel → odeslat odkaz pro obnovu hesla (platí hodinu); odhlášení všech jeho zařízení tamtéž. Odkaz se v administraci nikdy nezobrazuje, jde jen e-mailem.

## 7. Bezpečnostní incident

Kontakty (doplň telefony při nasazení):

| Role                         | Jméno                 | Telefon / e-mail               |
| ---------------------------- | --------------------- | ------------------------------ |
| Správce OPSYS (vlastník)     | Ondřej Dvořák         | dvorak@opdigital.cz            |
| Záložní kontakt (partner)    | Patrik Šilhánek       | silhanek@opdigital.cz          |
| Poskytovatel VPS (Hostinger) | podpora poskytovatele | `<kontakt z administrace VPS>` |
| Pověřenec / právní zástupce  | `<jméno>`             | `<kontakt>`                    |

Postup (nejdřív zastavit škodu, potom zjišťovat příčinu):

1. **Zaznamenej čas a příznak** (kdo nahlásil, co viděl). Nic nemaž, logy a audit jsou důkaz.
2. **Izoluj.** Podezření na zneužitý účet: Nastavení → Uživatelé → deaktivovat uživatele a odhlásit jeho zařízení. Podezření na únik tajemství: kapitola 6 pro dotčené tajemství.
   Podezření na kompromitaci serveru: odpoj ho (zastav `caddy`: `docker compose stop caddy`), systém tím přestane být dostupný zvenku.
3. **Zajisti stav.** Okamžitá záloha (`./scripts/backup.sh`), uložení logů: `docker compose logs --no-color > /root/incident-$(date +%F).log` (mimo `/opt/system/logs`).
4. **Zjisti rozsah.** V aplikaci Historie změn (audit, `audit.read`) a historie přihlášení (`login_event`: úspěšné i neúspěšné s IP a prohlížečem); logy Caddy (`docker compose logs caddy`); seznam relací uživatelů.
5. **Odstraň příčinu a obnov důvěru.** Rotace všech dotčených tajemství (kapitola 6), reset hesel dotčených uživatelů, aktualizace na opravenou verzi (kapitola 1). Při kompromitaci serveru nasaď novou instanci a obnov data ze zálohy před incidentem (kapitola 3).
6. **Oznam.** Partnerovi (Patrikovi) bez zbytečného odkladu. V OPSYS jsou osobní údaje kontaktů klientů; zasáhl-li incident osobní údaje, posuď s právníkem povinnost oznámit porušení Úřadu pro ochranu osobních údajů do 72 hodin od zjištění a případně informovat dotčené klienty. Právní posouzení patří právníkovi.
7. **Po incidentu:** zpráva (časová osa, příčina, dopad, opatření), oprava v kódu nebo postupu, doplnění tohoto runbooku.

Obecný postup hlášení a model hrozeb: [SECURITY](SECURITY.md).

## 8. Fronta úloh

Fronta je v PostgreSQL (pg-boss, schéma `pgboss`), zpracovává ji služba `worker` ([ADR 009](adr/009-fronta-uloh-a-migrace.md)). Úlohy: e-maily (`mail.send`), náhledy fotek, úklid souborů (denně 03:30),
heartbeat (hodinově), upozornění (`notification.dispatch`: ihned po vzniku a každou minutu jako záloha), připomínky a ranní přehledy modulů.

1. **Běží worker?** `docker compose ps worker`, `docker compose logs --tail=100 worker`.
2. **Zpoždění a neúspěchy:** `/api/health` → `queue.oldestReadySeconds` (nad 15 minut = `degraded`) a `queue.failedLast24h` (nad 0 = `degraded`).
3. **Přehled stavů** (čtení):

   ```bash
   docker compose exec postgres psql -U postgres -d system -c \
     "select name, state, count(*) from pgboss.job group by 1, 2 order by 1, 2"
   docker compose exec postgres psql -U postgres -d system -c \
     "select name, created_on, completed_on, output from pgboss.job where state = 'failed' order by completed_on desc limit 20"
   ```

4. **E-maily:** `select to_email, template, subject, status, error, created_at from email_log order by created_at desc limit 20;` (v `email_log` není tělo zprávy, záměrně).
   Spusť jako `docker compose exec postgres psql -U postgres -d system -c "…"`. Častá příčina je neplatné nastavení SMTP nebo odmítnutí odesílatele.
5. **Zaseknutá fronta:** `docker compose restart worker`. Rozpracované úlohy se po vypršení zámku zpracují znovu; plánované úlohy se spustí v dalším termínu samy.
6. **Opakování selhané úlohy** se dělá akcí v aplikaci, která ji vyvolala (znovu poslat pozvánku, znovu odeslat fakturu). Do tabulek pg-boss neprováděj zápisy ručně.
7. Fronty se zakládají při migraci. Po přidání modulu s novými úlohami proto vždy proběhne migrace (`update.sh` ji dělá vždy).
8. **Upozornění (push, e-mail):** doručení čekají v tabulce `notification_delivery` (stav a důvod u každého), odesílá je worker. Když push nechodí, postupuj podle [NOTIFICATIONS §11](NOTIFICATIONS.md#11-push-nechodí-postup-krok-za-krokem):
   nejdřív běží-li worker (řádek `[worker] push: zapnuto` v logu) a jsou-li nastavené klíče VAPID, pak souhrn `select status, reason, count(*) from notification_delivery where created_at > now() - interval '1 day' group by 1, 2;`.
   Zaseknutá doručení (`sending` starší 5 minut) se zpracují znovu sama. Zkušební upozornění si uživatel pošle v Nastavení → Upozornění.

## 9. Vypnutí a zapnutí modulu

Moduly určuje pole `modules` v `clients/opsys/config.ts` ([CUSTOMIZATION](CUSTOMIZATION.md) §1); je to **změna konfigurace s novým vydáním**, ne přepínač za běhu.

1. V repozitáři uprav `modules` v `clients/opsys/config.ts` (závislosti modulů hlídá `pnpm config:check`, chybnou sestavu odmítne).
2. `pnpm check`, commit, tag nové verze (`vX.Y.Z`), počkej na CI (image OPSYS).
3. Na serveru `./scripts/update.sh vX.Y.Z`.

Důsledky:

- **Vypnutí:** modul zmizí z navigace, oprávnění i rozhraní. **Data v jeho tabulkách zůstanou** (nic se nemaže), vypnutému modulu se přestanou spouštět migrace a úlohy.
- **Zapnutí:** `update.sh` spustí migrace modulu a založí jeho fronty; výchozí data modulu (řady, pipeline, číselníky) doplní `seed` (`docker compose run --rm seed`, aktualizace to nedělá sama),
  nová oprávnění přidej rolím v Nastavení → Role a oprávnění (systémová role majitele je dostane automaticky).
- Data vypnutého modulu, která jiné moduly zobrazují (např. náklady ze skladu na zakázce), zmizí z jejich pohledu; po zapnutí se vrátí.

## 10. Obnova přístupu majitele

Majitel ztratil heslo i 2FA a není jiný administrátor:

1. Jiný uživatel s oprávněním `users.manage` mu v Nastavení → Uživatelé zvolí „Poslat odkaz pro nové heslo“. Jsou-li nastavené e-maily, odkaz odejde uživateli. Bez e-mailů se správci
   jednou zobrazí jednorázový odkaz (platí hodinu), který předá osobně nebo telefonem; heslo správce nikdy nevidí. Po nastavení hesla se uživatel odhlásí ze všech zařízení a 2FA zůstává v platnosti.
   Majitele smí takto obnovit jen jiný majitel.
2. Není-li takový uživatel: na serveru vytvoř nového majitele (`seed` je idempotentní a existující účty nemění):

   ```bash
   docker compose run --rm -T -e OWNER_EMAIL=dvorak@opdigital.cz -e OWNER_NAME="Jméno" -e OWNER_PASSWORD="$(openssl rand -base64 18)" seed
   ```

   Heslo, které jsi zadal, předej bezpečným kanálem; systém při prvním přihlášení vyžádá nastavení 2FA. Pokud účet s tímto e-mailem už existuje, skript to oznámí a heslo nezmění.

3. Zápis o obnově přístupu doplň do interního deníku (kdo, kdy, na čí žádost). V auditu je akce `password_reset_link` (nebo `password_reset_sent`) s tím, kdo odkaz vytvořil.

### Změna hesla a podezřelé přihlášení

- **Vlastní heslo si každý mění sám** v Nastavení → Profil (po instalaci i majitel; krok 6 v [DEPLOYMENT](DEPLOYMENT.md)). Po změně se odhlásí ostatní zařízení.
- **Podezření na cizí přístup:** uživatel v Profil → Přihlášená zařízení odhlásí neznámé zařízení (nebo „Odhlásit všechna ostatní“) a změní heslo. Správce může u uživatele zvolit „Odhlásit všude“
  a „Poslat odkaz pro nové heslo“. Historie přihlášení (včetně neúspěšných) je v nabídce uživatele.
- **Ztracený telefon s 2FA:** přihlášení záložním kódem, pak Zabezpečení účtu → nové záložní kódy. Povinné 2FA (v OPSYS pro všechny) vypnout nejde; když chybí záložní kódy, použije se postup výše (jiný správce odkaz pro heslo a majitel přes `seed`).
- Pokusy o změnu hesla jsou omezené (6 za 10 minut na uživatele); při překročení počkej, nebo požádej správce o odkaz pro nové heslo.

## 11. n8n: tajemství webhooků a ingestu, výpadek n8n

Automatizace (složky na Google Disku, leady z Meta) běží v n8n mimo OPSYS ([deploy/n8n/README.md](../deploy/n8n/README.md)). Mezi OPSYS a n8n jsou **dvě nezávislá tajemství**, obě se spravují v aplikaci (Nastavení → Integrace), ne v `.env`, a v databázi jsou šifrovaná klíčem `APP_ENCRYPTION_KEY`:

| Tajemství                      | Podepisuje                                           | Kde se mění                                                      | Kde se musí změnit v n8n |
| ------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------ |
| tajemství webhooku (`whsec_…`) | odchozí události OPSYS → n8n (`X-Opsys-Signature`)   | Integrace → Webhooky → webhook → Vyměnit tajemství               | `OPSYS_WEBHOOK_SECRET`   |
| tajemství příchozích požadavků | callback Disku a leady n8n → OPSYS (`/api/ingest/*`) | Integrace → Příchozí požadavky → Vygenerovat (Vyměnit) tajemství | `OPSYS_INGEST_SECRET`    |

**Rotace tajemství příchozích požadavků** (plánovaně, nebo při podezření na únik):

1. V OPSYS vyměň tajemství (Vyměnit tajemství). Zobrazí se jednou. Staré platí ještě **24 hodin**, takže mezi výměnou a úpravou n8n se neztratí žádný callback ani lead. Při podezření na únik zaškrtni „Staré tajemství zneplatnit hned“ (callbacky a leady pak do úpravy n8n selžou; selhané se zpracují z n8n znovu).
2. V n8n změň `OPSYS_INGEST_SECRET` a n8n restartuj (obě workflow ho čtou z prostředí).
3. Ověř: ruční test v `meta-leads` (větev „Ruční test“) a v Nastavení → Systém nejsou nové chyby integrací. Po 24 hodinách staré tajemství přestane platit samo.

**Rotace tajemství webhooku:**

1. V Integrace → Webhooky u webhooku zvol „Vyměnit tajemství“ a zkopíruj nové (zobrazí se jednou). **Staré přestává platit hned**: webhooky odeslané mezi výměnou a úpravou n8n n8n odmítne (401) a OPSYS je zkusí znovu podle plánu (1, 5, 15, 30 min, 1 h).
2. Hned v n8n změň `OPSYS_WEBHOOK_SECRET`, restartuj n8n.
3. Nastavení → Integrace → **Odeslat test** (musí být doručeno), pak v Nastavení → Systém **Opakovat všechna** chybná doručení z okna výměny.

**Výpadek n8n (nebo jeho přihlášení ke Googlu/Meta):**

- OPSYS **funguje dál**: uložení klienta, zakázky ani obchodu se kvůli n8n nikdy neblokuje. Události `drive.*` se řadí do fronty (odeslání zkouší worker 5× během zhruba 2 hodin, pak doručení zůstane jako chybné a čeká).
- Zjištění: Nastavení → **Systém** → Chyby integrací a Chybná doručení webhooků; u klientů a zakázek tlačítko „Otevřít Disk“ po 10 minutách bez odpovědi nabídne „Zkusit znovu“. Leady z Meta se v tu dobu hromadí u Meta (n8n trigger je stáhne po obnovení; leady starší než pár dní zkontroluj ručně v Meta Lead Center).
- Postup: 1) opravit n8n (restart, obnovit přihlášení Google/Meta, zkontrolovat proměnné prostředí), 2) v Nastavení → Systém **Opakovat všechna** chybná doručení, 3) ve výpisu „Selhané příchozí události“ použít **Zpracovat znovu**, 4) u klientů, jejichž složka nevznikla, v kartě klienta „Zkusit znovu“ nebo „Vytvořit složku“. Opakované doručení je bezpečné: callback i lead jsou idempotentní.
- Dlouhý výpadek (dny): po obnově zkontroluj Nastavení → Google Disk → stav požadavků a leady v Meta Lead Center proti obchodům v OPSYS (zdroj „Meta“).

**Kdo je n8n podepsaný:** `X-Opsys-Signature` platí ±5 minut, proto musí mít server OPSYS i server n8n správný čas (`timedatectl`). Chyba 401 s „expired“ v protokolu příchozích požadavků je téměř vždy rozjetý čas.
