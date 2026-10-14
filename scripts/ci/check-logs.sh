#!/usr/bin/env bash
# Projde log kontejnerů (soubor z `docker compose logs --no-color`) a selže, když v něm jsou chyby aplikace.
# Ignorované řádky jsou ve scripts/ci/log-allowlist.txt (regulární výrazy, jeden na řádek; # = komentář) – vždy s důvodem.
#   check-logs.sh compose.log
set -euo pipefail
log_file="${1:?Použití: check-logs.sh soubor.log}"
here="$(dirname "${BASH_SOURCE[0]}")"
allow="$(grep -vE '^\s*(#|$)' "$here/log-allowlist.txt" || true)"

# postgres: ERROR/FATAL jsou běžné při kolizích a testech; sledujeme jen pád serveru
pg_bad="$(grep -E '^postgres-1\s+\|.*(PANIC|could not|terminated by signal)' "$log_file" || true)"
# ostatní služby: jakákoli chyba
bad="$(grep -vE '^postgres-1\s+\|' "$log_file" | grep -iE '\b(error|fatal|unhandled|exception|panic|ECONNREFUSED|ENOTFOUND)\b' || true)"
if [ -n "$allow" ] && [ -n "$bad" ]; then
  bad="$(printf '%s\n' "$bad" | grep -vEf <(printf '%s\n' "$allow") || true)"
fi
status=0
if [ -n "$pg_bad" ]; then
  echo "Postgres hlásí vážný problém:"
  printf '%s\n' "$pg_bad" | head -20
  status=1
fi
if [ -n "$bad" ]; then
  echo "V logu kontejnerů jsou chyby ($(printf '%s\n' "$bad" | wc -l | tr -d ' ') řádků):"
  printf '%s\n' "$bad" | head -40
  status=1
fi
[ "$status" -eq 0 ] && echo "Log kontejnerů je bez chyb."
exit "$status"
