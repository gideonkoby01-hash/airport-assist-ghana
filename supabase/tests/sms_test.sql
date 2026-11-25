-- The text message log. Run after the migrations.
begin;
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

set local role service_role;
insert into public.sms_deliveries (event_key, status, to_phone, body) values ('sms_booking_confirmation:b1', 'queued', '233241234567', 'Hello');
select pg_temp.raises('the same event cannot be texted twice while queued or sent', $$insert into public.sms_deliveries (event_key, status) values ('sms_booking_confirmation:b1', 'queued')$$, '23505');
update public.sms_deliveries set status = 'failed', details = 'Hubtel said no' where event_key = 'sms_booking_confirmation:b1';
insert into public.sms_deliveries (event_key, status, to_phone, body) values ('sms_booking_confirmation:b1', 'queued', '233241234567', 'Hello');
select pg_temp.check_that('after a failure the event can be tried again', (select count(*) from public.sms_deliveries where event_key = 'sms_booking_confirmation:b1') = 2);
reset role;

set local role anon;
select pg_temp.raises('visitors cannot read the log', $$select * from public.sms_deliveries$$, '42501');
reset role;
set local role authenticated;
select pg_temp.raises('signed-in users cannot read phone numbers', $$select to_phone from public.sms_deliveries$$, '42501');
select pg_temp.raises('signed-in users cannot read the message text', $$select body from public.sms_deliveries$$, '42501');
select pg_temp.raises('signed-in users cannot write the log', $$insert into public.sms_deliveries (event_key, status) values ('x', 'queued')$$, '42501');
reset role;
rollback;
