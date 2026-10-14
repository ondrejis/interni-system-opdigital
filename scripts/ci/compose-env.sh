#!/usr/bin/env bash
# Vytvoří deploy/.env pro smoke test kontejnerů v CI (job compose-smoke): vzor z deploy/.env.example
# + vygenerovaná tajemství a testovací vlastník. Jen pro CI, v provozu se používá deploy/scripts/install.sh.
# Je-li nastavené GITHUB_ENV, zapíše do něj přihlašovací údaje vlastníka pro procházecí testy (CRAWL_*).
set -euo pipefail
# shellcheck source=../../deploy/scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/../../deploy/scripts/lib.sh"

cp "$DEPLOY_DIR/.env.example" "$ENV_FILE"
chmod 600 "$ENV_FILE"

owner_password="$(rand_pass)"
env_set CLIENT demo
env_set APP_IMAGE system-demo
env_set BACKUP_IMAGE system-backup
env_set APP_TAG ci
env_set DOMAIN localhost
env_set ACME_EMAIL ci@example.test
env_set AUTH_SECRET "$(rand_b64 32)"
env_set APP_ENCRYPTION_KEY "$(rand_b64 32)"
env_set HEALTH_TOKEN "$(rand_hex 24)"
env_set DB_SUPERUSER_PASSWORD "$(rand_pass)"
env_set DB_MIGRATOR_PASSWORD "$(rand_pass)"
env_set DB_APP_PASSWORD "$(rand_pass)"
env_set RESTIC_REPOSITORY /restic-repo
env_set RESTIC_PASSWORD "$(rand_pass)"
# plánovač zálohování v kontejneru nesmí v testu spustit vlastní zálohu (zálohu spouští test ručně)
env_set BACKUP_TIME 23:59
env_set RESTORE_TEST_DAY 0
env_set OWNER_EMAIL ci-owner@example.test
env_set OWNER_NAME "CI Majitel"
env_set OWNER_PASSWORD "$owner_password"

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "::add-mask::$owner_password"
  {
    echo "CRAWL_EMAIL=ci-owner@example.test"
    echo "CRAWL_PASSWORD=$owner_password"
    echo "HEALTH_TOKEN=$(env_get HEALTH_TOKEN)"
  } >>"$GITHUB_ENV"
fi
log "deploy/.env pro CI vytvořeno."
