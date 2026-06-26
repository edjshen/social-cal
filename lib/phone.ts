/**
 * Tiny phone-number normalizer / validator. US-only.
 * Returns the number in E.164 form (+1XXXXXXXXXX) on success, or null
 * if the input doesn't look like a valid US phone.
 */
export function normalizePhoneUS(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}
