// Two letters for the round badge: "Ama Mensah" gives AM; with no name, the start of the email.
export function initials(fullName, email) {
  const words = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return String(email || '?').slice(0, 2).toUpperCase();
}
