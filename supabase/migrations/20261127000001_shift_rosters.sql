-- Monthly shift rosters for supervisors and porters. Four shifts (groups of people); every day each shift is on the Morning (M), the Night
-- (N) or Off (O), in a four-day cycle M, N, O, O with the shifts one day apart. For supervisors one shift at a time is "head supervisor"
-- for its morning and the night after, and that moves on every five days. The pattern is stored as two dates and four phases, so the
-- website works out any day from them and a new month carries on from the last one.
--
-- Who may make and change rosters: the new task "rosters.manage" (General manager and Operations manager have it; an admin can
-- give it to other roles on the Roles screen). Admin always can. Supervisors and management can read rosters.
-- Past months cannot be changed. Safe to run more than once.

create or replace function public.all_permissions() returns text[]
language sql immutable as $$ select array['accounts.view', 'accounts.record', 'analytics.view', 'leaderboard.view', 'customers.manage', 'porter_pay.manage', 'commissions.view', 'payments.adjust', 'shift_reports.view', 'ratings.view', 'supervisors.assign', 'rosters.manage']::text[] $$;

insert into public.role_permissions (role_key, permission)
select r, 'rosters.manage' from unnest(array['general_manager', 'operations_manager']) r
where exists (select 1 from public.staff_roles where key = r)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.shift_rosters (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  kind text not null check (kind in ('supervisor', 'porter')),
  month date not null check (month = date_trunc('month', month)::date),
  anchor_date date not null,
  phases integer[] not null check (array_length(phases, 1) = 4 and phases <@ array[0, 1, 2, 3]),
  head_anchor date,
  created_by_name text,
  updated_by_name text,
  unique (kind, month)
);

create table if not exists public.shift_roster_members (
  id uuid primary key default gen_random_uuid(),
  roster_id uuid not null references public.shift_rosters (id) on delete cascade,
  person_id text not null,
  person_name text not null check (char_length(btrim(person_name)) >= 1),
  group_no integer not null check (group_no between 1 and 4),
  lead boolean not null default false,
  unique (roster_id, person_id)
);
create index if not exists shift_roster_members_roster_idx on public.shift_roster_members (roster_id);

alter table public.shift_rosters enable row level security;
alter table public.shift_roster_members enable row level security;
do $$
declare t text;
begin
  foreach t in array array['shift_rosters', 'shift_roster_members'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.app_role() in (''admin'', ''management'', ''supervisor''))', t || '_read', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop trigger if exists %I on public.%I', 'audit_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', 'audit_' || t, t);
  end loop;
end $$;
drop trigger if exists shift_rosters_touch on public.shift_rosters;
create trigger shift_rosters_touch before update on public.shift_rosters for each row execute function public.touch_updated_date();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- The people who can be on a roster: signed-up supervisors, or the porters on the porter register.
create or replace function public.roster_people(p_kind text) returns table (person_id text, person_name text)
language sql stable security definer set search_path = public as $$
  select p.id::text, coalesce(nullif(btrim(p.full_name), ''), p.email)
  from public.profiles p where p_kind = 'supervisor' and p.role = 'supervisor' and not p.disabled
  union all
  select r.id::text, btrim(r.full_name) from public.porters r where p_kind = 'porter' and r.active and btrim(r.full_name) <> ''
$$;
revoke all on function public.roster_people(text) from public, anon, authenticated;

-- Where each shift is in its four-day cycle when `g` (1 to 4) is the shift on the morning of the anchor date.
create or replace function public.roster_phases(g integer) returns integer[]
language sql immutable as $$ select array[((g - 1) % 4 + 4) % 4, ((g - 2) % 4 + 4) % 4, ((g - 3) % 4 + 4) % 4, ((g - 4) % 4 + 4) % 4] $$;

-- A roster that may still be changed: its month is this month or later.
create or replace function public.roster_open(p_roster uuid) returns public.shift_rosters
language plpgsql stable security definer set search_path = public as $$
declare r public.shift_rosters;
begin
  select * into r from public.shift_rosters where id = p_roster;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if r.month < date_trunc('month', current_date)::date then raise exception 'month_past' using errcode = 'P0001'; end if;
  return r;
end $$;
revoke all on function public.roster_open(uuid) from public, anon, authenticated;

-- Spreads the people evenly over the four shifts (sizes differ by at most one). The marked people are spread first so each shift gets one
-- before any gets two. With a seed the order is shuffled; without one it follows the names.
create or replace function public.roster_spread(p_roster uuid, p_seed text) returns void
language plpgsql security definer set search_path = public as $$
begin
  with ranked as (
    select id, row_number() over (order by lead desc, case when p_seed is null then person_name else md5(p_seed || person_id) end, person_id) as rn
    from public.shift_roster_members where roster_id = p_roster)
  update public.shift_roster_members m set group_no = ((r.rn - 1) % 4)::int + 1 from ranked r where m.id = r.id;
end $$;
revoke all on function public.roster_spread(uuid, text) from public, anon, authenticated;

-- The shift with the fewest people (the lowest number on a tie).
create or replace function public.roster_smallest(p_roster uuid) returns integer
language sql stable security definer set search_path = public as $$
  select g from generate_series(1, 4) g
  order by (select count(*) from public.shift_roster_members m where m.roster_id = p_roster and m.group_no = g), g limit 1
$$;
revoke all on function public.roster_smallest(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the managers do
-- ---------------------------------------------------------------------------
-- Makes the roster for a month. It carries on from the latest earlier month (the same pattern, the same people, new people added to the
-- smallest shift, people who have left dropped). The first ever roster needs the shift that works the morning of the 1st.
create or replace function public.roster_generate(p_kind text, p_month date, p_first_morning integer default null, p_head_anchor date default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date; prev public.shift_rosters; new_id uuid; who text := public.current_staff_name();
begin
  perform public.require_permission('rosters.manage');
  if p_kind not in ('supervisor', 'porter') then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  if m < date_trunc('month', current_date)::date then raise exception 'month_past' using errcode = 'P0001'; end if;
  if exists (select 1 from public.shift_rosters where kind = p_kind and month = m) then raise exception 'already_exists' using errcode = 'P0001'; end if;

  select * into prev from public.shift_rosters where kind = p_kind and month < m order by month desc limit 1;
  if found then
    insert into public.shift_rosters (kind, month, anchor_date, phases, head_anchor, created_by_name, updated_by_name)
    values (p_kind, m, prev.anchor_date, prev.phases, prev.head_anchor, who, who) returning id into new_id;
    insert into public.shift_roster_members (roster_id, person_id, person_name, group_no, lead)
    select new_id, pm.person_id, pp.person_name, pm.group_no, pm.lead
    from public.shift_roster_members pm join public.roster_people(p_kind) pp on pp.person_id = pm.person_id
    where pm.roster_id = prev.id;
  else
    if p_first_morning is null or p_first_morning not between 1 and 4 then raise exception 'start_required' using errcode = 'P0001'; end if;
    insert into public.shift_rosters (kind, month, anchor_date, phases, head_anchor, created_by_name, updated_by_name)
    values (p_kind, m, m, public.roster_phases(p_first_morning), case when p_kind = 'supervisor' then coalesce(p_head_anchor, m) end, who, who)
    returning id into new_id;
  end if;

  -- people not on it yet: the very first roster spreads everyone evenly, later ones put each newcomer in the smallest shift
  if prev.id is null then
    insert into public.shift_roster_members (roster_id, person_id, person_name, group_no) select new_id, person_id, person_name, 1 from public.roster_people(p_kind);
    perform public.roster_spread(new_id, null);
  else
    declare np record;
    begin
      for np in select person_id, person_name from public.roster_people(p_kind) pp
                where not exists (select 1 from public.shift_roster_members x where x.roster_id = new_id and x.person_id = pp.person_id) order by person_name loop
        insert into public.shift_roster_members (roster_id, person_id, person_name, group_no) values (new_id, np.person_id, np.person_name, public.roster_smallest(new_id));
      end loop;
    end;
  end if;
  return new_id;
end $$;
revoke all on function public.roster_generate(text, date, integer, date) from public, anon;
grant execute on function public.roster_generate(text, date, integer, date) to authenticated;

-- Moves a person to another shift and/or marks them (the ** in the header).
create or replace function public.roster_set_member(p_roster uuid, p_person text, p_group integer, p_lead boolean default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('rosters.manage');
  perform public.roster_open(p_roster);
  if p_group is null or p_group not between 1 and 4 then raise exception 'invalid_group' using errcode = 'P0001'; end if;
  update public.shift_roster_members set group_no = p_group, lead = coalesce(p_lead, lead) where roster_id = p_roster and person_id = p_person;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.shift_rosters set updated_by_name = public.current_staff_name() where id = p_roster;
end $$;
revoke all on function public.roster_set_member(uuid, text, integer, boolean) from public, anon;
grant execute on function public.roster_set_member(uuid, text, integer, boolean) to authenticated;

-- Takes a person off the roster (they left, or are not working this month).
create or replace function public.roster_remove_member(p_roster uuid, p_person text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('rosters.manage');
  perform public.roster_open(p_roster);
  delete from public.shift_roster_members where roster_id = p_roster and person_id = p_person;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.shift_rosters set updated_by_name = public.current_staff_name() where id = p_roster;
end $$;
revoke all on function public.roster_remove_member(uuid, text) from public, anon;
grant execute on function public.roster_remove_member(uuid, text) to authenticated;

-- Adds everyone who should be on the roster and is not (a new supervisor or porter, or someone taken off earlier) to the smallest shift.
create or replace function public.roster_add_missing(p_roster uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare r public.shift_rosters; np record; n integer := 0;
begin
  perform public.require_permission('rosters.manage');
  r := public.roster_open(p_roster);
  for np in select person_id, person_name from public.roster_people(r.kind) pp
            where not exists (select 1 from public.shift_roster_members x where x.roster_id = p_roster and x.person_id = pp.person_id) order by person_name loop
    insert into public.shift_roster_members (roster_id, person_id, person_name, group_no) values (p_roster, np.person_id, np.person_name, public.roster_smallest(p_roster));
    n := n + 1;
  end loop;
  update public.shift_rosters set updated_by_name = public.current_staff_name() where id = p_roster;
  return n;
end $$;
revoke all on function public.roster_add_missing(uuid) from public, anon;
grant execute on function public.roster_add_missing(uuid) to authenticated;

-- Reshuffles everyone into the four shifts at random, evenly, keeping the marked people apart. Pass a seed to repeat a shuffle.
create or replace function public.roster_shuffle(p_roster uuid, p_seed text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('rosters.manage');
  perform public.roster_open(p_roster);
  perform public.roster_spread(p_roster, coalesce(p_seed, gen_random_uuid()::text));
  update public.shift_rosters set updated_by_name = public.current_staff_name() where id = p_roster;
end $$;
revoke all on function public.roster_shuffle(uuid, text) from public, anon;
grant execute on function public.roster_shuffle(uuid, text) to authenticated;

-- Changes which shift works the morning on the 1st of the month (and where the head supervisor mark starts). Only while no later month
-- has been made, because later months carry on from this one.
create or replace function public.roster_set_cycle(p_roster uuid, p_first_morning integer, p_head_anchor date default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.shift_rosters;
begin
  perform public.require_permission('rosters.manage');
  r := public.roster_open(p_roster);
  if p_first_morning is null or p_first_morning not between 1 and 4 then raise exception 'invalid_group' using errcode = 'P0001'; end if;
  if exists (select 1 from public.shift_rosters where kind = r.kind and month > r.month) then raise exception 'later_exists' using errcode = 'P0001'; end if;
  if p_head_anchor is not null and (p_head_anchor < r.month or p_head_anchor >= (r.month + interval '1 month')::date) then raise exception 'invalid_date' using errcode = 'P0001'; end if;
  update public.shift_rosters set anchor_date = month, phases = public.roster_phases(p_first_morning),
         head_anchor = case when kind = 'supervisor' then coalesce(p_head_anchor, head_anchor, month) end,
         updated_by_name = public.current_staff_name()
  where id = p_roster;
end $$;
revoke all on function public.roster_set_cycle(uuid, integer, date) from public, anon;
grant execute on function public.roster_set_cycle(uuid, integer, date) to authenticated;

-- Deletes a roster that has not started to be used (this month or later).
create or replace function public.roster_delete(p_roster uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.shift_rosters;
begin
  perform public.require_permission('rosters.manage');
  r := public.roster_open(p_roster);
  if exists (select 1 from public.shift_rosters where kind = r.kind and month > r.month) then raise exception 'later_exists' using errcode = 'P0001'; end if;
  delete from public.shift_rosters where id = p_roster;
end $$;
revoke all on function public.roster_delete(uuid) from public, anon;
grant execute on function public.roster_delete(uuid) to authenticated;
