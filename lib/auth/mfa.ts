import * as OTPAuth from 'otpauth';
import { hashPassword, verifyPassword } from './password';

const ISSUER = 'Barycal';

export function newTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function totpAuthUri(secretBase32: string, label: string): string {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  }).toString();
}

// ±1 time-step window absorbs clock drift; null from validate() = no match.
export function verifyTotp(secretBase32: string, token: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secretBase32) });
    return totp.validate({ token, window: 1 }) !== null;
  } catch {
    return false; // malformed secret → reject auth, never 500
  }
}

// 10 codes, formatted xxxx-xxxx. Crockford base32 (32 chars, no i/l/o/u) so
// `byte & 31` is bias-free; CRYPTO randomness — these are a real auth credential.
export function newRecoveryCodes(n = 10): string[] {
  const A = '0123456789abcdefghjkmnpqrstvwxyz';
  const one = () => {
    const b = crypto.getRandomValues(new Uint8Array(8));
    const c = Array.from(b, (x) => A[x & 31]);
    return c.slice(0, 4).join('') + '-' + c.slice(4).join('');
  };
  return Array.from({ length: n }, one);
}

export const hashRecoveryCode = (code: string) => hashPassword(code);
export const verifyRecoveryCode = (code: string, hash: string) => verifyPassword(code, hash);
