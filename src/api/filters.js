// Pure query-translation helpers (no Supabase import, so they can be unit tested in Node).
// Turn the Mongo-style filters the app uses into PostgREST builder calls.
//
// Supported: equality, null, $or, $and, $in, $gte, $lte, $gt, $lt, $ne and case-insensitive
// $regex (treated as "contains this text").

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message || 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const OPS = { $gte: 'gte', $lte: 'lte', $gt: 'gt', $lt: 'lt', $ne: 'neq' };

// A value inside a PostgREST logic string: quote anything that could break the syntax.
function lit(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  return `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// $regex is only used for "contains this text, any case": turn it into ILIKE.
function likePattern(term) {
  const text = String(term).replace(/\\(.)/g, '$1').replace(/[%_]/g, (c) => '\\' + c);
  return `%${text}%`;
}

// One field condition as a PostgREST string, e.g. status.in.("a","b").
function conditionStrings(field, cond) {
  if (cond === null || typeof cond !== 'object' || Array.isArray(cond)) {
    return [cond === null ? `${field}.is.null` : `${field}.eq.${lit(cond)}`];
  }
  const out = [];
  for (const [op, v] of Object.entries(cond)) {
    if (OPS[op]) out.push(`${field}.${OPS[op]}.${lit(v)}`);
    else if (op === '$in') out.push(`${field}.in.(${v.map(lit).join(',')})`);
    else if (op === '$regex') out.push(`${field}.ilike.${lit(likePattern(v))}`);
    else if (op === '$options') continue;
    else throw new ApiError(`Unsupported filter operator ${op}`, 400);
  }
  return out;
}

function logicString(filter) {
  const parts = [];
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === '$or') parts.push(`or(${value.map(logicString).join(',')})`);
    else if (key === '$and') parts.push(`and(${value.map(logicString).join(',')})`);
    else parts.push(...conditionStrings(key, value));
  }
  return parts.length === 1 ? parts[0] : `and(${parts.join(',')})`;
}

function applyCondition(builder, field, cond) {
  if (cond === null) return builder.is(field, null);
  if (typeof cond !== 'object' || Array.isArray(cond)) return builder.eq(field, cond);
  for (const [op, v] of Object.entries(cond)) {
    if (OPS[op]) builder = builder[OPS[op]](field, v);
    else if (op === '$in') builder = builder.in(field, v);
    else if (op === '$regex') builder = builder.ilike(field, likePattern(v));
    else if (op !== '$options') throw new ApiError(`Unsupported filter operator ${op}`, 400);
  }
  return builder;
}

export function applyFilter(builder, filter) {
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === '$or') builder = builder.or(value.map(logicString).join(','));
    else if (key === '$and') for (const clause of value) builder = applyFilter(builder, clause);
    else builder = applyCondition(builder, key, value);
  }
  return builder;
}

export function applySort(builder, sort) {
  if (!sort) return builder;
  for (const part of String(sort).split(',')) {
    const field = part.trim();
    if (!field) continue;
    builder = field.startsWith('-')
      ? builder.order(field.slice(1), { ascending: false })
      : builder.order(field.replace(/^\+/, ''), { ascending: true });
  }
  return builder;
}

