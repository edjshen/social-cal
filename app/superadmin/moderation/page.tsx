import { adminListEvents, adminListConnections } from '@/lib/db/admin';
import { getAllUsers } from '@/lib/db/queries';
import ModerationView from '@/components/admin/ModerationView';

export default async function AdminModeration() {
  const [events, connections, users] = await Promise.all([
    adminListEvents(),
    adminListConnections(),
    getAllUsers(),
  ]);
  const handle = Object.fromEntries(users.map((u) => [u.id, u.handle]));
  const conns = connections.map((c) => ({
    id: c.id,
    a: handle[c.aId] ?? c.aId,
    b: handle[c.bId] ?? c.bId,
    status: c.status,
  }));
  return (
    <main>
      <h1>Moderation</h1>
      <ModerationView events={events} connections={conns} />
    </main>
  );
}
