#!/bin/sh
# E2E testy lokálně proti samostatné databázi `rebar_e2e` (vývojová `rebar_dev` zůstane nedotčená).
# Vyžaduje `pnpm db:up`. Screenshoty do složky: E2E_SHOTS=/cesta pnpm test:e2e:local
# Čistá databáze jako v CI: E2E_FRESH=1 pnpm test:e2e:local (databáze se zahodí a znovu vytvoří; výchozí je zachovat).
set -e
export DATABASE_URL="${E2E_DATABASE_URL:-postgres://rebar_app:app@localhost:5433/rebar_e2e}"
export DATABASE_MIGRATE_URL="${E2E_DATABASE_MIGRATE_URL:-postgres://rebar_migrator:migrator@localhost:5433/rebar_e2e}"

if [ "${E2E_FRESH:-}" = "1" ]; then
  PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
  ADMIN_URL="${E2E_ADMIN_URL:-postgres://postgres@localhost:${REBAR_PG_PORT:-5433}/postgres}"
  PSQL="$PG_BIN/psql"
  [ -x "$PSQL" ] || PSQL="psql"
  echo "E2E_FRESH=1: zahazuji a znovu vytvářím databázi rebar_e2e"
  "$PSQL" "$ADMIN_URL" -v ON_ERROR_STOP=1 -qAt \
    -c "DROP DATABASE IF EXISTS rebar_e2e WITH (FORCE)" \
    -c "CREATE DATABASE rebar_e2e OWNER rebar_migrator TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'cs-CZ' LOCALE 'en_US.UTF-8'"
  rm -rf "${FILES_DIR:-./.data/files-e2e}" 2>/dev/null || true
fi

pnpm db:migrate
pnpm test:e2e "$@"
