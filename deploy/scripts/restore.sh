#!/usr/bin/env bash
# Obnova ze zálohy: ./restore.sh [snapshot|latest] [--yes] [--no-pre-backup]
# PŘEPÍŠE databázi i soubory stavem ze snapshotu. Před obnovou se (pokud to jde) udělá ještě záloha současného stavu.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$DEPLOY_DIR"

snapshot="latest"
yes=0
pre=1
for arg in "$@"; do
  case "$arg" in
    --yes) yes=1 ;;
    --no-pre-backup) pre=0 ;;
    -*) die "Neznámý přepínač $arg" ;;
    *) snapshot="$arg" ;;
  esac
done

domain="$(env_get DOMAIN)"
if [ "$yes" -ne 1 ]; then
  echo "Obnova snapshotu „${snapshot}“ PŘEPÍŠE databázi a soubory na $domain."
  read -r -p "Pro potvrzení napište adresu systému ($domain): " answer
  [ "$answer" = "$domain" ] || die "Potvrzení nesouhlasí, nic se nestalo."
fi

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_DIR/restore-$(date +%Y%m%d-%H%M%S).log") 2>&1

if [ "$pre" -eq 1 ]; then
  log "Záloha současného stavu před obnovou…"
  "$DEPLOY_DIR/scripts/backup.sh" || die "Záloha před obnovou selhala. Obnovu lze vynutit přepínačem --no-pre-backup."
fi

# `backup` se zastaví taky: denní záloha spuštěná uprostřed obnovy by uložila prázdnou nebo rozpracovanou databázi
# jako nejnovější snapshot (a `latest` by pak mířilo na ni)
log "Zastavuji aplikaci, worker a plánovač záloh…"
dc stop app worker backup
log "Obnova…"
dc run --rm restore restore "$snapshot"
log "Migrace a práva aplikační role…"
dc run --rm migrate
log "Spouštím systém…"
dc up -d
wait_app_healthy 180 || die "Aplikace po obnově nenaběhla (viz: docker compose logs app)."
log "Obnova dokončena."
