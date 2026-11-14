import { adminClient, appUrl, recipientsByRole, requireCaller } from '../_shared/auth.ts';
import { sendTransactionalEmail } from '../_shared/email.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

// A newly registered person asks for Supervisor or Management access. Their account is held as
// "pending" until an admin decides (processStaffRequest).
serve('submitStaffRequest', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin);

  // Only passengers (or someone already pending) can ask. Staff and admins must not be able to
  // downgrade themselves to "pending" and lock themselves out.
  if (user.role !== 'passenger' && user.role !== 'pending') throw new HttpError(403, 'This account already has staff access.');

  const body = await readBody(req);
  const requestedRole = body.requested_role;
  const fullName = String(body.full_name ?? '').trim().slice(0, 120);
  if (requestedRole !== 'supervisor' && requestedRole !== 'management') throw new HttpError(400, 'Invalid role');

  // One open request per person: repeat calls must not spam every admin.
  const { data: open } = await admin.from('account_requests').select('id').eq('user_id', user.id).eq('status', 'pending').limit(1);
  if (open && open.length > 0) return json({ ok: true, notified: 0, failed: [], already_pending: true });

  const { error: holdError } = await admin.from('profiles').update({ role: 'pending', updated_by_id: user.id, ...(fullName ? { full_name: fullName } : {}) }).eq('id', user.id);
  if (holdError) throw holdError;

  const { data: request, error: requestError } = await admin
    .from('account_requests')
    .insert({ full_name: fullName, email: user.email, requested_role: requestedRole, status: 'pending', user_id: user.id })
    .select('id')
    .single();
  if (requestError) throw requestError;

  const roleLabel = requestedRole === 'management' ? 'Management' : 'Supervisor';

  // Tell every admin. Best effort: the request itself is already saved.
  let notified = 0;
  const failed: { user_id: string; error: string }[] = [];
  try {
    const admins = await recipientsByRole(admin, ['admin']);
    const message = [
      'New staff access request awaiting review.',
      `Requester: ${fullName || user.email}`,
      `Requested role: ${roleLabel}`,
      `Submitted: ${new Date().toISOString()}`,
    ].join('\n');
    for (const a of admins) {
      const { error } = await admin.from('notifications').insert({
        user_id: a.id, account_request_id: request.id, title: 'New Staff Access Request', message,
        read: false, type: 'staff_request', link_path: '/admin?tab=requests',
      });
      if (error) failed.push({ user_id: a.id, error: error.message });
      else notified++;
    }
  } catch (e) {
    console.error('submitStaffRequest: failed to notify admins:', e instanceof Error ? e.message : e);
  }

  const firstName = (fullName || user.full_name || user.email).trim().split(/\s+/)[0] || 'there';
  const email_ack = await sendTransactionalEmail(admin, {
    eventKey: `staff_request_received:${request.id}`,
    templateName: 'StaffRequestReceived',
    to: user.email,
    userId: user.id,
    relatedEntityId: request.id,
    variables: { first_name: firstName, role_label: roleLabel, submitted_line: new Date().toUTCString(), cta_url: `${appUrl()}/login` },
  });

  return json({ ok: true, notified, failed, email_ack });
});
