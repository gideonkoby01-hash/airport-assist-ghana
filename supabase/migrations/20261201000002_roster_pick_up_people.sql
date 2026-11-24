-- Rosters pick up people by themselves: when a supervisor account is made (or a person becomes a supervisor), or a porter is added to the
-- porter register, they are put on the roster of this month and every later month that has been made, in the smallest shift, in the place
-- of a name-only entry with their name if there is one. Their name on the rosters follows any change to it. Nobody is taken off by this
-- (people who leave are dropped when the next month is made). Past months are left alone. Safe to run more than once.

create or replace function public.roster_pick_up(p_kind text, p_id text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.shift_rosters where kind = p_kind and month >= date_trunc('month', current_date)::date loop
    if exists (select 1 from public.shift_roster_members where roster_id = r.id and person_id = p_id) then
      update public.shift_roster_members set person_name = p_name where roster_id = r.id and person_id = p_id and person_name is distinct from p_name;
    elsif not public.roster_claim_named(r.id, p_id, p_name, p_kind) then
      insert into public.shift_roster_members (roster_id, person_id, person_name, group_no) values (r.id, p_id, p_name, public.roster_smallest(r.id));
    end if;
  end loop;
end $$;
revoke all on function public.roster_pick_up(text, text, text) from public, anon, authenticated;

create or replace function public.profiles_roster_pick_up() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'supervisor' and not new.disabled then
    perform public.roster_pick_up('supervisor', new.id::text, coalesce(nullif(btrim(new.full_name), ''), new.email));
  end if;
  return null;
end $$;
revoke all on function public.profiles_roster_pick_up() from public, anon, authenticated;
drop trigger if exists profiles_roster_pick_up on public.profiles;
create trigger profiles_roster_pick_up after insert or update of role, disabled, full_name on public.profiles
  for each row execute function public.profiles_roster_pick_up();

create or replace function public.porters_roster_pick_up() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.active and btrim(new.full_name) <> '' then
    perform public.roster_pick_up('porter', new.id::text, btrim(new.full_name));
  end if;
  return null;
end $$;
revoke all on function public.porters_roster_pick_up() from public, anon, authenticated;
drop trigger if exists porters_roster_pick_up on public.porters;
create trigger porters_roster_pick_up after insert or update of active, full_name on public.porters
  for each row execute function public.porters_roster_pick_up();
