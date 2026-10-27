import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getAdminRecipients } from '../../shared/notifyHelpers.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const requestedRole = body.requested_role;
    const fullName = (body.full_name || '').trim();
    if (requestedRole !== 'supervisor' && requestedRole !== 'management') {
      return Response.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Hold the account as "pending" so no dashboard is reachable until an admin approves.
    const update = { role: 'pending' };
    if (fullName) update.full_name = fullName;
    await base44.asServiceRole.entities.User.update(user.id, update);

    // Record the access request for admin review.
    const request = await base44.asServiceRole.entities.AccountRequest.create({
      full_name: fullName,
      email: user.email,
      requested_role: requestedRole,
      status: 'pending',
      user_id: user.id,
    });

    // Notify every Admin user about the new request. Best effort: the request
    // itself was recorded successfully, so a notification failure is logged
    // and reported but does not fail the submission.
    let notified = 0;
    const failed = [];
    try {
      const admins = await getAdminRecipients(base44);
      const existing = await base44.asServiceRole.entities.Notification.filter({
        account_request_id: request.id,
        type: 'staff_request',
      });
      const existingIds = new Set(
        (Array.isArray(existing) ? existing : existing.items || []).map((n) => n.user_id)
      );
      const roleLabel = requestedRole === 'management' ? 'Management' : 'Supervisor';
      const message = [
        'New staff access request awaiting review.',
        `Requester: ${fullName || user.email}`,
        `Requested role: ${roleLabel}`,
        `Submitted: ${new Date().toLocaleString()}`,
      ].join('\n');
      for (const a of admins) {
        if (existingIds.has(a.id)) continue;
        try {
          await base44.asServiceRole.entities.Notification.create({
            user_id: a.id,
            account_request_id: request.id,
            title: 'New Staff Access Request',
            message,
            read: false,
            type: 'staff_request',
            link_path: '/admin?tab=requests',
          });
          notified++;
        } catch (e) {
          console.error(`submitStaffRequest: admin notification failed for user ${a.id}: ${e.message}`);
          failed.push({ user_id: a.id, error: e.message });
        }
      }
    } catch (e) {
      console.error(`submitStaffRequest: failed to notify admins: ${e.message}`);
    }

    return Response.json({ ok: true, notified, failed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}