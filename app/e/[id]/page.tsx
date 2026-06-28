import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { getEventById, getGraphContext } from '@/lib/db/queries';
import { canSeeContent } from '@/lib/domain/visibility';
import { enrich } from '@/lib/domain/enrich';
import Avatar from '@/components/primitives/Avatar';
import PublicCta from '@/components/PublicCta';

const fullTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

async function load(id: string) {
  const viewerId = (await getSession()).userId ?? null;
  const ev = await getEventById(id);
  if (!ev) return null;
  const ctx = await getGraphContext();
  if (!canSeeContent(viewerId, ev, ctx.conns, ctx.places)) return null;
  return enrich(ev, viewerId, ctx, { detail: true }) as any;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const e = await load(id);
  if (!e || e.busy) return { title: 'Barycal' };
  return { title: `${e.title} · Barycal`, description: e.location || 'on Barycal' };
}

export default async function PublicEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await load(id);
  if (!e || e.busy) notFound();
  return (
    <div className="shell">
      <div className="main">
        <div className="topbar" style={{ marginBottom: 16 }}>
          <div
            className="logo"
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
          </div>
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
            <span className="muted" style={{ fontSize: 13 }}>
              {e.attendeeCount} going
            </span>
          </div>
        </div>
        <PublicCta label="I'm down — open in Barycal" />
      </div>
    </div>
  );
}
