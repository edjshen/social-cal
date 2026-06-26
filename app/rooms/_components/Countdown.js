'use client';

import { useEffect, useState } from 'react';

/**
 * Live countdown to a room's expiry. Uses SERVER time: the parent passes
 * `serverNow()` (Date.now() + offset from the welcome frame), so a skewed device
 * clock can't show the wrong remaining time. Renders nothing until expiresAt is
 * known. Time is read inside the interval (an effect), never during render.
 */
function fmt(ms) {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function Countdown({ expiresAt, serverNow }) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(null);
      return undefined;
    }
    const compute = () => {
      const now = serverNow ? serverNow() : Date.now();
      setRemaining(expiresAt - now);
    };
    compute();
    const t = setInterval(compute, 1000);
    return () => clearInterval(t);
  }, [expiresAt, serverNow]);

  if (remaining == null) return null;
  const urgent = remaining < 60 * 60 * 1000; // last hour

  return (
    <span
      title="this room self-destructs at zero"
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontSize: '0.82rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: urgent ? 'var(--mf-bad)' : 'var(--mf-muted)',
      }}
    >
      ⏳ {fmt(remaining)}
    </span>
  );
}
