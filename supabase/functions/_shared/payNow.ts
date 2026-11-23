import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { appUrl } from './auth.ts';
import { getSecret, loadSettings } from './config.ts';

/** Is online payment switched on and ready (the switch is on and a Paystack key is saved)? */
export async function onlinePaymentOpen(admin: SupabaseClient): Promise<boolean> {
  const settings = await loadSettings(admin);
  if (settings.str('paystack_enabled') !== 'true') return false;
  return Boolean(await getSecret(admin, 'PAYSTACK_SECRET_KEY'));
}

/** The page where a passenger pays a booking: the booking's id and reference are what let them in. */
export function payLink(booking: { id: string; reference?: string | null }, base: string = appUrl()): string {
  return `${base}/pay?booking=${encodeURIComponent(booking.id)}&ref=${encodeURIComponent(String(booking.reference ?? ''))}`;
}
