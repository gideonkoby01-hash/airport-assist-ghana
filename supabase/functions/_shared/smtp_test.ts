// Run: deno test --allow-all supabase/functions/_shared/smtp_test.ts
// These tests talk to a real SMTP server (the smtp-server package) running on this machine, so the wire behaviour
// (sign-in, TLS, refusals, message content) is exercised, not imitated.
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { SMTPServer } from 'smtp-server';
import { describeSmtpError, htmlToText, sendViaSmtp, verifySmtp } from './smtp.ts';

interface Mail { from: string; to: string[]; raw: string }

async function withServer(
  opts: ConstructorParameters<typeof SMTPServer>[0],
  run: (port: number, inbox: Mail[]) => Promise<void>,
) {
  const inbox: Mail[] = [];
  const server = new SMTPServer({
    logger: false,
    onAuth(auth, _s, cb) { auth.username === 'mailer' && auth.password === 'p4ss word' ? cb(null, { user: 'mailer' }) : cb(new Error('Invalid login')); },
    onMailFrom(address, _s, cb) { address.address.endsWith('@blocked.example') ? cb(Object.assign(new Error('550 sender not allowed'), { responseCode: 550 })) : cb(); },
    onData(stream, session, cb) {
      let raw = '';
      stream.on('data', (c: Uint8Array) => (raw += new TextDecoder().decode(c)));
      stream.on('end', () => { inbox.push({ from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '', to: session.envelope.rcptTo.map((r) => r.address), raw }); cb(); });
    },
    ...opts,
  });
  // A client that refuses our self-signed certificate makes the server report a TLS alert; that is the expected outcome.
  server.on('error', () => {});
  const port = await new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.server.address() as { port: number }).port)));
  try { await run(port, inbox); } finally { await new Promise<void>((r) => server.close(() => r())); }
}

const base = { host: '127.0.0.1', username: 'mailer', password: 'p4ss word' } as const;
const message = { from: 'Airport Assist Ghana <noreply@example.com>', to: 'passenger@example.org', subject: 'Your booking', html: '<h1>Booked</h1><p>See you at <b>Terminal 3</b> &amp; welcome.</p>' };

Deno.test('plain connection with sign-in: the message arrives with sender, recipient, subject, HTML and a text part', async () => {
  await withServer({ authOptional: false, allowInsecureAuth: true, disabledCommands: ['STARTTLS'] }, async (port, inbox) => {
    const result = await sendViaSmtp({ ...base, port, security: 'none' }, message);
    assertStringIncludes(result.messageId, '@example.com');
    assertEquals(inbox.length, 1);
    assertEquals(inbox[0].to, ['passenger@example.org']);
    assertEquals(inbox[0].from, 'noreply@example.com');
    assertStringIncludes(inbox[0].raw, 'Subject: Your booking');
    assertStringIncludes(inbox[0].raw, 'Content-Type: text/html');
    assertStringIncludes(inbox[0].raw, 'Content-Type: text/plain');
    assertStringIncludes(inbox[0].raw, 'See you at Terminal 3 & welcome.');
  });
});

Deno.test('a password with spaces works, a wrong one is explained without revealing anything', async () => {
  await withServer({ authOptional: false, allowInsecureAuth: true, disabledCommands: ['STARTTLS'] }, async (port) => {
    await verifySmtp({ ...base, port, security: 'none' });
    let said = '';
    try { await verifySmtp({ ...base, port, security: 'none', password: 'wrong' }); } catch (e) { said = describeSmtpError(e, { host: base.host, port, security: 'none' }); }
    assertStringIncludes(said, 'refused the username or password');
    assertStringIncludes(said, 'app password');
    assertEquals(said.includes('wrong'), false);
  });
});

Deno.test('SSL/TLS (port 465 style): certificates are verified, so a self-signed server is refused unless a test allows it', async () => {
  await withServer({ secure: true, authOptional: false }, async (port, inbox) => {
    let said = '';
    try { await sendViaSmtp({ ...base, port, security: 'ssl' }, message); } catch (e) { said = describeSmtpError(e, { host: base.host, port, security: 'ssl' }); }
    assertStringIncludes(said, 'certificate');
    assertEquals(inbox.length, 0);
    await sendViaSmtp({ ...base, port, security: 'ssl' }, message, { allowSelfSigned: true });
    assertEquals(inbox.length, 1);
  });
});

Deno.test('STARTTLS (port 587 style) upgrades the connection before signing in', async () => {
  await withServer({ secure: false, authOptional: false }, async (port, inbox) => {
    await sendViaSmtp({ ...base, port, security: 'starttls' }, message, { allowSelfSigned: true });
    assertEquals(inbox.length, 1);
  });
});

Deno.test('STARTTLS is required, never silently skipped: a server without it is refused', async () => {
  await withServer({ authOptional: false, allowInsecureAuth: true, disabledCommands: ['STARTTLS'] }, async (port, inbox) => {
    let failed = false;
    try { await sendViaSmtp({ ...base, port, security: 'starttls' }, message); } catch { failed = true; }
    assertEquals(failed, true);
    assertEquals(inbox.length, 0);
  });
});

Deno.test('a server that needs no sign-in works with an empty username', async () => {
  await withServer({ authOptional: true, disabledCommands: ['STARTTLS', 'AUTH'] }, async (port, inbox) => {
    await sendViaSmtp({ host: base.host, port, security: 'none', username: '', password: '' }, message);
    assertEquals(inbox.length, 1);
  });
});

Deno.test('a refused sender is explained, with the server\'s own words', async () => {
  await withServer({ authOptional: false, allowInsecureAuth: true, disabledCommands: ['STARTTLS'] }, async (port) => {
    let said = '';
    try { await sendViaSmtp({ ...base, port, security: 'none' }, { ...message, from: 'x@blocked.example' }); } catch (e) { said = describeSmtpError(e, { host: base.host, port, security: 'none' }); }
    assertStringIncludes(said, 'refused the message');
    assertStringIncludes(said, 'sender address');
  });
});

Deno.test('nothing listening, and an unknown server, are explained', async () => {
  const closed = await new Promise<number>((resolve) => { const l = Deno.listen({ port: 0, hostname: '127.0.0.1' }); const p = (l.addr as Deno.NetAddr).port; l.close(); resolve(p); });
  let said = '';
  try { await verifySmtp({ ...base, port: closed, security: 'none' }); } catch (e) { said = describeSmtpError(e, { host: base.host, port: closed, security: 'none' }); }
  assertStringIncludes(said, 'Could not connect');
  assertStringIncludes(said, 'port');
  let said2 = '';
  try { await verifySmtp({ ...base, host: 'no-such-host.invalid', port: 465, security: 'ssl' }); } catch (e) { said2 = describeSmtpError(e, { host: 'no-such-host.invalid', port: 465, security: 'ssl' }); }
  assertStringIncludes(said2, 'not found');
});

Deno.test('the plain-text version keeps the words and drops the markup', () => {
  assertEquals(htmlToText('<style>p{color:red}</style><p>Hello&nbsp;<b>Ama</b></p><p>Tom &amp; Jerry</p>'), 'Hello Ama\nTom & Jerry');
});
