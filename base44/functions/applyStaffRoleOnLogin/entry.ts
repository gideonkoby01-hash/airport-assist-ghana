import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.email) return Response.json({ applied: false });

    // Look up a pending staff role assignment for this user's email (case-insensitive).
    const result = await base44.asServiceRole.entities.StaffRoleAssignment.filter({
      email: { $regex: '^' + escapeRegex(user.email) + '$', $options: 'i' }
    });
    const list = Array.isArray(result) ? result : (result.items || []);
    const assignment = list[0];
    if (!assignment) return Response.json({ applied: false });

    // Apply the assigned role to the now-registered user.
    await base44.asServiceRole.entities.User.update(user.id, { role: assignment.role });

    // Remove the assignment so it does not override future manual role changes.
    await base44.asServiceRole.entities.StaffRoleAssignment.delete(assignment.id);

    return Response.json({ applied: true, role: assignment.role });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}