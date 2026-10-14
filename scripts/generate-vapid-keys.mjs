// Generates a VAPID key pair for Web Push in the standard base64url format
// (the same format as `npx web-push generate-vapid-keys`).
//
//   node scripts/generate-vapid-keys.mjs
//
// Put VAPID_PUBLIC_KEY in .env as VITE_VAPID_PUBLIC_KEY, and set VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY and VAPID_SUBJECT as Supabase edge function secrets.
// The private key is printed to your terminal only; never commit it.
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });

const b64 = (s) => Buffer.from(s, 'base64url');
const rawPublic = Buffer.concat([Buffer.from([4]), b64(pub.x), b64(pub.y)]).toString('base64url');

console.log(`VAPID_PUBLIC_KEY=${rawPublic}`);
console.log(`VAPID_PRIVATE_KEY=${priv.d}`);
console.log('VAPID_SUBJECT=mailto:you@example.com');
