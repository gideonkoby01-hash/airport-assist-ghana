import { adminClient } from '../_shared/auth.ts';
import { json, serve } from '../_shared/http.ts';

// For an uptime monitor: answers 200 only if the functions and the database are both working. Reveals nothing else.
serve('health', async () => {
  const { error } = await adminClient().from('app_settings').select('key').limit(1);
  return json({ ok: !error, time: new Date().toISOString() }, error ? 503 : 200);
});
