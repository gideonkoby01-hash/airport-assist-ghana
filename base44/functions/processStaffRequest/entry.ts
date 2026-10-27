import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendTransactionalEmail, logSkippedEmail } from '../../shared/emailDelivery.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { request_id, action } = body;
    if (!request_id || (action !== 'approve' && action !== 'reject')) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    let request;
    try {
      request = await base44.asServiceRole.entities.AccountRequest.get(request_id);
    } catch (e) {
      return Response.json({ error: 'Request not found' }, { status: 404 });
    }
    if (request.status !== 'pending') return Response.json({ error: 'Request already processed' }, { status: 400 });

    if (action === 'approve') {
      // Grant the requested staff role securely.
      await base44.asServiceRole.entities.User.update(request.user_id, { role: request.requested_role });
      await base44.asServiceRole.entities.AccountRequest.update(request_id, { status: 'approved' });

      // Auto-add approved supervisors to the Supervisor Directory.
      if (request.requested_role === 'supervisor') {
        const existing = await base44.asServiceRole.entities.SupervisorDirectory.filter({ user_id: request.user_id });
        if ((existing.items || []).length === 0) {
          await base44.asServiceRole.entities.SupervisorDirectory.create({
            user_id: request.user_id,
            full_name: request.full_name || '',
            email: request.email || '',
            active: true,
          });
        }
      }
    } else {
      // Reject: the user stays "pending" and sees the rejection on the pending screen.
      await base44.asServiceRole.entities.AccountRequest.update(request_id, { status: 'rejected' });
    }

    // Notify the requester of the outcome through the in-app Notification
    // entity (only when the request carries a valid account identifier). Best
    // effort: logged on failure; no administrative details are included.
    let requester_notified = false;
    if (request.user_id) {
      try {
        const existing = await base44.asServiceRole.entities.Notification.filter({
          account_request_id: request_id,
          type: 'staff_request',
        });
        const existingIds = new Set(
          (Array.isArray(existing) ? existing : existing.items || []).map((n) => n.user_id)
        );
        if (!existingIds.has(request.user_id)) {
          const roleLabel = request.requested_role === 'management' ? 'Management' : 'Supervisor';
          const approved = action === 'approve';
          await base44.asServiceRole.entities.Notification.create({
            user_id: request.user_id,
            account_request_id: request_id,
            title: approved ? 'Staff Access Approved' : 'Staff Access Rejected',
            message: approved
              ? [
                  `Your request for ${roleLabel} access has been approved.`,
                  `Sign in and open your ${roleLabel} dashboard to get started.`,
                ].join('\n')
              : [
                  `Your request for ${roleLabel} access was not approved.`,
                  'If you believe this is an error, please contact the Admin office.',
                ].join('\n'),
            read: false,
            type: 'staff_request',
            link_path: approved
              ? (request.requested_role === 'management' ? '/management' : '/supervisor')
              : '/login',
          });
          requester_notified = true;
        }
      } catch (e) {
        console.error(`processStaffRequest: failed to notify requester: ${e.message}`);
      }
    }

    // Email the requester the outcome after the decision is saved. Best
    // effort: logged and reported, never rolled back; no internal notes or
    // administrative details are included.
    let email_result = null;
    if (request.user_id) {
      try {
        const requester = await base44.asServiceRole.entities.User.get(request.user_id)
          .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
        if (requester && requester.email) {
          const roleLabel = request.requested_role === 'management' ? 'Management' : 'Supervisor';
          const approved = action === 'approve';
          const contactName = request.full_name || requester.full_name || requester.email;
          const firstName = contactName.trim().split(/\s+/)[0] || 'there';
          email_result = await sendTransactionalEmail(base44, {
            eventKey: 'staff_request_decision:' + request_id + ':' + action,
            templateName: approved ? 'StaffRequestApproved' : 'StaffRequestRejected',
            to: requester.email,
            userId: requester.id,
            relatedEntityId: request_id,
            variables: {
              first_name: firstName,
              role_label: roleLabel,
              decision_line: new Date().toLocaleString(),
              cta_url: 'https://airportassistghana.base44.app/login',
            },
          });
        } else {
          console.warn('processStaffRequest: no valid recipient for request ' + request_id);
          await logSkippedEmail(
            base44,
            'staff_request_decision:' + request_id + ':' + action,
            action === 'approve' ? 'StaffRequestApproved' : 'StaffRequestRejected',
            request.user_id,
            request_id,
            'No registered account or email for the requester'
          );
          email_result = { status: 'skipped', reason: 'no_valid_recipient', sent: false };
        }
      } catch (e) {
        console.error('processStaffRequest: outcome email failed: ' + e.message);
        email_result = { status: 'failed', reason: 'error', message: e.message, sent: false };
      }
    }

    return Response.json({ ok: true, action, requester_notified, email_result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}