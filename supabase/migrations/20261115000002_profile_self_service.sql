-- Lets a signed-in person keep their own name and phone number up to date.
-- Role, email and access stay admin-only: this function can only touch the two fields below.
alter table public.profiles add column phone text not null default '';

create function public.update_my_profile(p_full_name text, p_phone text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  new_name text := btrim(coalesce(p_full_name, ''));
  new_phone text := btrim(coalesce(p_phone, ''));
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  select * into me from public.profiles where id = auth.uid();
  if not found or me.disabled then
    raise exception 'account_unavailable' using errcode = '42501';
  end if;
  if char_length(new_name) > 120 then
    raise exception 'name_too_long' using errcode = 'P0001';
  end if;
  -- Same rule as the booking form: 7 to 15 digits, optional leading +, spaces, brackets and dashes allowed.
  if new_phone <> '' and not (new_phone ~ '^\+?[0-9][0-9 ()-]{5,24}$'
                              and char_length(regexp_replace(new_phone, '\D', '', 'g')) between 7 and 15) then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  update public.profiles set full_name = new_name, phone = new_phone where id = auth.uid() returning * into me;
  return me;
end $$;

revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;
