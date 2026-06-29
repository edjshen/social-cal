import Link from 'next/link';
import { withNext } from '@/lib/url';

// Shown when a logged-out visitor opens a link to content that requires an
// account (e.g. a private event). It deliberately reveals NO details about the
// gated content — just a branded prompt to log in or sign up. Both buttons carry
// a validated `next` so the visitor returns to exactly where they were headed.
export default function AuthWall({
  next,
  title = 'Sign in to continue',
  message = 'Log in or sign up to view this.',
}: {
  next: string;
  title?: string;
  message?: string;
}) {
  return (
    <div className="auth">
      <div className="logo">
        <span className="mark" /> Barycal
      </div>
      <p className="tag">your life in orbit</p>
      <div className="card" style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 500 }}>{title}</div>
        <p style={{ color: 'var(--dim)', fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>{message}</p>
      </div>
      <Link className="btn solid block" style={{ marginTop: 16 }} href={withNext('/login', next)}>
        Log in
      </Link>
      <Link className="btn block" style={{ marginTop: 10 }} href={withNext('/register', next)}>
        Sign up
      </Link>
      <div className="footnote">powered by plur.nyc</div>
    </div>
  );
}
