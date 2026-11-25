import { adminClient, clientIp } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { normalizePhone } from '../_shared/phone.ts';
import { spendTheSameTime, verifyPassword } from '../_shared/password.ts';
import { signSession } from '../_shared/porterSession.ts';
import { sessionKey } from '../_shared/porterSessionGate.ts';

// A porter signs in with their phone number and password. Every way of failing gives the same answer, in about the same time, so the
// reply does not reveal which phone numbers have a login. Attempts are limited per network address and per phone number.
const WRONG = 'That phone number or password is not right. If you have forgotten your password, ask the Airport Assist office to reset it.';
const WINDOW_SECONDS = 600;

serve('porterLogin', async (req) => {
  const key = sessionKey();
  const admin = adminClient();
  const body = await readBody(req);
  const phone = normalizePhone(body.phone);
  const password = String(body.password ?? '');

  const byIp = await admin.rpc('hit_rate_limit', { p_key: `porter_login_ip:${clientIp(req)}`, p_window_seconds: WINDOW_SECONDS });
  if (byIp.error) throw byIp.error;
  const byPhone = phone ? await admin.rpc('hit_rate_limit', { p_key: `porter_login_phone:${phone}`, p_window_seconds: WINDOW_SECONDS }) : { data: 0, error: null };
  if (byPhone.error) throw byPhone.error;
  if (byIp.data > 30 || byPhone.data > 8) throw new HttpError(429, 'Too many attempts. Please wait ten minutes and try again.');

  if (!phone || !password || password.length > 200) {
    await spendTheSameTime(password.slice(0, 200));
    throw new HttpError(401, WRONG);
  }

  const { data: login } = await admin.from('porter_logins').select('porter_id,password_hash,must_change_password,token_version,disabled').eq('phone', phone).maybeSingle();
  const { data: porter } = login ? await admin.from('porters').select('id,full_name,active').eq('id', login.porter_id).maybeSingle() : { data: null };
  const usable = !!login && !login.disabled && !!porter?.active;
  const ok = usable ? await verifyPassword(login.password_hash, password) : await spendTheSameTime(password);
  if (!ok || !login || !porter) throw new HttpError(401, WRONG);

  await admin.from('porter_logins').update({ last_login_at: new Date().toISOString() }).eq('porter_id', login.porter_id);
  const session = await signSession(login.porter_id, login.token_version, key);
  return json({ ...session, must_change_password: login.must_change_password, porter: { id: porter.id, name: porter.full_name } });
});
