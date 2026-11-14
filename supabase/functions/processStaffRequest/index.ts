import { adminClient, appUrl, requireCaller } from '../_shared/auth.ts';
import { sendTransactionalEmail } from '../_shared/email.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

// Admin approves or rejects a staff access request.
serve('processStaffRequest', async (req) => {
  const admin = adminClient();
  const caller = await requireCaller(req, admin, ['admin']);

  const { request_id: requestId, action } = await readBody(req);
  if (typeof requestId !== 'string' || (action !== 'approve' && action !== 'reject')) throw new HttpError(400, 'Invalid request');

  const { data: request } = await admin.from('account_requests').select('*').eq('id', requestId).maybeSingle();
  if (!request) throw new HttpError(404, 'Request not found');
  if (request.status !== 'pending') throw new HttpError(400, 'Request already processed');

  const approved = action === 'approve';

  // Claim the decision first so two admins clicking at once cannot both act on it.
  const { data: claimed, error: claimError } = await admin
    .from('account_requests')
    .update({ status: approved ? 'approved' : 'rejected' })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id');
  if (claimError) throw claimError;
  if (!claimed?.length) throw new HttpError(400, 'Request already processed');

  if (approved && request.user_id) {
    const { error } = await admin.from('profiles').update({ role: request.requested_role, updated_by_id: caller.id }).eq('id', request.user_id);
    if (error) throw error;
    if (request.requested_role === 'supervisor') {
      const { data: existing } = await admin.from('supervisor_directory').select('id').eq('user_id', request.user_id).limit(1);
      if (!existing?.length) {
        await admin.from('supervisor_directory').insert({ user_id: request.user_id, full_name: request.full_name || '', email: request.email || '', active: true });
      }
    }
  }

  const roleLabel = request.requested_role === 'management' ? 'Management' : 'Supervisor';

  // In-app notice to the requester (a rejected person stays "pending" and sees it on the pending screen).
  let requester_notified = false;
  if (request.user_id) {
    const { error } = await admin.from('notifications').insert({
      user_id: request.user_id,
      account_request_id: requestId,
      title: approved ? 'Staff Access Approved' : 'Staff Access Rejected',
      message: approved
        ? `Your request for ${roleLabel} access has been approved.\nSign in and open your ${roleLabel} dashboard to get started.`
        : `Your request for ${roleLabel} access was not approved.\nIf you believe this is an error, please contact the Admin office.`,
      read: false,
      type: 'staff_request',
      link_path: approved ? (request.requested_role === 'management' ? '/management' : '/supervisor') : '/login',
    });
    if (error) console.error('processStaffRequest: requester notification failed:', error.message);
    else requester_notified = true;
  }

  // Email the outcome (no internal notes). Failure is reported, not fatal.
  let email_result = null;
  if (request.user_id) {
    const { data: requester } = await admin.from('profiles').select('id,email,full_name').eq('id', request.user_id).maybeSingle();
    const contactName = request.full_name || requester?.full_name || requester?.email || '';
    email_result = await sendTransactionalEmail(admin, {
      eventKey: `staff_request_decision:${requestId}:${action}`,
      templateName: approved ? 'StaffRequestApproved' : 'StaffRequestRejected',
      to: requester?.email,
      userId: request.user_id,
      relatedEntityId: requestId,
      variables: {
        first_name: contactName.trim().split(/\s+/)[0] || 'there',
        role_label: roleLabel,
        decision_line: new Date().toUTCString(),
        cta_url: `${appUrl()}/login`,
      },
    });
  }

  return json({ ok: true, action, requester_notified, email_result });
});
