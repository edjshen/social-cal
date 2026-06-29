'use client';
import Link from 'next/link';

// Branded recovery UI for unexpected render / server-action errors, so a thrown
// error shows a retry path instead of Next's raw error screen.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="auth">
      <div className="logo">
        <span className="mark" /> Barycal
      </div>
      <p className="tag">your life in orbit</p>
      <div className="card" style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 500 }}>
          Something went wrong
        </div>
        <p style={{ color: 'var(--dim)', fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
          An unexpected error occurred. Please try again.
        </p>
      </div>
      <button className="btn solid block" style={{ marginTop: 16 }} onClick={() => reset()}>
        Try again
      </button>
      <Link className="btn block" style={{ marginTop: 10 }} href="/">
        Go home
      </Link>
      <div className="footnote">powered by plur.nyc</div>
    </div>
  );
}
