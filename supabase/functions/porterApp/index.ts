import { adminClient } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { hashPassword, passwordProblem, verifyPassword } from '../_shared/password.ts';
import { signSession } from '../_shared/porterSession.ts';
import { requirePorter, sessionKey } from '../_shared/porterSessionGate.ts';

// Everything a signed-in porter can do. The porter is always the one in the signed session, never one named in the request, so a porter
// cannot ask for anyone else's shifts, jobs or earnings.
serve('porterApp', async (req) => {
  const admin = adminClient();
  const body = await readBody(req);
  const { login, porter } = await requirePorter(admin, body.token);
  const action = String(body.action ?? 'overview');

  if (action === 'change_password') {
    const tries = await admin.rpc('hit_rate_limit', { p_key: `porter_pw:${porter.id}`, p_window_seconds: 600 });
    if (tries.error) throw tries.error;
    if (tries.data > 8) throw new HttpError(429, 'Too many attempts. Please wait ten minutes and try again.');
    if (!(await verifyPassword(login.password_hash, String(body.current_password ?? '')))) throw new HttpError(400, 'Your current password is not right.');
    const next = String(body.new_password ?? '');
    const problem = passwordProblem(next, login.phone);
    if (problem) throw new HttpError(400, problem);
    if (next === String(body.current_password)) throw new HttpError(400, 'Choose a password different from the one you have now.');
    const version = login.token_version + 1; // every other open session ends
    const { error } = await admin.from('porter_logins').update({ password_hash: await hashPassword(next), must_change_password: false, token_version: version }).eq('porter_id', porter.id);
    if (error) throw error;
    return json({ ok: true, ...(await signSession(porter.id, version, sessionKey())) });
  }

  if (action === 'me') return json({ porter: { id: porter.id, name: porter.full_name }, must_change_password: login.must_change_password });

  // Until the first password has been replaced, nothing else is available.
  if (login.must_change_password) {
    if (action === 'overview') return json({ must_change_password: true, porter: { id: porter.id, name: porter.full_name } });
    throw new HttpError(403, 'Please choose your own password first.');
  }

  if (action === 'overview') {
    const { data, error } = await admin.rpc('porter_dashboard', { p_porter: porter.id });
    if (error) throw error;
    return json({ ...data, must_change_password: false });
  }

  if (action === 'mark_done') {
    const { data, error } = await admin.rpc('porter_mark_done', { p_porter: porter.id, p_reference: String(body.reference ?? '') });
    if (error) {
      if (error.message?.includes('not_yours')) throw new HttpError(404, 'That job is not on your list.');
      if (error.message?.includes('too_early')) throw new HttpError(400, 'You can mark a job done on the day of the flight.');
      if (error.message?.includes('closed')) throw new HttpError(400, 'That booking was cancelled, so there is nothing to mark.');
      throw error;
    }
    return json(data);
  }

  throw new HttpError(400, 'Unknown request.');
});
