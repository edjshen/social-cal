import { scrypt } from '@noble/hashes/scrypt';
import { randomBytes } from '@noble/hashes/utils';

const N = 2 ** 15,
  r = 8,
  p = 1,
  dkLen = 32;
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const enc = (s: string) => new TextEncoder().encode(s);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = scrypt(enc(password), salt, { N, r, p, dkLen });
  return `${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split('$');
  if (!saltB64 || !hashB64) return false;
  try {
    const hash = scrypt(enc(password), unb64(saltB64), { N, r, p, dkLen });
    const a = b64(hash),
      b = hashB64;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  } catch {
    // Malformed stored hash (e.g. bad base64) → reject rather than throw a 500.
    return false;
  }
}
