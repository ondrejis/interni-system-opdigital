#!/usr/bin/env bash
# Aktualizace na novou verzi: ./update.sh vX.Y.Z [--skip-backup] [--force] [--dry-run]
# záloha → stažení image → migrace → restart → kontrola zdraví → při selhání návrat na předchozí verzi.
# Migrace jsou jen dopředné a zpětně kompatibilní (expand → contract), takže starší aplikace běží i nad novějším schématem.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$DEPLOY_DIR"

new="${1:-}"
shift || true
skip_backup=0
force=0
dry_run=0
for arg in "$@"; do
  case "$arg" in
    --skip-backup) skip_backup=1 ;;
    --force) force=1 ;;
    --dry-run) dry_run=1 ;;
    *) die "Neznámý přepínač $arg" ;;
  esac
done
[[ "$new" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] || die "Použití: $0 vX.Y.Z [--skip-backup] [--force] [--dry-run]"

old="$(env_get APP_TAG)"
[ -n "$old" ] || die "V .env chybí APP_TAG."

# Nanečisto: jen ověří vstupy a vypíše plán, nic nespouští ani nemění (nepotřebuje Docker).
if [ "$dry_run" -eq 1 ]; then
  if [ "$new" = "$old" ] && [ "$force" -ne 1 ]; then
    log "DRY-RUN: verze $new už běží, nic by se nedělo."
    exit 0
  fi
  log "DRY-RUN: aktualizace $old → $new"
  if [ "$skip_backup" -eq 1 ]; then log "DRY-RUN: 1. záloha se přeskočí (--skip-backup)"; else log "DRY-RUN: 1. záloha před aktualizací (backup.sh)"; fi
  log "DRY-RUN: 2. stažení image $new (app, worker, backup)"
  log "DRY-RUN: 3. migrace databáze (docker compose run --rm migrate)"
  log "DRY-RUN: 4. zápis APP_TAG=$new do .env a restart app, worker, backup, caddy"
  log "DRY-RUN: 5. kontrola zdraví (/api/health/live a /api/health); při selhání návrat na $old"
  exit 0
fi

mkdir -p "$LOG_DIR" "$STATE_DIR"
exec > >(tee -a "$LOG_DIR/update-$(date +%Y%m%d-%H%M%S).log") 2>&1
if [ "$new" = "$old" ] && [ "$force" -ne 1 ]; then
  log "Verze $new už běží (přepínač --force ji nasadí znovu)."
  exit 0
fi
log "Aktualizace $old → $new"

if [ "$skip_backup" -ne 1 ]; then
  log "Záloha před aktualizací…"
  "$DEPLOY_DIR/scripts/backup.sh" || die "Záloha selhala, aktualizace se neprovede (přepínač --skip-backup ji obejde)."
fi
printf '%s\n' "$old" >"$STATE_DIR/previous_tag"

rollback() {
  log "Vracím se na $old…"
  env_set APP_TAG "$old"
  dc up -d app worker backup caddy || true
  if wait_app_healthy 180; then
    log "Návrat na $old proběhl, systém běží."
  else
    log "POZOR: ani verze $old nenaběhla. Postup: docker compose logs app, případně ./restore.sh."
  fi
}

log "Stahuji image $new…"
APP_TAG="$new" dc pull app worker backup || die "Stažení image selhalo (verze neexistuje, nebo chybí přihlášení do ghcr.io). Nic se nezměnilo."

log "Migrace databáze…"
if ! APP_TAG="$new" dc run --rm migrate; then
  die "Migrace selhala (každá běží v transakci, schéma zůstalo ve stavu před ní). Aplikace dál běží na $old."
fi

log "Restart na $new…"
env_set APP_TAG "$new"
# `set -e` by jinak skončil bez návratu: .env by zůstal na nové verzi a část kontejnerů by běžela na staré
if ! dc up -d app worker backup caddy; then
  log "Restart na $new selhal."
  rollback
  exit 1
fi

if wait_app_healthy 180; then
  # podrobné zdraví za tokenem: selhání databáze nebo disku = návrat
  token="$(env_get HEALTH_TOKEN)"
  status="$(dc exec -T -e T="$token" app node -e "fetch('http://127.0.0.1:3000/api/health',{headers:{authorization:'Bearer '+process.env.T}}).then(async r=>{const j=await r.json();console.log(j.status)}).catch(()=>console.log('fail'))" 2>/dev/null | tail -1 || true)"
  if [ "$status" = "ok" ] || [ "$status" = "degraded" ]; then
    log "Aktualizace na $new hotová (stav systému: $status)."
    dc image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  log "Podrobná kontrola zdraví vrátila „${status}“."
else
  log "Aplikace $new nenaběhla do 3 minut."
fi
rollback
exit 1
