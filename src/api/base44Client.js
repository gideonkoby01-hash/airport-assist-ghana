import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// The SDK's declared types are narrower than what the app relies on at runtime
// (paged `{ items }` results, `users.inviteUser`), so expose it loosely typed.
/** @type {any} */
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  appBaseUrl
});
