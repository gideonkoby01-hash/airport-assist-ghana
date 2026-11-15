// Run: deno test supabase/functions/_shared/retention_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { purgePrivateFiles } from './retention.ts';

// Fake Supabase client: rpc returns the list, storage.remove and bookings.update are recorded.
function fake(rows: { path: string; reason: string }[], opts: { removeError?: boolean } = {}) {
  const calls = { rpc: [] as unknown[], removed: [] as string[][], cleared: [] as string[][] };
  const admin = {
    calls,
    rpc: (name: string, args: unknown) => { calls.rpc.push([name, args]); return Promise.resolve({ data: rows, error: null }); },
    storage: { from: (_bucket: string) => ({
      remove: (paths: string[]) => {
        if (opts.removeError) return Promise.resolve({ data: null, error: { message: 'boom' } });
        calls.removed.push(paths); return Promise.resolve({ data: paths.map((name) => ({ name })), error: null });
      } }) },
    from: (_t: string) => ({ update: (_patch: unknown) => ({ in: (_c: string, paths: string[]) => ({
      select: () => { calls.cleared.push(paths); return Promise.resolve({ data: paths.map((p) => ({ id: p })), error: null }); } }) }) }),
  };
  return admin;
}

const rows = [
  { path: 'u1/old.jpg', reason: 'booking_past_retention' },
  { path: 'u1/abandoned.jpg', reason: 'orphan_upload' },
];

Deno.test('dry run lists but changes nothing', async () => {
  const a = fake(rows);
  const r = await purgePrivateFiles(a as never, { dryRun: true });
  assertEquals(r, { dry_run: true, retention_days: 30, listed: 2, removed: 0, bookings_cleared: 0, by_reason: { booking_past_retention: 1, orphan_upload: 1 } });
  assertEquals(a.calls.removed.length, 0);
  assertEquals(a.calls.cleared.length, 0);
});

Deno.test('removes the files, then clears only the booking references', async () => {
  const a = fake(rows);
  const r = await purgePrivateFiles(a as never, { retentionDays: 30 });
  assertEquals(r.removed, 2);
  assertEquals(r.bookings_cleared, 1);
  assertEquals(a.calls.removed, [['u1/old.jpg', 'u1/abandoned.jpg']]);
  assertEquals(a.calls.cleared, [['u1/old.jpg']]);
  assertEquals(a.calls.rpc[0], ['purgeable_private_files', { p_retention_days: 30, p_orphan_days: 7 }]);
});

Deno.test('a storage failure leaves booking references untouched and is reported', async () => {
  const a = fake(rows, { removeError: true });
  const r = await purgePrivateFiles(a as never);
  assertEquals(r.removed, 0);
  assertEquals(r.bookings_cleared, 0);
  assertEquals(a.calls.cleared.length, 0);
  assertEquals(r.error?.startsWith('Storage removal failed'), true);
});

Deno.test('nothing to purge is a clean no-op', async () => {
  const a = fake([]);
  const r = await purgePrivateFiles(a as never);
  assertEquals(r.listed, 0);
  assertEquals(a.calls.removed.length, 0);
});
