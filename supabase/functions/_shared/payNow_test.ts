import { assertEquals } from 'jsr:@std/assert@1';
import { payLink } from './payNow.ts';
import { renderTemplate } from './email.ts';

Deno.test('the pay link carries the booking id and reference, escaped', () => {
  assertEquals(payLink({ id: 'abc-123', reference: 'AAG 1/2' }, 'https://site.example'), 'https://site.example/pay?booking=abc-123&ref=AAG%201%2F2');
});

Deno.test('the confirmation with a pay link has the button; the plain one does not', () => {
  const vars = { first_name: 'Ama', order_id: 'AAG-1', item_name: 'S', flight_line: 'F', travel_line: 'T', direction_line: 'Arrival', travelers_line: '1', total: 'GHS 700.00' };
  const pay = renderTemplate('BookingConfirmationPay', { ...vars, pay_url: 'https://site.example/pay?booking=b&ref=AAG-1' });
  assertEquals(pay.html.includes('href="https://site.example/pay?booking=b&amp;ref=AAG-1"'), true);
  assertEquals(pay.html.includes('Pay now'), true);
  assertEquals(pay.html.includes('{{'), false);
  assertEquals(renderTemplate('BookingConfirmation', vars).html.includes('Pay now'), false);
});
