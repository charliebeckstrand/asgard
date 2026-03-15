#!/bin/bash
set -e

# This script runs as the POSTGRES_USER (heimdall) during container init.
# It creates additional roles and databases needed by other services.
# Schema migrations are handled by each service on startup via saga.

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
    DO $$ BEGIN CREATE ROLE vidar WITH LOGIN PASSWORD 'vidar'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    SELECT 'CREATE DATABASE vidar OWNER vidar' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'vidar')\gexec
EOSQL
