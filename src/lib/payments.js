// Pure helpers for the online payment screens (kept apart from the components so they can be tested).

/** Where Paystack sends the passenger back to: it adds ?reference=... (and trxref=...) to our return address. */
export function returnReference(search) {
  const params = new URLSearchParams(search || "");
  const ref = (params.get("reference") || params.get("trxref") || "").trim();
  return /^[A-Za-z0-9._=-]{8,100}$/.test(ref) ? ref : "";
}

/** The page where a passenger pays a booking (the link in the confirmation email). */
export function payPath(booking) {
  return `/pay?booking=${encodeURIComponent(booking.id)}&ref=${encodeURIComponent(booking.reference || "")}`;
}

/** The booking named in a /pay address, or null when the link is incomplete. */
export function readPayLink(search) {
  const params = new URLSearchParams(search || "");
  const bookingId = (params.get("booking") || "").trim();
  const reference = (params.get("ref") || "").trim();
  return /^[0-9a-f-]{36}$/i.test(bookingId) && reference ? { bookingId, reference } : null;
}

/** How often the return page asks again while Paystack has not said yet, and how many times. */
export const VERIFY_POLL = { delayMs: 3000, maxChecks: 8 };

/** What the return page says for each outcome. */
export const RESULT_COPY = {
  paid: { tone: "good", title: "Payment received", body: "Thank you. Your booking is paid. A receipt is on its way to your email." },
  review: {
    tone: "warn",
    title: "We received your payment, and we are checking it",
    body: "Your payment went through, but we need to match it to your booking. Our team will contact you. Please do not pay again.",
  },
  failed: { tone: "bad", title: "The payment was not completed", body: "No money was taken for this attempt. You can try again, or pay at the airport." },
  pending: {
    tone: "wait",
    title: "Still waiting for Paystack",
    body: "Paystack has not confirmed the payment yet. If you were charged, it will show on your booking shortly and we will email you. Please do not pay again straight away.",
  },
};

/** Wording about how to pay, which depends on whether online payment is switched on (settings.paystack_enabled). */
export function payWording(settings) {
  const online = settings?.paystack_enabled === "true";
  return {
    online,
    short: online ? "Pay online, or at the airport." : "You pay at the airport; nothing is taken online.",
    faq: online
      ? "You can pay online by card or mobile money after you book, or in person at the airport when you meet our team. Paying online is optional."
      : "You pay in person at the airport when you meet our team. No payment is taken online when you book.",
    trustTitle: online ? "Pay online or in person" : "Pay at the airport",
    trustText: online ? "Card, mobile money or at the airport" : "Nothing taken online",
    bullet: online ? "Pay online or at the airport" : "Pay at the airport, not online",
  };
}
