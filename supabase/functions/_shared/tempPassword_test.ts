// Run: deno test supabase/functions/_shared/tempPassword_test.ts
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { generateTempPassword } from './tempPassword.ts';

Deno.test('16 characters with every kind, and no look-alikes', () => {
  for (let i = 0; i < 200; i++) {
    const p = generateTempPassword();
    assertEquals(p.length, 16);
    assert(/[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p) && /[#$%&*+=?]/.test(p), p);
    assert(!/[0O1lI]/.test(p), `look-alike in ${p}`);
  }
});
Deno.test('two passwords differ', () => {
  assertNotEquals(generateTempPassword(), generateTempPassword());
});
