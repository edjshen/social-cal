import { describe, it, expect } from 'vitest';
import * as OTPAuth from 'otpauth';
import { newTotpSecret, totpAuthUri, verifyTotp, newRecoveryCodes } from './mfa';
import { hashRecoveryCode, verifyRecoveryCode } from './mfa';

describe('TOTP', () => {
  it('verifies a freshly generated code and rejects a wrong one', () => {
    const secret = newTotpSecret();
    const live = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate();
    expect(verifyTotp(secret, live)).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(false);
  });
  it('builds an otpauth:// URI carrying the label + secret', () => {
    const uri = totpAuthUri('SECRET32', 'ed');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('secret=SECRET32');
  });
});

describe('recovery codes', () => {
  it('generates 10 distinct codes', () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });
  it('hashes + verifies a code (and rejects a wrong one)', async () => {
    const [code] = newRecoveryCodes();
    const hash = await hashRecoveryCode(code);
    expect(await verifyRecoveryCode(code, hash)).toBe(true);
    expect(await verifyRecoveryCode('nope', hash)).toBe(false);
  });
});
