# Nasazení OPSYS

OPSYS (interní systém agentury OP Digital) běží jako **jedna instance** na jednom VPS (Ubuntu 24.04 LTS, 1 vCPU / 4 GB RAM) s jednou databází, na veřejné doméně s HTTPS ([ADR 001](adr/001-klientske-instance.md), [ADR 014](adr/014-nasazeni-a-provoz.md)).
Na serveru běží jen Docker a image sestavené v CI; **na serveru se nikdy nebuilduje**. Pro správce (Ondřeje); provozní postupy po nasazení jsou v [RUNBOOK](RUNBOOK.md), automatizace v n8n v [deploy/n8n/README.md](../deploy/n8n/README.md).

> **Co je ověřeno.** Skripty prochází automatickými testy (syntaxe, `shellcheck`, logika, `--dry-run`, zálohovací nástroj proti PostgreSQL i proti skutečnému resticu s lokálním repozitářem) a CI.
> **Instalace na čistém Ubuntu 24.04, skutečný Docker build image, validace Caddyfile (`caddy validate`) a běh šablon n8n se dosud nezkoušely** (vývojový Mac nemá Docker). První nasazení proto udělej na testovacím VPS a podle něj tento dokument oprav.

## Co běží

| Služba     | Co dělá                                                                                          | Poznámka                                                  |
| ---------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `caddy`    | reverzní proxy, automatické HTTPS, bezpečnostní hlavičky, limity těla                            | jediná služba s otevřenými porty (80, 443)                |
| `app`      | webová aplikace OPSYS (Next.js standalone)                                                       | `/api/health/live` pro Docker, `/api/health` za tokenem   |
| `worker`   | úlohy na pozadí: doručování webhooků do n8n, synchronizace (Google, Meta), retainery, úklid koše | stejná image jako `app`; fronta pg-boss je v databázi     |
| `postgres` | databáze, jen ve vnitřní síti bez přístupu ven                                                   | vyladěná pro 4 GB RAM (`deploy/postgres/postgresql.conf`) |
| `backup`   | noční záloha a měsíční zkouška obnovy (restic, šifrovaně mimo server)                            | image se staví v CI                                       |

Volitelně `beszel-agent` (metriky serveru, profil `monitoring`). Jednorázové nástroje (`migrate`, `seed`, `restore`) jsou pod profilem `tools`. **n8n neběží na tomto serveru** (je to samostatná služba agentury).
Limity paměti: app 1 GB, worker 512 MB, postgres 1,25 GB, caddy 128 MB, backup 256 MB.

## Co potřebuješ předem

| Co                       | Poznámka                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| VPS (Ubuntu 24.04 LTS)   | čistý systém bez panelů, s SSH klíčem                                                                                        |
| Doména                   | např. `opsys.opdigital.cz`, DNS záznam A (případně AAAA) **míří na server už při instalaci**, jinak Caddy nezíská certifikát |
| Úložiště záloh           | S3 kompatibilní bucket (AWS S3, Backblaze B2, Wasabi…) **mimo tento server** a přístupový klíč jen k němu                    |
| Přístup ke stažení image | token GitHubu s `read:packages` (balíčky v GHCR jsou soukromé)                                                               |
| Sestavená verze          | tag `vX.Y.Z`, CI dokončeno (krok 0)                                                                                          |
| Odesílání e-mailů (SMTP) | jen pro pozvánky a obnovu hesla (OPSYS jinak žádné e-maily ani upozornění neposílá)                                          |

## Krok 0: vydání verze (CI)

Tag `vX.Y.Z` spustí `.github/workflows/release.yml`: ověří kód, sestaví image klienta `opsys` (`ghcr.io/ondrejis/interni-system-opdigital-opsys:vX.Y.Z`), zálohovací image (`…-backup:vX.Y.Z`) a k vydání přiloží `deploy-vX.Y.Z.tgz` (obsah složky `deploy/`).

```bash
git tag v1.0.0 && git push origin v1.0.0
```

## Krok 1: server a DNS

1. Objednej VPS (Ubuntu 24.04 LTS) a při zakládání přidej veřejný SSH klíč. Poznamenej si IPv4 adresu.
2. V DNS vytvoř záznam **A** `opsys.opdigital.cz → <IPv4 serveru>`. Kontrola: `dig +short opsys.opdigital.cz`.
3. Přihlas se `ssh root@opsys.opdigital.cz`. Po ověření klíče doporučeno zakázat heslo v SSH (`PasswordAuthentication no` v `/etc/ssh/sshd_config.d/`).

## Krok 2: úložiště záloh a přístup k image

1. Bucket a přístupový klíč jen k němu. Adresa restic repozitáře: `s3:https://s3.eu-central-1.amazonaws.com/nazev-bucketu` (u jiných poskytovatelů jejich S3 endpoint).
2. Token GitHubu s `read:packages`.
3. Heslo k zálohám (`RESTIC_PASSWORD`) vygeneruje instalace, pokud ho nezadáš; **uložit si ho musíš ty** (správce hesel). Bez něj se záloha neobnoví.

## Krok 3: provozní soubory a instalace

Z vydání stáhni `deploy-v1.0.0.tgz` (`gh release download v1.0.0 -R ondrejis/interni-system-opdigital -p 'deploy-*.tgz'`), přenes na server a rozbal:

```bash
scp deploy-v1.0.0.tgz root@opsys.opdigital.cz:/root/
ssh root@opsys.opdigital.cz
mkdir -p /root/deploy && tar -xzf deploy-v1.0.0.tgz -C /root/deploy && cd /root/deploy
```

Nanečisto (zkontroluje parametry a vypíše plán; nepotřebuje root ani Docker):

```bash
./scripts/install.sh --dry-run --domain opsys.opdigital.cz --acme-email info@opdigital.cz \
  --client opsys --version v1.0.0 \
  --image ghcr.io/ondrejis/interni-system-opdigital-opsys \
  --backup-image ghcr.io/ondrejis/interni-system-opdigital-backup
```

Ostrá instalace (jako root):

```bash
./scripts/install.sh --domain opsys.opdigital.cz --acme-email info@opdigital.cz \
  --client opsys --version v1.0.0 \
  --image ghcr.io/ondrejis/interni-system-opdigital-opsys \
  --backup-image ghcr.io/ondrejis/interni-system-opdigital-backup \
  --owner-email dvorak@opdigital.cz --owner-name "Ondřej Dvořák" \
  --restic-repository s3:https://s3.eu-central-1.amazonaws.com/nazev-bucketu --aws-key … --aws-secret … \
  --ghcr-user ondrejis --ghcr-token …
```

Nepovinné: `--heartbeat-url` (monitoring, hlášení jednou za hodinu), `--beszel-key`, `--restic-password`, `--install-dir` (výchozí `/opt/system`), `--non-interactive`; parametry jde předat i proměnnými `INSTALL_DOMAIN` apod.
Skript: nainstaluje Docker, firewall `ufw` (22, 80, 443), `fail2ban`, jen bezpečnostní aktualizace, 2 GB swap, soubory do `/opt/system`, `.env` s vygenerovanými tajemstvími (práva 600), stáhne image, spustí databázi, migrace, výchozí data (role, pipeline, číselníky)
a založí **prvního uživatele (vlastníka Ondřeje)**. Je **idempotentní** (opakované spuštění nerotuje tajemství ani nevytvoří uživatele znovu).

Na konci vypíše a **uložit do správce hesel** je třeba: heslo prvního uživatele (jen jednou) a heslo k záloze (restic). Ulož také kopii `/opt/system/.env`: klíče `AUTH_SECRET` a `APP_ENCRYPTION_KEY` **nejsou v záloze** a bez nich nejde obnovit 2FA ani šifrovaná nastavení (Google, Meta, Fakturoid, SMTP) ([RUNBOOK](RUNBOOK.md) §3).

## Krok 4: ověření

```bash
cd /opt/system
docker compose ps                                   # caddy, app, worker, postgres, backup: running / healthy
curl -fsS https://opsys.opdigital.cz/api/health/live
curl -fsS -H "Authorization: Bearer $(grep '^HEALTH_TOKEN=' .env | cut -d= -f2)" https://opsys.opdigital.cz/api/health
curl -sSI https://opsys.opdigital.cz | grep -i 'strict-transport\|content-security\|x-frame'   # bezpečnostní hlavičky
```

`/api/health` vrací `status` (`ok` / `degraded` / `fail`); hned po instalaci je `degraded`, dokud neproběhne první záloha (krok 6). Totéž vidí vlastník v **Nastavení → Systém**.
Ověř také, že ve `docker compose logs worker` je řádek „úlohy: …“ se všemi frontami (`core.webhooks.deliver`, `disk.timeout`, `kalendar.sync`, `finance.retainer.generate`, `reklama.sync.daily`, `muj-prostor.invoices.prepare`…).

## Krok 5: první přihlášení a nastavení

1. Otevři `https://opsys.opdigital.cz`, přihlas se e-mailem a heslem z výpisu. Systém **vyžádá nastavení dvoufázového ověření** (povinné pro všechny): QR kód do autentikační aplikace, záložní kódy uschovej.
2. Změň si počáteční heslo: Nastavení → Profil.
3. **E-maily (SMTP):** Nastavení → E-maily. Bez nich se neodešle pozvánka pro Patrika ani obnova hesla. Pak v Nastavení → Uživatelé pozvi Patrika (role partner).
4. **Integrace:** viz níže (Google, Meta, Fakturoid, n8n).

## Integrace a adresy (OAuth, n8n)

Všechny adresy se skládají z `DOMAIN` (`APP_URL = https://$DOMAIN`). **Tajné hodnoty se do `.env` nepíšou**: Google OAuth klient, Meta, Fakturoid a tajemství pro n8n se zadávají v aplikaci (Nastavení) a v databázi jsou zašifrované klíčem `APP_ENCRYPTION_KEY`. V `.env` jsou jen adresa, tajemství instance a zálohy; přehled adres je i v `deploy/.env.example`.

| Služba                        | Co nastavit u služby                                                                                                                                                        | Kde v OPSYS                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Google Kalendář (OAuth)       | Google Cloud Console → OAuth klient typu Web → **Authorized redirect URI** `https://<DOMAIN>/api/kalendar/google/callback`                                                  | Nastavení → Google Kalendář (client ID, secret) |
| Google Kalendář (push kanály) | nic; Google volá `https://<DOMAIN>/api/kalendar/google/webhook` (jen přes HTTPS, jinak běží jen pravidelná synchronizace)                                                   | automaticky po připojení účtu                   |
| Meta (Ads, Lead Ads)          | bez OAuth přesměrování: Business Manager → systémový uživatel → dlouhodobý přístupový token s právem číst reklamní účty; leady z formulářů posílá n8n (`/api/ingest/leads`) | Nastavení → Integrace → Meta (token)            |
| Fakturoid                     | bez OAuth: přístup se zadá v aplikaci                                                                                                                                       | Nastavení → Integrace (jen vlastník)            |
| n8n → OPSYS (callback, leady) | n8n volá `https://<DOMAIN>/api/ingest/drive` a `https://<DOMAIN>/api/ingest/leads`, podepsané tajemstvím příchozích požadavků                                               | Nastavení → Integrace → Příchozí požadavky      |
| OPSYS → n8n (události)        | adresa webhooku z n8n a výběr událostí (`drive.*`…)                                                                                                                         | Nastavení → Integrace → Webhooky                |

**Veřejné jsou jen** `/api/ingest/*` (podpis HMAC, limit těla 512 kB, 120 požadavků za minutu z jedné adresy), `/api/kalendar/google/webhook` (Google) a přihlašovací/pozvánkové cesty. Caddy pro `/api/ingest/*` povolí tělo do 1 MB (aplikace sama odmítne nad 512 kB s českou chybou) a adresu klienta předává aplikaci, která z ní počítá limit. Rate limit je v aplikaci, ne v Caddy (Caddy ho bez pluginu neumí).
Workflow pro n8n (složky na Disku, Meta leady) a jejich zapnutí krok za krokem: [deploy/n8n/README.md](../deploy/n8n/README.md).

## Krok 6: zálohy a první zkouška obnovy

1. Okamžitá záloha: `./scripts/backup.sh` (jinak proběhne denně v 02:30). Při prvním spuštění se inicializuje restic repozitář.
2. **Nastavení → Systém → Zálohy** ukáže poslední zálohu, snapshot, velikost a počet uložených záloh; `/api/health` → `backup.lastSuccessAt` je vyplněné.
3. Zkouška obnovy: `./scripts/restore-test.sh` skončí řádkem „Zkouška obnovy v pořádku“. Poté běží sama měsíčně (výchozí 1. dne v 04:30) a výsledek je v Nastavení → Systém.

## Krok 7: předání a kontrolní seznam

- [ ] adresa funguje s platným certifikátem, `/api/health` je `ok`, Nastavení → Systém je bez problémů
- [ ] Ondřej se přihlásil, má 2FA a záložní kódy; Patrik je pozván a také má 2FA
- [ ] SMTP funguje (pozvánka dorazila)
- [ ] záloha proběhla, zkouška obnovy prošla
- [ ] heslo k záloze a kopie `.env` jsou ve správci hesel
- [ ] Google Kalendář připojen, Meta napojena, n8n workflow aktivní a vyzkoušená na testovacím klientovi
- [ ] heartbeat chodí do monitoringu (`HEARTBEAT_URL`), případně Beszel

## Aktualizace

```bash
/opt/system/scripts/update.sh v1.1.0
```

Záloha → stažení image → **migrace** → restart → kontrola zdraví → při selhání **automatický návrat** na předchozí verzi. Výstup jde do `/opt/system/logs/update-*.log`. Přepínače: `--skip-backup`, `--force`, `--dry-run`. Postup a rollback: [RUNBOOK](RUNBOOK.md) §1–2.
Migrace jsou jen dopředné a zpětně kompatibilní (expand → contract), každá běží v transakci.

## Zálohy

Kontejner `backup` denně (výchozí 02:30) udělá `pg_dump`, spolu se složkou souborů ho uloží do restic repozitáře (šifrovaně, S3 mimo server), ponechá **30 denních a 12 měsíčních** snapshotů a v neděli zkontroluje integritu. Stav zapisuje do `/data/status/backup.json`;
`/api/health` hlásí „degraded“, když je záloha starší než 36 hodin nebo selhala zkouška obnovy (nebo je starší než 45 dní). Skripty (na serveru v `/opt/system/scripts/`): `backup.sh` (okamžitá záloha), `restore.sh` (obnova databáze i souborů, před ní záloha současného stavu), `restore-test.sh` (obnova do dočasné databáze + porovnání počtů záznamů).
Záloha, kterou nikdo nezkusil obnovit, není záloha: měsíční zkouška běží sama a její výsledek je v Nastavení → Systém.

## Monitoring

- `GET /api/health` s `Authorization: Bearer <HEALTH_TOKEN>`: databáze, disk, záloha a zkouška obnovy, fronta. `GET /api/health/live` bez tokenu (Docker, proxy).
- **Nastavení → Systém** (jen vlastník): totéž včetně verze, heartbeatu, velikosti databáze, front, chyb integrací a chybných doručení webhooků s ruční opakováním; odkaz do Koše. Stránka nic neposílá (žádné e-maily ani upozornění), stav se čte při otevření.
- Heartbeat: jednou za hodinu `POST` na `HEARTBEAT_URL` (instance, verze, stav; žádné osobní údaje). Beszel pro metriky serveru; chyby do GlitchTip/Sentry přes `SENTRY_DSN`.

## Konfigurace (`.env`)

Vzor je `deploy/.env.example`; skutečné `.env` má práva 600 a nikdy se nedává do gitu. Aplikace dostane jen to, co potřebuje: heslo k záloze ani superuživatel databáze se do `app` a `worker` nedostanou. Databáze má dvě role: vlastníka schématu (migrace) a aplikační roli bez práva měnit schéma. Po úpravě `.env` služby znovu vytvoř: `docker compose up -d <služba>` (ne `restart`).
OPSYS nepoužívá push ani e-mailová upozornění: `VAPID_*` zůstávají prázdné.

## Řešení potíží

| Příznak                           | Postup                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| web neodpovídá                    | `docker compose ps`, `docker compose logs --tail=100 app caddy`                        |
| Caddy nezískal certifikát         | DNS neukazuje na server, nebo jsou zavřené porty 80/443 (`ufw status`)                 |
| `degraded`: není záznam o záloze  | `docker compose logs backup`; chybí `RESTIC_REPOSITORY`, nebo nejde spojení k úložišti |
| webhooky do n8n se nedoručují     | Nastavení → Systém → Chybná doručení; [RUNBOOK](RUNBOOK.md) §11 (výpadek n8n)          |
| aktualizace skončila návratem     | `/opt/system/logs/update-*.log`; verze se vrátila, systém běží na předchozí            |
| potřeba obnovit z poslední zálohy | `./scripts/restore.sh` (potvrzením je napsání adresy systému)                          |
| instalace skončila chybou         | oprav příčinu a spusť `install.sh` znovu (je idempotentní)                             |

Další postupy (výpadek, plný disk, rotace tajemství, incident): [RUNBOOK](RUNBOOK.md).
