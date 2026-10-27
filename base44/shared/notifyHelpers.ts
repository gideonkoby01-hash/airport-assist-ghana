// Shared recipient lookup for the notification backend functions.
// Staff event alerts go to every Management and Admin user.
export async function getStaffRecipients(base44) {
  const res = await base44.asServiceRole.entities.User.filter({
    role: { $in: ['management', 'admin'] },
  });
  return Array.isArray(res) ? res : res.items || [];
}