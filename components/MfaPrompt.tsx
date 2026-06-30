'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyMfaStepUp, useRecoveryCode } from '@/lib/actions/auth';

export default function MfaPrompt() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErr('');
        setBusy(true);
        try {
          const r = recovery ? await useRecoveryCode(token) : await verifyMfaStepUp(token);
          if (r.ok) router.push('/discover');
          else setErr('Couldn’t verify that code. Check it, or wait a moment and try again.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="mfa-code">{recovery ? 'Recovery code' : 'Verification code'}</label>
        <input
          id="mfa-code"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="one-time-code"
          inputMode={recovery ? 'text' : 'numeric'}
          placeholder={recovery ? 'recovery code' : '123456'}
        />
      </div>
      <button type="submit" className="btn solid block" disabled={busy}>
        Verify
      </button>
      <button
        type="button"
        className="btn block"
        style={{ marginTop: 8 }}
        onClick={() => setRecovery((v) => !v)}
      >
        {recovery ? 'Use authenticator code' : 'Use a recovery code'}
      </button>
      {err && (
        <p role="alert" className="error">
          {err}
        </p>
      )}
    </form>
  );
}
