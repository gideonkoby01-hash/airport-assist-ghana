import { adminClient, appUrl, requireCaller } from '../_shared/auth.ts';
import { buildOverview, clearSecret, resetSetting, saveSecret, saveSettings, superAdminState } from '../_shared/adminSettings.ts';
import { getSecret, loadSettings } from '../_shared/config.ts';
import { sendSms } from '../_shared/sms.ts';
import { sendTransactionalEmail } from '../_shared/email.ts';
import { checkKey, keyMode, PaystackError } from '../_shared/paystack.ts';
import { loadSmtpConfig } from '../_shared/emailConfig.ts';
import { describeSmtpError, verifySmtp } from '../_shared/smtp.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

// Everything the admin Settings page does. Admin only, and only for a session that passed two-step verification.
// Saved API keys are encrypted and are never sent back to the browser: the page only ever learns whether a key is
// set and its last four characters.
serve('adminSettings', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['admin']);
  const body = await readBody(req) as Record<string, any>;
  const env = (name: string) => Deno.env.get(name);
  // Some settings (the public website switch) can be changed only by the super admin, once one has been set.
  const sa = await superAdminState(admin, user.id);
  const canChangeSuperOnly = { superAdmin: !sa.set || sa.you };

  switch (String(body.action || 'get')) {
    case 'get':
      return json(await buildOverview(admin, env, user.id));

    case 'save': {
      const result = await saveSettings(admin, user.id, (body.changes ?? {}) as Record<string, unknown>, canChangeSuperOnly);
      if (!result.ok) throw new HttpError(result.error.startsWith('Only the super admin') ? 403 : 400, result.error);
      return json({ ok: true, saved: result.saved, overview: await buildOverview(admin, env, user.id) });
    }

    case 'reset': {
      const result = await resetSetting(admin, String(body.key || ''), canChangeSuperOnly);
      if (!result.ok) throw new HttpError(result.error.startsWith('Only the super admin') ? 403 : 400, result.error);
      return json({ ok: true, overview: await buildOverview(admin, env, user.id) });
    }

    case 'save_secret': {
      const result = await saveSecret(admin, user, String(body.name || ''), body.value, env('SETTINGS_ENCRYPTION_KEY'));
      if (!result.ok) throw new HttpError(400, result.error);
      return json({ ok: true, overview: await buildOverview(admin, env, user.id) });
    }

    case 'clear_secret': {
      const result = await clearSecret(admin, user, String(body.name || ''));
      if (!result.ok) throw new HttpError(400, result.error);
      return json({ ok: true, overview: await buildOverview(admin, env, user.id) });
    }

    case 'test_smtp': {
      // Connects and signs in to the saved SMTP server without sending anything.
      const hits = await admin.rpc('hit_rate_limit', { p_key: `test-smtp:${user.id}`, p_window_seconds: 3600 });
      if ((hits.data ?? 0) > 10) throw new HttpError(429, 'That is enough connection tests for now. Try again in an hour.');
      const { smtp, problem } = await loadSmtpConfig(admin);
      if (!smtp) return json({ ok: false, message: problem });
      try {
        await verifySmtp(smtp);
        return json({ ok: true, message: `Connected to ${smtp.host}:${smtp.port}${smtp.username ? ' and signed in' : ''}. Send yourself a test email to finish checking.` });
      } catch (e) {
        return json({ ok: false, message: describeSmtpError(e, smtp) });
      }
    }

    case 'test_paystack': {
      // Asks Paystack a harmless question with the saved key: it answers only if the key is genuine.
      const hits = await admin.rpc('hit_rate_limit', { p_key: `test-paystack:${user.id}`, p_window_seconds: 3600 });
      if ((hits.data ?? 0) > 10) throw new HttpError(429, 'That is enough key checks for now. Try again in an hour.');
      const secret = await getSecret(admin, 'PAYSTACK_SECRET_KEY', { fresh: true });
      if (!secret) return json({ ok: false, message: 'Save the Paystack secret key first.' });
      try {
        await checkKey(secret);
        const mode = keyMode(secret);
        return json({ ok: true, mode, message: mode === 'live'
          ? 'Paystack accepted the key. It is a LIVE key: payments will move real money.'
          : 'Paystack accepted the key. It is a TEST key: payments are practice only and move no real money.' });
      } catch (e) {
        if (e instanceof PaystackError) return json({ ok: false, message: e.message });
        throw e;
      }
    }

    case 'test_email': {
      // Five a hour is plenty for checking a setup and stops the button being used to send mail.
      const hits = await admin.rpc('hit_rate_limit', { p_key: `test-email:${user.id}`, p_window_seconds: 3600 });
      if ((hits.data ?? 0) > 5) throw new HttpError(429, 'That is enough test emails for now. Try again in an hour.');
      const result = await sendTransactionalEmail(admin, {
        eventKey: `test:${crypto.randomUUID()}`, templateName: 'TestEmail', to: user.email, userId: user.id,
        variables: { first_name: (user.full_name || user.email).trim().split(/\s+/)[0], sent_at: new Date().toUTCString(), cta_url: `${appUrl()}/admin?tab=settings` },
      });
      // Say plainly what happened, including why a send failed (for example an unverified sender domain).
      return json({ ok: result.sent, status: result.status, message: result.sent ? `A test email was sent to ${user.email}. Check your inbox (and spam).` : (result.message ?? 'The test email could not be sent.') });
    }

    case 'test_sms': {
      // Sends a text to the number the admin types, with the saved Hubtel details. Five an hour: it costs credit and must not become a way to send texts.
      const hits = await admin.rpc('hit_rate_limit', { p_key: `test-sms:${user.id}`, p_window_seconds: 3600 });
      if ((hits.data ?? 0) > 5) throw new HttpError(429, 'That is enough test texts for now. Try again in an hour.');
      const settings = await loadSettings(admin);
      const result = await sendSms(admin, {
        eventKey: `test:${crypto.randomUUID()}`, to: body.phone, test: true,
        text: `${settings.str('company_name') || 'Airport Assist Ghana'}: this is a test text. Text messages are working.`,
      });
      return json({ ok: result.sent, status: result.status, message: result.sent ? 'The test text was sent. It should reach the phone within a minute.' : (result.message ?? 'The test text could not be sent.') });
    }

    default:
      throw new HttpError(400, 'Unknown action');
  }
});
