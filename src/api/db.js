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
      throw new ApiError(/nothing_due/.test(error.message || '') ? 'There is nothing left to pay this porter for that day.' : error.message, undefined, error);
    }
  },
};

// Loosely typed on purpose: rows are plain objects whose shape is defined by the database.
/** @type {any} */
export const api = { entities, functions, storage, settings, profile, crm, porterPay };
