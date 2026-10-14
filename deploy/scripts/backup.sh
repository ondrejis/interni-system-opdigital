#!/usr/bin/env bash
# Okamžitá záloha (databáze + soubory) do restic repozitáře. Denně ji spouští kontejner `backup` sám.
set -euo pipefail
# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$DEPLOY_DIR"
dc exec -T backup /scripts/backup-tool.sh backup
