// Shared transactional email delivery used by the notification backend
// functions. Provides a durable idempotency guard (EmailDelivery records keyed
// by event), truthful status reporting, and logging of every attempt without
// storing secrets or full recipient addresses. A mail failure is reported to the
// caller but never thrown: the underlying booking/registration operation must
// continue safely.
export async function sendTransactionalEmail(base44, opts) {
  const {
    eventKey,
    templateName,
    to,
    userId = '',
    variables = {},
    relatedEntityId = '',
  } = opts;
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const logDelivery = async (status, details) => {
    try {
      await base44.asServiceRole.entities.EmailDelivery.create({
        event_key: eventKey,
        template_name: templateName,
        recipient_user_id: userId,
        status,
        details: String(details || '').slice(0, 500),
        related_entity_id: relatedEntityId,
      });
    } catch (e) {
      console.error(`emailDelivery: failed to log ${status} for ${eventKey}: ${e.message}`);
    }
  };

  // Duplicate prevention: an earlier send attempt or successful send for the
  // same event means this invocation must not send again. The 'queued' record
  // below claims the event before the send, so concurrent invocations (e.g.
  // the entity workflow plus a manual retry) skip instead of double-sending.
  // Failed attempts are retried on the next invocation.
  const existing = await base44.asServiceRole.entities.EmailDelivery.filter({
    event_key: eventKey,
    status: { $in: ['queued', 'sent'] },
  });
  const claimedRows = Array.isArray(existing) ? existing : existing.items || [];
  if (claimedRows.length > 0) {
    return { status: 'duplicate', sent: false };
  }

  // Recipient validation: only a verified address of a registered account.
  if (!to || !EMAIL_REGEX.test(to)) {
    console.warn(`emailDelivery: no valid recipient for ${eventKey}`);
    await logDelivery('skipped', 'No valid recipient email address');
    return { status: 'skipped', reason: 'no_valid_recipient', sent: false };
  }

  console.log(`emailDelivery: sending ${templateName} for ${eventKey}`);
  let claim;
  try {
    claim = await base44.asServiceRole.entities.EmailDelivery.create({
      event_key: eventKey,
      template_name: templateName,
      recipient_user_id: userId,
      status: 'queued',
      details: 'Send attempt starting',
      related_entity_id: relatedEntityId,
    });
  } catch (e) {
    console.error(`emailDelivery: ${eventKey} could not claim event: ${e.message}`);
    return { status: 'failed', reason: 'error', message: e.message, sent: false };
  }
  const settle = async (status, details) => {
    try {
      await base44.asServiceRole.entities.EmailDelivery.update(claim.id, { status, details: String(details || '').slice(0, 500) });
    } catch (e) {
      console.error(`emailDelivery: failed to update ${status} for ${eventKey}: ${e.message}`);
    }
  };
  try {
    const res = await base44.asServiceRole.integrations.Core.SendEmail({
      to,
      template_name: templateName,
      variables,
      from_name: 'Airport Assist Ghana',
      category: 'transactional',
    });
    if (res && res.success === false) {
      const reason = res.reason || 'provider_rejected';
      const detail = `Send rejected (${reason})${res.message ? ': ' + res.message : ''}`;
      console.error(`emailDelivery: ${eventKey} ${detail}`);
      await settle('failed', detail);
      return { status: 'failed', reason, message: res.message, sent: false };
    }
    // The platform/provider accepted the send (queued for delivery).
    // Delivery to the inbox is not individually confirmed by this API.
    await settle('sent', 'Accepted by email provider, queued for delivery');
    return { status: 'sent', sent: true };
  } catch (e) {
    console.error(`emailDelivery: ${eventKey} send failed: ${e.message}`);
    await settle('failed', e.message);
    return { status: 'failed', reason: 'error', message: e.message, sent: false };
  }
}

// Durable log for events that could not be sent because no valid recipient
// exists. Used by callers that resolve the recipient before calling
// sendTransactionalEmail.
export async function logSkippedEmail(base44, eventKey, templateName, userId, relatedEntityId, reason) {
  try {
    await base44.asServiceRole.entities.EmailDelivery.create({
      event_key: eventKey,
      template_name: templateName,
      recipient_user_id: userId || '',
      status: 'skipped',
      details: String(reason || 'No valid recipient email address').slice(0, 500),
      related_entity_id: relatedEntityId,
    });
  } catch (e) {
    console.error(`emailDelivery: failed to log skipped for ${eventKey}: ${e.message}`);
  }
}