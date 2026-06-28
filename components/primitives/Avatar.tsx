import type { PublicUser } from '@/lib/domain/types';
export default function Avatar({
  user,
  size = 'sm',
  className = '',
}: {
  user: PublicUser;
  size?: 'sm' | 'lg' | 'xl';
  className?: string;
}) {
  return (
    <span
      className={`av ${size} ${className}`}
      style={{ background: `linear-gradient(135deg,${user.avatar})` }}
    >
      {user.initials}
    </span>
  );
}
