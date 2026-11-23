-- Editing who is on a roster, as and when it is needed:
--   * Anyone with the roster task (the Operations manager, the General manager, an admin) can add a supervisor or porter by name, rename a
--     person who was added by name, move, mark and remove people. An account or porter-register name that matches is used instead of a
--     name-only entry, so nobody ends up on a roster twice.
--   * An admin can also correct people on a PAST month (a mistake, someone who left). Nobody else can change a past month, and nobody,
--     admin included, can reshuffle, restart the pattern of, or delete a past month.
-- Safe to run more than once.

-- A roster whose people may be edited by this person: this month or later, or any month for an admin.
create or replace function public.roster_open_edit(p_roster uuid) returns public.shift_rosters
language plpgsql stable security definer set search_path = public as $$
declare r public.shift_rosters;
begin
  select * into r from public.shift_rosters where id = p_roster;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if r.month < date_trunc('month', current_date)::date and public.app_role() is distinct from 'admin' then raise exception 'month_past' using errcode = 'P0001'; end if;
  return r;
end $$;
revoke all on function public.roster_open_edit(uuid) from public, anon, authenticated;

-- Adds a person by name. If the name belongs to a supervisor account (or a porter on the register) that is not on the roster yet, that
-- account is added; if it is already on the roster, nothing is added.
create or replace function public.roster_add_person(p_roster uuid, p_name text, p_group integer, p_lead boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare r public.shift_rosters; nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'); pid text; shown text;
begin
  perform public.require_permission('rosters.manage');
  r := public.roster_open_edit(p_roster);
  if char_length(nm) < 2 or char_length(nm) > 60 then raise exception 'name_required' using errcode = 'P0001'; end if;
  if p_group is null or p_group not between 1 and 4 then raise exception 'invalid_group' using errcode = 'P0001'; end if;

  pid := public.roster_match_person(r.kind, nm);
  if pid is not null then
    select pp.person_name into shown from public.roster_people(r.kind) pp where pp.person_id = pid;
  else
    pid := 'name:' || lower(nm);
    shown := nm;
  end if;
  if exists (select 1 from public.shift_roster_members where roster_id = p_roster and person_id = pid) then raise exception 'already_on' using errcode = 'P0001'; end if;
  if pid like 'name:%' and exists (select 1 from public.shift_roster_members where roster_id = p_roster and lower(btrim(person_name)) = lower(nm)) then raise exception 'already_on' using errcode = 'P0001'; end if;

  insert into public.shift_roster_members (roster_id, person_id, person_name, group_no, lead) values (p_roster, pid, shown, p_group, coalesce(p_lead, false));
  update public.shift_rosters set updated_by_name = public.current_staff_name() where id = p_roster;
  return pid;
end $$;
revoke all on function public.roster_add_person(uuid, text, integer, boolean) from public, anon;
grant execute on function public.roster_add_person(uuid, text, integer, boolean) to authenticated;

-- Corrects the name of a person who was added by name (an account's name comes from the account itself).
create or replace function public.roster_rename_member(p_roster uuid, p_person text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  perform public.require_permission('rosters.manage');
  perform public.roster_open_edit(p_roster);
  if char_length(nm) < 2 or char_length(nm) > 60 then raise exception 'name_required' using errcode = 'P0001'; end if;
  if p_person not like 'name:%' then raise exception 'not_name_only' using errcode = 'P0001'; end if;
  if exists (select 1 from public.shift_roster_members where roster_id = p_roster and person_id <> p_person and lower(btrim(person_name)) = lower(nm)) then raise exception 'already_on' using errcode = 'P0001'; end if;
  update public.shift_roster_members set person_name = nm, person_id = 'name:' || lower(nm) where roster_id = p_roster and person_id = p_person;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.shift_rosters set updated_by_name = public.current_staff_name() where id = p_roster;
end $$;
revoke all on function public.roster_rename_member(uuid, text, text) from public, anon;
grant execute on function public.roster_rename_member(uuid, text, text) to authenticated;

-- Moving, marking, removing and adding the missing people now use the edit rule above (so an admin can correct a past month).
create or replace function public.roster_set_member(p_roster uuid, p_person text, p_group integer, p_lead boolean default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('rosters.manage');
  perform public.roster_open_edit(p_roster);
  if p_group is null or p_group not between 1 and 4 then raise exception 'invalid_group' using errcode = 'P0001'; end if;
  update public.shift_roster_members set group_no = p_group, lead = coalesce(p_lead, lead) where roster_id = p_roster and person_id = p_person;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.shift_rosters set updated_by_name = public.current_staff_name() where id = p_roster;
end $$;
revoke all on function public.roster_set_member(uuid, text, integer, boolean) from public, anon;
grant execute on function public.roster_set_member(uuid, text, integer, boolean) to authenticated;

create or replace function public.roster_remove_member(p_roster uuid, p_person text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_permission('rosters.manage');
  perform public.roster_open_edit(p_roster);
  delete from public.shift_roster_members where roster_id = p_roster and person_id = p_person;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.shift_rosters set updated_by_name = public.current_staff_name() where id = p_roster;
end $$;
revoke all on function public.roster_remove_member(uuid, text) from public, anon;
grant execute on function public.roster_remove_member(uuid, text) to authenticated;

create or replace function public.roster_add_missing(p_roster uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare r public.shift_rosters; np record; n integer := 0;
begin
  perform public.require_permission('rosters.manage');
  r := public.roster_open_edit(p_roster);
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
