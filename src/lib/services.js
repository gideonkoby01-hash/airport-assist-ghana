// Adding a service (package) from the admin screen: the code made from the name, what the form checks, and how a service is
// told apart. Pure functions, tested in services.test.mjs.

export const SERVICE_KINDS = [
  {
    key: "meet_assist",
    label: "Meet and assist",
    help: "A supervisor meets the passenger and takes them through. A porter is optional, and the supervisor earns the meet and assist commission. Like Full Arrival or Departure Priority.",
  },
  {
    key: "porter",
    label: "Porter service",
    help: "A porter for every passenger, and no supervisor commission. Like Porter Service Only.",
  },
];

export const SERVICE_DIRECTIONS = [
  { key: "arrival", label: "Arrival" },
  { key: "departure", label: "Departure" },
  { key: "both", label: "Arrival and departure" },
];

const CODE_RE = /^[a-z][a-z0-9_]{1,39}$/;

/** Is this a porter-type service? A service or its code; `list` is the service list, for a code. Unknown codes keep the original rule. */
export function isPorterService(service, list = []) {
  if (service && typeof service === "object") {
    if (service.kind) return service.kind === "porter";
    return service.code === "porter_only";
  }
  const found = (list || []).find((p) => p.code === service);
  if (found) return found.kind ? found.kind === "porter" : found.code === "porter_only";
  return service === "porter_only";
}

/** "VIP Fast Track" becomes "vip_fast_track". A name that starts with a digit gets "svc_" first. Never longer than 40. */
export function codeFromName(name) {
  let code = String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (code && !/^[a-z]/.test(code)) code = `svc_${code}`;
  return code.slice(0, 40).replace(/_+$/, "");
}

/** The first code from the name that no existing service uses: vip_fast_track, then vip_fast_track_2, and so on. */
export function freeCode(name, existingCodes) {
  const base = codeFromName(name);
  if (!base) return "";
  const taken = new Set(existingCodes || []);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const suffix = `_${i}`;
    const candidate = `${base.slice(0, 40 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return "";
}

const money = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

/**
 * Check the "Add a service" form. Returns { problems, value } where `problems` maps a field to a message (empty when fine) and
 * `value` is what to save. Direction "both" is for porter services only.
 */
export function checkNewService(form, existingCodes = []) {
  const problems = {};
  const name = String(form.name || "").trim();
  const code = String(form.code || "").trim();
  const description = String(form.description || "").trim();
  const price = money(form.price);
  const usd = form.price_usd === "" || form.price_usd === null || form.price_usd === undefined ? null : Number(form.price_usd);

  if (name.length < 3) problems.name = "Give the service a name of at least 3 letters.";
  else if (name.length > 80) problems.name = "Keep the name under 80 characters.";
  if (!CODE_RE.test(code)) problems.code = "The code is 2 to 40 lower-case letters, numbers or underscores, starting with a letter.";
  else if ((existingCodes || []).includes(code)) problems.code = "Another service already uses this code. Change it.";
  if (!["meet_assist", "porter"].includes(form.kind)) problems.kind = "Choose what kind of service this is.";
  if (!["arrival", "departure", "both"].includes(form.flight_type)) problems.flight_type = "Choose arrival, departure or both.";
  else if (form.flight_type === "both" && form.kind !== "porter") problems.flight_type = "A meet and assist service is for arrivals or departures. Only a porter service can work in both.";
  if (!(price > 0)) problems.price = "Enter the price per passenger in cedis.";
  else if (price > 100000) problems.price = "That price looks too high. Check it.";
  if (usd !== null && !(usd > 0)) problems.price_usd = "Leave the dollar price empty, or enter an amount above zero.";
  if (description.length > 200) problems.description = "Keep the summary under 200 characters.";

  const value = {
    code,
    name,
    kind: form.kind,
    flight_type: form.flight_type,
    price: Math.round((Number.isFinite(price) ? price : 0) * 100) / 100,
    price_usd: usd === null ? null : Math.round(usd * 100) / 100,
    description: description || null,
    inclusions: String(form.inclusions || "").trim(),
    exclusions: "",
    includes_lounge: form.kind === "meet_assist" && form.flight_type === "departure" ? Boolean(form.includes_lounge) : false,
    active: form.active !== false,
  };
  return { problems, value };
}

/** Plain words for what the database refuses. */
export function serviceSaveMessage(error) {
  const text = String(error?.message || error || "");
  if (/service_packages_code_key|duplicate key/i.test(text)) return "Another service already uses that code. Change the code and save again.";
  if (/service_packages_code_format/.test(text)) return "The code is 2 to 40 lower-case letters, numbers or underscores, starting with a letter.";
  if (/service_packages_kind_direction/.test(text)) return "A meet and assist service is for arrivals or departures. Only a porter service can work in both.";
  if (/service_code_is_fixed/.test(text)) return "A service's code cannot be changed once it exists.";
  if (/row-level security|42501|forbidden/i.test(text)) return "Only an admin can add or change services.";
  return text || "The service could not be saved.";
}
