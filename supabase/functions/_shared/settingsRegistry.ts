// The one list of settings the admin Settings page can change, with their rules. The page is drawn from this list
// (the adminSettings function sends it), so adding a setting here is all it takes to show and validate it.
//
// A setting's value is resolved in this order: saved on the Settings page, then the function environment variable
// named in `env` (how it was set before the page existed), then `default`.

export type SettingType = 'text' | 'textarea' | 'email' | 'number' | 'boolean' | 'time';

export interface SettingDef {
  key: string;
  group: 'business' | 'bookings' | 'operations' | 'privacy' | 'email';
  label: string;
  help: string;
  type: SettingType;
  default: string;
  env?: string;
  min?: number;
  max?: number;
  unit?: string;
  maxLength?: number;
  public?: boolean; // shown to visitors on the website
}

export interface SecretDef {
  name: string;
  group: 'email';
  label: string;
  help: string;
  prefix: string; // what a genuine key starts with
  where: string; // where to get it
}

export const GROUPS: Record<SettingDef['group'], { title: string; blurb: string }> = {
  email: { title: 'Email', blurb: 'The address emails come from, and the keys for the email service (Resend).' },
  business: { title: 'Business details', blurb: 'Shown on the public website: the footer, the contact section and the privacy notice.' },
  bookings: { title: 'Bookings', blurb: 'Rules applied when a passenger books online. Walk-in sales at the desk are not held to these.' },
  operations: { title: 'Operations', blurb: 'Shifts, escalation and porter commission.' },
  privacy: { title: 'Privacy and retention', blurb: 'How long personal files are kept. Tell passengers the same figures in the privacy notice.' },
};

export const SETTINGS: SettingDef[] = [
  { key: 'email_from', group: 'email', label: 'Sender address', type: 'text', default: '', env: 'EMAIL_FROM', maxLength: 200,
    help: 'Shown as the sender, for example: Airport Assist Ghana <noreply@mail.yourdomain.com>. The domain must be verified in Resend.' },

  { key: 'company_name', group: 'business', label: 'Business name', type: 'text', default: 'Airport Assist Ghana', maxLength: 80, public: true, help: 'Used in the footer and the privacy notice.' },
  { key: 'contact_email', group: 'business', label: 'Contact email', type: 'email', default: 'moehamedi@gmail.com', maxLength: 120, public: true, help: 'The public contact address, and where privacy requests are sent.' },
  { key: 'contact_phone', group: 'business', label: 'Contact phone numbers', type: 'text', default: '+233 537 755 063 / +233 246 222 777', maxLength: 120, public: true, help: 'Separate several numbers with a slash.' },
  { key: 'contact_address', group: 'business', label: 'Address', type: 'text', default: '39 Ring Road East, Nyaniba [GL-030-6750]', maxLength: 160, public: true, help: 'Shown in the footer.' },

  { key: 'online_bookings_enabled', group: 'bookings', label: 'Accept online bookings', type: 'boolean', default: 'true', public: true,
    help: 'Switch off to pause online booking (for example during a system change). Staff can still take walk-in bookings and quick sales.' },
  { key: 'online_bookings_message', group: 'bookings', label: 'Message shown while paused', type: 'textarea', default: 'Online booking is paused right now. Please contact the Airport Assist desk.', maxLength: 240, public: true, help: 'Shown on the booking form when online booking is switched off.' },
  { key: 'min_lead_hours', group: 'bookings', label: 'Minimum notice', type: 'number', default: '2', env: 'MIN_LEAD_HOURS', min: 0, max: 72, unit: 'hours', help: 'How far ahead of the flight an online booking must be made.' },
  { key: 'max_advance_days', group: 'bookings', label: 'Furthest ahead', type: 'number', default: '366', min: 30, max: 730, unit: 'days', help: 'How far ahead of the flight an online booking may be made.' },
  { key: 'booking_limit_per_hour', group: 'bookings', label: 'Bookings per passenger per hour', type: 'number', default: '10', min: 1, max: 100, help: 'Stops one account from flooding the desk with bookings.' },
  { key: 'discount_attempt_limit', group: 'bookings', label: 'Wrong discount codes allowed', type: 'number', default: '10', min: 3, max: 50, help: 'After this many wrong codes the person must wait (see the window below).' },
  { key: 'discount_attempt_window_minutes', group: 'bookings', label: 'Discount code lockout window', type: 'number', default: '15', min: 5, max: 240, unit: 'minutes', help: 'How long the wrong-code count is held for.' },

  { key: 'shift_morning_start', group: 'operations', label: 'Morning shift starts', type: 'time', default: '06:00', help: 'Ghana time. The morning shift runs until the night shift starts. Change before anyone files a report for the new hours.' },
  { key: 'shift_night_start', group: 'operations', label: 'Night shift starts', type: 'time', default: '18:00', help: 'Ghana time. The night shift runs until the next morning shift starts.' },
  { key: 'unassigned_alert_minutes', group: 'operations', label: 'Alert when no supervisor after', type: 'number', default: '15', env: 'UNASSIGNED_ALERT_MINUTES', min: 5, max: 240, unit: 'minutes', help: 'Management is alerted once if a booking has no supervisor this long after it was made.' },
  { key: 'porter_commission_per_passenger', group: 'operations', label: 'Porter commission', type: 'number', default: '30', min: 0, max: 1000, unit: 'GHS per passenger', public: true, help: 'Applies to commissions recorded from now on. Past commissions are not changed.' },

  { key: 'photo_retention_days', group: 'privacy', label: 'Keep passenger ID photos for', type: 'number', default: '30', env: 'PHOTO_RETENTION_DAYS', min: 1, max: 365, unit: 'days after the flight', help: 'After this the photo is deleted automatically. Update the privacy notice if you change it.' },
  { key: 'orphan_upload_days', group: 'privacy', label: 'Delete unused uploads after', type: 'number', default: '7', min: 1, max: 60, unit: 'days', help: 'Photos uploaded but never attached to a booking.' },
];

export const SECRETS: SecretDef[] = [
  { name: 'RESEND_API_KEY', group: 'email', label: 'Resend API key', prefix: 're_', where: 'Resend > API Keys > create a key with "Sending access"',
    help: 'Lets the system send emails (booking confirmations, alerts, staff invites).' },
  { name: 'RESEND_WEBHOOK_SECRET', group: 'email', label: 'Resend webhook signing secret', prefix: 'whsec_', where: 'Resend > Webhooks > your endpoint > Signing secret',
    help: 'Lets the system trust delivery reports (delivered, bounced, spam) coming from Resend.' },
];

export const SETTING_BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));
export const SECRET_BY_NAME = new Map(SECRETS.map((s) => [s.name, s]));

export type Checked = { ok: true; value: string } | { ok: false; error: string };

// Checks one value from the page. Returns the text to store (booleans as "true"/"false", numbers without padding).
export function validateSetting(def: SettingDef, raw: unknown): Checked {
  const text = String(raw ?? '').trim();
  const fail = (error: string): Checked => ({ ok: false, error: `${def.label}: ${error}` });
  switch (def.type) {
    case 'boolean':
      if (text !== 'true' && text !== 'false') return fail('choose on or off.');
      return { ok: true, value: text };
    case 'number': {
      if (text === '' || !/^-?\d+(\.\d+)?$/.test(text)) return fail('enter a number.');
      const n = Number(text);
      if (def.min !== undefined && n < def.min) return fail(`must be at least ${def.min}.`);
      if (def.max !== undefined && n > def.max) return fail(`must be at most ${def.max}.`);
      return { ok: true, value: String(n) };
    }
    case 'time':
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return fail('use 24-hour time like 06:00.');
      return { ok: true, value: text };
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return fail('enter a valid email address.');
      break;
    default:
      break;
  }
  if (def.maxLength && text.length > def.maxLength) return fail(`keep it under ${def.maxLength} characters.`);
  if (text === '' && def.key !== 'email_from') return fail('cannot be empty.');
  if (def.key === 'email_from' && text !== '' && !/^[^<>@\s][^<>@]*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$|^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text)) {
    return fail('use an address like noreply@yourdomain.com or Name <noreply@yourdomain.com>.');
  }
  return { ok: true, value: text };
}

// Rules that involve more than one setting. `values` holds the effective value of each key after the change.
export function validateTogether(values: Record<string, string>): string | null {
  const morning = values.shift_morning_start;
  const night = values.shift_night_start;
  if (morning && night && morning >= night) return 'The night shift must start after the morning shift starts (for example morning 06:00, night 18:00).';
  return null;
}

export function validateSecret(def: SecretDef, raw: unknown): Checked {
  const text = String(raw ?? '').trim();
  if (text.length < 12 || text.length > 500 || /\s/.test(text)) return { ok: false, error: `${def.label}: that does not look like a key. Paste it exactly as given, with no spaces.` };
  if (!text.startsWith(def.prefix)) return { ok: false, error: `${def.label}: a genuine key starts with "${def.prefix}". Check you copied the right one from ${def.where}.` };
  return { ok: true, value: text };
}

export type Source = 'saved' | 'environment' | 'default';

// What each setting is right now and where that value came from.
export function resolveSettings(rows: { key: string; value: string }[], env: (name: string) => string | undefined): Record<string, { value: string; source: Source }> {
  const saved = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, { value: string; source: Source }> = {};
  for (const def of SETTINGS) {
    const s = saved.get(def.key);
    const e = def.env ? env(def.env) : undefined;
    if (s !== undefined) out[def.key] = { value: s, source: 'saved' };
    else if (e !== undefined && e !== '') out[def.key] = { value: e, source: 'environment' };
    else out[def.key] = { value: def.default, source: 'default' };
  }
  return out;
}
