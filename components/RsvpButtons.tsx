'use client';
import { useOptimistic, useTransition } from 'react';
import { setRsvp } from '@/lib/actions/events';
const OPTS: { v: 'down' | 'maybe' | 'cant'; label: string }[] = [
  { v: 'down', label: "I'm down" },
  { v: 'maybe', label: 'Maybe' },
  { v: 'cant', label: "Can't" },
];
export default function RsvpButtons({
  eventId,
  myRsvp,
}: {
  eventId: string;
  myRsvp: string | null;
}) {
  const [optimistic, setOptimistic] = useOptimistic(myRsvp);
  const [, startTransition] = useTransition();
  return (
    <div className="row" style={{ gap: 6, marginLeft: 'auto' }}>
      {OPTS.map(({ v, label }) => (
        <button
          key={v}
          className={`btn sm ${optimistic === v ? 'in' : ''}`}
          onClick={() =>
            startTransition(async () => {
              setOptimistic(v);
              try {
                await setRsvp(eventId, v);
              } catch (err) {
                // The optimistic value reverts to `myRsvp` once the transition
                // settles; swallow so a transient/expired-session failure doesn't
                // tear down the page via the error boundary.
                console.error('RSVP failed', err);
              }
            })
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
