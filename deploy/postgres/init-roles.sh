#!/bin/sh
# Spustí se jen při prvním vytvoření databáze. Role pro migrace (vlastník schématu) a pro aplikaci (bez DDL).
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE "$DB_MIGRATOR_USER" LOGIN CREATEDB PASSWORD '$DB_MIGRATOR_PASSWORD';
CREATE ROLE "$DB_APP_USER" LOGIN PASSWORD '$DB_APP_PASSWORD';
CREATE DATABASE "$DB_NAME" OWNER "$DB_MIGRATOR_USER" TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER icu ICU_LOCALE 'cs-CZ' LOCALE 'en_US.UTF-8';
SQL
