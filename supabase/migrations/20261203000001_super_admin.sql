-- The super admin: one protected owner account.
--   * It cannot be disabled, erased, demoted or given another role by anyone, other admins included.
--   * Only the super admin can make someone an admin, or take admin away from someone (other admins can still do everything else).
--   * There is at most one. It is set, or handed to another admin, with public.transfer_super_admin('their@email'): by the
--     current super admin, or from the Supabase SQL Editor (so the account can always be recovered by whoever owns the database).
-- Until a super admin is set, nothing changes for anyone. Safe to run more than once.

alter table public.profiles add column if not exists is_super_admin boolean not null default false;
create unique index if not exists profiles_one_super_admin on public.profiles ((true)) where is_super_admin;

create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare other_admin boolean; transferring boolean := coalesce(current_setting('app.super_admin_transfer', true), '') = 'on';
begin
  -- the super admin account is fixed
  if tg_op = 'DELETE' then
    if old.is_super_admin then raise exception 'super_admin_protected' using errcode = 'P0001'; end if;
  else
    if old.is_super_admin and not transferring
       and (new.is_super_admin is distinct from old.is_super_admin or new.role <> old.role or new.disabled) then
      raise exception 'super_admin_protected' using errcode = 'P0001';
    end if;
    if new.is_super_admin and not old.is_super_admin and not transferring then
      raise exception 'super_admin_protected' using errcode = 'P0001';
    end if;
    -- only the super admin makes or removes admins (a signed-in person is acting; the Edge Functions act for the service)
    if (old.role = 'admin') is distinct from (new.role = 'admin') and auth.uid() is not null
       and exists (select 1 from public.profiles where is_super_admin)
       and not exists (select 1 from public.profiles where id = auth.uid() and is_super_admin) then
      raise exception 'super_admin_only' using errcode = 'P0001';
    end if;
  end if;

  if old.role = 'admin' and not old.disabled then
    select exists (select 1 from public.profiles where role = 'admin' and not disabled and id <> old.id) into other_admin;
    if not other_admin and (tg_op = 'DELETE' or new.role <> 'admin' or new.disabled) then
      raise exception 'last_admin' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.disabled and not old.disabled then new.disabled_at = now(); end if;
  if not new.disabled and old.disabled then new.disabled_at = null; end if;
  return new;
end $$;

-- Makes an active admin the super admin (taking it from the current one). The current super admin may do this; so may whoever runs it in
-- the Supabase SQL Editor, where nobody is signed in to the website.
create or replace function public.transfer_super_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if auth.uid() is not null and not exists (select 1 from public.profiles where id = auth.uid() and is_super_admin) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into target from public.profiles where lower(email) = lower(btrim(p_email)) and role = 'admin' and not disabled;
  if not found then raise exception 'not_an_active_admin' using errcode = 'P0001'; end if;
  perform set_config('app.super_admin_transfer', 'on', true);
  update public.profiles set is_super_admin = false where is_super_admin and id <> target;
  update public.profiles set is_super_admin = true where id = target and not is_super_admin;
  perform set_config('app.super_admin_transfer', 'off', true);
end $$;
revoke all on function public.transfer_super_admin(text) from public, anon;
grant execute on function public.transfer_super_admin(text) to authenticated;
