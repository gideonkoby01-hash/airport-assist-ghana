import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

const BUCKET = 'private-files';
const LINK_SECONDS = 300;

// A five-minute link to a private file. The storage rules decide whether the caller may read it (the link is
// requested with the caller's own login), and a view of someone else's file is written to the audit log.
serve('getFileUrl', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin);

  const { path } = await readBody(req) as Record<string, unknown>;
  if (typeof path !== 'string' || !path || path.length > 300 || path.includes('..')) throw new HttpError(400, 'A file path is required.');

  // As the caller, not as the service: the same rules as the rest of the app apply.
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await asUser.storage.from(BUCKET).createSignedUrl(path, LINK_SECONDS);
  if (error || !data) throw new HttpError(404, 'That file is not available.');

  if (path.split('/')[0] !== user.id) {
    const { error: logError } = await admin.from('audit_log').insert({
      actor_id: user.id, actor_role: user.role, action: 'VIEW', table_name: 'private-files', record_id: path,
    });
    if (logError) console.error('getFileUrl: could not log the view:', logError.message);
  }
  return json({ signed_url: data.signedUrl, expires_in: LINK_SECONDS });
});
