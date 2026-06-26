'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '../rooms.module.css';
import { parseFragment } from '@/lib/mayfly/shared/credential.js';
import { fromB64, keyFromFragment } from '@/lib/mayfly/shared/crypto.js';
import { isValidThreeWords } from '../_client/cast/threewords.js';
import { resolveOpenWords } from '../_client/store/rooms.js';
import { startQrScan, qrScanSupported } from '../_client/cast/qr-scan.js';

/**
 * Catch a room: listen for a chirp, scan a QR, paste a link, or type three
 * words (open rooms only). Each path resolves to a credential handed to
 * onCatch — the parent saves it instantly (even offline) and connects.
 *
 * Mic/camera are requested only from an explicit gesture (or an `intent`
 * deep-link from the floating launcher), never silently on load.
 */
export default function CatchListener({ onCatch, intent = null }) {
  const [listening, setListening] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [words, setWords] = useState('');
  const [error, setError] = useState('');
  const stopRef = useRef(null);
  const scanStopRef = useRef(null);
  const videoRef = useRef(null);
  const wordsRef = useRef(null);

  useEffect(() => {
    return () => {
      if (stopRef.current) stopRef.current();
      if (scanStopRef.current) scanStopRef.current();
      stopRef.current = null;
      scanStopRef.current = null;
    };
  }, []);

  function fromCredential(parsed) {
    if (!parsed) return false;
    try {
      onCatch({
        idBytes: fromB64(parsed.id),
        key: keyFromFragment(parsed.k),
        event: parsed.event,
        expiresAt: parsed.expiresAt,
      });
      return true;
    } catch {
      return false;
    }
  }

  async function toggleListen() {
    if (listening) {
      stopRef.current?.();
      stopRef.current = null;
      setListening(false);
      return;
    }
    setError('');
    try {
      const { listenForPayload, chirpSupported } = await import('../_client/cast/chirp.js');
      if (!chirpSupported()) {
        setError('listening for sound is not supported on this device');
        return;
      }
      const stop = await listenForPayload((payload) => {
        const parsed = parseFragment(payload);
        if (parsed && fromCredential(parsed)) {
          stop();
          stopRef.current = null;
          setListening(false);
        }
      });
      stopRef.current = stop;
      setListening(true);
    } catch {
      setError('mic permission denied or unavailable');
    }
  }

  async function toggleScan() {
    if (scanning) {
      scanStopRef.current?.();
      scanStopRef.current = null;
      setScanning(false);
      return;
    }
    setError('');
    if (!qrScanSupported()) {
      setError('camera scanning is not supported on this device');
      return;
    }
    setScanning(true);
    try {
      // videoRef mounts with `scanning` true; wait a tick for it to exist.
      await new Promise((r) => setTimeout(r, 0));
      const stop = await startQrScan(videoRef.current, (text) => {
        const parsed = parseFragment(text);
        if (parsed && fromCredential(parsed)) {
          stop();
          scanStopRef.current = null;
          setScanning(false);
        }
      });
      scanStopRef.current = stop;
    } catch {
      setScanning(false);
      setError('camera permission denied or unavailable');
    }
  }

  // Deep-link intents from the floating launcher (?go=listen|scan|words).
  useEffect(() => {
    if (intent === 'listen') toggleListen();
    else if (intent === 'scan') toggleScan();
    else if (intent === 'words') wordsRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  function submitLink(e) {
    e.preventDefault();
    setError('');
    const parsed = parseFragment(linkText.trim());
    if (!fromCredential(parsed)) setError('that link does not look like a room');
    else setLinkText('');
  }

  async function submitWords(e) {
    e.preventDefault();
    setError('');
    if (!isValidThreeWords(words)) {
      setError('type the three words exactly');
      return;
    }
    try {
      const { idBytes, key } = await resolveOpenWords(words);
      onCatch({ idBytes, key });
      setWords('');
    } catch {
      setError('could not resolve those words');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`${styles.btn} ${listening ? '' : styles.btnPrimary}`}
          onClick={toggleListen}
          style={{ flex: 1 }}
        >
          {listening ? '◼ listening…' : '👂 listen for a chirp'}
        </button>
        <button
          type="button"
          className={`${styles.btn} ${scanning ? '' : styles.btnPrimary}`}
          onClick={toggleScan}
          style={{ flex: 1 }}
        >
          {scanning ? '◼ stop scan' : '📷 scan a QR'}
        </button>
      </div>

      {scanning ? (
        <video
          ref={videoRef}
          muted
          playsInline
          style={{
            width: '100%',
            maxHeight: 260,
            objectFit: 'cover',
            borderRadius: 12,
            border: '1px solid var(--mf-border)',
            background: '#000',
          }}
        />
      ) : null}

      <form onSubmit={submitLink} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          className={styles.input}
          placeholder="paste a room link"
          value={linkText}
          onChange={(e) => setLinkText(e.target.value)}
          aria-label="room link"
        />
        <button type="submit" className={styles.btn} disabled={!linkText.trim()}>
          go
        </button>
      </form>

      <form onSubmit={submitWords} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          ref={wordsRef}
          className={styles.input}
          placeholder="three words (open rooms)"
          value={words}
          onChange={(e) => setWords(e.target.value)}
          aria-label="three words"
        />
        <button type="submit" className={styles.btn} disabled={!words.trim()}>
          join
        </button>
      </form>

      {error ? <span style={{ color: 'var(--mf-bad)', fontSize: '0.8rem' }}>{error}</span> : null}
    </div>
  );
}
