// Shared recipient lookup for the notification backend functions.
// Staff event alerts go to every Management and Admin user.
export async function getStaffRecipients(base44) {
  const res = await base44.asServiceRole.entities.User.filter({
    role: { $in: ['management', 'admin'] },
  });
  return Array.isArray(res) ? res : res.items || [];
}

// Staff approval-flow alerts go to every Admin user.
export async function getAdminRecipients(base44) {
  const res = await base44.asServiceRole.entities.User.filter({
    role: 'admin',
  });
  return Array.isArray(res) ? res : res.items || [];
}