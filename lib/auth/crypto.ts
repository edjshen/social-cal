import { getCloudflareContext } from '@opennextjs/cloudflare';

// ponytail: spread btoa — safe for the tiny secrets here (<1k bytes); don't reuse for large blobs (String.fromCharCode spread stack-overflows ~124k).
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const enc = new TextEncoder();
const dec = new TextDecoder();

async function importKey(keyBytes: Uint8Array) {
  return crypto.subtle.importKey('raw', keyBytes as Uint8Array<ArrayBuffer>, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function aesEncrypt(keyBytes: Uint8Array, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(keyBytes);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
      key,
      enc.encode(plain) as Uint8Array<ArrayBuffer>
    )
  );
  return `${b64(iv)}:${b64(ct)}`;
}

export async function aesDecrypt(keyBytes: Uint8Array, stored: string): Promise<string> {
  const parts = stored.split(':');
  if (parts.length !== 2) throw new Error('aesDecrypt: malformed stored value');
  const [ivB64, ctB64] = parts;
  const key = await importKey(keyBytes);
  const ivBytes = unb64(ivB64) as Uint8Array<ArrayBuffer>;
  const ctBytes = unb64(ctB64) as Uint8Array<ArrayBuffer>;
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, ctBytes);
  return dec.decode(pt);
}

// 32-byte key from the MFA_ENCRYPTION_KEY Worker secret (base64), env-read like
// SESSION_SECRET. ponytail: throws loud if unset — a silent empty key is worse.
function mfaKey(): Uint8Array {
  const e = getCloudflareContext().env as unknown as { MFA_ENCRYPTION_KEY?: string };
  const k = e.MFA_ENCRYPTION_KEY ?? process.env.MFA_ENCRYPTION_KEY;
  if (!k) throw new Error('MFA_ENCRYPTION_KEY is not set');
  const bytes = unb64(k);
  if (bytes.length !== 32)
    throw new Error(`MFA_ENCRYPTION_KEY must be 32 bytes, got ${bytes.length}`);
  return bytes;
}

export const encryptSecret = (plain: string) => aesEncrypt(mfaKey(), plain);
export const decryptSecret = (stored: string) => aesDecrypt(mfaKey(), stored);
