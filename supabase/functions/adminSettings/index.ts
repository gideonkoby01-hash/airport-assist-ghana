import { adminClient, appUrl, requireCaller } from '../_shared/auth.ts';
import { buildOverview, clearSecret, resetSetting, saveSecret, saveSettings } from '../_shared/adminSettings.ts';
import { sendTransactionalEmail } from '../_shared/email.ts';
import { HttpError, json, readBody, serve } from '../_shared/http.ts';

// Everything the admin Settings page does. Admin only, and only for a session that passed two-step verification.
// Saved API keys are encrypted and are never sent back to the browser: the page only ever learns whether a key is
// set and its last four characters.
serve('adminSettings', async (req) => {
  const admin = adminClient();
  const user = await requireCaller(req, admin, ['admin']);
  const body = await readBody(req) as Record<string, any>;
  const env = (name: string) => Deno.env.get(name);

  switch (String(body.action || 'get')) {
    case 'get':
      return json(await buildOverview(admin, env));

    case 'save': {
      const result = await saveSettings(admin, user.id, (body.changes ?? {}) as Record<string, unknown>);
      if (!result.ok) throw new HttpError(400, result.error);
      return json({ ok: true, saved: result.saved, overview: await buildOverview(admin, env) });
    }

    case 'reset': {
      const result = await resetSetting(admin, String(body.key || ''));
      if (!result.ok) throw new HttpError(400, result.error);
      return json({ ok: true, overview: await buildOverview(admin, env) });
    }

    case 'save_secret': {
      const result = await saveSecret(admin, user, String(body.name || ''), body.value, env('SETTINGS_ENCRYPTION_KEY'));
      if (!result.ok) throw new HttpError(400, result.error);
      return json({ ok: true, overview: await buildOverview(admin, env) });
    }

    case 'clear_secret': {
      const result = await clearSecret(admin, user, String(body.name || ''));
      if (!result.ok) throw new HttpError(400, result.error);
      return json({ ok: true, overview: await buildOverview(admin, env) });
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

    default:
      throw new HttpError(400, 'Unknown action');
  }
});
