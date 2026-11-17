// What the public website shows before the settings have loaded, or if they cannot be loaded. These match the defaults in
// supabase/functions/_shared/settingsRegistry.ts (a test keeps them in step).
export const PUBLIC_DEFAULTS = {
  company_name: "Airport Assist Ghana",
  contact_email: "moehamedi@gmail.com",
  contact_phone: "+233 537 755 063 / +233 246 222 777",
  contact_address: "39 Ring Road East, Nyaniba [GL-030-6750]",
  online_bookings_enabled: "true",
  online_bookings_message: "Online booking is paused right now. Please contact the Airport Assist desk.",
  porter_commission_per_passenger: "30",
  extra_porter_fee: "100",
};
