import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';
import {
  getOrbitById,
  getOrbitMembers,
  getGraphContext,
  getEventsForOrbit,
} from '@/lib/db/queries';
import { myConnectionIds } from '@/lib/domain/visibility';
import { enrich } from '@/lib/domain/enrich';
import { publicUser } from '@/lib/domain/helpers';
import { startOfToday, notExpired } from '@/lib/domain/dates';
import OrbitManageView from '@/components/OrbitManageView';

export const metadata: Metadata = { title: 'Orbit · Barycal' };

export default async function OrbitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meId = (await getSession()).userId!;
  const orbit = await getOrbitById(id);
  if (!orbit) notFound();
  const memberRows = await getOrbitMembers(id);
  // Only members can view or manage an orbit — everyone else 404s (never confirm
  // a group exists to someone outside it).
  if (!memberRows.some((m) => m.userId === meId)) notFound();

  const ctx = await getGraphContext();
  const members = memberRows
    .map((m) => {
      const pu = publicUser(ctx.users.find((u) => u.id === m.userId) || null);
      return pu ? { ...pu, role: m.role } : null;
    })
    .filter((m): m is NonNullable<typeof m> => !!m)
    .sort((a, b) =>
      a.role === b.role ? a.displayName.localeCompare(b.displayName) : a.role === 'owner' ? -1 : 1
    );
  const memberIds = new Set(memberRows.map((m) => m.userId));

  // People you can add: your connections not already in the orbit (ghosts hidden).
  const connIds = myConnectionIds(ctx.conns, meId);
  const candidates = ctx.users
    .filter((u) => connIds.has(u.id) && !memberIds.has(u.id) && !u.ghost)
    .map((u) => publicUser(u)!)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  // Upcoming events on this shared calendar (base rows only; the full calendar
  // handles recurrence expansion).
  const from = startOfToday();
  const upcoming = (await getEventsForOrbit(id))
    .filter((ev) => !ev.parentId && notExpired(ev) && new Date(ev.startTime) >= from)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 12)
    .map((ev) => enrich(ev, meId, ctx))
    .filter((e: { busy?: boolean }) => !e.busy);

  return (
    <OrbitManageView
      orbit={{ id: orbit.id, name: orbit.name, color: orbit.color ?? null }}
      isOwner={orbit.ownerId === meId}
      meId={meId}
      members={members}
      candidates={candidates}
      upcoming={upcoming as never[]}
    />
  );
}
