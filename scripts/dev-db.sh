#!/bin/sh
# Lokální PostgreSQL 17 pro vývoj a testy (oddělený cluster, port 5433, trust auth jen na localhost).
# Nezasahuje do jiných lokálních clusterů. Použití: scripts/dev-db.sh up|down|status|reset
set -e
# macOS: postmaster potřebuje platnou locale, jinak spadne na „multithreaded during startup“
export LC_ALL=en_US.UTF-8

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
DATA="${REBAR_PG_DATA:-$HOME/.local/share/rebar-pg17}"
PORT="${REBAR_PG_PORT:-5433}"

pg() { "$PG_BIN/$1" "${@:2}"; }

ensure_cluster() {
  if [ ! -f "$DATA/PG_VERSION" ]; then
    mkdir -p "$DATA"
    pg initdb -D "$DATA" -U postgres -E UTF8 --locale-provider=icu --icu-locale=cs-CZ --locale=en_US.UTF-8 --auth=trust >/dev/null
    echo "Vytvořen cluster $DATA"
  fi
}

ensure_roles_and_dbs() {
  psql="$PG_BIN/psql -h localhost -p $PORT -U postgres -v ON_ERROR_STOP=1 -qAt"
  $psql -d postgres <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rebar_migrator') THEN CREATE ROLE rebar_migrator LOGIN PASSWORD 'migrator'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rebar_app') THEN CREATE ROLE rebar_app LOGIN PASSWORD 'app'; END IF;
END \$\$;
SQL
  for db in rebar_dev rebar_test rebar_e2e; do
    if [ -z "$($psql -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$db'")" ]; then
      $psql -d postgres -c "CREATE DATABASE $db OWNER rebar_migrator TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'cs-CZ' LOCALE 'en_US.UTF-8'"
      echo "Vytvořena databáze $db"
    fi
  done
}

case "${1:-status}" in
  up)
    ensure_cluster
    pg pg_ctl -D "$DATA" status >/dev/null 2>&1 || pg pg_ctl -D "$DATA" -o "-p $PORT -c listen_addresses=localhost -c unix_socket_directories=/tmp/rebar-pg" -l "$DATA/server.log" -w start >/dev/null
    ensure_roles_and_dbs
    echo "PostgreSQL 17 běží na localhost:$PORT (rebar_dev, rebar_test, rebar_e2e)"
    ;;
  down) pg pg_ctl -D "$DATA" stop -m fast ;;
  status) pg pg_ctl -D "$DATA" status ;;
  reset)
    "$0" down 2>/dev/null || true
    rm -rf "$DATA"
    "$0" up
    ;;
  *) echo "Použití: $0 up|down|status|reset" >&2; exit 1 ;;
esac
