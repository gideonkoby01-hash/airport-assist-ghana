#!/usr/bin/env bash
# Applies the migrations to a scratch database on any PostgreSQL 15+ server and runs the SQL tests.
# Uses the standard PG* environment variables (PGHOST, PGPORT, PGUSER, ...). The scratch database
# `aag_test` is dropped and recreated. Does not need Docker or the Supabase CLI.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=aag_test
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>&1 | grep -v NOTICE || true
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
for t in rls_test function_payloads_test; do
  echo "== $t"
  psql -q -t -A -v ON_ERROR_STOP=1 -d "$DB" -f "supabase/tests/$t.sql" 2>&1 | grep -E "NOTICE|^function|ERROR|FAIL" | sed 's/^psql:[^ ]* //'
done
echo "All database tests passed."
