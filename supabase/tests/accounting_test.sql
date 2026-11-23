-- Double-entry books: chart of accounts, journal, trial balance, balance sheet, transfers, supervisor payouts,
-- shift report review and month-end close. Run after the migrations.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'acc-gl@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'sup-gl@example.com'),
  ('00000000-0000-0000-0000-0000000000b3', 'adm-gl@example.com');
update public.profiles set role = 'accounts', full_name = 'Akos Accountant' where email = 'acc-gl@example.com';
update public.profiles set role = 'supervisor', full_name = 'Sena Supervisor' where email = 'sup-gl@example.com';
update public.profiles set role = 'admin', full_name = 'Ada Admin' where email = 'adm-gl@example.com';

create function pg_temp.check_that(label text, ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;
create function pg_temp.raises(label text, stmt text, expected text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm like expected || '%' or sqlstate = expected then raise notice 'ok   % (%)', label, sqlerrm; return; end if;
    raise exception 'FAIL %: wrong error: % (%)', label, sqlerrm, sqlstate;
  end;
  raise exception 'FAIL %: no error raised', label;
end $$;
create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2')::text, true);
  set local role authenticated;
end $$;

set local role service_role;
insert into public.service_packages (code, name, price, flight_type, includes_lounge) values
  ('full_arrival', 'Full Arrival Assist', 700, 'arrival', true),
  ('porter_only', 'Porter Service Only', 100, 'both', false)
on conflict (code) do nothing;

-- A meet and assist sale in cash (2 passengers, 2 porters at 30 each) and a porter-only sale on mobile money.
select public.create_quick_sale('00000000-0000-0000-0000-0000000000b2', 'Sena', 'GL-1', 'full_arrival', 2, null, 'Ama Mensah', '0241111111', null, null, 'cash', 'Kojo', 2, 30, null, 'ke 510', 'Kenya Airways', '14:30', 'porter-kojo');
select public.create_quick_sale('00000000-0000-0000-0000-0000000000b2', 'Sena', 'GL-2', 'porter_only', 1, null, 'Kwame', '0242222222', null, null, 'mobile_money', 'Yaw', 1, 30, null, null, 'Kenya Airways', '09:00', 'porter-yaw');
select public.record_adjustment((select id from public.bookings where reference = 'GL-1'), 'refund', 100, 'cash', 'Short service', 'b1', 'Akos');
insert into public.shift_reports (supervisor_id, supervisor_name, shift_type, reporting_period_start, cash_expected, cash_counted, cash_variance, grand_total_paid)
values ('00000000-0000-0000-0000-0000000000b2', 'Sena Supervisor', 'morning', to_char(current_date, 'YYYY-MM-DD'), 1300, 1280, -20, 1430);

-- ---- who can use it -----------------------------------------------------------------------------------
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.raises('a supervisor cannot read the journal', $q$select * from public.gl_journal(current_date, current_date)$q$, '42501');
select pg_temp.raises('a supervisor cannot post a journal entry',
  $q$select public.gl_post_journal(current_date, 'Sneaky', null, '[{"account":"1000","debit":5},{"account":"4000","credit":5}]')$q$, '42501');
select pg_temp.check_that('a supervisor sees no chart of accounts', (select count(*) = 0 from public.gl_accounts));
select pg_temp.raises('a supervisor cannot review shift reports', $q$select * from public.shift_reports_for_review(current_date, current_date)$q$, '42501');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.raises('nobody writes to the chart of accounts directly',
  $q$insert into public.gl_accounts (code, name, kind) values ('1999', 'Hidden', 'asset')$q$, '42501');

-- ---- the automatic entries ---------------------------------------------------------------------------
select pg_temp.check_that('cash sale: cash debited 1400, revenue credited',
  (select sum(debit) = 1400 from public.gl_journal(current_date, current_date) where source = 'payment' and account_code = '1000'));
select pg_temp.check_that('mobile money sale goes to the mobile money account',
  (select sum(debit) = 100 from public.gl_journal(current_date, current_date) where source = 'payment' and account_code = '1010'));
select pg_temp.check_that('the refund reduces revenue and cash',
  (select bool_and((account_code = '4010' and debit = 100) or (account_code = '1000' and credit = 100)) from public.gl_journal(current_date, current_date) where source = 'refund'));
reset role;
set local role service_role;
-- a booking still to be served: its porter has not earned anything yet
insert into public.bookings (reference, package_code, package_name, price_per_passenger, num_passengers, original_total, total_value, amount_collected, outstanding_balance,
                             payment_status, flight_type, booking_channel, flight_date, status, passengers, contact, porters)
values ('GL-3', 'full_arrival', 'Full Arrival Assist', 700, 1, 700, 700, 0, 700, 'unpaid', 'arrival', 'online',
        to_char(current_date, 'YYYY-MM-DD'), 'confirmed', '[{"name":"Esi Owusu"}]', '0243333333',
        '[{"porter_name":"Kofi","passengers_handled":1,"commission":30}]');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check_that('porter commission is owed on completed jobs only: 90, not 120',
  (select sum(credit) = 90 from public.gl_journal(current_date, current_date) where account_code = '2000'));

insert into public.expenses (expense_date, category, description, method, amount) values (current_date, 'rent', 'Office rent', 'bank_transfer', 400);
select pg_temp.check_that('an expense lands on its category account and comes out of the bank',
  (select count(*) = 2 from public.gl_journal(current_date, current_date) where source = 'expense'
     and ((account_code = '6010' and debit = 400) or (account_code = '1030' and credit = 400))));

-- ---- transfers and manual entries ---------------------------------------------------------------------
select public.record_cash_transfer(current_date, '1000', '1030', 1000, 'DEP-1', 'Cash banked');
select pg_temp.raises('a transfer must be between two money accounts',
  $q$select public.record_cash_transfer(current_date, '1000', '4000', 10, null, null)$q$, 'invalid_accounts');
select pg_temp.raises('a transfer needs an amount', $q$select public.record_cash_transfer(current_date, '1000', '1030', 0, null, null)$q$, 'invalid_amount');
select pg_temp.raises('a journal entry must balance',
  $q$select public.gl_post_journal(current_date, 'Opening', null, '[{"account":"1030","debit":5000},{"account":"3000","credit":4000}]')$q$, 'not_balanced');
select pg_temp.raises('a line cannot be both debit and credit',
  $q$select public.gl_post_journal(current_date, 'Opening', null, '[{"account":"1030","debit":5,"credit":5},{"account":"3000","credit":0}]')$q$, 'invalid_lines');
select pg_temp.raises('a journal entry needs a known account',
  $q$select public.gl_post_journal(current_date, 'Opening', null, '[{"account":"9999","debit":5},{"account":"3000","credit":5}]')$q$, 'account_not_found');
select public.gl_post_journal(current_date, 'Owner put money in', 'CAP-1', '[{"account":"1030","debit":5000},{"account":"3000","credit":5000}]');
select pg_temp.check_that('the entry is signed with who posted it',
  (select created_by_name = 'Akos Accountant' from public.gl_journals where reference = 'CAP-1'));
select public.gl_post_journal(current_date, 'Mistake', 'MIS-1', '[{"account":"6090","debit":70},{"account":"1000","credit":70}]');
select pg_temp.raises('voiding needs a reason', $q$select public.gl_void_journal((select id from public.gl_journals where reference = 'MIS-1'), '')$q$, 'void_reason_required');
select public.gl_void_journal((select id from public.gl_journals where reference = 'MIS-1'), 'Posted by mistake');
select pg_temp.check_that('a voided entry leaves the books', (select count(*) = 0 from public.gl_journal(current_date, current_date) where reference = 'MIS-1'));

-- ---- supervisor commission ----------------------------------------------------------------------------
select pg_temp.check_that('the supervisor is owed 50 for the meet and assist',
  (select owed = 50 from public.supervisor_commission_owed() where supervisor_id = '00000000-0000-0000-0000-0000000000b2'));
select pg_temp.raises('cannot pay a supervisor more than they are owed',
  $q$select public.pay_supervisor_commission('00000000-0000-0000-0000-0000000000b2', 60, 'cash', current_date, null)$q$, 'more_than_owed');
select public.pay_supervisor_commission('00000000-0000-0000-0000-0000000000b2', 50, 'mobile_money', current_date, 'November');
select pg_temp.check_that('after paying, nothing is owed', (select owed = 0 from public.supervisor_commission_owed() where supervisor_id = '00000000-0000-0000-0000-0000000000b2'));

-- ---- the reports -------------------------------------------------------------------------------------
select pg_temp.check_that('the trial balance: debits equal credits',
  (select sum(debit) = sum(credit) and sum(debit) > 0 from public.gl_trial_balance(current_date, current_date)));
select pg_temp.check_that('cash on hand: 1400 in, 100 refunded, 1000 banked = 300',
  (select closing = 300 from public.gl_trial_balance(current_date, current_date) where code = '1000'));
select pg_temp.check_that('bank: 1000 banked + 5000 capital - 400 rent = 5600',
  (select closing = 5600 from public.gl_trial_balance(current_date, current_date) where code = '1030'));
select pg_temp.check_that('the balance sheet balances',
  (select (b ->> 'total_assets')::numeric = (b ->> 'total_liabilities')::numeric + (b ->> 'total_equity')::numeric
   from (select public.gl_balance_sheet(current_date) b) x));
select pg_temp.check_that('profit to date: 1500 sales - 100 refund - 400 rent - 90 porters - 50 supervisor = 860',
  (select (public.gl_balance_sheet(current_date) ->> 'profit_to_date')::numeric = 860));
select pg_temp.check_that('the bank ledger runs its balance',
  (select count(*) = 4 and max(balance) = 5600 and (array_agg(balance))[1] = 0 from public.gl_account_ledger('1030', current_date, current_date)));
select pg_temp.check_that('the home screen shows the money and the to-dos',
  (select (h ->> 'cash_on_hand')::numeric = 300 and (h ->> 'porters_owed')::numeric = 90 and (h ->> 'shift_reports_to_review')::int = 1
          and (h ->> 'cash_shortages_unreviewed')::int = 1
   from (select public.accounts_home() h) x));

-- ---- chart of accounts -------------------------------------------------------------------------------
select public.gl_add_account('1040', 'Second bank', 'asset');
select pg_temp.raises('a code is used once', $q$select public.gl_add_account('1040', 'Again', 'asset')$q$, 'code_taken');
select pg_temp.raises('the accounts the books use cannot be switched off', $q$select public.gl_update_account('1000', 'Cash', false)$q$, 'system_account');
select public.gl_update_account('1040', 'GCB current account', false);
select pg_temp.check_that('an added account can be renamed and switched off', (select name = 'GCB current account' and not active from public.gl_accounts where code = '1040'));

-- ---- shift report review -----------------------------------------------------------------------------
select pg_temp.raises('a query needs a note',
  $q$select public.review_shift_report((select id from public.shift_reports_for_review(current_date, current_date) where supervisor_name = 'Sena Supervisor'), 'queried', '')$q$, 'note_required');
select public.review_shift_report((select id from public.shift_reports_for_review(current_date, current_date) where supervisor_name = 'Sena Supervisor'), 'queried', 'GHS 20 short, please explain');
select pg_temp.check_that('the query is recorded with who raised it',
  (select review_status = 'queried' and reviewed_by_name = 'Akos Accountant' from public.shift_reports_for_review(current_date, current_date)));
select public.review_shift_report((select id from public.shift_reports_for_review(current_date, current_date) where supervisor_name = 'Sena Supervisor'), 'accepted', null);
select pg_temp.check_that('accepted, nothing left to review', (select (public.accounts_home() ->> 'shift_reports_to_review')::int = 0));

-- ---- month-end close ---------------------------------------------------------------------------------
insert into public.expenses (expense_date, category, description, method, amount)
values ((date_trunc('month', current_date) - interval '1 month')::date + 3, 'utilities', 'Electricity', 'cash', 80);
select pg_temp.raises('the current month cannot be closed yet', $q$select public.close_period(current_date, null)$q$, 'month_not_over');
select public.close_period((date_trunc('month', current_date) - interval '1 month')::date, 'Checked');
select pg_temp.check_that('last month shows as closed', (select closed and closed_by_name = 'Akos Accountant' from public.gl_periods() where month = (date_trunc('month', current_date) - interval '1 month')::date));
select pg_temp.raises('no expense can be added to a closed month',
  $q$insert into public.expenses (expense_date, category, description, amount) values ((date_trunc('month', current_date) - interval '1 month')::date + 5, 'rent', 'Late', 10)$q$, 'period_closed');
select pg_temp.raises('an expense cannot be moved into a closed month',
  $q$update public.expenses set expense_date = (date_trunc('month', current_date) - interval '1 month')::date + 5 where description = 'Office rent'$q$, 'period_closed');
select pg_temp.raises('an expense in a closed month cannot be voided',
  $q$update public.expenses set voided = true, void_reason = 'Wrong' where description = 'Electricity'$q$, 'period_closed');
select pg_temp.raises('no journal entry can be dated in a closed month',
  $q$select public.gl_post_journal((date_trunc('month', current_date) - interval '1 month')::date + 5, 'Late', null, '[{"account":"6090","debit":5},{"account":"1000","credit":5}]')$q$, 'period_closed');
select pg_temp.raises('no transfer can be dated in a closed month',
  $q$select public.record_cash_transfer((date_trunc('month', current_date) - interval '1 month')::date + 5, '1000', '1030', 5, null, null)$q$, 'period_closed');
select pg_temp.raises('only an admin can reopen a month',
  $q$select public.reopen_period((date_trunc('month', current_date) - interval '1 month')::date, 'Fix')$q$, '42501');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select pg_temp.raises('reopening needs a reason', $q$select public.reopen_period((date_trunc('month', current_date) - interval '1 month')::date, '')$q$, 'reason_required');
select public.reopen_period((date_trunc('month', current_date) - interval '1 month')::date, 'Late electricity bill');
select pg_temp.check_that('the month is open again', (select not closed from public.gl_periods() where month = (date_trunc('month', current_date) - interval '1 month')::date));
select pg_temp.check_that('reopening is kept in the audit log', (select count(*) >= 1 from public.audit_log where table_name = 'closed_periods' and action = 'REOPEN'));
reset role;

rollback;
