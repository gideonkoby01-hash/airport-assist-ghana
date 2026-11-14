-- Email delivery bookkeeping: one live claim per event, outcomes from the provider, retry rows.
begin;
set local role service_role;
create function pg_temp.raises(label text, stmt text, expected text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlstate = expected then raise notice 'ok   % (%)', label, sqlerrm; return; end if;
    raise exception 'FAIL %: wrong error % (%)', label, sqlerrm, sqlstate;
  end;
  raise exception 'FAIL %: no error raised', label;
end $$;

insert into public.email_deliveries (event_key, template_name, status, to_email, variables) values ('ev1', 'T', 'queued', 'a@b.com', '{"x":1}');
select pg_temp.raises('a second live claim for the event is refused',
  $q$insert into public.email_deliveries (event_key, template_name, status) values ('ev1', 'T', 'queued')$q$, '23505');
update public.email_deliveries set status = 'sent', provider_id = 'em_1', to_email = null, variables = null where event_key = 'ev1';
update public.email_deliveries set status = 'delivered' where provider_id = 'em_1';
select pg_temp.raises('a delivered email still blocks a duplicate send',
  $q$insert into public.email_deliveries (event_key, template_name, status) values ('ev1', 'T', 'queued')$q$, '23505');

insert into public.email_deliveries (event_key, template_name, status, to_email) values ('ev2', 'T', 'failed', 'a@b.com');
insert into public.email_deliveries (event_key, template_name, status, to_email) values ('ev2', 'T', 'failed', 'a@b.com');
update public.email_deliveries set status = 'queued', attempts = attempts + 1 where event_key = 'ev2' and id = (select id from public.email_deliveries where event_key = 'ev2' limit 1);
do $$ begin
  if (select count(*) from public.email_deliveries where event_key = 'ev2' and status = 'queued') <> 1 then raise exception 'FAIL retry state'; end if;
  raise notice 'ok   failed rows can be retried (one goes back to queued)';
end $$;

insert into public.email_deliveries (event_key, template_name, status) values ('ev3', 'T', 'bounced');
insert into public.email_deliveries (event_key, template_name, status) values ('ev3', 'T', 'queued');
select pg_temp.raises('an unknown status is refused',
  $q$insert into public.email_deliveries (event_key, template_name, status) values ('ev4', 'T', 'maybe')$q$, '23514');
do $$ begin
  if (select count(*) from public.email_deliveries where event_key = 'ev1' and (to_email is not null or variables is not null)) <> 0 then
    raise exception 'FAIL personal data left on a sent email';
  end if;
  raise notice 'ok   a sent email holds no recipient or variables';
end $$;
rollback;
