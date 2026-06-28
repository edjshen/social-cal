/**
 * Per-room crypto session — binds a room key + a presenting profile + the
 * device HLC into the two operations the app needs:
 *
 *   buildPublish(body)      -> { id, frame, message }  (sign + encrypt + stamp)
 *   verifyAndDecrypt(event) -> { ok, body } | { ok:false, reason }
 *
 * Confidentiality: the body JSON is secretbox-encrypted with the room key.
 * Authenticity: an Ed25519 signature covers the ciphertext + routing metadata
 * (roomId, sender pubkey, hlc, kind), so a relay or peer cannot spoof or reorder
 * a profile's messages. A profile's public key IS its identity within the room.
 */
import { nanoid } from 'nanoid';
import {
  encryptString,
  decryptString,
  sign,
  verify,
  envelopeBytes,
  toB64,
  fromB64,
} from '@/lib/mayfly/shared/crypto.js';
import { HybridLogicalClock } from '@/lib/mayfly/shared/hlc.js';

export function createRoomSession({ roomId, key, profile, nodeId }) {
  const clock = new HybridLogicalClock(nodeId);
  const profilePub = toB64(profile.publicKey);
  const secretKey = profile.secretKey;

  /**
   * Encrypt + sign + stamp an application message body.
   * @param {object} body  e.g. { kind:'text', text:'hi' }
   */
  function buildPublish(body) {
    const hlc = clock.now();
    const kind = body.kind;
    const ciphertext = encryptString(JSON.stringify(body), key);
    // id is generated BEFORE signing so the signature binds it (see envelopeBytes).
    const id = nanoid(21);
    const sigBytes = sign(
      envelopeBytes({ roomId, id, profilePub, hlc, kind, ciphertext }),
      secretKey
    );
    const frame = {
      type: 'publish',
      id,
      hlc,
      kind,
      ciphertext,
      sig: toB64(sigBytes),
      profilePub,
    };
    return { id, hlc, frame };
  }

  /**
   * Verify the signature, then decrypt. Treat the relay as untrusted: never
   * surface unverified or undecryptable content (security checklist §20).
   * @returns {{ ok: true, body: object } | { ok: false, reason: string }}
   */
  function verifyAndDecrypt(event) {
    let senderPub;
    try {
      senderPub = fromB64(event.profilePub);
    } catch {
      return { ok: false, reason: 'bad-pubkey' };
    }
    let ok = false;
    try {
      ok = verify(
        fromB64(event.sig),
        envelopeBytes({
          roomId,
          id: event.id,
          profilePub: event.profilePub,
          hlc: event.hlc,
          kind: event.kind,
          ciphertext: event.ciphertext,
        }),
        senderPub
      );
    } catch {
      ok = false;
    }
    if (!ok) return { ok: false, reason: 'bad-sig' };

    // Advance our logical clock ONLY on an authenticated remote stamp. Observing
    // before verification let an outsider (who knows only the roomId) inject a
    // bad-sig frame with a huge wallMillis and permanently poison our clock.
    clock.observe(event.hlc);

    try {
      const body = JSON.parse(decryptString(event.ciphertext, key));
      return { ok: true, body };
    } catch {
      // Authentic but undecryptable (wrong key / corrupt) — caller renders a
      // neutral placeholder rather than crashing.
      return { ok: false, reason: 'undecryptable' };
    }
  }

  return { profilePub, clock, buildPublish, verifyAndDecrypt };
}
