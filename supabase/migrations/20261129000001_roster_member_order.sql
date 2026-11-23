-- People on a roster keep the order they were put in, so the sheet lists names the way the paper roster does instead of A to Z.
-- A new person goes to the end; a new month keeps the order of the last one. Safe to run more than once.

alter table public.shift_roster_members add column if not exists position integer;

-- Anyone already on a roster with no order yet: by name within the roster (the order fix for the real names sets the paper order).
update public.shift_roster_members m set position = o.rn
from (select id, row_number() over (partition by roster_id order by lower(person_name), id) as rn from public.shift_roster_members where position is null) o
where m.id = o.id;

-- A person added without an order goes to the end of the roster.
create or replace function public.roster_member_position() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.position is null then
    new.position := coalesce((select max(position) from public.shift_roster_members where roster_id = new.roster_id), 0) + 1;
  end if;
  return new;
end $$;
drop trigger if exists shift_roster_members_position on public.shift_roster_members;
create trigger shift_roster_members_position before insert on public.shift_roster_members for each row execute function public.roster_member_position();

-- The next month keeps the order of the last.
create or replace function public.roster_generate(p_kind text, p_month date, p_first_morning integer default null, p_head_anchor date default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date; prev public.shift_rosters; new_id uuid; who text := public.current_staff_name(); np record;
begin
  perform public.require_permission('rosters.manage');
  if p_kind not in ('supervisor', 'porter') then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  if m < date_trunc('month', current_date)::date then raise exception 'month_past' using errcode = 'P0001'; end if;
  if exists (select 1 from public.shift_rosters where kind = p_kind and month = m) then raise exception 'already_exists' using errcode = 'P0001'; end if;

  select * into prev from public.shift_rosters where kind = p_kind and month < m order by month desc limit 1;
  if found then
    insert into public.shift_rosters (kind, month, anchor_date, phases, head_anchor, created_by_name, updated_by_name)
    values (p_kind, m, prev.anchor_date, prev.phases, prev.head_anchor, who, who) returning id into new_id;
    insert into public.shift_roster_members (roster_id, person_id, person_name, group_no, lead, position)
    select new_id, pm.person_id, coalesce(pp.person_name, pm.person_name), pm.group_no, pm.lead, pm.position
    from public.shift_roster_members pm left join public.roster_people(p_kind) pp on pp.person_id = pm.person_id
    where pm.roster_id = prev.id and (pm.person_id like 'name:%' or pp.person_id is not null);
  else
    if p_first_morning is null or p_first_morning not between 1 and 4 then raise exception 'start_required' using errcode = 'P0001'; end if;
    insert into public.shift_rosters (kind, month, anchor_date, phases, head_anchor, created_by_name, updated_by_name)
    values (p_kind, m, m, public.roster_phases(p_first_morning), case when p_kind = 'supervisor' then coalesce(p_head_anchor, m) end, who, who)
    returning id into new_id;
  end if;

  if prev.id is null then
    insert into public.shift_roster_members (roster_id, person_id, person_name, group_no, position)
    select new_id, person_id, person_name, 1, row_number() over (order by lower(person_name), person_id) from public.roster_people(p_kind);
    perform public.roster_spread(new_id, null);
  else
    for np in select person_id, person_name from public.roster_people(p_kind) pp
              where not exists (select 1 from public.shift_roster_members x where x.roster_id = new_id and x.person_id = pp.person_id) order by person_name loop
      if not public.roster_claim_named(new_id, np.person_id, np.person_name, p_kind) then
        insert into public.shift_roster_members (roster_id, person_id, person_name, group_no) values (new_id, np.person_id, np.person_name, public.roster_smallest(new_id));
      end if;
    end loop;
  end if;
  return new_id;
end $$;
revoke all on function public.roster_generate(text, date, integer, date) from public, anon;
grant execute on function public.roster_generate(text, date, integer, date) to authenticated;

-- Matching a name-only person to an account: a supervisor's first name is enough ("Doreen" for "Doreen Mensah"), but porters have to match
-- on the whole name, because porters can share a first name ("Amu" and "Amu Davis" are two people).
drop function if exists public.roster_claim_named(uuid, text, text);
create or replace function public.roster_claim_named(p_roster uuid, p_person_id text, p_person_name text, p_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
declare hit uuid;
begin
  select id into hit from (
    select m.id, count(*) over () as n from public.shift_roster_members m
    where m.roster_id = p_roster and m.person_id like 'name:%'
      and (lower(btrim(m.person_name)) = lower(btrim(p_person_name))
           or (p_kind = 'supervisor' and lower(btrim(m.person_name)) = lower(split_part(btrim(p_person_name), ' ', 1))))
  ) x where n = 1;
  if hit is null then return false; end if;
  update public.shift_roster_members set person_id = p_person_id, person_name = p_person_name where id = hit;
  return true;
end $$;
revoke all on function public.roster_claim_named(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.roster_add_missing(p_roster uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare r public.shift_rosters; np record; n integer := 0;
begin
  perform public.require_permission('rosters.manage');
  r := public.roster_open_edit(p_roster);
  for np in select person_id, person_name from public.roster_people(r.kind) pp
            where not exists (select 1 from public.shift_roster_members x where x.roster_id = p_roster and x.person_id = pp.person_id) order by person_name loop
    if not public.roster_claim_named(p_roster, np.person_id, np.person_name, r.kind) then
      insert into public.shift_roster_members (roster_id, person_id, person_name, group_no) values (p_roster, np.person_id, np.person_name, public.roster_smallest(p_roster));
    end if;
    n := n + 1;
  end loop;
  update public.shift_rosters set updated_by_name = public.current_staff_name() where id = p_roster;
  return n;
end $$;
revoke all on function public.roster_add_missing(uuid) from public, anon;
grant execute on function public.roster_add_missing(uuid) to authenticated;
