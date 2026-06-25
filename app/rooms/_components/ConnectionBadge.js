'use client';

/**
 * Calm connection indicator. Mandatory per the spec: degrade visibly, never
 * freeze. Reads straight off the connection state machine.
 */

const MAP = {
  idle: { label: 'connecting…', color: 'var(--mf-muted)', pulse: true },
  connecting: { label: 'connecting…', color: 'var(--mf-warn)', pulse: true },
  connected: { label: 'live', color: 'var(--mf-good)', pulse: false },
  reconnecting: { label: 'reconnecting…', color: 'var(--mf-warn)', pulse: true },
  offline: { label: 'offline', color: 'var(--mf-bad)', pulse: false },
  expired: { label: 'gone', color: 'var(--mf-muted)', pulse: false },
};

export default function ConnectionBadge({ state }) {
  const s = MAP[state] || MAP.idle;
  return (
    <span
      title={`connection: ${state}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        fontSize: '0.78rem',
        color: s.color,
        fontWeight: 600,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: s.color,
          boxShadow: `0 0 8px ${s.color}`,
          animation: s.pulse ? 'mfPulse 1.2s ease-in-out infinite' : 'none',
        }}
      />
      {s.label}
      <style>{`@keyframes mfPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </span>
  );
}
