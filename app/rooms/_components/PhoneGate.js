'use client';

import { useState } from 'react';
import styles from '../rooms.module.css';
import { PHONE_MARKETING_CONSENT, PHONE_CONSENT_CHECKBOX } from './copy';

/**
 * Phone verification gate (Twilio Verify, via /api/rooms/*). Used before
 * creating a room and before joining an ad-hoc user room. Public per-event
 * rooms skip this entirely.
 *
 * Flow: enter phone → POST /api/rooms/verify/start → (if OTP required) enter
 * code → onSubmit({ phone, code }). The parent's onSubmit performs the actual
 * create/join POST (which re-verifies the code server-side) and returns
 * { ok, error } so wrong codes surface here.
 *
 * @param {{ purpose?: string, onSubmit: (v:{phone:string,code:string|null})=>Promise<{ok:boolean,error?:string}>, onCancel: ()=>void }} props
 */
export default function PhoneGate({ purpose = 'continue', onSubmit, onCancel }) {
  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendCode(e) {
    e?.preventDefault();
    if (busy) return;
    if (!consented) {
      setError('Please check the box to agree to receive texts.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/rooms/verify/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not send a code. Try again.');
        return;
      }
      setStep('code');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e) {
    e?.preventDefault();
    if (busy) return;
    await finish(code);
  }

  async function finish(codeValue) {
    setError('');
    setBusy(true);
    try {
      const r = await onSubmit({ phone, code: codeValue, consent: consented });
      if (!r?.ok) setError(r?.error || 'That did not work. Try again.');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={styles.card}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}
    >
      <strong>verify your number to {purpose}</strong>
      <p className={styles.muted} style={{ margin: 0, fontSize: '0.8rem' }}>
        we text a one-time code. your number is logged with the room — messages stay end-to-end
        encrypted and aren’t stored.
      </p>

      {step === 'phone' ? (
        <form
          onSubmit={sendCode}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        >
          <input
            className={styles.input}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-label="phone number"
          />
          <label
            className={styles.muted}
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'flex-start',
              fontSize: '0.72rem',
              lineHeight: 1.4,
            }}
          >
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              style={{ marginTop: 2, flexShrink: 0 }}
              aria-label="agree to receive texts"
            />
            <span>{PHONE_CONSENT_CHECKBOX}</span>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="submit"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={busy || !phone.trim() || !consented}
            >
              {busy ? 'sending…' : 'text me a code'}
            </button>
            <button type="button" className={styles.btn} onClick={onCancel} disabled={busy}>
              cancel
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={submitCode}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        >
          <input
            className={styles.input}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            aria-label="verification code"
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="submit"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={busy || code.length < 4}
            >
              {busy ? 'verifying…' : 'verify'}
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => setStep('phone')}
              disabled={busy}
            >
              back
            </button>
          </div>
        </form>
      )}

      {error ? <span style={{ color: 'var(--mf-bad)', fontSize: '0.82rem' }}>{error}</span> : null}

      <p
        className={styles.muted}
        style={{ margin: 0, fontSize: '0.66rem', lineHeight: 1.4, opacity: 0.8 }}
      >
        {PHONE_MARKETING_CONSENT}
      </p>
    </div>
  );
}
