'use server';
import QRCode from 'qrcode';
import { requireUserId } from '../auth/session';
import { encryptSecret, decryptSecret } from '../auth/crypto';
import {
  newTotpSecret,
  totpAuthUri,
  verifyTotp,
  newRecoveryCodes,
  hashRecoveryCode,
} from '../auth/mfa';
import {
  getMfaCredential,
  upsertMfaCredential,
  confirmMfaCredential,
  replaceRecoveryCodes,
} from '../db/mfa-queries';

export async function startMfaEnrollment(): Promise<{ qrDataUrl: string; secret: string }> {
  const userId = await requireUserId();
  const secret = newTotpSecret();
  await upsertMfaCredential(userId, await encryptSecret(secret));
  const svg = await QRCode.toString(totpAuthUri(secret, userId), { type: 'svg' });
  const qrDataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
  return { qrDataUrl, secret }; // secret shown as manual-entry fallback
}

export async function confirmMfaEnrollment(token: string): Promise<{ recoveryCodes: string[] }> {
  const userId = await requireUserId();
  const cred = await getMfaCredential(userId);
  if (!cred) throw new Error('NO_PENDING_MFA');
  const secret = await decryptSecret(cred.secretEnc);
  if (!verifyTotp(secret, token)) throw new Error('BAD_CODE');
  await confirmMfaCredential(userId);
  const codes = newRecoveryCodes();
  await replaceRecoveryCodes(userId, await Promise.all(codes.map(hashRecoveryCode)));
  return { recoveryCodes: codes };
}
