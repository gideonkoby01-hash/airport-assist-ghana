// Help shown on the SMTP settings: provider presets and advice about the port and security combination.

// Well-known providers, to fill in the server details. Always check your provider's own current instructions.
export const SMTP_PRESETS = [
  { label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: "465", security: "ssl", note: "Sign in with your full email address and an app password (Google Account > Security > 2-Step Verification > App passwords), not your normal password." },
  { label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: "587", security: "starttls", note: "SMTP sign-in must be allowed for the mailbox. This provider uses port 587, which Supabase may block from functions." },
  { label: "Zoho Mail", host: "smtp.zoho.com", port: "465", security: "ssl", note: "Zoho accounts in Europe use smtp.zoho.eu." },
  { label: "Resend (SMTP)", host: "smtp.resend.com", port: "465", security: "ssl", username: "resend", note: "The password is your Resend API key." },
  { label: "SendGrid", host: "smtp.sendgrid.net", port: "465", security: "ssl", username: "apikey", note: "The password is a SendGrid API key." },
];

// Advice shown next to the SMTP fields, computed from what is typed so mistakes are caught before a test.
export function smtpHints({ port, security }) {
  const hints = [];
  if (security === "none") hints.push("No encryption: the password and the emails cross the internet unprotected. Use SSL/TLS or STARTTLS if your provider offers it.");
  if (String(port) === "465" && security !== "ssl") hints.push("Port 465 normally uses SSL/TLS.");
  if (String(port) === "587" && security !== "starttls") hints.push("Port 587 normally uses STARTTLS.");
  if (["25", "587"].includes(String(port))) hints.push("Supabase has blocked outbound SMTP on ports 25 and 587 from functions (check its current documentation). If the connection check times out, use port 465 with SSL/TLS.");
  return hints;
}
