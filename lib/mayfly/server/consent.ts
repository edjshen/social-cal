/**
 * Server-side proof-of-consent recording for SMS marketing (TCPA/CTIA).
 *
 * Writes an append-only row to mayfly_consents each time a user affirmatively
 * opts in (the required checkbox in PhoneGate) while creating a room or joining
 * an ad-hoc room. The row captures phone + the disclosure-text VERSION + when,
 * so consent is auditable independent of the UI.
 *
 * Bump CONSENT_VERSION whenever the disclosure wording changes, so each record
 * points at the exact text the user agreed to.
 */
import { getMayflyDb, mayflySchema } from '../db/index';

const { mayflyConsents } = mayflySchema;

export const CONSENT_VERSION = 'sms-consent-v2-orbit-2026-06-25';

/** True only for an explicit, affirmative opt-in. */
export function hasConsent(value: unknown): value is true {
  return value === true;
}

/** Append a proof-of-consent row. Throws on DB error (caller catches). */
export async function logConsent({
  phone,
  context,
  roomId,
}: {
  phone: string;
  context: 'create' | 'join';
  roomId?: string | null;
}) {
  const db = getMayflyDb();
  await db.insert(mayflyConsents).values({
    id: crypto.randomUUID(),
    phone,
    consentVersion: CONSENT_VERSION,
    context,
    roomId: roomId ?? null,
    createdAt: new Date().toISOString(),
  });
}
