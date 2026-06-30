'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startMfaEnrollment, confirmMfaEnrollment } from '@/lib/actions/mfa';

export default function MfaEnroll() {
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (codes)
    return (
      <div>
        <h2>Save your recovery codes</h2>
        <ul>
          {codes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
        <p>Each works once. Store them somewhere safe.</p>
        <button className="btn solid" onClick={() => router.refresh()}>
          Done
        </button>
      </div>
    );

  return (
    <div>
      {!qr ? (
        <button
          className="btn solid"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await startMfaEnrollment();
              setQr(r.qrDataUrl);
              setSecret(r.secret);
            } finally {
              setBusy(false);
            }
          }}
        >
          Enable two-factor
        </button>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setErr('');
            setBusy(true);
            try {
              setCodes((await confirmMfaEnrollment(token)).recoveryCodes);
            } catch {
              setErr('That code didn’t match. Try again.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- inline data:image/svg+xml QR; next/image can't optimize data URLs */}
          <img src={qr} alt="Scan with your authenticator app" width={200} height={200} />
          <p>
            Or enter this key manually: <code>{secret}</code>
          </p>
          <div className="field">
            <label htmlFor="enroll-code">Verification code</label>
            <input
              id="enroll-code"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="123456"
            />
          </div>
          <button type="submit" className="btn solid" disabled={busy}>
            Confirm
          </button>
          {err && (
            <p role="alert" className="error">
              {err}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
