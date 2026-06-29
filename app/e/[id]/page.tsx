import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { getEventById, getGraphContext } from '@/lib/db/queries';
import { canSeeContent } from '@/lib/domain/visibility';
import { enrich } from '@/lib/domain/enrich';
import Avatar from '@/components/primitives/Avatar';
import PublicCta from '@/components/PublicCta';
import AuthWall from '@/components/AuthWall';
import RsvpButtons from '@/components/RsvpButtons';

const fullTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

// Three outcomes for an event link:
//  - ok:      the viewer may see the event (public to anyone, or visible to this
//             logged-in viewer). Render the details.
//  - auth:    a logged-OUT visitor hit a non-public event. They might gain access
//             by signing in, so prompt auth rather than 404.
//  - missing: the event doesn't exist, is ghost-redacted, OR a logged-IN viewer
//             isn't on the guest list. We 404 so as never to confirm a private
//             event's existence to someone not permitted to see it.
type Loaded =
  | { status: 'ok'; event: any; viewerId: string | null }
  | { status: 'auth' }
  | { status: 'missing' };

async function load(id: string): Promise<Loaded> {
  const viewerId = (await getSession()).userId ?? null;
  const ev = await getEventById(id);
  if (!ev) return { status: 'missing' };
  const ctx = await getGraphContext();
  if (canSeeContent(viewerId, ev, ctx.conns, ctx.places)) {
    const event = enrich(ev, viewerId, ctx, { detail: true }) as any;
    // A ghost creator's event comes back as the redacted free/busy stub; treat it
    // as non-existent so a ghost is never revealed via a direct link.
    if (event.busy) return { status: 'missing' };
    return { status: 'ok', event, viewerId };
  }
  if (!viewerId) return { status: 'auth' };
  return { status: 'missing' };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const r = await load(id);
  // Don't leak a private event's details into page metadata / link unfurls.
  if (r.status !== 'ok') return { title: 'Barycal' };
  const e = r.event;
  return { title: `${e.title} · Barycal`, description: e.location || 'on Barycal' };
}

export default async function PublicEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await load(id);
  if (r.status === 'missing') notFound();
  if (r.status === 'auth') {
    return (
      <AuthWall
        next={`/e/${id}`}
        title="This event is private"
        message="Log in or sign up to see what's happening."
      />
    );
  }

  const { event: e, viewerId } = r;
  return (
    <div className="shell">
      <div className="main">
        <div className="topbar" style={{ marginBottom: 16 }}>
          <Link
            className="logo"
            href="/"
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'var(--grad)',
                display: 'inline-block',
              }}
            />{' '}
            Barycal
          </Link>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <span className={`pill ${e.type === 'intention' ? 'free' : e.type}`}>{e.type}</span>
          <div
            className="ev-title"
            style={{ fontSize: 24, fontFamily: 'var(--serif)', fontWeight: 500 }}
          >
            {e.title}
          </div>
          <div className="meta" style={{ marginTop: 6 }}>
            {fullTime(e.startTime)}
          </div>
          {e.location && (
            <div className="meta" style={{ marginTop: 4 }}>
              {e.location}
            </div>
          )}
          {e.description && <div className="pf-bio">{e.description}</div>}
          <div className="row" style={{ marginTop: 16, gap: 8 }}>
            {(e.attendees || []).slice(0, 6).map((a: any) => (
              <Avatar key={a.id} user={a} />
            ))}
            {(e.attendeeCount ?? 0) > 0 && (
              <span className="muted" style={{ fontSize: 13 }}>
                {e.attendeeCount} going
              </span>
            )}
            {/* Logged-in viewers get the real RSVP control; logged-out visitors
                get a static preview (the sign-up CTA below) and cannot act. */}
            {viewerId && <RsvpButtons eventId={e.id} myRsvp={e.myRsvp} />}
          </div>
        </div>
        {!viewerId && (
          <PublicCta
            href={`/register?next=${encodeURIComponent(`/e/${id}`)}`}
            label="Sign up to RSVP"
          />
        )}
      </div>
    </div>
  );
}
