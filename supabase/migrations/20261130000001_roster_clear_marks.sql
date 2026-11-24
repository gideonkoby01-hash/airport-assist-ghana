-- The ** mark on rosters is no longer used (it stood for nothing), so any person who was marked is unmarked. Safe to run more than once.
update public.shift_roster_members set lead = false where lead;
