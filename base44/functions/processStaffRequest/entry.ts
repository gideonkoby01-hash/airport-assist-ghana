import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

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

    return Response.json({ ok: true, action });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}