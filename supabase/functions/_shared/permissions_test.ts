// Run: deno test supabase/functions/_shared/permissions_test.ts
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { requirePermission, userCan } from './auth.ts';

// A stand-in for the database: which person may do which tasks (what the user_can function answers).
function db(allowed: Record<string, string[]>) {
  const calls: Array<[string, string]> = [];
  return {
    calls,
    rpc: (_name: string, args: Record<string, unknown>) => {
      calls.push([String(args.p_user), String(args.p_key)]);
      return Promise.resolve({ data: (allowed[String(args.p_user)] || []).includes(String(args.p_key)) });
    },
  };
}

Deno.test('an admin can do everything, without asking the database', async () => {
  const d = db({});
  assertEquals(await userCan(d, { id: 'a1', role: 'admin' }, 'accounts.record'), true);
  assertEquals(d.calls.length, 0);
});

Deno.test('anyone else needs a role that has the task', async () => {
  const d = db({ ops: ['payments.adjust'], acc: ['accounts.view'] });
  assertEquals(await userCan(d, { id: 'ops', role: 'management' }, 'payments.adjust'), true);
  assertEquals(await userCan(d, { id: 'ops', role: 'management' }, 'supervisors.assign'), false);
  assertEquals(await userCan(d, { id: 'acc', role: 'accounts' }, 'payments.adjust'), false);
  assertEquals(await userCan(d, { id: 'nobody', role: 'supervisor' }, 'payments.adjust'), false);
});

Deno.test('a missing answer from the database means no', async () => {
  const broken = { rpc: () => Promise.resolve({ data: null, error: { message: 'down' } }) };
  assertEquals(await userCan(broken, { id: 'x', role: 'management' }, 'payments.adjust'), false);
});

Deno.test('requirePermission stops the request with 403 and the message', async () => {
  const d = db({ ops: ['payments.adjust'] });
  await requirePermission(d, { id: 'ops', role: 'management' }, 'payments.adjust');
  const err = await assertRejects(() => requirePermission(d, { id: 'ops', role: 'management' }, 'supervisors.assign', 'Not for your role.'));
  assertEquals((err as { status?: number }).status, 403);
  assertEquals((err as Error).message, 'Not for your role.');
});
