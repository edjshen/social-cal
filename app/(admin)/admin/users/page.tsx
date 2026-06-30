import { requireSuperadmin } from '@/lib/auth/superadmin';
import { adminListUsers } from '@/lib/db/admin';
import UsersView from '@/components/admin/UsersView';

export default async function AdminUsers() {
  const [users, { userId: meId }] = await Promise.all([adminListUsers(), requireSuperadmin()]);
  return (
    <main>
      <h1>Users</h1>
      <UsersView users={users} meId={meId} />
    </main>
  );
}
