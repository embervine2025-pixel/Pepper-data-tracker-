#!/bin/sh
# Runs once on first container start, alongside the database named in
# POSTGRES_DB. Keeps `npm test` (which resets the schema) off the dev data.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE pepper_test OWNER $POSTGRES_USER;
EOSQL
