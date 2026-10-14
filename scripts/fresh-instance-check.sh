#!/bin/sh
# Ověří „čerstvou instanci“ jako v CI, jen bez Dockeru: nová databáze → migrace → demo data → produkční server
# (standalone build z `pnpm build`) → procházecí testy (`pnpm test:crawl`) proti němu. Selže na jakékoli chybě.
# Použití: pnpm build && sh scripts/fresh-instance-check.sh [soubory crawl specifikací…]
# Výchozí: celé `pnpm test:crawl`. Vyžaduje `pnpm db:up`. Port serveru: FRESH_PORT (výchozí 3102),
# databáze: FRESH_DB (výchozí rebar_fresh; po skončení se zahodí).
#
# Dva průchody (CI `compose-smoke` je má v sobě oba, protože install/compose generuje klíče VAPID a nastaví TZ):
#   FRESH_VAPID=0  bez klíčů VAPID (push vypnutý), jako čerstvá instalace bez nich
#   FRESH_VAPID=1  s klíči VAPID (vygeneruje `scripts/vapid-generate.ts`): vykreslí se větev „push zapnutý“
#   nenastaveno    oba průchody po sobě (výchozí `pnpm check:fresh`); `pnpm check:fresh:push` jen druhý.
# Časová pásma jako v CI: server v Europe/Prague (TZ v deploy/docker-compose.yml), prohlížeč testů v UTC (runner
# GitHub Actions; přepíše FRESH_BROWSER_TZ). Chytá nesoulad vykreslení serveru a prohlížeče (chyba hydratace #418).
set -e
cd "$(dirname "$0")/.."

if [ -z "${FRESH_VAPID+x}" ]; then
  FAIL=0
  FRESH_VAPID=0 sh "$0" "$@" || FAIL=1
  FRESH_VAPID=1 sh "$0" "$@" || FAIL=1
  exit $FAIL
fi

PORT="${FRESH_PORT:-3102}"
DB="${FRESH_DB:-rebar_fresh}"
case "$DB" in rebar|rebar_dev|rebar_e2e|rebar_test) echo "FRESH_DB=$DB je vyhrazená databáze, zvolte jiný název"; exit 1 ;; esac
PSQL="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}/psql -h localhost -p ${REBAR_PG_PORT:-5434} -U postgres -v ON_ERROR_STOP=1 -qAt -d postgres"

# uložené relace demo uživatelů z jiné databáze by v čerstvé instanci neplatily
rm -f apps/web/e2e-crawl/.auth/localhost_"$PORT"-*.json

echo "== nová databáze $DB"
$PSQL -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)"
$PSQL -c "CREATE DATABASE $DB OWNER rebar_migrator TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'cs-CZ' LOCALE 'en_US.UTF-8'"

# tajemství aplikace z .env.local (v CI je generuje compose-env.sh); databáze a adresy se přepíšou níže
if [ -f .env.local ]; then
  for k in AUTH_SECRET APP_ENCRYPTION_KEY APP_ENCRYPTION_KEYS; do
    v="$(grep -E "^$k=" .env.local | head -1 | cut -d= -f2-)"
    [ -z "$v" ] || export "$k=$v"
  done
fi
export DATABASE_URL="postgres://rebar_app:app@localhost:${REBAR_PG_PORT:-5434}/$DB"
export DATABASE_MIGRATE_URL="postgres://rebar_migrator:migrator@localhost:${REBAR_PG_PORT:-5434}/$DB"
export FILES_DIR="$(mktemp -d)"
export CLIENT=opsys
export APP_URL="http://localhost:$PORT"
export APP_ALLOW_HTTP=1

# klíče VAPID jako v compose (v provozu je vytvoří install.sh); bez nich je push na serveru vypnutý
unset VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT
if [ "$FRESH_VAPID" = "1" ]; then
  KEYS="$(pnpm --silent exec tsx scripts/vapid-generate.ts 2>/dev/null)"
  export VAPID_PUBLIC_KEY="$(printf '%s\n' "$KEYS" | sed -n 's/^VAPID_PUBLIC_KEY=//p')"
  export VAPID_PRIVATE_KEY="$(printf '%s\n' "$KEYS" | sed -n 's/^VAPID_PRIVATE_KEY=//p')"
  export VAPID_SUBJECT="mailto:ci@example.test"
  [ -n "$VAPID_PUBLIC_KEY" ] && [ -n "$VAPID_PRIVATE_KEY" ] || { echo "Klíče VAPID se nepodařilo vygenerovat"; exit 1; }
fi

echo "== migrace a demo data"
pnpm db:migrate
pnpm demo:seed --quiet

echo "== server na portu $PORT (VAPID=$FRESH_VAPID)"
LOG="$(mktemp)"
# server běží v Europe/Prague jako kontejner (TZ v deploy/docker-compose.yml), nezávisle na pásmu tohoto stroje
PORT="$PORT" HOSTNAME=127.0.0.1 TZ=Europe/Prague node apps/web/.next/standalone/apps/web/server.js >"$LOG" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; $PSQL -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null 2>&1; rm -rf "$FILES_DIR"' EXIT
i=0
until curl -fsS "http://127.0.0.1:$PORT/prihlaseni" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -lt 60 ] || { echo "Server nenaběhl:"; tail -30 "$LOG"; exit 1; }
  sleep 1
done

echo "== procházecí testy proti čerstvé instanci"
export CRAWL_BASE_URL="http://localhost:$PORT"
export CRAWL_EMAIL="majitel@demo.opsys.example"
export CRAWL_PASSWORD="Opsys-demo-2026"
export CRAWL_OUTPUT_DIR="${CRAWL_OUTPUT_DIR:-test-results-fresh}"
# v CI běží prohlížeč v UTC (runner), server v Europe/Prague; napodobíme to i lokálně (FRESH_BROWSER_TZ přepíše)
set +e
TZ="${FRESH_BROWSER_TZ:-UTC}" pnpm test:crawl "$@"
STATUS=$?
echo "== chyby v logu serveru"
grep -iE "error|exception|unhandled" "$LOG" | grep -v "destination stream errored" | head -20 || true
exit $STATUS
