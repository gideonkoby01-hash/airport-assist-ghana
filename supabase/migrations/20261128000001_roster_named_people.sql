-- Supervisors can be on a roster by name before they have a login. A name-only person has an id that starts with "name:". They carry over from
-- month to month like anyone else. When a supervisor account (or a porter on the register) later appears with the same name, adding the missing
-- people takes the place of the name-only entry, in the same shift and with the same mark, instead of adding a second copy.
-- Safe to run more than once.

-- The one active supervisor account (or porter on the register) a name belongs to, or null if there is none or more than one.
-- A supervisor's name matches their full name, or just their first name ("Doreen" for "Doreen Mensah").
create or replace function public.roster_match_person(p_kind text, p_name text) returns text
language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then min(person_id) end from (
    select p.id::text as person_id from public.profiles p
    where p_kind = 'supervisor' and p.role = 'supervisor' and not p.disabled
      and (lower(btrim(p.full_name)) = lower(btrim(p_name)) or lower(split_part(btrim(p.full_name), ' ', 1)) = lower(btrim(p_name)))
    union all
    select r.id::text from public.porters r where p_kind = 'porter' and r.active and lower(btrim(r.full_name)) = lower(btrim(p_name))
  ) x
$$;
revoke all on function public.roster_match_person(text, text) from public, anon, authenticated;

-- If a name-only person on this roster is the same person as this account, the account takes their place. Returns true when it did.
create or replace function public.roster_claim_named(p_roster uuid, p_person_id text, p_person_name text) returns boolean
language plpgsql security definer set search_path = public as $$
declare hit uuid;
begin
  select id into hit from (
    select m.id, count(*) over () as n from public.shift_roster_members m
    where m.roster_id = p_roster and m.person_id like 'name:%'
      and (lower(btrim(m.person_name)) = lower(btrim(p_person_name)) or lower(btrim(m.person_name)) = lower(split_part(btrim(p_person_name), ' ', 1)))
  ) x where n = 1;
  if hit is null then return false; end if;
  update public.shift_roster_members set person_id = p_person_id, person_name = p_person_name where id = hit;
  return true;
end $$;
revoke all on function public.roster_claim_named(uuid, text, text) from public, anon, authenticated;

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
    -- the same people (name-only people stay; accounts and porters who have left are dropped)
    insert into public.shift_roster_members (roster_id, person_id, person_name, group_no, lead)
    select new_id, pm.person_id, coalesce(pp.person_name, pm.person_name), pm.group_no, pm.lead
    from public.shift_roster_members pm left join public.roster_people(p_kind) pp on pp.person_id = pm.person_id
    where pm.roster_id = prev.id and (pm.person_id like 'name:%' or pp.person_id is not null);
  else
    if p_first_morning is null or p_first_morning not between 1 and 4 then raise exception 'start_required' using errcode = 'P0001'; end if;
    insert into public.shift_rosters (kind, month, anchor_date, phases, head_anchor, created_by_name, updated_by_name)
    values (p_kind, m, m, public.roster_phases(p_first_morning), case when p_kind = 'supervisor' then coalesce(p_head_anchor, m) end, who, who)
    returning id into new_id;
  end if;

  if prev.id is null then
    insert into public.shift_roster_members (roster_id, person_id, person_name, group_no) select new_id, person_id, person_name, 1 from public.roster_people(p_kind);
    perform public.roster_spread(new_id, null);
  else
    -- newcomers take the place of a name-only person with their name, or join the smallest shift
    for np in select person_id, person_name from public.roster_people(p_kind) pp
              where not exists (select 1 from public.shift_roster_members x where x.roster_id = new_id and x.person_id = pp.person_id) order by person_name loop
      if not public.roster_claim_named(new_id, np.person_id, np.person_name) then
        insert into public.shift_roster_members (roster_id, person_id, person_name, group_no) values (new_id, np.person_id, np.person_name, public.roster_smallest(new_id));
      end if;
    end loop;
  end if;
  return new_id;
end $$;
revoke all on function public.roster_generate(text, date, integer, date) from public, anon;
grant execute on function public.roster_generate(text, date, integer, date) to authenticated;

create or replace function public.roster_add_missing(p_roster uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare r public.shift_rosters; np record; n integer := 0;
begin
  perform public.require_permission('rosters.manage');
  r := public.roster_open(p_roster);
  for np in select person_id, person_name from public.roster_people(r.kind) pp
            where not exists (select 1 from public.shift_roster_members x where x.roster_id = p_roster and x.person_id = pp.person_id) order by person_name loop
    if not public.roster_claim_named(p_roster, np.person_id, np.person_name) then
      insert into public.shift_roster_members (roster_id, person_id, person_name, group_no) values (p_roster, np.person_id, np.person_name, public.roster_smallest(p_roster));
    end if;
    n := n + 1;
  end loop;
  update public.shift_rosters set updated_by_name = public.current_staff_name() where id = p_roster;
  return n;
end $$;
revoke all on function public.roster_add_missing(uuid) from public, anon;
grant execute on function public.roster_add_missing(uuid) to authenticated;
