'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import styles from '../rooms.module.css';
import { roomUrl, shareOrCopyRoom } from '../_client/cast/link.js';
import { wordsForRoom } from '../_client/cast/threewords.js';
import { nfcSupported, writeRoomToTag } from '../_client/cast/nfc.js';
import { buildFragment } from '@/lib/mayfly/shared/credential.js';
import { keyToFragment } from '@/lib/mayfly/shared/crypto.js';

/**
 * Cast a room into the air: link (always works), three-words, chirp (sound),
 * NFC (Android). Chirp is loaded lazily so its WASM never touches SSR or other
 * routes.
 */
export default function CastSheet({ room, onClose }) {
  const [linkState, setLinkState] = useState('');
  const [casting, setCasting] = useState(false);
  const [mode, setMode] = useState('audible');
  const [nfcMsg, setNfcMsg] = useState('');
  const [qr, setQr] = useState('');
  const stopRef = useRef(null);

  const words = wordsForRoom(room);
  const fragment = buildFragment(room.id, keyToFragment(room.key), {
    event: room.event,
    expiresAt: room.desiredExpiresAt,
  });

  // Render a QR of the room link for scan-to-join.
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(roomUrl(room), {
      margin: 1,
      width: 320,
      color: { dark: '#0a0a0f', light: '#ececf2' },
    })
      .then((url) => alive && setQr(url))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  // Stop any active chirp when the sheet closes / mode changes / unmounts.
  useEffect(() => {
    return () => {
      if (stopRef.current) stopRef.current();
      stopRef.current = null;
    };
  }, []);

  async function toggleChirp() {
    if (casting) {
      stopRef.current?.();
      stopRef.current = null;
      setCasting(false);
      return;
    }
    try {
      const { castPayload, chirpSupported } = await import('../_client/cast/chirp.js');
      if (!chirpSupported()) {
        setNfcMsg('sound casting not supported on this device');
        return;
      }
      const stop = await castPayload(fragment, mode);
      stopRef.current = stop;
      setCasting(true);
    } catch {
      setNfcMsg('could not start the chirp');
    }
  }

  async function doLink() {
    const res = await shareOrCopyRoom(room);
    setLinkState(res === 'copied' ? 'link copied' : res === 'shared' ? 'shared' : 'copy failed');
    setTimeout(() => setLinkState(''), 2500);
  }

  async function doNfc() {
    try {
      await writeRoomToTag(roomUrl(room));
      setNfcMsg('tap a tag to write…');
    } catch {
      setNfcMsg('NFC write failed');
    }
  }

  return (
    <div
      className={styles.card}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong>cast this room</strong>
        <button
          type="button"
          className={styles.btn}
          onClick={onClose}
          aria-label="close cast sheet"
        >
          done
        </button>
      </div>

      <p className={styles.muted} style={{ margin: 0, fontSize: '0.82rem' }}>
        {room.mode === 'open'
          ? 'open room — anyone who hears the three words can join.'
          : 'sealed room — only the chirp, link, or NFC tag can join (the words are just a name).'}
      </p>

      {/* Three words */}
      <div>
        <div className={styles.muted} style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>
          three words
        </div>
        <div style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '0.01em' }}>{words}</div>
      </div>

      {/* QR */}
      {qr ? (
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="scan to join this room"
            width={160}
            height={160}
            style={{ borderRadius: 12, border: '1px solid var(--mf-border)' }}
          />
          <span className={styles.muted} style={{ fontSize: '0.72rem' }}>
            point a camera here to join
          </span>
        </div>
      ) : null}

      {/* Chirp */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className={`${styles.btn} ${casting ? '' : styles.btnPrimary}`}
            onClick={toggleChirp}
          >
            {casting ? '◼ stop chirp' : '🔊 chirp it'}
          </button>
          <label
            className={styles.muted}
            style={{ fontSize: '0.8rem', display: 'flex', gap: '0.3rem', alignItems: 'center' }}
          >
            <input
              type="checkbox"
              checked={mode === 'ultrasonic'}
              disabled={casting}
              onChange={(e) => setMode(e.target.checked ? 'ultrasonic' : 'audible')}
            />
            ultrasonic
          </label>
        </div>
        {casting ? (
          <span className={styles.muted} style={{ fontSize: '0.78rem' }}>
            broadcasting on a loop — nearby phones can “listen” to catch it.
          </span>
        ) : null}
      </div>

      {/* Link + NFC */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className={styles.btn} onClick={doLink}>
          🔗 {linkState || 'share link'}
        </button>
        {nfcSupported() ? (
          <button type="button" className={styles.btn} onClick={doNfc}>
            📲 write NFC tag
          </button>
        ) : null}
      </div>
      {nfcMsg ? (
        <span className={styles.muted} style={{ fontSize: '0.78rem' }}>
          {nfcMsg}
        </span>
      ) : null}
    </div>
  );
}
