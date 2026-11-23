-- One-off: puts the names on the November 2026 rosters (and the months made from it) in the order the paper roster lists them, instead of A to Z.
-- Run once after the roster order update (20261129000001). People who are not in the lists below (added later) go after them, in the order they were added.
-- Safe to run more than once.

with paper(kind, name, ord) as (
  select 'porter', n, o from unnest(array[
    'Stephen','Yaw','Solomon','Godwin','Owusu','James','Adjei','Amu','Ernest','Elvis','Opoku','Antwi','Adam',
    'Tunu','Divine','Awuku','Stanley','Derick','Benson','Gollu','Michael','Sylvester','David','Isaac','Addo',
    'Daniel','Yeboah','Frazer','Eric','Jonathan','Maxwell','Oduro','Mathew','Sackey','Aidoo','Lenny','Richard','Otoo',
    'Nicholas','Paul','Samuel','Obed','Prince','Kumahor','Frank','Davidson','Simon','Benjamin','Appiah','Mawuli','Isaac-Marte']) with ordinality as t(n, o)
  union all
  select 'supervisor', n, o from unnest(array[
    'Doreen','Emmanuella','Ankrah','Mavis','Betty','Faustina','Wasila','Sydney','Desmond','Deborah','Eunice']) with ordinality as t(n, o)
)
update public.shift_roster_members m
set position = coalesce(
  (select min(p.ord) from paper p
   where p.kind = r.kind and (lower(btrim(m.person_name)) = lower(p.name)
         or (r.kind = 'supervisor' and lower(split_part(btrim(m.person_name), ' ', 1)) = lower(p.name)))),
  case when coalesce(m.position, 0) >= 1000 then m.position else 1000 + coalesce(m.position, 0) end)
from public.shift_rosters r
where r.id = m.roster_id;

-- Check: the first people of each shift, in order
select r.kind, m.group_no as shift, string_agg(m.person_name, ', ' order by m.position) as people
from public.shift_rosters r join public.shift_roster_members m on m.roster_id = r.id
where r.month = date '2026-11-01' group by r.kind, m.group_no order by r.kind, m.group_no;
