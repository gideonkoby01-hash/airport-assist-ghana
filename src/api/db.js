// Data access layer. Exposes the same call shapes the app already used
// (api.entities.Booking.filter(...), api.functions.invoke(...)) on top of Supabase,
// so pages and components did not need rewriting.
//
//   - Entities map to tables below (User is the `profiles` table).
//   - Query filters keep the small Mongo-style vocabulary the app uses:
//     equality, $or, $and, $in, $gte, $lte and case-insensitive $regex (substring).
//   - filter() returns an array that also has `.items` and `.next_cursor`, because
//     callers read it both ways.
import { shrinkImage } from '@/lib/imageResize';
import { supabase } from '@/api/supabaseClient';
import { ApiError, applyFilter, applySort } from '@/api/filters';

export { ApiError };

const TABLES = {
  AccountRequest: 'account_requests',
  AuditLog: 'audit_log',
  Booking: 'bookings',
  Customer: 'customers',
  CustomerNote: 'customer_notes',
  BookingRating: 'booking_ratings',
  DiscountCode: 'discount_codes',
  DiscountRedemption: 'discount_redemptions',
  EmailDelivery: 'email_deliveries',
  Expense: 'expenses',
  Lounge: 'lounges',
  Notification: 'notifications',
  Payment: 'payments',
  Porter: 'porters',
  ReportingBaseline: 'reporting_baselines',
  ServicePackage: 'service_packages',
  ShiftReport: 'shift_reports',
  StaffRoleAssignment: 'staff_role_assignments',
  SupervisorDirectory: 'supervisor_directory',
  User: 'profiles',
};

const AGGREGATES = {
  Booking: (query) => supabase.rpc('aggregate_bookings', {
    p_statuses: query?.status?.$in ?? (typeof query?.status === 'string' ? [query.status] : null),
    p_created_from: query?.created_date?.$gte ?? null,
  }),
  BookingRating: () => supabase.rpc('aggregate_ratings'),
};

function fail(error, status) {
  throw new ApiError(error.message, status ?? (error.code === 'PGRST116' ? 404 : error.status), error);
}

/** @returns {any} an array that also carries .items, .next_cursor and .has_more */
function toPage(rows, offset, limit) {
  /** @type {any} */
  const page = Array.isArray(rows) ? [...rows] : [];
  page.items = page;
  page.next_cursor = limit && page.length === limit ? String(offset + limit) : undefined;
  page.has_more = page.next_cursor !== undefined;
  return page;
}

// ---- entity API -------------------------------------------------------------------------------

function entity(name) {
  const table = TABLES[name];

  const select = (fields) => supabase.from(table).select(fields?.length ? [...new Set(['id', ...fields])].join(',') : '*');

  const api = {
    async filter(query = {}, options = {}) {
      // Accept both filter(q, 'sort', limit) and filter(q, { sort, limit, cursor, fields }).
      const opts = typeof options === 'string' ? { sort: options } : options || {};
      let builder = applyFilter(select(opts.fields), query);
      builder = applySort(builder, opts.sort);
      const offset = Number(opts.cursor ?? opts.skip ?? 0) || 0;
      const limit = opts.limit ? Number(opts.limit) : undefined;
      if (limit) builder = builder.range(offset, offset + limit - 1);
      else if (offset) builder = builder.range(offset, offset + 999);
      const { data, error } = await builder;
      if (error) fail(error);
      return toPage(data, offset, limit);
    },

    list(sort, limit) {
      return api.filter({}, { sort, limit });
    },

    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      if (error) fail(error);
      if (!data) throw new ApiError(`${name} not found`, 404);
      return data;
    },

    async create(record) {
      const { data, error } = await supabase.from(table).insert(record).select().single();
      if (error) fail(error);
      return data;
    },

    async bulkCreate(records) {
      const { data, error } = await supabase.from(table).insert(records).select();
      if (error) fail(error);
      return data;
    },

    async update(id, patch) {
      const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().maybeSingle();
      if (error) fail(error);
      // RLS hides rows you may not update; an empty result means "not allowed or not found".
      if (!data) throw new ApiError(`${name} not found or not allowed`, 403);
      return data;
    },

    async bulkUpdate(/** @type {any[]} */ patches) {
      return Promise.all(patches.map(({ id, ...patch }) => api.update(id, patch)));
    },

    async upsert(records, { key = 'id' } = {}) {
      const { data, error } = await supabase.from(table).upsert(records, { onConflict: key }).select();
      if (error) fail(error);
      return data;
    },

    async delete(id) {
      const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
      if (error) fail(error);
      if (!data?.length) throw new ApiError(`${name} not found or not allowed`, 403);
      return { id };
    },

    async count(query = {}) {
      const { count, error } = await applyFilter(supabase.from(table).select('id', { count: 'exact', head: true }), query);
      if (error) fail(error);
      return count ?? 0;
    },

    // Dashboard totals. Supported per entity through SQL functions (see the migrations).
    async aggregate(/** @type {{ query?: any }} */ { query } = {}) {
      const run = AGGREGATES[name];
      if (!run) throw new ApiError(`aggregate is not supported for ${name}`, 400);
      const { data, error } = await run(query);
      if (error) fail(error);
      return { rows: data || [] };
    },

    // Row changes pushed live. Returns an unsubscribe function.
    subscribe(callback) {
      const channel = supabase
        .channel(`${table}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          /** @type {any} */
          const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
          callback({ type: payload.eventType.toLowerCase(), id: row?.id, data: payload.new });
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    },
  };
  return api;
}

const entities = Object.fromEntries(Object.keys(TABLES).map((name) => [name, entity(name)]));

// ---- Edge Functions ---------------------------------------------------------------------------

const functions = {
  // Resolves to { data } like before. Failures throw ApiError carrying the server's message.
  async invoke(name, body = {}) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      let payload = null;
      let status;
      if (error.context && typeof error.context.json === 'function') {
        status = error.context.status;
        payload = await error.context.json().catch(() => null);
      }
      throw new ApiError(payload?.error || error.message, status, payload);
    }
    return { data };
  },
};

// ---- Private file storage -----------------------------------------------------------------------

const BUCKET = 'private-files';

const storage = {
  // Stores a file under the caller's own folder and returns a stable reference.
  async uploadPrivateFile(/** @type {{ file: File }} */ { file: original }) {
    const file = await shrinkImage(original);
    const { data: auth } = await supabase.auth.getUser();
    const owner = auth?.user?.id;
    if (!owner) throw new ApiError('Sign in to upload files', 401);
    const ext = (file.name?.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
    const path = `${owner}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) fail(error);
    return { file_uri: path };
  },

  // For a passenger who has no account: asks for a single-use upload link, then sends the photo straight to private storage.
  async uploadGuestPhoto(/** @type {{ file: File }} */ { file: original }) {
    const file = await shrinkImage(original);
    const { data } = await functions.invoke('createGuestPhotoUpload', { content_type: file.type });
    const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(data.path, data.token, file, { contentType: file.type });
    if (error) fail(error);
    return { file_uri: data.path };
  },

  // Goes through the getFileUrl function so staff views of other people's files are logged.
  async createFileSignedUrl(/** @type {{ file_uri: string }} */ { file_uri }) {
    const { data } = await functions.invoke('getFileUrl', { path: file_uri });
    return { signed_url: data.signed_url };
  },
};

// Settings shown on the public website (contact details, whether online booking is open). Readable before sign-in.
const settings = {
  async getPublic() {
    const { data, error } = await supabase.rpc('get_public_settings');
    if (error) fail(error);
    return data || {};
  },
};

// The signed-in person's own details. Only name and phone can be changed here; role and access are admin-only.
const profile = {
  async updateMine(/** @type {{ full_name: string, phone: string }} */ { full_name, phone }) {
    const { data, error } = await supabase.rpc('update_my_profile', { p_full_name: full_name, p_phone: phone });
    if (error) {
      const known = {
        invalid_phone: 'Enter a phone number with at least 7 digits. Add the country code if it is not a Ghana number.',
        name_too_long: 'That name is too long.',
      };
      const key = Object.keys(known).find((k) => (error.message || '').includes(k));
      throw new ApiError(key ? known[key] : error.message, undefined, error);
    }
    return data;
  },
};

// Customer CRM (admin and management). The list comes from a database function that adds each customer's totals.
const crm = {
  async list(/** @type {{ search?: string, segment?: string, sort?: string, limit?: number, offset?: number }} */ { search = '', segment = 'all', sort = 'recent', limit = 50, offset = 0 } = {}) {
    const { data, error } = await supabase.rpc('crm_customers', { p_search: search, p_segment: segment, p_sort: sort, p_limit: limit, p_offset: offset });
    if (error) fail(error);
    return { rows: data || [], total: data?.[0]?.total_count ?? 0 };
  },
  async erase(/** @type {string} */ id) {
    const { error } = await supabase.rpc('crm_erase_customer', { p_customer_id: id });
    if (error) {
      throw new ApiError(/has_account/.test(error.message || '')
        ? 'This customer has a website account. Erase them from Staff accounts instead.'
        : error.message, undefined, error);
    }
  },
};

// Porter pay (admin and management): what each porter earned on a day, and paying it out.
const porterPay = {
  async earnings(/** @type {string} */ date) {
    const { data, error } = await supabase.rpc('porter_earnings', { p_date: date });
    if (error) fail(error);
    return data || [];
  },
  async pay(/** @type {string} */ porterKey, /** @type {string} */ date) {
    const { error } = await supabase.rpc('pay_porter', { p_porter_key: porterKey, p_date: date });
    if (error) {
      const msg = error.message || '';
      throw new ApiError(/nothing_due/.test(msg) ? 'There is nothing left to pay this porter for that day.'
        : /period_closed/.test(msg) ? 'The accountant has closed that month, so a payout for that day cannot be recorded. Ask an admin to reopen the month.'
          : msg, undefined, error);
    }
  },
};

// Supervisor commissions marked in a date range (admin and management).
const commissions = {
  async list(/** @type {string | null} */ from, /** @type {string | null} */ to) {
    const { data, error } = await supabase.rpc('supervisor_commissions', { p_from: from, p_to: to });
    if (error) fail(error);
    return data || [];
  },
};

// Accounts and analytics (admin and management): every call is a database function that checks the role itself.
const finance = {
  async summary(/** @type {string} */ from, /** @type {string} */ to) {
    const { data, error } = await supabase.rpc('finance_summary', { p_from: from, p_to: to });
    if (error) fail(error);
    return data || {};
  },
  async ledger(/** @type {string} */ from, /** @type {string} */ to, /** @type {string | null} */ type = null, /** @type {string | null} */ method = null) {
    const { data, error } = await supabase.rpc('ledger_entries', { p_from: from, p_to: to, p_type: type, p_method: method });
    if (error) fail(error);
    return data || [];
  },
  async receivables(/** @type {string | null} */ asOf = null) {
    const { data, error } = await supabase.rpc('receivables_aging', asOf ? { p_as_of: asOf } : {});
    if (error) fail(error);
    return data || [];
  },
  async cashBook(/** @type {string} */ from, /** @type {string} */ to) {
    const { data, error } = await supabase.rpc('cash_book', { p_from: from, p_to: to });
    if (error) fail(error);
    return data || {};
  },
  async dashboard(/** @type {string} */ from, /** @type {string} */ to) {
    const { data, error } = await supabase.rpc('analytics_dashboard', { p_from: from, p_to: to });
    if (error) fail(error);
    return data || {};
  },
};

// What the accounting functions refuse, in words the accountant can act on.
export const BOOKS_ERRORS = {
  period_closed: 'That month is closed. An admin has to reopen it before anything dated in it can change.',
  month_not_over: 'A month can be closed only once it is over.',
  not_balanced: 'The entry does not balance: the debits and the credits must add up to the same amount.',
  invalid_lines: 'Each line needs an account and either a debit or a credit, not both.',
  account_not_found: 'One of the accounts is not in the chart of accounts, or it is switched off.',
  invalid_accounts: 'Choose two different money accounts.',
  invalid_amount: 'Enter an amount above zero.',
  invalid_date: 'Choose a date that is not in the future.',
  void_reason_required: 'Give a reason so the record shows why it was cancelled.',
  reason_required: 'Give a reason so the record shows why.',
  note_required: 'Say what needs explaining, so the supervisor knows what to answer.',
  more_than_owed: 'That is more than this supervisor is owed.',
  code_taken: 'That account number is already used.',
  invalid_code: 'An account number is 3 to 6 digits.',
  invalid_name: 'Give the account a name.',
  system_account: 'This account is used by the automatic entries, so it cannot be switched off. It can be renamed.',
  not_found: 'That record was not found. Refresh the page and try again.',
  forbidden: 'Your role cannot do this.',
};

function booksFail(error) {
  const code = Object.keys(BOOKS_ERRORS).find((k) => new RegExp(`\\b${k}\\b`).test(error.message || ''));
  throw new ApiError(code ? BOOKS_ERRORS[code] : error.message, undefined, error);
}

async function booksRpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) booksFail(error);
  return data;
}

// The double-entry books, banking, shift report review and month-end close (finance roles only).
const books = {
  home: async () => (await booksRpc('accounts_home')) || {},
  journal: async (/** @type {string} */ from, /** @type {string} */ to) => (await booksRpc('gl_journal', { p_from: from, p_to: to })) || [],
  trialBalance: async (/** @type {string} */ from, /** @type {string} */ to) => (await booksRpc('gl_trial_balance', { p_from: from, p_to: to })) || [],
  accountLedger: async (/** @type {string} */ code, /** @type {string} */ from, /** @type {string} */ to) => (await booksRpc('gl_account_ledger', { p_code: code, p_from: from, p_to: to })) || [],
  balanceSheet: async (/** @type {string} */ asOf) => (await booksRpc('gl_balance_sheet', { p_as_of: asOf })) || {},
  async accounts() {
    const { data, error } = await supabase.from('gl_accounts').select('*').order('code');
    if (error) booksFail(error);
    return data || [];
  },
  addAccount: (/** @type {string} */ code, /** @type {string} */ name, /** @type {string} */ kind) => booksRpc('gl_add_account', { p_code: code, p_name: name, p_kind: kind }),
  updateAccount: (/** @type {string} */ code, /** @type {string} */ name, /** @type {boolean} */ active) => booksRpc('gl_update_account', { p_code: code, p_name: name, p_active: active }),
  postJournal: (/** @type {string} */ date, /** @type {string} */ memo, /** @type {string | null} */ reference, /** @type {any[]} */ lines) =>
    booksRpc('gl_post_journal', { p_date: date, p_memo: memo, p_reference: reference, p_lines: lines }),
  voidJournal: (/** @type {string} */ id, /** @type {string} */ reason) => booksRpc('gl_void_journal', { p_id: id, p_reason: reason }),
  async transfers(/** @type {string} */ from, /** @type {string} */ to) {
    const { data, error } = await supabase.from('cash_transfers').select('*').gte('transfer_date', from).lte('transfer_date', to)
      .order('transfer_date', { ascending: false }).order('created_date', { ascending: false }).limit(2000);
    if (error) booksFail(error);
    return data || [];
  },
  recordTransfer: (/** @type {any} */ t) => booksRpc('record_cash_transfer', { p_date: t.date, p_from: t.from, p_to: t.to, p_amount: t.amount, p_reference: t.reference || null, p_note: t.note || null }),
  voidTransfer: (/** @type {string} */ id, /** @type {string} */ reason) => booksRpc('void_cash_transfer', { p_id: id, p_reason: reason }),
  supervisorsOwed: async () => (await booksRpc('supervisor_commission_owed')) || [],
  async supervisorPayouts(/** @type {string} */ from, /** @type {string} */ to) {
    const { data, error } = await supabase.from('supervisor_commission_payouts').select('*').gte('pay_date', from).lte('pay_date', to).order('pay_date', { ascending: false }).limit(2000);
    if (error) booksFail(error);
    return data || [];
  },
  paySupervisor: (/** @type {any} */ p) => booksRpc('pay_supervisor_commission', { p_supervisor_id: p.supervisorId, p_amount: p.amount, p_method: p.method, p_date: p.date, p_note: p.note || null }),
  shiftReports: async (/** @type {string} */ from, /** @type {string} */ to) => (await booksRpc('shift_reports_for_review', { p_from: from, p_to: to })) || [],
  reviewShift: (/** @type {string} */ id, /** @type {string} */ status, /** @type {string | null} */ note) => booksRpc('review_shift_report', { p_id: id, p_status: status, p_note: note }),
  periods: async () => (await booksRpc('gl_periods')) || [],
  closePeriod: (/** @type {string} */ month, /** @type {string | null} */ note) => booksRpc('close_period', { p_month: month, p_note: note }),
  reopenPeriod: (/** @type {string} */ month, /** @type {string} */ reason) => booksRpc('reopen_period', { p_month: month, p_reason: reason }),
};

// The supervisor and porter leaderboard (management and admin). Until the roles update is applied it falls back to the dashboard analytics.
const team = {
  async leaderboard(/** @type {string} */ from, /** @type {string} */ to) {
    const { data, error } = await supabase.rpc('team_leaderboard', { p_from: from, p_to: to });
    if (!error) return data || {};
    if (/could not find the function|does not exist|PGRST202/i.test(error.message || error.code || '')) {
      const { data: legacy, error: legacyError } = await supabase.rpc('analytics_dashboard', { p_from: from, p_to: to });
      if (legacyError) fail(legacyError);
      return { supervisors: legacy?.supervisors || [], porters: legacy?.porters || [] };
    }
    fail(error);
    return {};
  },
};

// Roles and the tasks each may perform (admin only). Every change goes through database functions that check the caller.
const roles = {
  /** @returns {Promise<Array<{ key: string, name: string, description: string | null, system: boolean, permissions: string[] }>>} */
  async list() {
    const [r, p] = await Promise.all([
      supabase.from('staff_roles').select('*').order('system', { ascending: false }).order('name'),
      supabase.from('role_permissions').select('role_key,permission'),
    ]);
    if (r.error) fail(r.error);
    if (p.error) fail(p.error);
    const by = new Map();
    for (const row of p.data || []) by.set(row.role_key, [...(by.get(row.role_key) || []), row.permission]);
    return (r.data || []).map((x) => ({ ...x, permissions: (by.get(x.key) || []).sort() }));
  },
  async create(/** @type {string} */ name, /** @type {string} */ description, /** @type {string[]} */ permissions) {
    const { data, error } = await supabase.rpc('create_staff_role', { p_name: name, p_description: description || null, p_permissions: permissions });
    if (error) fail(error);
    return /** @type {string} */ (data);
  },
  async update(/** @type {string} */ key, /** @type {string} */ name, /** @type {string} */ description, /** @type {string[]} */ permissions) {
    const { error } = await supabase.rpc('update_staff_role', { p_key: key, p_name: name, p_description: description || null, p_permissions: permissions });
    if (error) fail(error);
  },
  async remove(/** @type {string} */ key) {
    const { error } = await supabase.rpc('delete_staff_role', { p_key: key });
    if (error) fail(error);
  },
  async assign(/** @type {string} */ userId, /** @type {string} */ key) {
    const { error } = await supabase.rpc('assign_staff_role', { p_user: userId, p_role_key: key });
    if (error) fail(error);
  },
};

// Loosely typed on purpose: rows are plain objects whose shape is defined by the database.
/** @type {any} */
export const api = { entities, functions, storage, settings, profile, crm, porterPay, commissions, finance, books, team, roles };
