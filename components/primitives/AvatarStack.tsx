import type { PublicUser } from '@/lib/domain/types';
import Avatar from './Avatar';
export default function AvatarStack({ users }: { users: PublicUser[] }) {
  return (
    <div className="stack">
      {users.map((u) => (
        <Avatar key={u.id} user={u} />
      ))}
    </div>
  );
}
