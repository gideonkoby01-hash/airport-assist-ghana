-- Admin-created staff accounts start with a temporary password the admin hands over. The new person must
-- choose their own password the first time they sign in.
alter table public.profiles add column must_change_password boolean not null default false;

-- Called by the signed-in person right after they have set their own password.
create function public.password_changed() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set must_change_password = false where id = auth.uid() and must_change_password;
end $$;
revoke all on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;
