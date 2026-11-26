import test from 'node:test';
import assert from 'node:assert/strict';
import { emailFieldCopy, confirmationLine } from './bookingNotices.js';

test('the email box is optional for Porter Service Only and required for the others', () => {
  assert.equal(emailFieldCopy({ porterService: true, smsOn: true }).label, 'Email address (optional)');
  assert.equal(emailFieldCopy({ porterService: false, smsOn: true }).label, 'Email address *');
  assert.match(emailFieldCopy({ porterService: true, smsOn: true }).help, /text your confirmation/);
  assert.match(emailFieldCopy({ porterService: false, smsOn: true }).help, /email your receipt/);
  assert.match(emailFieldCopy({ porterService: true, smsOn: false }).help, /desk will contact you/);
});

test('porter service: the text is the confirmation, the email only a copy', () => {
  assert.equal(confirmationLine({ porterService: true, smsOn: true, email: '', phone: '024 123 4567' }), 'We are texting your confirmation to 024 123 4567. Keep your reference.');
  assert.match(confirmationLine({ porterService: true, smsOn: true, email: 'a@b.co', phone: '024' }), /texting your confirmation to 024 and emailing a copy to a@b\.co/);
});

test('other services: an emailed receipt and a texted confirmation', () => {
  const t = confirmationLine({ porterService: false, smsOn: true, email: 'a@b.co', phone: '024 123 4567' });
  assert.match(t, /emailing your receipt to a@b\.co and texting your confirmation to 024 123 4567/);
});

test('with text messages switched off, nobody is promised a text', () => {
  for (const porterService of [true, false]) {
    for (const email of ['a@b.co', '']) {
      assert.doesNotMatch(confirmationLine({ porterService, smsOn: false, email, phone: '024' }), /text/i);
    }
  }
  assert.match(confirmationLine({ porterService: true, smsOn: false, email: '', phone: '024' }), /desk will contact you on 024/);
});
