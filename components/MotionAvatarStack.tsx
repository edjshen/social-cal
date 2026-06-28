'use client';
import { LazyMotion, domAnimation, m } from 'motion/react';
import type { PublicUser } from '@/lib/domain/types';
export default function MotionAvatarStack({ users }: { users: PublicUser[] }) {
  return (
    <LazyMotion features={domAnimation}>
      <div className="stack">
        {users.map((u, i) => (
          <m.span
            key={u.id}
            className="av sm"
            style={{
              background: `linear-gradient(135deg,${u.avatar})`,
              marginLeft: i === 0 ? 0 : -8,
            }}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28, delay: i * 0.04 }}
          >
            {u.initials}
          </m.span>
        ))}
      </div>
    </LazyMotion>
  );
}
