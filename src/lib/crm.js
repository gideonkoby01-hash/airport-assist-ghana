// Words and small rules shared by the customer screens.

export const SEGMENTS = [
  { key: "all", label: "Everyone" },
  { key: "vip", label: "VIP" },
  { key: "returning", label: "Returning" },
  { key: "new", label: "New" },
  { key: "lapsed", label: "Lapsed" },
];

export const SEGMENT_HELP = {
  vip: "Tagged VIP.",
  returning: "Two or more bookings.",
  new: "One booking, or none yet.",
  lapsed: "Last flight was more than 180 days ago.",
};

export const SEGMENT_STYLES = {
  vip: "bg-amber-100 text-amber-900 border-amber-200",
  returning: "bg-emerald-50 text-emerald-800 border-emerald-200",
  new: "bg-sky-50 text-sky-800 border-sky-200",
  lapsed: "bg-slate-100 text-slate-700 border-slate-200",
};

export const NOTE_KINDS = [
  { key: "note", label: "Note" },
  { key: "call", label: "Phone call" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "meeting", label: "Meeting" },
  { key: "complaint", label: "Complaint" },
];

export const TAG_SUGGESTIONS = ["vip", "corporate", "travel agent", "airline crew", "frequent flyer", "needs wheelchair"];

/** Tags as typed ("VIP, corporate ,vip") to the stored list: lower case, no blanks or repeats, at most 12. */
export function parseTags(text) {
  const seen = new Set();
  for (const part of String(text || "").split(",")) {
    const tag = part.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30);
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, 12);
}

/** Where a follow-up stands against today's date (both YYYY-MM-DD). */
export function followUpState(note, today) {
  if (!note?.follow_up_on || note.done) return "none";
  if (note.follow_up_on < today) return "overdue";
  if (note.follow_up_on === today) return "today";
  return "later";
}

/** "024 111 2222" as typed stays as typed; this only tidies a missing name for display. */
export function customerLabel(c) {
  return (c?.full_name || "").trim() || c?.phone || c?.email || "Unnamed customer";
}
