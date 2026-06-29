import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import { getProfileData } from '@/lib/db/profile';
import Avatar from '@/components/primitives/Avatar';
import PublicCta from '@/components/PublicCta';
import { timeLabel } from '@/lib/format';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const data = await getProfileData(handle, null);
  if (!data) return { title: 'Barycal' };
  return {
    title: `${data.user.displayName} · Barycal`,
    description: data.user.bio || 'on Barycal',
    openGraph: { title: data.user.displayName },
  };
}
export default async function PublicProfile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const viewerId = (await getSession()).userId ?? null;
  const data = await getProfileData(handle, viewerId);
  if (!data) notFound();
  const u = data.user;
  return (
    <div className="shell">
      <div className="main">
        <div className="banner" />
        <div className="pf-head">
          <Avatar user={{ ...u, initials: u.initials }} size="xl" className="pf-av" />
          <div className="pf-name">{u.displayName}</div>
          <div className="pf-handle">@{u.handle}</div>
          {u.bio && <div className="pf-bio">{u.bio}</div>}
          {u.scenes?.length > 0 && (
            <div className="chips" style={{ marginTop: 13 }}>
              {u.scenes.map((s: string) => (
                <span key={s} className="chip">
                  {s}
                </span>
              ))}
            </div>
          )}
          <div className="kicker" style={{ margin: '22px 0 6px' }}>
            Going to
          </div>
          {data.upcoming.length ? (
            data.upcoming.map((e: any) => (
              <div className="up" key={e.id}>
                <div className="when">
                  <b>{new Date(e.startTime).getDate()}</b>
                  <span>
                    {new Date(e.startTime).toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                </div>
                <div className="body">
                  <div className="t">{e.title}</div>
                  <div className="s">
                    {timeLabel(e.startTime)}
                    {e.location && ' · ' + e.location}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty" style={{ padding: 20 }}>
              Nothing public right now.
            </div>
          )}
          {!viewerId && (
            <PublicCta
              href={`/register?next=${encodeURIComponent(`/u/${u.handle}`)}`}
              label={`Sign up to follow ${u.displayName.split(' ')[0]}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
