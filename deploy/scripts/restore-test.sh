#!/usr/bin/env bash
# Zkouška obnovy: poslední záloha se obnoví do dočasné databáze a porovnají se počty záznamů. Měsíčně ji spouští kontejner `backup`.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$DEPLOY_DIR"
dc exec -T backup /scripts/backup-tool.sh restore-test
