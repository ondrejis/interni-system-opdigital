# Nasazení

Krok za krokem nová instance na VPS u Hostingeru (nebo jiném poskytovateli s Ubuntu 24.04 LTS). Jeden klient = jeden server (1 vCPU / 4 GB RAM) = jedna databáze ([ADR 001](adr/001-klientske-instance.md)).
Na serveru běží jen Docker a image sestavené v CI; **na serveru se nikdy nebuilduje** ([ADR 014](adr/014-nasazeni-a-provoz.md)). Pro správce agentury; provozní postupy po nasazení jsou v [RUNBOOK](RUNBOOK.md).

> **Co je ověřeno.** Skripty prochází automatickými testy (syntaxe, logika, `--dry-run`, zálohovací nástroj proti PostgreSQL) a CI. **Instalace na čistém Ubuntu 24.04, skutečný Docker build image a skutečný restic na serveru
> se při psaní tohoto dokumentu ještě nezkoušely.** První nasazení proto udělej na testovacím VPS a podle něj tento dokument oprav.

## Co běží

| Služba         | Co dělá                                                            | Poznámka                                                  |
| -------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| `caddy`        | reverzní proxy, automatické HTTPS, bezpečnostní hlavičky           | jediná služba s otevřenými porty (80, 443)                |
| `app`          | webová aplikace (Next.js standalone)                               | `/api/health/live` pro Docker, `/api/health` za tokenem   |
| `worker`       | úlohy na pozadí (fronta pg-boss, e-maily, připomínky, push)        | stejná image jako `app`                                   |
| `postgres`     | databáze, jen ve vnitřní síti bez přístupu ven                     | vyladěná pro 4 GB RAM (`deploy/postgres/postgresql.conf`) |
| `backup`       | denní záloha a měsíční zkouška obnovy (restic, šifrovaně mimo VPS) | image se staví v CI                                       |
| `beszel-agent` | metriky serveru                                                    | zapíná se, když je v `.env` `BESZEL_KEY` (profil)         |

Jednorázové nástroje (`migrate`, `seed`, `restore`) jsou ve stejném `docker-compose.yml` pod profilem `tools`.
Dohromady se vejdou do ~2,5 GB RAM při běžném provozu (limity: app 1 GB, worker 512 MB, postgres 1,25 GB, caddy 128 MB, backup 256 MB).

## Co potřebuješ předem

| Co                                | Poznámka                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| VPS (1 vCPU / 4 GB, Ubuntu 24.04) | u Hostingeru VPS KVM s čistým operačním systémem Ubuntu 24.04 LTS (bez předinstalovaných panelů), s SSH klíčem agentury |
| Doména nebo subdoména             | např. `system.klient.cz`; DNS spravuje klient nebo agentura                                                             |
| Úložiště záloh                    | S3 kompatibilní bucket **klienta** (AWS S3, Backblaze B2, Wasabi, MinIO…) a přístupový klíč jen k tomuto bucketu        |
| Přístup ke stažení image          | token GitHubu s právem `read:packages` (balíčky v GHCR jsou soukromé)                                                   |
| Sestavená verze                   | tag `vX.Y.Z` v repozitáři, CI dokončeno (viz níže)                                                                      |
| Údaje majitele                    | jméno a e-mail prvního uživatele                                                                                        |
| Odesílání e-mailů (SMTP)          | server, port, uživatel, heslo a adresa odesílatele (pozvánky, reset hesla, faktury)                                     |

## Krok 0: vydání verze (CI)

Tag `vX.Y.Z` spustí `.github/workflows/release.yml`:

1. ověří kód (stejné kroky jako CI: formát, lint, typy, testy, audit),
2. sestaví image **každého klienta** (`clients/<slug>`, kromě `_template`) a nahraje do GHCR jako `ghcr.io/<org>/<repo>-<slug>:vX.Y.Z`,
3. sestaví a nahraje zálohovací image `ghcr.io/<org>/<repo>-backup:vX.Y.Z`,
4. k vydání na GitHubu přiloží `deploy-vX.Y.Z.tgz` (obsah složky `deploy/`).

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Pro nového klienta nejdřív založ klienta v repozitáři (`pnpm client:new`, viz [CUSTOMIZATION](CUSTOMIZATION.md) §4) a zařaď ho do vydání; image `…-<slug>` vznikne jen pro klienty, kteří v tagované verzi existují.

## Krok 1: server a DNS

1. Objednej VPS (Ubuntu 24.04 LTS) a při zakládání přidej veřejný SSH klíč agentury. Poznamenej si IPv4 adresu.
2. V DNS domény vytvoř záznam **A** `system.klient.cz → <IPv4 serveru>` (případně AAAA pro IPv6). DNS musí na server mířit **už při instalaci**, jinak Caddy nezíská certifikát. Kontrola:

   ```bash
   dig +short system.klient.cz
   ```

3. Přihlas se: `ssh root@system.klient.cz` (nebo na IP, dokud se DNS nešíří).
4. Doporučeno (mimo `install.sh`): zakázat přihlášení heslem v SSH (`PasswordAuthentication no` v `/etc/ssh/sshd_config.d/`, `systemctl reload ssh`) po ověření, že funguje klíč.

## Krok 2: úložiště záloh a přístup k image

1. Vytvoř bucket a přístupový klíč jen k němu. Adresa restic repozitáře má tvar `s3:https://s3.eu-central-1.amazonaws.com/nazev-bucketu` (u jiných poskytovatelů jejich S3 endpoint).
2. Vytvoř token GitHubu s `read:packages` (uživatel, který má k balíčkům přístup).
3. Heslo k šifrovaným zálohám (`RESTIC_PASSWORD`) vygeneruje instalace, pokud ho nezadáš; uložit si ho musíš ty.

## Krok 3: provozní soubory na server

Stáhni z vydání `deploy-v0.1.0.tgz` (privátní repozitář: `gh release download v0.1.0 -R ondrejis/stavebni-system-core -p 'deploy-*.tgz'`) a přenes na server:

```bash
scp deploy-v0.1.0.tgz root@system.klient.cz:/root/
ssh root@system.klient.cz
mkdir -p /root/deploy && tar -xzf deploy-v0.1.0.tgz -C /root/deploy && cd /root/deploy
```

## Krok 4: instalace

Nanečisto (zkontroluje parametry a vypíše plán; nepotřebuje root ani Docker a nic nemění):

```bash
./scripts/install.sh --dry-run \
  --domain system.klient.cz --acme-email info@klient.cz \
  --client demo --version v0.1.0 \
  --image ghcr.io/ondrejis/stavebni-system-core-demo \
  --backup-image ghcr.io/ondrejis/stavebni-system-core-backup \
  --owner-email majitel@klient.cz
```

Ostrá instalace (jako root):

```bash
./scripts/install.sh \
  --domain system.klient.cz --acme-email info@klient.cz \
  --client demo --version v0.1.0 \
  --image ghcr.io/ondrejis/stavebni-system-core-demo \
  --backup-image ghcr.io/ondrejis/stavebni-system-core-backup \
  --owner-email majitel@klient.cz --owner-name "Jan Novák" \
  --restic-repository s3:https://s3.eu-central-1.amazonaws.com/zalohy-klient \
  --aws-key … --aws-secret … \
  --ghcr-user ondrejis --ghcr-token …
```

(`--client` je složka klienta v `clients/`, v příkladu `demo`; `--image` je image tohoto klienta.) Bez parametrů se skript zeptá; parametry lze předat i proměnnými `INSTALL_DOMAIN` apod.
Nepovinné: `--heartbeat-url` (monitoring agentury), `--beszel-key` (metriky serveru), `--restic-password`, `--install-dir` (výchozí `/opt/system`), `--non-interactive`.

Co skript udělá: balíčky a Docker z oficiálního repozitáře, firewall `ufw` (22, 80, 443), `fail2ban`, automatické **jen bezpečnostní** aktualizace, 2 GB swap, rotaci logů Dockeru, soubory do `/opt/system`,
`.env` s vygenerovanými tajemstvími (práva 600), stažení image, databázi, migrace, výchozí data (role, pipeline, číselníky, řady, DPH), klíče pro push a prvního uživatele.
Je **idempotentní**: při opakovaném spuštění nerotuje tajemství, nepřepíše verzi a nevytvoří uživatele znovu.

Na konci vypíše a **uložit do správce hesel** je třeba:

- **heslo prvního uživatele** (jen jednou),
- **heslo k šifrovaným zálohám** (restic): bez něj zálohu nikdo neobnoví.

Ulož také kopii souboru `/opt/system/.env` (klíče `AUTH_SECRET` a `APP_ENCRYPTION_KEY` nejsou v záloze; bez nich nejde obnovit 2FA a šifrovaná nastavení, [RUNBOOK](RUNBOOK.md) §3).

## Krok 5: ověření

```bash
cd /opt/system
docker compose ps                                   # caddy, app, worker, postgres, backup: running / healthy
curl -fsS https://system.klient.cz/api/health/live  # běží a vidí databázi
curl -fsS -H "Authorization: Bearer $(grep '^HEALTH_TOKEN=' .env | cut -d= -f2)" https://system.klient.cz/api/health
```

`/api/health` vrací `status` (`ok` / `degraded` / `fail`), databázi, disk, zálohu, frontu a seznam problémů. Hned po instalaci je `degraded`, dokud neproběhne první záloha (krok 7).

## Krok 6: první přihlášení a nastavení

1. Otevři `https://system.klient.cz`, přihlas se e-mailem a heslem z výpisu instalace.
2. Systém **vyžádá nastavení dvoufázového ověření** (2FA je povinné pro majitele a administrátory): naskenuj QR kód v autentikační aplikaci, potvrď kód a uschovej záložní kódy.
3. Heslo z výpisu instalace je počáteční. **Změň si ho hned v aplikaci:** Nastavení → Můj účet → Změna hesla (zadáš současné heslo z výpisu a nové, alespoň 12 znaků; ostatní přihlášená zařízení se odhlásí, tohle zůstane). Na e-mail ani na krok 4 nemusíš čekat. Tamtéž si doplníš jméno a telefon.
4. **E-maily (SMTP).** Bez nastaveného odesílání se pozvánky, reset hesla ani faktury neodešlou (e-maily jdou frontou a odesílá je `worker`). Nastavení → E-maily: zapnout odesílání, server, port, zabezpečení, uživatel, heslo
   (v databázi je zašifrované), odesílatel. Tlačítkem „Ověřit spojení“ zkontroluješ přihlášení k serveru a „Poslat zkušební e-mail“ odešle zprávu přes frontu na adresu přihlášeného uživatele (dorazí do minuty).
   Chyby odesílání jsou v tabulce `email_log` ([RUNBOOK](RUNBOOK.md) §8).
5. Nastavení → Firma a vzhled: údaje na dokladech, název systému, barva a logo.
6. Nastavení → Uživatelé a Role: pozvi uživatele (pozvánka platí 7 dní) a přiřaď role; ověř oprávnění rolí.
7. Případné úpravy stavů, číselníků, číselných řad, sazeb DPH a vlastních polí: Nastavení ([CUSTOMIZATION](CUSTOMIZATION.md) §1).

## Krok 7: zálohy a první zkouška obnovy

1. Okamžitá záloha: `./scripts/backup.sh` (jinak proběhne denně v 02:30). Při prvním spuštění se inicializuje restic repozitář.
2. `/api/health` → `backup.lastSuccessAt` je vyplněné.
3. Zkouška obnovy: `./scripts/restore-test.sh` — skončí řádkem „Zkouška obnovy v pořádku“. Poté běží měsíčně sama.
4. Tuto zkoušku zopakuj u každého nového klienta a zapiš datum.

## Krok 8: předání a kontrolní seznam

- [ ] adresa funguje s platným certifikátem, `/api/health` je `ok`
- [ ] majitel se přihlásil, má nastavené 2FA a uložené záložní kódy
- [ ] SMTP funguje (pozvánka dorazila)
- [ ] záloha proběhla, zkouška obnovy prošla
- [ ] heslo k záloze a kopie `.env` jsou ve správci hesel agentury
- [ ] heartbeat chodí do monitoringu agentury (`HEARTBEAT_URL`), případně Beszel
- [ ] uživatelé pozváni, role odpovídají (montér nevidí ceny a cizí výkazy)
- [ ] klient zná kontakt pro hlášení závad a incidentů ([SECURITY](SECURITY.md) §9)

## Aktualizace

```bash
/opt/system/scripts/update.sh v0.2.0
```

Záloha → stažení image → **migrace** → restart → kontrola zdraví → při selhání **automatický návrat** na předchozí verzi. Výstup jde do `/opt/system/logs/update-*.log`.
Přepínače: `--skip-backup`, `--force`, `--dry-run`. Postup a rollback podrobně: [RUNBOOK](RUNBOOK.md) §1–2.

Migrace jsou jen dopředné a **zpětně kompatibilní (expand → contract)**: vydání N přidá (expand), vydání N+1 teprve odstraní, co už nikdo nečte (contract).
Díky tomu starší aplikace běží i nad novějším schématem a návrat na předchozí verzi nerozbije data. Každá migrace běží v transakci.

## Zálohy

Kontejner `backup` denně (výchozí 02:30) udělá `pg_dump` a spolu se složkou souborů ji uloží do restic repozitáře (šifrovaně, S3 kompatibilní úložiště **klienta**). Retence: 30 denních a 12 měsíčních snapshotů, týdně kontrola integrity.
Výsledek je v `/data/status/backup.json`; `/api/health` hlásí „degraded“, když je záloha starší než 36 hodin.

| Skript                           | Co dělá                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `deploy/scripts/backup.sh`       | okamžitá záloha                                                                                   |
| `deploy/scripts/restore.sh`      | obnova databáze i souborů (zastaví aplikaci, před obnovou zálohuje současný stav, spustí migrace) |
| `deploy/scripts/restore-test.sh` | obnoví poslední zálohu do **dočasné databáze**, porovná počty záznamů se zálohou a databázi smaže |

(Na serveru jsou ve složce `/opt/system/scripts/`.) **Zkouška obnovy** běží sama měsíčně (výchozí 1. dne v 04:30); její výsledek je ve stavu zálohy, v `/api/health` a v heartbeatu.
Selhání nebo zkouška starší než 45 dní zhorší stav na „degraded“. Záloha, kterou nikdo nezkusil obnovit, není záloha.

## Monitoring

- `GET /api/health` s hlavičkou `Authorization: Bearer <HEALTH_TOKEN>`: databáze, volné místo, záloha a zkouška obnovy, zpoždění fronty.
- `GET /api/health/live`: bez tokenu, jen „běží a vidí databázi“ (Docker a proxy).
- Heartbeat: jednou za hodinu `POST` na `HEARTBEAT_URL` (instance, verze, stav; žádné osobní údaje).
- Beszel agent pro metriky serveru; chyby do GlitchTip/Sentry přes `SENTRY_DSN` (osobní údaje se odstraňují).
- Aktualizace závislostí hlídá Renovate (`renovate.json`): týdně v pondělí, seskupené; hlavní verze ručně schválit, PostgreSQL major nikdy automaticky. V CI se hlídá velikost JavaScriptu (`scripts/bundle-report.mjs`, rozpočet 700 kB gzip) a `pnpm audit`.

## Konfigurace (`.env`)

Vzor je `deploy/.env.example`; skutečné `.env` má práva 600 a nikdy se nedává do gitu. Aplikace dostane jen to, co potřebuje:
heslo k záloze ani superuživatel databáze se do kontejnerů `app` a `worker` nedostanou. Databáze má dvě role: vlastníka schématu pro migrace
a aplikační roli bez práva měnit schéma (ADR 009). Po úpravě `.env` služby znovu vytvoř: `docker compose up -d <služba>` (ne `restart`).

## Řešení potíží

| Příznak                           | Postup                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| web neodpovídá                    | `docker compose ps`, `docker compose logs --tail=100 app caddy`                        |
| Caddy nezískal certifikát         | DNS neukazuje na server, nebo jsou zavřené porty 80/443 (`ufw status`)                 |
| `degraded`: není záznam o záloze  | `docker compose logs backup`; chybí `RESTIC_REPOSITORY`, nebo nejde spojení k úložišti |
| aktualizace skončila návratem     | `/opt/system/logs/update-*.log`; verze se vrátila, systém běží na předchozí            |
| potřeba obnovit z poslední zálohy | `./scripts/restore.sh` (potvrzením je napsání adresy systému)                          |
| instalace skončila chybou         | oprav příčinu a spusť `install.sh` znovu (je idempotentní)                             |

Další postupy (výpadek, plný disk, rotace tajemství, incident): [RUNBOOK](RUNBOOK.md).
