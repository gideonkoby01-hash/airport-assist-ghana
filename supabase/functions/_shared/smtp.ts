import nodemailer from 'npm:nodemailer@6.9.16';

// Sending through an SMTP mail server (the settings under Admin > Settings > Email).
// Certificates are always verified. The password is only ever used to sign in; it is never put in an error message.

export interface SmtpConfig {
  host: string;
  port: number;
  security: 'ssl' | 'starttls' | 'none';
  username: string; // empty means "no sign-in"
  password: string;
}

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// For tests against a local server with a self-signed certificate. Not reachable from the settings page.
export interface SmtpTestOptions { allowSelfSigned?: boolean }

function transport(cfg: SmtpConfig, opts: SmtpTestOptions = {}) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.security === 'ssl',
    requireTLS: cfg.security === 'starttls', // never fall back to plain text if STARTTLS is unavailable
    ignoreTLS: cfg.security === 'none',
    auth: cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { rejectUnauthorized: !opts.allowSelfSigned, minVersion: 'TLSv1.2' },
  });
}

export async function sendViaSmtp(cfg: SmtpConfig, msg: MailMessage, opts: SmtpTestOptions = {}): Promise<{ messageId: string }> {
  const info = await transport(cfg, opts).sendMail({ from: msg.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text ?? htmlToText(msg.html) });
  if (!info.accepted?.length) throw Object.assign(new Error('The server did not accept the recipient'), { code: 'EENVELOPE' });
  return { messageId: String(info.messageId ?? '') };
}

// Connects and signs in without sending anything.
export async function verifySmtp(cfg: SmtpConfig, opts: SmtpTestOptions = {}): Promise<void> {
  await transport(cfg, opts).verify();
}

// A plain-text version for mail programs that do not show HTML (and for spam filters, which like to see one).
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|tr|h\d|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// What went wrong, in words an administrator can act on. Nothing secret is included.
export function describeSmtpError(error: unknown, cfg?: Pick<SmtpConfig, 'host' | 'port' | 'security'>): string {
  const e = error as { code?: string; responseCode?: number; response?: string; message?: string };
  const where = cfg ? `${cfg.host}:${cfg.port}` : 'the server';
  const code = e?.code ?? '';
  if (code === 'EAUTH' || e?.responseCode === 535) {
    return 'The server refused the username or password. For Gmail and Microsoft 365 use an app password, not your normal password, and check the username is the full email address.';
  }
  const text = `${code} ${e?.message ?? ''}`;
  if (/ECONNREFUSED/.test(text)) return `Could not connect to ${where}. Check the server name and port, and that the connection security matches the port.`;
  if (/ENOTFOUND|EDNS|EAI_AGAIN/.test(text)) return `The server name ${cfg?.host ?? ''} was not found. Check it for typing mistakes.`;
  if (/ETIMEDOUT|timed? ?out|ECONNRESET|EHOSTUNREACH|ENETUNREACH/i.test(text) || code === 'ECONNECTION') {
    return `The server at ${where} did not answer in time. The port may be blocked: Supabase has blocked outbound SMTP on ports 25 and 587 from functions (check its current documentation), so try port 465 with SSL/TLS.`;
  }
  if (/self.signed|unable to verify|certificate|CERT_|altnames|hostname/i.test(`${code} ${e?.message}`)) {
    return `The server's security certificate could not be verified for ${cfg?.host ?? 'that server'}. Check the server name matches the one your provider gives you.`;
  }
  if (/wrong version number|ssl3_get_record|tls/i.test(e?.message ?? '') && code === 'ESOCKET') {
    return 'The secure connection could not be set up. The connection security option probably does not match the port: use SSL/TLS for port 465 and STARTTLS for port 587.';
  }
  if (code === 'EENVELOPE' || (e?.responseCode && e.responseCode >= 500)) {
    const said = (e.response ?? e.message ?? '').toString().replace(/\s+/g, ' ').slice(0, 160);
    return `The server refused the message${said ? `: ${said}` : ''}. Check that the sender address is one your provider lets you send from.`;
  }
  return `The email could not be sent (${(e?.message ?? 'unknown error').toString().slice(0, 160)}).`;
}
