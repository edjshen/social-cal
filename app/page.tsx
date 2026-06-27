import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

export default async function Home() {
  const s = await getSession();
  if (s.userId) redirect('/discover');

  return (
    <div className="auth">
      <div className="logo"><span className="mark" /> Barycal</div>
      <p className="tag">your life in orbit</p>

      <p style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 14, lineHeight: 1.6, marginBottom: 32, maxWidth: 300, margin: '0 auto 32px' }}>
        Share your calendar with friends and find time together — without the back-and-forth.
      </p>

      <Link className="btn solid block" href="/register">Get started</Link>
      <Link className="btn block" href="/login" style={{ marginTop: 10 }}>Log in</Link>

      <div className="footnote">powered by plur.nyc</div>
    </div>
  );
}
