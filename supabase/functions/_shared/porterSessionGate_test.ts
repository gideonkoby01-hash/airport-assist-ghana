// Run: deno test --allow-all supabase/functions/_shared/porterSessionGate_test.ts
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { signSession } from './porterSession.ts';
import { requirePorter, SESSION_ENDED } from './porterSessionGate.ts';
import { HttpError } from './http.ts';

const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
Deno.env.set('SETTINGS_ENCRYPTION_KEY', key);

// A tiny stand-in for the database client: from(table).select().eq().maybeSingle() over fixed rows.
function fakeAdmin(rows: Record<string, Record<string, unknown> | null>) {
  return {
    from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: rows[table] ?? null }) }) }) }),
  } as never;
}
const login = { porter_id: 'p1', phone: '+233241111111', password_hash: 'x', must_change_password: false, token_version: 2, disabled: false };
const porter = { id: 'p1', full_name: 'Kofi', active: true };

async function ended(token: unknown, rows: Record<string, Record<string, unknown> | null>) {
  const e = await assertRejects(() => requirePorter(fakeAdmin(rows), token), HttpError);
  assertEquals([e.status, e.message], [401, SESSION_ENDED]);
}

Deno.test('a current session gets its porter', async () => {
  const { token } = await signSession('p1', 2, key);
  const got = await requirePorter(fakeAdmin({ porter_logins: login, porters: porter }), token);
  assertEquals(got.porter.full_name, 'Kofi');
});

Deno.test('a session ends when the password was reset, the login is off, the porter is off, or it was never ours', async () => {
  const { token } = await signSession('p1', 2, key);
  await ended(token, { porter_logins: { ...login, token_version: 3 }, porters: porter });
  await ended(token, { porter_logins: { ...login, disabled: true }, porters: porter });
  await ended(token, { porter_logins: null, porters: porter });
  await ended(token, { porter_logins: login, porters: { ...porter, active: false } });
  await ended(token, { porter_logins: login, porters: null });
  await ended('garbage', { porter_logins: login, porters: porter });
  await ended(undefined, { porter_logins: login, porters: porter });
});
