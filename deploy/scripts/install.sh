#!/usr/bin/env bash
# Instalace z čistého Ubuntu 24.04 LTS do běžícího systému. Idempotentní: opakované spuštění nic nepřepisuje
# (tajemství v .env se zachovají, existující uživatel se nevytváří znovu).
#
#   sudo ./scripts/install.sh --domain system.klient.cz --acme-email info@klient.cz \
#        --client demo --image ghcr.io/ondrejis/stavebni-system-core-demo --backup-image ghcr.io/ondrejis/stavebni-system-core-backup \
#        --version v1.0.0 --owner-email majitel@klient.cz --owner-name "Jan Novák" \
#        --restic-repository s3:https://s3.eu-central-1.amazonaws.com/zalohy-klient --aws-key … --aws-secret … \
#        --ghcr-user ondrejis --ghcr-token …
#
# Chybějící povinné hodnoty se zeptá (bez --non-interactive). Parametry lze předat i proměnnými prostředí stejného jména
# velkými písmeny s předponou INSTALL_ (např. INSTALL_DOMAIN).
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INSTALL_DIR="${INSTALL_DIR:-/opt/system}"
interactive=1
dry_run=0
domain="${INSTALL_DOMAIN:-}" acme_email="${INSTALL_ACME_EMAIL:-}" client="${INSTALL_CLIENT:-}"
image="${INSTALL_IMAGE:-}" backup_image="${INSTALL_BACKUP_IMAGE:-}" version="${INSTALL_VERSION:-}"
owner_email="${INSTALL_OWNER_EMAIL:-}" owner_name="${INSTALL_OWNER_NAME:-}"
restic_repo="${INSTALL_RESTIC_REPOSITORY:-}" restic_password="${INSTALL_RESTIC_PASSWORD:-}"
aws_key="${INSTALL_AWS_KEY:-}" aws_secret="${INSTALL_AWS_SECRET:-}"
ghcr_user="${INSTALL_GHCR_USER:-}" ghcr_token="${INSTALL_GHCR_TOKEN:-}"
beszel_key="${INSTALL_BESZEL_KEY:-}" heartbeat_url="${INSTALL_HEARTBEAT_URL:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) domain="$2"; shift 2 ;;
    --acme-email) acme_email="$2"; shift 2 ;;
    --client) client="$2"; shift 2 ;;
    --image) image="$2"; shift 2 ;;
    --backup-image) backup_image="$2"; shift 2 ;;
    --version) version="$2"; shift 2 ;;
    --owner-email) owner_email="$2"; shift 2 ;;
    --owner-name) owner_name="$2"; shift 2 ;;
    --restic-repository) restic_repo="$2"; shift 2 ;;
    --restic-password) restic_password="$2"; shift 2 ;;
    --aws-key) aws_key="$2"; shift 2 ;;
    --aws-secret) aws_secret="$2"; shift 2 ;;
    --ghcr-user) ghcr_user="$2"; shift 2 ;;
    --ghcr-token) ghcr_token="$2"; shift 2 ;;
    --beszel-key) beszel_key="$2"; shift 2 ;;
    --heartbeat-url) heartbeat_url="$2"; shift 2 ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --non-interactive) interactive=0; shift ;;
    --dry-run) dry_run=1; interactive=0; shift ;;
    -h | --help) sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "Neznámý parametr $1 (viz --help)" ;;
  esac
done

# Nanečisto (--dry-run): zkontroluje parametry a vypíše plán; nepotřebuje root ani Docker a nic nemění.
if [ "$dry_run" -eq 1 ]; then
  for need in domain acme_email client image backup_image version; do
    [ -n "${!need}" ] || die "Chybí povinná hodnota: $need (--dry-run se neptá)"
  done
  [[ "$domain" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || die "Neplatná adresa systému: $domain"
  [[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] || die "Verze musí mít tvar vX.Y.Z (je: $version)"
  log "DRY-RUN: instalace $client $version na https://$domain do $INSTALL_DIR"
  log "DRY-RUN: 1. balíčky a Docker, 2. firewall (22/80/443), fail2ban, bezpečnostní aktualizace, 3. swap 2 GB"
  log "DRY-RUN: 4. soubory a .env s vygenerovanými tajemstvími (existující se nepřepíšou)"
  log "DRY-RUN: 5. stažení image $image:$version, databáze, migrace, výchozí data${owner_email:+, první uživatel $owner_email}"
  if [ -n "$restic_repo" ]; then log "DRY-RUN: zálohy do $restic_repo"; else log "DRY-RUN: zálohy nejsou nastavené (chybí --restic-repository)"; fi
  exit 0
fi

need_root
mkdir -p "$INSTALL_DIR"
SRC_DIR="$DEPLOY_DIR"

# Znovu načíst z existujícího .env (opakovaná instalace se neptá na to, co už je nastavené).
if [ -f "$INSTALL_DIR/.env" ]; then
  ENV_FILE="$INSTALL_DIR/.env"
  : "${domain:=$(env_get DOMAIN)}" "${acme_email:=$(env_get ACME_EMAIL)}" "${client:=$(env_get CLIENT)}"
  : "${image:=$(env_get APP_IMAGE)}" "${backup_image:=$(env_get BACKUP_IMAGE)}" "${version:=$(env_get APP_TAG)}"
fi

ask() { # ask PROMPT VAR [default]
  local prompt="$1" var="$2" def="${3:-}" val
  if [ -n "${!var}" ]; then return; fi
  if [ "$interactive" -eq 1 ]; then
    read -r -p "$prompt${def:+ [$def]}: " val
    printf -v "$var" '%s' "${val:-$def}"
  else
    printf -v "$var" '%s' "$def"
  fi
}
ask "Adresa systému (např. system.klient.cz)" domain
ask "E-mail pro certifikát a upozornění Let's Encrypt" acme_email
ask "Klient (složka v clients/)" client demo
ask "Image aplikace (bez tagu)" image
ask "Image zálohování (bez tagu)" backup_image
ask "Verze (např. v1.0.0)" version
for need in domain acme_email client image backup_image version; do
  [ -n "${!need}" ] || die "Chybí povinná hodnota: $need"
done
[[ "$domain" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || die "Neplatná adresa systému: $domain"
[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] || die "Verze musí mít tvar vX.Y.Z (je: $version)"

if [ -r /etc/os-release ] && ! grep -q 'Ubuntu' /etc/os-release; then
  log "VAROVÁNÍ: skript je určený pro Ubuntu 24.04 LTS, jiný systém není otestovaný."
fi

# ---------- 1. balíčky a Docker ----------
log "Balíčky…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg openssl ufw fail2ban unattended-upgrades apt-listchanges

if ! command -v docker >/dev/null 2>&1; then
  log "Instaluji Docker z oficiálního repozitáře…"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  cat >/etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" }, "live-restore": true }
JSON
  systemctl restart docker
fi
systemctl enable --now docker

# ---------- 2. zabezpečení serveru ----------
log "Firewall (22/80/443), fail2ban, automatické bezpečnostní aktualizace…"
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

systemctl enable --now fail2ban

cat >/etc/apt/apt.conf.d/52system-unattended <<'CONF'
// Jen bezpečnostní aktualizace; ostatní balíčky se mění vědomě.
#clear Unattended-Upgrade::Allowed-Origins;
Unattended-Upgrade::Allowed-Origins {
        "${distro_id}:${distro_codename}-security";
        "${distro_id}ESMApps:${distro_codename}-apps-security";
        "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Automatic-Reboot "false";
CONF
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

# ---------- 3. swap 2 GB ----------
if ! swapon --show=NAME --noheadings | grep -q .; then
  log "Vytvářím swap 2 GB…"
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  echo 'vm.swappiness=10' >/etc/sysctl.d/99-system-swap.conf
  sysctl -p /etc/sysctl.d/99-system-swap.conf >/dev/null
fi

# ---------- 4. soubory a .env ----------
log "Soubory do $INSTALL_DIR…"
if [ "$(cd "$SRC_DIR" && pwd)" != "$(cd "$INSTALL_DIR" && pwd)" ]; then
  mkdir -p "$INSTALL_DIR/scripts" "$INSTALL_DIR/caddy" "$INSTALL_DIR/postgres"
  cp "$SRC_DIR/docker-compose.yml" "$INSTALL_DIR/"
  cp "$SRC_DIR/.env.example" "$INSTALL_DIR/"
  cp "$SRC_DIR"/scripts/*.sh "$INSTALL_DIR/scripts/"
  cp "$SRC_DIR"/caddy/Caddyfile "$INSTALL_DIR/caddy/"
  cp "$SRC_DIR"/postgres/* "$INSTALL_DIR/postgres/"
fi
chmod +x "$INSTALL_DIR"/scripts/*.sh "$INSTALL_DIR"/postgres/init-roles.sh
DEPLOY_DIR="$INSTALL_DIR"
ENV_FILE="$INSTALL_DIR/.env"
STATE_DIR="$INSTALL_DIR/.state"
mkdir -p "$STATE_DIR" "$INSTALL_DIR/logs"

fresh_env=0
if [ ! -f "$ENV_FILE" ]; then
  fresh_env=1
  cp "$INSTALL_DIR/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

# Secret se vygeneruje jen tehdy, když ještě není (opakované spuštění je nerotuje).
set_once() { [ -n "$(env_get "$1")" ] || env_set "$1" "$2"; }
env_set CLIENT "$client"
env_set DOMAIN "$domain"
env_set ACME_EMAIL "$acme_email"
env_set APP_IMAGE "$image"
env_set BACKUP_IMAGE "$backup_image"
[ "$fresh_env" -eq 1 ] && env_set APP_TAG "$version"
set_once AUTH_SECRET "$(rand_b64 32)"
set_once APP_ENCRYPTION_KEY "$(rand_b64 32)"
set_once HEALTH_TOKEN "$(rand_hex 24)"
set_once DB_SUPERUSER_PASSWORD "$(rand_pass)"
set_once DB_MIGRATOR_PASSWORD "$(rand_pass)"
set_once DB_APP_PASSWORD "$(rand_pass)"
[ -z "$restic_repo" ] || env_set RESTIC_REPOSITORY "$restic_repo"
[ -z "$aws_key" ] || env_set AWS_ACCESS_KEY_ID "$aws_key"
[ -z "$aws_secret" ] || env_set AWS_SECRET_ACCESS_KEY "$aws_secret"
[ -z "$heartbeat_url" ] || env_set HEARTBEAT_URL "$heartbeat_url"
if [ -n "$beszel_key" ]; then
  env_set BESZEL_KEY "$beszel_key"
  env_set COMPOSE_PROFILES monitoring
fi
new_restic_password=""
if [ -z "$(env_get RESTIC_PASSWORD)" ]; then
  new_restic_password="${restic_password:-$(rand_b64 24)}"
  env_set RESTIC_PASSWORD "$new_restic_password"
fi
env_set VAPID_SUBJECT "mailto:$acme_email"

# ---------- 5. image, databáze, migrace, uživatel ----------
if [ -n "$ghcr_token" ]; then
  log "Přihlášení do ghcr.io…"
  printf '%s' "$ghcr_token" | docker login ghcr.io -u "${ghcr_user:-token}" --password-stdin
fi

cd "$INSTALL_DIR"
log "Stahuji image…"
dc pull app worker backup caddy postgres
dc up -d postgres
wait_postgres || die "Databáze nenaběhla (docker compose logs postgres)."
log "Migrace…"
dc run --rm migrate

if [ -z "$(env_get VAPID_PUBLIC_KEY)" ]; then
  log "Generuji klíče pro push upozornění…"
  keys="$(dc run --rm --no-deps -T seed node_modules/.bin/tsx scripts/vapid-generate.ts | tr -d '\r')"
  pub="$(printf '%s\n' "$keys" | sed -n 's/^VAPID_PUBLIC_KEY=//p')"
  priv="$(printf '%s\n' "$keys" | sed -n 's/^VAPID_PRIVATE_KEY=//p')"
  [ -n "$pub" ] && [ -n "$priv" ] && { env_set VAPID_PUBLIC_KEY "$pub"; env_set VAPID_PRIVATE_KEY "$priv"; }
fi

owner_password=""
if [ -n "$owner_email" ]; then
  owner_name="${owner_name:-Majitel}"
  owner_password="$(rand_pass)"
  log "Výchozí data a první uživatel…"
  seed_out="$(dc run --rm -T -e OWNER_EMAIL="$owner_email" -e OWNER_NAME="$owner_name" -e OWNER_PASSWORD="$owner_password" seed)"
  printf '%s\n' "$seed_out" | grep -v "$owner_password" || true
  # uživatel už existoval → heslo z tohoto spuštění neplatí, nesmíme ho ukazovat
  if printf '%s\n' "$seed_out" | grep -q 'už existuje'; then owner_password=""; fi
else
  log "Výchozí data (bez prvního uživatele; zadejte --owner-email)…"
  dc run --rm -T seed
fi

log "Spouštím systém…"
dc up -d
wait_app_healthy 240 || die "Aplikace nenaběhla do 4 minut (docker compose logs app)."
printf '%s\n' "$(env_get APP_TAG)" >"$STATE_DIR/installed_tag"

cat <<SUMMARY

==============================================================
 Systém běží: https://$domain   (verze $(env_get APP_TAG))
==============================================================
SUMMARY
if [ -n "$owner_password" ]; then
  cat <<SUMMARY
 První přihlášení (heslo se zobrazí jen teď, uložte ho do správce hesel):
   e-mail: $owner_email
   heslo:  $owner_password
 Po přihlášení systém vyžádá nastavení dvoufázového ověření.
SUMMARY
fi
if [ -n "$new_restic_password" ]; then
  cat <<SUMMARY

 Heslo k šifrovaným zálohám (restic) – BEZ NĚJ JDE ZÁLOHA OBNOVIT JEN S PORAŽENÍM:
   $new_restic_password
 Uložte ho mimo server (správce hesel). Je také v $ENV_FILE.
SUMMARY
fi
if [ -z "$(env_get RESTIC_REPOSITORY)" ]; then
  echo
  echo " POZOR: zálohy nejsou nastavené (chybí --restic-repository). Systém bude hlásit stav „degraded“."
fi
echo
echo " DŮLEŽITÉ: uložte kopii $ENV_FILE do správce hesel. Klíče AUTH_SECRET a APP_ENCRYPTION_KEY nejsou v záloze;"
echo " bez nich po ztrátě serveru nejde obnovit dvoufázové ověření ani šifrovaná nastavení (např. heslo k SMTP)."
echo
echo " Provoz: $INSTALL_DIR/scripts/update.sh vX.Y.Z | backup.sh | restore.sh | restore-test.sh"
