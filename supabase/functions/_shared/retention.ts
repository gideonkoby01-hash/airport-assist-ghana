import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'private-files';
const CHUNK = 100;

export interface PurgeResult {
  dry_run: boolean;
  retention_days: number;
  listed: number;
  removed: number;
  bookings_cleared: number;
  by_reason: Record<string, number>;
  error?: string;
}

// Deletes passenger ID photos past their retention period (and abandoned uploads).
// Order matters: the file is removed first, and the booking's reference is cleared only for files
// whose removal succeeded, so a failure leaves a reference that still points at a real file,
// never the reverse. Safe to run repeatedly.
export async function purgePrivateFiles(
  admin: SupabaseClient,
  opts: { dryRun?: boolean; retentionDays?: number; orphanDays?: number } = {},
): Promise<PurgeResult> {
  const retentionDays = opts.retentionDays ?? 30;
  const result: PurgeResult = { dry_run: !!opts.dryRun, retention_days: retentionDays, listed: 0, removed: 0, bookings_cleared: 0, by_reason: {} };

  const { data, error } = await admin.rpc('purgeable_private_files', { p_retention_days: retentionDays, p_orphan_days: opts.orphanDays ?? 7 });
  if (error) throw error;
  const rows = (data ?? []) as { path: string; reason: string }[];
  result.listed = rows.length;
  for (const r of rows) result.by_reason[r.reason] = (result.by_reason[r.reason] ?? 0) + 1;
  if (opts.dryRun) return result;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const paths = chunk.map((r) => r.path);
    const { error: removeError } = await admin.storage.from(BUCKET).remove(paths);
    if (removeError) {
      result.error = `Storage removal failed: ${removeError.message}`;
      return result;
    }
    result.removed += paths.length;

    const bookingPaths = chunk.filter((r) => r.reason === 'booking_past_retention').map((r) => r.path);
    if (bookingPaths.length) {
      const { data: cleared, error: clearError } = await admin
        .from('bookings')
        .update({ passenger_photo_uri: '', passenger_photo_deleted_at: new Date().toISOString() })
        .in('passenger_photo_uri', bookingPaths)
        .select('id');
      if (clearError) {
        result.error = `Files removed but bookings not updated: ${clearError.message}`;
        return result;
      }
      result.bookings_cleared += cleared?.length ?? 0;
    }
  }
  return result;
}
