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
for t in rls_test function_payloads_test storage_test retention_test governance_test shift_report_test email_delivery_test settings_test profile_self_service_test crm_test porter_pay_test extra_porter_test supervisor_commission_test accounts_test accounts_role_test one_porter_test accounting_test services_test roles_test paystack_test roster_test; do
  echo "== $t"
  psql -q -t -A -v ON_ERROR_STOP=1 -d "$DB" -f "supabase/tests/$t.sql" 2>&1 | grep -E "NOTICE|^function|ERROR|FAIL" | sed 's/^psql:[^ ]* //'
done
# The seed runs last: the tests above create their own packages and rolled back.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/seed.sql
psql -q -t -A -d "$DB" -c "select 'seed: ' || count(*) || ' service packages' from public.service_packages"
echo "All database tests passed."
