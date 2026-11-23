-- One-off: puts the real supervisors and porters from the paper roster for November 2026 into the system, in the shifts the paper sheet has them.
-- Run it once in the Supabase SQL Editor, after the shift roster updates (20261127000001, 20261128000001 and 20261128000002) have been run.
--
--   * Porters: added to the porter register (Admin > Porters) with no phone number yet. Fill the phone numbers in there. A porter who is
--     already on the register with the same name is used as is, not added twice.
--   * Supervisors: have no login yet, so they go on the roster by name. When a supervisor's account is made (Admin > Staff accounts) and you
--     press "Add people who are missing" on the roster, the account takes the place of the name, in the same shift.
--   * The roster for November 2026 is made for both, with the paper pattern (Shift Three on the morning of the 1st; the head supervisor starts
--     on the 4th). If a November 2026 roster already exists it is REPLACED by this one.
-- Names marked ** on the paper sheet (Ankrah and Sydney) have the ** mark. Safe to run more than once.

-- 0. An earlier version of this script added five two-word names as one porter each (they are two people each). Remove those, if they
--    were added and have no phone number, so each person is on the register once.
delete from public.porters where btrim(phone_number) = '' and lower(btrim(full_name)) in ('adjei amu', 'benson gollu', 'oduro mathew', 'kumahor frank', 'benjamin appiah');

-- 1. The porters
with porter_names(name) as (values
  ('Stephen'), ('Yaw'), ('Solomon'), ('Godwin'), ('Owusu'), ('James'), ('Adjei'), ('Amu'), ('Ernest'), ('Elvis'), ('Opoku'), ('Antwi'), ('Adam'),
  ('Tunu'), ('Divine'), ('Awuku'), ('Stanley'), ('Derick'), ('Benson'), ('Gollu'), ('Michael'), ('Sylvester'), ('David'), ('Isaac'), ('Addo'),
  ('Daniel'), ('Yeboah'), ('Frazer'), ('Eric'), ('Jonathan'), ('Maxwell'), ('Oduro'), ('Mathew'), ('Sackey'), ('Aidoo'), ('Lenny'), ('Richard'), ('Otoo'),
  ('Nicholas'), ('Paul'), ('Samuel'), ('Obed'), ('Prince'), ('Kumahor'), ('Frank'), ('Davidson'), ('Simon'), ('Benjamin'), ('Appiah'), ('Mawuli'), ('Isaac-Marte'))
insert into public.porters (full_name, phone_number, active)
select n.name, '', true from porter_names n
where not exists (select 1 from public.porters p where lower(btrim(p.full_name)) = lower(n.name));

-- 2. The November 2026 rosters (replacing any already made for that month)
delete from public.shift_rosters where month = date '2026-11-01' and kind in ('supervisor', 'porter');

insert into public.shift_rosters (kind, month, anchor_date, phases, head_anchor, created_by_name, updated_by_name) values
  ('supervisor', date '2026-11-01', date '2026-11-01', array[2, 1, 0, 3], date '2026-11-04', 'Set up from the paper roster', 'Set up from the paper roster'),
  ('porter',     date '2026-11-01', date '2026-11-01', array[2, 1, 0, 3], null,              'Set up from the paper roster', 'Set up from the paper roster');

-- 3. Who is in which shift
insert into public.shift_roster_members (roster_id, person_id, person_name, group_no, lead)
select r.id, coalesce(public.roster_match_person('supervisor', s.name), 'name:' || lower(s.name)), s.name, s.grp, s.lead
from (values
  ('Doreen', 1, false), ('Emmanuella', 1, false), ('Ankrah', 1, true),
  ('Mavis', 2, false), ('Betty', 2, false),
  ('Faustina', 3, false), ('Wasila', 3, false), ('Sydney', 3, true),
  ('Desmond', 4, false), ('Deborah', 4, false), ('Eunice', 4, false)
) as s(name, grp, lead)
join public.shift_rosters r on r.kind = 'supervisor' and r.month = date '2026-11-01'
on conflict (roster_id, person_id) do nothing;

insert into public.shift_roster_members (roster_id, person_id, person_name, group_no, lead)
select distinct on (p.id) r.id, p.id::text, btrim(p.full_name), s.grp, false
from (values
  ('Stephen', 1), ('Yaw', 1), ('Solomon', 1), ('Godwin', 1), ('Owusu', 1), ('James', 1), ('Adjei', 1), ('Amu', 1), ('Ernest', 1), ('Elvis', 1), ('Opoku', 1), ('Antwi', 1), ('Adam', 1),
  ('Tunu', 2), ('Divine', 2), ('Awuku', 2), ('Stanley', 2), ('Derick', 2), ('Benson', 2), ('Gollu', 2), ('Michael', 2), ('Sylvester', 2), ('David', 2), ('Isaac', 2), ('Addo', 2),
  ('Daniel', 3), ('Yeboah', 3), ('Frazer', 3), ('Eric', 3), ('Jonathan', 3), ('Maxwell', 3), ('Oduro', 3), ('Mathew', 3), ('Sackey', 3), ('Aidoo', 3), ('Lenny', 3), ('Richard', 3), ('Otoo', 3),
  ('Nicholas', 4), ('Paul', 4), ('Samuel', 4), ('Obed', 4), ('Prince', 4), ('Kumahor', 4), ('Frank', 4), ('Davidson', 4), ('Simon', 4), ('Benjamin', 4), ('Appiah', 4), ('Mawuli', 4), ('Isaac-Marte', 4)
) as s(name, grp)
join public.porters p on lower(btrim(p.full_name)) = lower(s.name) and p.active
join public.shift_rosters r on r.kind = 'porter' and r.month = date '2026-11-01'
order by p.id, p.created_date
on conflict (roster_id, person_id) do nothing;

-- 4. Check: should show 11 supervisors (3, 2, 3, 3) and 51 porters (13, 12, 13, 13) over the four shifts
select r.kind, m.group_no as shift, count(*) as people
from public.shift_rosters r join public.shift_roster_members m on m.roster_id = r.id
where r.month = date '2026-11-01' group by r.kind, m.group_no order by r.kind, m.group_no;
