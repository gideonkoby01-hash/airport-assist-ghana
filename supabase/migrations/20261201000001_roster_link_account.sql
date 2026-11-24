-- Creating logins for supervisors who are on the roster by name: once the account exists, the name on the rosters is replaced by the account
-- (the shift and the order stay), in every month it appears in. Only an admin can do this, because only an admin creates accounts.
-- Safe to run more than once.
create or replace function public.roster_link_account(p_person text, p_account uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare acc public.profiles; shown text; n integer;
begin
  if public.app_role() is distinct from 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_person is null or p_person not like 'name:%' then raise exception 'not_name_only' using errcode = 'P0001'; end if;
  select * into acc from public.profiles where id = p_account and role = 'supervisor' and not disabled;
  if not found then raise exception 'not_supervisor' using errcode = 'P0001'; end if;
  shown := coalesce(nullif(btrim(acc.full_name), ''), acc.email);

  select count(*) into n from public.shift_roster_members m join public.shift_rosters r on r.id = m.roster_id where r.kind = 'supervisor' and m.person_id = p_person;

  -- where the account is already on a roster (rosters pick new accounts up by themselves), it takes over the shift, the order and the mark
  -- of the name, and the name is dropped
  update public.shift_roster_members a set group_no = nm.group_no, position = nm.position, lead = nm.lead
  from public.shift_roster_members nm join public.shift_rosters r on r.id = nm.roster_id
  where r.kind = 'supervisor' and nm.person_id = p_person and a.roster_id = nm.roster_id and a.person_id = acc.id::text;
  delete from public.shift_roster_members m using public.shift_rosters r
  where r.id = m.roster_id and r.kind = 'supervisor' and m.person_id = p_person
    and exists (select 1 from public.shift_roster_members x where x.roster_id = m.roster_id and x.person_id = acc.id::text);
  -- where it is not, the name becomes the account
  update public.shift_roster_members m set person_id = acc.id::text, person_name = shown
  from public.shift_rosters r
  where r.id = m.roster_id and r.kind = 'supervisor' and m.person_id = p_person;
  return n;
end $$;
revoke all on function public.roster_link_account(text, uuid) from public, anon;
grant execute on function public.roster_link_account(text, uuid) to authenticated;
