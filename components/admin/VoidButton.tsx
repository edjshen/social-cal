'use client';
import { useState, useTransition } from 'react';
import { voidCheckIn, voidRedemption, markFulfilled } from '@/lib/actions/admin';

type Action = 'checkin' | 'redemption' | 'fulfill';

const LABEL: Record<Action, string> = {
  checkin: 'Void',
  redemption: 'Void',
  fulfill: 'Mark fulfilled',
};
const CONFIRM: Record<Action, string> = {
  checkin: 'Void this check-in? This reverses the awarded points.',
  redemption: 'Void this redemption? This refunds the point cost.',
  fulfill: 'Mark this redemption fulfilled?',
};

export default function VoidButton({ id, action }: { id: string; action: Action }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function run() {
    if (!confirm(CONFIRM[action])) return;
    setErr(null);
    start(async () => {
      try {
        if (action === 'checkin') await voidCheckIn(id);
        else if (action === 'redemption') await voidRedemption(id);
        else await markFulfilled(id);
        setDone(true);
      } catch (e) {
        setErr((e as Error)?.message ?? 'Failed');
      }
    });
  }

  if (done) return <span className="muted">done</span>;
  return (
    <>
      <button
        className="btn sm"
        onClick={run}
        disabled={pending}
        style={action === 'fulfill' ? undefined : { color: '#ff8088' }}
      >
        {pending ? '…' : LABEL[action]}
      </button>
      {err && (
        <span className="error" style={{ marginLeft: 6 }}>
          {err}
        </span>
      )}
    </>
  );
}
