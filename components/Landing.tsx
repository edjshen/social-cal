import Link from 'next/link';

const NODES = [
  { ring: 'r1', cls: 'free', label: 'Free' },
  { ring: 'r2', cls: 'plan', label: 'Plans' },
  { ring: 'r3', cls: 'event', label: 'Events' },
] as const;

const SATS = [
  { ring: 'r1', cls: 'scene', deg: 150 },
  { ring: 'r2', cls: 'free', deg: 70 },
  { ring: 'r2', cls: 'event', deg: 250 },
  { ring: 'r3', cls: 'violet', deg: 40 },
  { ring: 'r3', cls: 'amber', deg: 200 },
] as const;

function Orbit() {
  return (
    <div className="lp-orbit" aria-hidden>
      <span className="lp-glow" />
      {(['r3', 'r2', 'r1'] as const).map((r) => (
        <span key={r} className={`lp-ring ${r}`}>
          {SATS.filter((s) => s.ring === r).map((s, i) => (
            <i key={i} className="lp-sat" style={{ transform: `rotate(${s.deg}deg)` }}>
              <i className={`lp-dot ${s.cls}`} />
            </i>
          ))}
          {NODES.filter((n) => n.ring === r).map((n) => (
            <span key={n.label} className="lp-node">
              <span className={`lp-node-in ${n.cls}`}>
                <i className="lp-node-dot" />
                {n.label}
              </span>
            </span>
          ))}
        </span>
      ))}
      <span className="lp-core">
        <span className="lp-core-label">you</span>
      </span>
    </div>
  );
}

const FEATURES = [
  {
    cls: 'free',
    title: 'Your calendar is your profile',
    body: 'Share when you’re actually free — not just what you’ve already done. Your availability is the first thing people see.',
  },
  {
    cls: 'plan',
    title: 'See your people’s orbit',
    body: 'Know who’s around this week and who’s drifting. Barycal surfaces the friends worth pulling back into the gravity well.',
  },
  {
    cls: 'event',
    title: 'Plans, events & scenes',
    body: 'Standing hangs, one-off parties, and the whole scene live in one place — so making plans takes a tap, not a thread.',
  },
];

export default function Landing() {
  return (
    <div className="lp" id="top">
      <header className="lp-nav">
        <a className="lp-brand" href="#top">
          <span className="lp-mark" /> Barycal
        </a>
        <div className="lp-nav-cta">
          <Link href="/login" className="lp-ghost">
            Log in
          </Link>
          <Link href="/register" className="btn solid lp-navbtn">
            Get started
          </Link>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <span className="lp-badge">
            <span className="lp-ping" /> a barycal · your social calendar
          </span>
          <h1 className="lp-h1">
            Your life,
            <br />
            <span className="lp-grad">in orbit.</span>
          </h1>
          <p className="lp-sub">
            Barycal turns your calendar into your profile. Share when you’re free, see who’s around,
            and actually make plans — all in one place your whole circle orbits.
          </p>
          <div className="lp-actions">
            <Link href="/register" className="btn solid lp-big">
              Create your orbit
            </Link>
            <Link href="/login" className="btn lp-big">
              I have an account
            </Link>
          </div>
        </div>
        <Orbit />
      </section>

      <section className="lp-features">
        {FEATURES.map((f) => (
          <article key={f.title} className={`lp-feat ${f.cls}`}>
            <span className="lp-feat-dot" />
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </article>
        ))}
      </section>

      <footer className="lp-foot">
        <div className="lp-brand small">
          <span className="lp-mark" /> Barycal
        </div>
        <div className="lp-foot-links">
          <Link href="/login">Log in</Link>
          <Link href="/register">Get started</Link>
        </div>
        <div className="footnote">powered by plur.nyc</div>
      </footer>
    </div>
  );
}
