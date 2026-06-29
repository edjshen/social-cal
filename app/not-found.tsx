import Link from 'next/link';

// Branded fallback for every notFound() — unknown links, ghost-redacted content,
// and private events/profiles a logged-in viewer isn't permitted to see. Kept
// generic so it never confirms whether a given private resource exists.
export default function NotFound() {
  return (
    <div className="auth">
      <div className="logo">
        <span className="mark" /> Barycal
      </div>
      <p className="tag">your life in orbit</p>
      <div className="card" style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 500 }}>Not found</div>
        <p style={{ color: 'var(--dim)', fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
          This page doesn&rsquo;t exist, or you don&rsquo;t have access to it.
        </p>
      </div>
      <Link className="btn solid block" style={{ marginTop: 16 }} href="/">
        Go home
      </Link>
      <div className="footnote">powered by plur.nyc</div>
    </div>
  );
}
