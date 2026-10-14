#!/usr/bin/env bash
# Společné funkce provozních skriptů. Načítá se přes `source`, sám nic nedělá.

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
# shellcheck disable=SC2034  # používají skripty, které tento soubor načítají
STATE_DIR="$DEPLOY_DIR/.state"
# shellcheck disable=SC2034
LOG_DIR="$DEPLOY_DIR/logs"

log() { printf '%s %s\n' "$(date +'%F %T')" "$*"; }
die() { log "CHYBA: $*" >&2; exit 1; }

need_root() { [ "$(id -u)" -eq 0 ] || die "Spusťte jako root (sudo)."; }

# Hodnota z .env (prázdná, když klíč chybí).
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  awk -F= -v k="$1" '$1 == k { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

# Nastaví klíč v .env (přidá, nebo přepíše); hodnoty se nikdy nevypisují.
env_set() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp "$ENV_FILE.XXXXXX")"
  # hodnota jde přes prostředí, ne přes `awk -v`: ten zpracovává zpětná lomítka (`\n`, `\\`) a poškodil by heslo
  # nebo do souboru vložil nový řádek
  ENV_SET_VALUE="$value" awk -F= -v k="$key" 'BEGIN { done = 0; v = ENVIRON["ENV_SET_VALUE"] }
    $1 == k { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }' "$ENV_FILE" >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

dc() { docker compose --project-directory "$DEPLOY_DIR" "$@"; }

# Počká, až aplikace odpoví na /api/health/live (ve vnitřní síti, mimo proxy).
wait_app_healthy() {
  local timeout="${1:-180}" waited=0
  while [ "$waited" -lt "$timeout" ]; do
    if dc exec -T app node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
    waited=$((waited + 3))
  done
  return 1
}

wait_postgres() {
  local waited=0
  until dc exec -T postgres pg_isready -U postgres -d postgres >/dev/null 2>&1; do
    sleep 2
    waited=$((waited + 2))
    [ "$waited" -lt 120 ] || return 1
  done
}

rand_hex() { openssl rand -hex "${1:-24}"; }
rand_b64() { openssl rand -base64 "${1:-32}"; }
# Bezpečné pro URL i shell (hesla k databázi se skládají do adresy připojení).
rand_pass() { openssl rand -base64 36 | tr -d '/+=\n' | cut -c1-32; }
