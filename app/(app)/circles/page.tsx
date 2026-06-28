import { getSession } from '@/lib/auth/session';
import { getGraphContext } from '@/lib/db/queries';
import { myConnectionIds, tierOf, connectionStatus } from '@/lib/domain/visibility';
import { publicUser } from '@/lib/domain/helpers';
import CirclesView from '@/components/CirclesView';

export default async function CirclesPage() {
  const meId = (await getSession()).userId!;
  const ctx = await getGraphContext();
  const ids = myConnectionIds(ctx.conns, meId);
  const list = [...ids]
    .map((id) => ({
      user: publicUser(ctx.users.find((u) => u.id === id) || null),
      tier: (tierOf(ctx.places, meId, id) || 'orbit') as 'inner' | 'orbit',
    }))
    .filter((x) => x.user);
  const requests = ctx.conns
    .filter((c) => c.status === 'pending' && c.bId === meId)
    .map((c) => ({ id: c.id, user: publicUser(ctx.users.find((u) => u.id === c.aId) || null) }))
    .filter((r) => r.user);
  // Exclude ghost users from the discovery directory (add-people / pending) so
  // ghost mode hides them from people they aren't already connected to. Existing
  // connections/requests above still resolve normally.
  const others = ctx.users
    .filter((u) => u.id !== meId && !u.ghost)
    .map((u) => ({
      ...publicUser(u)!,
      status: connectionStatus(ctx.conns, meId, u.id),
      tier: tierOf(ctx.places, meId, u.id),
    }));
  return (
    <CirclesView
      inner={list.filter((x) => x.tier === 'inner')}
      orbit={list.filter((x) => x.tier !== 'inner')}
      requests={requests}
      addable={others.filter((u) => u.status === 'none')}
      pending={others.filter((u) => u.status === 'pending_out')}
    />
  );
}
