import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

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
    await base44.asServiceRole.entities.AccountRequest.create({
      full_name: fullName,
      email: user.email,
      requested_role: requestedRole,
      status: 'pending',
      user_id: user.id,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}