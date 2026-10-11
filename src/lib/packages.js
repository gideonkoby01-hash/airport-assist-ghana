// Service package definitions and shared helpers for Airport Assist Ghana.
// These mirror the seeded ServicePackage entity records and act as a fallback.

export const PACKAGE_DEFINITIONS = [
  {
    code: "full_arrival",
    name: "Full Arrival Assist",
    price: 700,
    flight_type: "arrival",
    includes_lounge: true,
    inclusions:
      "Meet & greet at the airbridge, Fast-track immigration, Luggage assistance, Customs clearance support, Lounge access, Ground transfer coordination.",
    exclusions: "Airline ticket, Visa fees, Hotel accommodation.",
  },
  {
    code: "full_departure",
    name: "Full Departure Assist",
    price: 850,
    flight_type: "departure",
    includes_lounge: true,
    inclusions:
      "Curbside meet & greet, Check-in assistance, Fast-track security & immigration, Lounge access, Boarding assistance.",
    exclusions: "Airline ticket, Visa fees, In-flight meals.",
  },
  {
    code: "departure_priority",
    name: "Departure Priority Only",
    price: 400,
    flight_type: "departure",
    includes_lounge: false,
    inclusions: "Fast-track security & immigration, Priority boarding.",
    exclusions: "Lounge access, Check-in assistance, Ground transfer.",
  },
  {
    code: "porter_only",
    name: "Porter Service Only",
    price: 100,
    flight_type: "both",
    includes_lounge: false,
    inclusions: "Luggage handling and porter escort across the terminal.",
    exclusions: "Immigration fast-track, Lounge access, Any other service.",
  },
];

export const PORTER_COMMISSION_PER_PASSENGER = 30;

export const STATUS_LABELS = {
  confirmed: "Confirmed",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const PAYMENT_STATUS_LABELS = {
  paid: "Paid",
  partially_paid: "Partially Paid",
  unpaid: "Unpaid",
};

export const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  card: "Card",
  corporate_account: "Corporate Account",
};

export const PACKAGE_LABELS = {
  full_arrival: "Full Arrival Assist",
  full_departure: "Full Departure Assist",
  departure_priority: "Departure Priority Only",
  porter_only: "Porter Service Only",
};

export function packageByCode(code) {
  return PACKAGE_DEFINITIONS.find((p) => p.code === code) || null;
}

export function computeTotal(pricePerPassenger, numPassengers) {
  return Number(pricePerPassenger || 0) * Number(numPassengers || 0);
}

export function porterCommission(passengersHandled) {
  return PORTER_COMMISSION_PER_PASSENGER * Number(passengersHandled || 0);
}

export function generateReference() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4).padEnd(4, "0");
  return `AAG-${ymd}-${rand}`;
}

// Africa/Accra is UTC+0 (GMT), so we can build shift bounds directly in UTC.
export function shiftBounds(dateStr, shiftType) {
  const base = new Date(`${dateStr}T00:00:00Z`);
  if (shiftType === "morning") {
    const start = new Date(base);
    start.setUTCHours(6, 0, 0, 0);
    const end = new Date(base);
    end.setUTCHours(18, 0, 0, 0);
    return { start, end };
  }
  const start = new Date(base);
  start.setUTCHours(18, 0, 0, 0);
  const end = new Date(base);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCHours(6, 0, 0, 0);
  return { start, end };
}

export function formatGHS(amount) {
  const n = Number(amount || 0);
  return `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function roleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "management") return "Management";
  if (role === "supervisor") return "Supervisor";
  return "Passenger";
}