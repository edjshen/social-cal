/**
 * Shared legal/consent copy for Mayfly. Kept in one place so the phone-entry
 * gate and the rooms home show identical wording.
 *
 * This is written toward US SMS "express written consent" (TCPA / CTIA): it
 * names the sender, discloses recurring automated marketing + autodialer use,
 * states consent is not a condition of purchase, gives frequency + rate
 * language, and provides STOP/HELP opt-out.
 *
 * NOT LEGAL ADVICE — have counsel review. Two recommended hardening steps the
 * code can't decide for you:
 *   1. Add a Privacy Policy + SMS Terms page and link them in the text below
 *      (replace the trailing sentence's plain reference with real links).
 *   2. For the strongest record of consent, gate submission behind an explicit
 *      unchecked checkbox ("I agree to receive texts…") rather than passive
 *      fine print. PhoneGate is structured to accept that easily.
 */

export const PHONE_MARKETING_CONSENT =
  'By entering your phone number and using Orbit rooms, you agree to receive recurring ' +
  'automated marketing and account text messages (such as event drops and ticket info) from ' +
  'Orbit at the number you provide, including messages sent using an automatic telephone ' +
  'dialing system. Consent is not a condition of any purchase. Message frequency varies. ' +
  'Message & data rates may apply. Reply STOP to unsubscribe or HELP for help.';

// Short label for the explicit (required, unchecked) opt-in checkbox shown at
// the point of collection. The full disclosure above is rendered alongside it.
export const PHONE_CONSENT_CHECKBOX =
  'I agree to receive recurring automated marketing & account texts from Orbit at this ' +
  'number. Consent is not a condition of purchase. Msg & data rates may apply; reply STOP to opt out.';
