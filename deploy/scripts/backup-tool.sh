#!/usr/bin/env bash
# Zálohování uvnitř kontejneru `backup`: pg_dump + soubory do restic repozitáře (šifrovaně, S3 kompatibilní úložiště).
#
#   backup-tool.sh backup            denní záloha + retence (30 denních, 12 měsíčních)
#   backup-tool.sh restore [snap]    obnova databáze a souborů ze snapshotu (výchozí: poslední); přepíše aktuální data
#   backup-tool.sh restore-test      obnova poslední zálohy do dočasné databáze a kontrola počtů záznamů
#   backup-tool.sh loop              plánovač (denní záloha, měsíční zkouška obnovy)
#
# Výsledek se zapisuje do $BACKUP_STATUS_FILE (čte ho /api/health a heartbeat).
set -euo pipefail

STATUS="${BACKUP_STATUS_FILE:-/data/status/backup.json}"
WORK="${BACKUP_WORK:-/work}"
FILES_DIR="${FILES_DIR:-/data/files}"
HOST_TAG="system"
export RESTIC_CACHE_DIR="${RESTIC_CACHE_DIR:-$WORK/restic-cache}"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "CHYBA: $*"; exit 1; }

need_repo() {
  [ -n "${RESTIC_REPOSITORY:-}" ] && [ -n "${RESTIC_PASSWORD:-}" ] ||
    die "Chybí RESTIC_REPOSITORY nebo RESTIC_PASSWORD (zálohy nejsou nastavené)."
}

ensure_repo() {
  need_repo
  restic cat config >/dev/null 2>&1 || {
    log "Inicializuji restic repozitář."
    restic init
  }
}

# Změní stavový soubor jq filtrem (zápis atomicky; poškozený soubor se začne znovu).
status_set() {
  local filter="$1"
  shift
  mkdir -p "$(dirname "$STATUS")"
  local cur='{}'
  [ -f "$STATUS" ] && jq -e . "$STATUS" >/dev/null 2>&1 && cur="$(cat "$STATUS")"
  local tmp
  tmp="$(mktemp "$STATUS.XXXXXX")"
  printf '%s' "$cur" | jq "$@" "$filter" >"$tmp"
  chmod 0644 "$tmp"
  mv "$tmp" "$STATUS"
}

# Počty řádků všech tabulek schématu public: "tabulka<TAB>počet"
table_counts() {
  local db="$1" t
  psql -d "$db" -At -c "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1" |
    while read -r t; do
      printf '%s\t%s\n' "$t" "$(psql -d "$db" -At -c "select count(*) from public.\"$t\"")"
    done
}

cmd_backup() {
  mkdir -p "$WORK"
  exec 9>"$WORK/backup.lock"
  flock -n 9 || die "Jiná záloha právě běží."
  local started
  started="$(date -u +%FT%TZ)"
  # shellcheck disable=SC2154  # $e a $t patří jq (--arg), ne shellu
  trap 'status_set ".lastFailureAt=\$t | .lastError=\$e" --arg t "$(date -u +%FT%TZ)" --arg e "záloha selhala (viz log kontejneru backup)"; log "Záloha selhala."' ERR

  ensure_repo
  log "pg_dump…"
  pg_dump -Fc -Z 6 --no-owner --no-privileges -f "$WORK/db.dump"
  table_counts "$PGDATABASE" >"$WORK/db.counts.tsv"

  log "restic backup…"
  restic backup "$WORK/db.dump" "$WORK/db.counts.tsv" "$FILES_DIR" \
    --tag daily --host "$HOST_TAG" --exclude-caches --quiet

  log "retence (30 denních, 12 měsíčních)…"
  restic forget --host "$HOST_TAG" --tag daily --keep-daily 30 --keep-monthly 12 --prune --quiet

  if [ "$(date +%u)" = "7" ]; then
    log "týdenní kontrola integrity repozitáře…"
    restic check --read-data-subset=2%
  fi

  local snap bytes
  snap="$(restic snapshots --host "$HOST_TAG" --latest 1 --json | jq -r '.[0].short_id // ""')"
  bytes="$(wc -c <"$WORK/db.dump" | tr -d ' ')"
  rm -f "$WORK/db.dump" "$WORK/db.counts.tsv"
  # shellcheck disable=SC2016  # jq filtr v apostrofech
  status_set '.lastSuccessAt=$t | .lastSnapshot=$s | .dumpBytes=($b|tonumber) | del(.lastError, .lastFailureAt)' \
    --arg t "$(date -u +%FT%TZ)" --arg s "$snap" --arg b "$bytes"
  trap - ERR
  log "Záloha hotová (snapshot $snap, začala $started)."
}

# Obnova ze snapshotu. Spouští se při zastavené aplikaci (viz restore.sh), přepíše databázi i soubory.
cmd_restore() {
  local snap="${1:-latest}"
  ensure_repo
  rm -rf "$WORK/restore"
  mkdir -p "$WORK/restore"
  log "Obnovuji snapshot $snap…"
  restic restore "$snap" --host "$HOST_TAG" --target "$WORK/restore" --include "$WORK/db.dump" --include "$WORK/db.counts.tsv"
  [ -s "$WORK/restore$WORK/db.dump" ] || die "Snapshot neobsahuje dump databáze."
  # Databáze se zakládá znovu (ne `pg_restore --clean`): fronta úloh (pg-boss) má dělené tabulky a `--clean` na nich selže
  # („cannot drop inherited constraint“). Aplikace a worker jsou při obnově zastavené; zbylá spojení ukončí FORCE.
  log "Znovu zakládám databázi $PGDATABASE a obnovuji ji z dumpu…"
  dropdb --if-exists --force "$PGDATABASE"
  createdb -T template0 --encoding UTF8 --locale-provider=icu --icu-locale=cs-CZ --locale=en_US.UTF-8 "$PGDATABASE"
  pg_restore --no-owner --no-privileges --exit-on-error -d "$PGDATABASE" "$WORK/restore$WORK/db.dump"
  log "Obnovuji soubory do $FILES_DIR…"
  [ -w "$FILES_DIR" ] || die "$FILES_DIR není zapisovatelný (spusťte přes docker compose run restore)."
  find "$FILES_DIR" -mindepth 1 -delete
  restic restore "$snap" --host "$HOST_TAG" --target / --include "$FILES_DIR"
  rm -rf "$WORK/restore"
  log "Obnova hotová. Spusťte migrace (zpřístupní práva aplikační role) a aplikaci."
}

cmd_restore_test() {
  mkdir -p "$WORK"
  ensure_repo
  local detail="" ok=true
  # globální (ne local): úklid se spouští při ukončení skriptu, až když lokální proměnné už neexistují
  RT_DB="restore_test_$(date +%s)_$$"
  local tdb="$RT_DB"
  rm -rf "$WORK/rt"
  mkdir -p "$WORK/rt"
  trap 'dropdb --if-exists "$RT_DB" >/dev/null 2>&1 || true; rm -rf "$WORK/rt"' EXIT

  log "Zkouška obnovy: stahuji poslední snapshot…"
  if ! restic restore latest --host "$HOST_TAG" --target "$WORK/rt" --include "$WORK/db.dump" --include "$WORK/db.counts.tsv" >/dev/null; then
    ok=false
    detail="snapshot se nepodařilo stáhnout"
  elif [ ! -s "$WORK/rt$WORK/db.dump" ]; then
    ok=false
    detail="snapshot neobsahuje dump databáze"
  else
    createdb -T template0 --encoding UTF8 --locale-provider=icu --icu-locale=cs-CZ --locale=en_US.UTF-8 "$tdb"
    if ! pg_restore --no-owner --no-privileges --exit-on-error -d "$tdb" "$WORK/rt$WORK/db.dump" 2>"$WORK/rt/restore.err"; then
      ok=false
      detail="pg_restore selhal: $(head -c 200 "$WORK/rt/restore.err" | tr '\n' ' ')"
    else
      local tables=0 bad=0 t expected got min
      while IFS=$'\t' read -r t expected; do
        [ -n "$t" ] || continue
        tables=$((tables + 1))
        got="$(psql -d "$tdb" -At -c "select count(*) from public.\"$t\"" 2>/dev/null || echo -1)"
        # data se mezi zálohou a zápisem počtů mohla o pár řádků posunout, proto malá tolerance
        min=$((expected - expected / 100 - 2))
        if [ "$got" -lt "$min" ]; then
          bad=$((bad + 1))
          detail="$detail $t: obnoveno $got, v záloze $expected;"
        fi
      done <"$WORK/rt$WORK/db.counts.tsv"
      if [ "$tables" -eq 0 ]; then
        ok=false
        detail="záloha neobsahuje žádné tabulky"
      elif [ "$bad" -gt 0 ]; then
        ok=false
      else
        detail="obnoveno $tables tabulek, počty záznamů sedí"
      fi
    fi
  fi

  # shellcheck disable=SC2016  # jq filtr v apostrofech
  status_set '.restoreTest={at:$t, ok:($ok=="true"), detail:$d}' \
    --arg t "$(date -u +%FT%TZ)" --arg ok "$ok" --arg d "$detail"
  if [ "$ok" = true ]; then log "Zkouška obnovy v pořádku: $detail"; else log "Zkouška obnovy SELHALA: $detail"; exit 1; fi
}

# Plánovač: denní záloha v BACKUP_TIME (při selhání nový pokus za hodinu), zkouška obnovy v RESTORE_TEST_DAY o dvě hodiny později.
cmd_loop() {
  mkdir -p "$WORK"
  local marker_dir; marker_dir="$(dirname "$STATUS")"
  local backup_time="${BACKUP_TIME:-02:30}" test_day="${RESTORE_TEST_DAY:-1}"
  local warned=0
  log "Plánovač záloh: denně v $backup_time, zkouška obnovy ${test_day}. dne v měsíci."
  while true; do
    local today now_min target_min test_min last_attempt
    today="$(date +%F)"
    now_min=$((10#$(date +%H) * 60 + 10#$(date +%M)))
    target_min=$((10#${backup_time%%:*} * 60 + 10#${backup_time##*:}))
    test_min=$((target_min + 120))
    if [ -z "${RESTIC_REPOSITORY:-}" ]; then
      [ "$warned" = 1 ] || { log "VAROVÁNÍ: zálohy nejsou nastavené (RESTIC_REPOSITORY)."; warned=1; }
      sleep 600
      continue
    fi
    last_attempt="$(cat "$marker_dir/.backup-attempt" 2>/dev/null || echo 0)"
    if [ "$(cat "$marker_dir/.backup-day" 2>/dev/null || true)" != "$today" ] &&
      [ "$now_min" -ge "$target_min" ] && [ $(($(date +%s) - last_attempt)) -ge 3600 ]; then
      date +%s >"$marker_dir/.backup-attempt"
      # jako samostatný proces, ať v něm platí `set -e` (v podmínce by se chyby ignorovaly)
      if "$0" backup; then echo "$today" >"$marker_dir/.backup-day"; fi
    fi
    if [ "$(date +%d | sed 's/^0//')" = "$test_day" ] && [ "$now_min" -ge "$test_min" ] &&
      [ "$(cat "$marker_dir/.restore-test-month" 2>/dev/null || true)" != "$(date +%Y-%m)" ]; then
      date +%Y-%m >"$marker_dir/.restore-test-month"
      "$0" restore-test || true
    fi
    sleep 60
  done
}

case "${1:-}" in
  backup) cmd_backup ;;
  restore) shift; cmd_restore "${1:-latest}" ;;
  restore-test) cmd_restore_test ;;
  loop) cmd_loop ;;
  *) echo "Použití: $0 backup | restore [snapshot] | restore-test | loop" >&2; exit 2 ;;
esac
