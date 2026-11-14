-- Admin settings page: code-level settings and encrypted API keys, edited by admins through the adminSettings
-- Edge Function. Browsers never read these tables directly.

-- Non-secret settings (the table already holds shift hours and the two-step requirement).
alter table public.app_settings
  add column is_public boolean not null default false,   -- shown on the public website (contact details, booking switch)
  add column updated_by_id text,
  add column updated_date timestamptz not null default now();

-- API keys, stored encrypted by the function (AES-256-GCM) with a key that lives outside the database
-- (the SETTINGS_ENCRYPTION_KEY function secret), so a copy of the database alone does not reveal them.
create table public.app_secrets (
  name text primary key,
  ciphertext text not null,
  last4 text not null default '',
  updated_by_id text,
  updated_date timestamptz not null default now()
);
alter table public.app_secrets enable row level security;   -- no policy: only the service role can touch it
grant all on public.app_secrets to service_role;

-- The public settings, readable by anyone (the website uses them before sign-in).
create function public.get_public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings where is_public
$$;
grant execute on function public.get_public_settings() to anon, authenticated, service_role;

-- Settings changes are audited like everything else; settings rows are identified by their key.
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare old_j jsonb; new_j jsonb; rec jsonb; actor text; actor_role text; rid text;
begin
  if tg_op = 'DELETE' then old_j := to_jsonb(old); rec := old_j;
  elsif tg_op = 'INSERT' then new_j := to_jsonb(new); rec := new_j;
  else
    old_j := to_jsonb(old); new_j := to_jsonb(new); rec := new_j;
    if (old_j - 'updated_date') = (new_j - 'updated_date') then return new; end if;
  end if;
  actor := coalesce(auth.uid()::text, rec ->> 'updated_by_id', rec ->> 'recorded_by_id');
  select role into actor_role from public.profiles where id::text = actor;
  rid := coalesce(rec ->> 'id', rec ->> 'key');
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, before, after)
  values (actor, actor_role, tg_op, tg_table_name, rid, old_j, new_j);
  return coalesce(new, old);
end $$;

create trigger audit_app_settings after insert or update or delete on public.app_settings
  for each row execute function public.audit_row();
-- app_secrets is deliberately not audited by trigger (the rows hold ciphertext); the function writes an entry
-- that names the key and its last four characters, never the value.
