import { adminClient, requireCaller } from '../_shared/auth.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';
import { hashPassword } from '../_shared/password.ts';
import { normalizePhone } from '../_shared/phone.ts';
import { generateTempPassword } from '../_shared/tempPassword.ts';

// The office gives a porter a login (phone number + a temporary password shown once), resets it, or switches it off.
// Admin only, like the porter register. The password itself is never stored or shown again; the porter must replace it at first sign-in.
serve('managePorterLogin', async (req) => {
  const admin = adminClient();
  const caller = await requireCaller(req, admin, ['admin']);
  const body = await readBody(req);
  const action = String(body.action ?? '');

  if (action === 'list') {
    const { data, error } = await admin.from('porter_logins').select('porter_id,phone,disabled,must_change_password,last_login_at');
    if (error) throw error;
    return json({ logins: data ?? [] });
  }

  const porterId = String(body.porter_id ?? '').trim();
  const { data: porter } = await admin.from('porters').select('id,full_name,phone_number,active').eq('id', porterId).maybeSingle();
  if (!porter) throw new HttpError(404, 'That porter was not found.');
  const { data: existing } = await admin.from('porter_logins').select('porter_id').eq('porter_id', porter.id).maybeSingle();
  const callerName = caller.full_name || caller.email;

  if (action === 'create') {
    if (existing) throw new HttpError(409, `${porter.full_name} already has a login. Use Reset password instead.`);
    if (!porter.active) throw new HttpError(409, `${porter.full_name} is switched off on the porter register. Switch them on first.`);
    const phone = normalizePhone(body.phone || porter.phone_number);
    if (!phone) throw new HttpError(400, 'Enter a valid phone number, for example 024 123 4567.');
    const password = generateTempPassword();
    const { error } = await admin.from('porter_logins').insert({ porter_id: porter.id, phone, password_hash: await hashPassword(password), created_by_name: callerName });
    if (error) {
      if (error.code === '23505') throw new HttpError(409, 'Another porter already uses that phone number to sign in.');
      throw error;
    }
    return json({ ok: true, phone, temporary_password: password });
  }

  if (!existing) throw new HttpError(404, `${porter.full_name} does not have a login yet.`);

  if (action === 'reset') {
    const password = generateTempPassword();
    const { data: row } = await admin.from('porter_logins').select('token_version,phone').eq('porter_id', porter.id).single();
    const { error } = await admin.from('porter_logins').update({ password_hash: await hashPassword(password), must_change_password: true, token_version: row!.token_version + 1 }).eq('porter_id', porter.id);
    if (error) throw error;
    return json({ ok: true, phone: row!.phone, temporary_password: password });
  }

  if (action === 'disable' || action === 'enable') {
    const { data: row } = await admin.from('porter_logins').select('token_version').eq('porter_id', porter.id).single();
    const { error } = await admin.from('porter_logins').update({ disabled: action === 'disable', token_version: row!.token_version + 1 }).eq('porter_id', porter.id);
    if (error) throw error;
    return json({ ok: true });
  }

  if (action === 'remove') {
    const { error } = await admin.from('porter_logins').delete().eq('porter_id', porter.id);
    if (error) throw error;
    return json({ ok: true });
  }

  throw new HttpError(400, 'Unknown request.');
});
