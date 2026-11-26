// What the passenger is told about how they hear about their booking. The rule: every service is confirmed by text message to the phone
// number on the booking, and every service except Porter Service Only also sends a receipt by email (an email address is required).
// For Porter Service Only the email is optional. Pure functions, tested in bookingNotices.test.mjs.

/** The label and help under the email box. */
export function emailFieldCopy({ porterService, smsOn }) {
  if (porterService) {
    return {
      label: "Email address (optional)",
      help: smsOn
        ? "We text your confirmation to your phone number. Add an email address if you would also like a copy by email."
        : "Add an email address if you would like your confirmation by email. Otherwise the Airport Assist desk will contact you by phone.",
    };
  }
  return {
    label: "Email address *",
    help: smsOn
      ? "You do not need an account. We email your receipt to this address and text your confirmation, your supervisor's details and any update on your booking to your phone number."
      : "You do not need an account. We email your confirmation, your supervisor's details and any update on your booking to this address. If you do not receive an email, the Airport Assist desk will contact you by phone.",
  };
}

/** The sentence on the confirmation screen saying where the confirmation went. */
export function confirmationLine({ porterService, smsOn, email, phone }) {
  const mail = String(email || "").trim();
  const tel = String(phone || "").trim();
  if (porterService) {
    if (smsOn) return mail ? `We are texting your confirmation to ${tel} and emailing a copy to ${mail}. Keep your reference.` : `We are texting your confirmation to ${tel}. Keep your reference.`;
    return mail
      ? `We are emailing your confirmation to ${mail}. Keep your reference. If you do not receive it, the Airport Assist desk will contact you by phone.`
      : `Your booking is confirmed. Keep your reference. The Airport Assist desk will contact you on ${tel}.`;
  }
  return smsOn
    ? `We are emailing your receipt to ${mail} and texting your confirmation to ${tel}. You will be told by email and text when a supervisor is assigned, and if the status or a payment changes. Keep your reference.`
    : `We are emailing your confirmation to ${mail}. You will get another email when a supervisor is assigned, and if the status or a payment changes. Keep your reference. If you do not receive an email, the Airport Assist desk will contact you by phone.`;
}
