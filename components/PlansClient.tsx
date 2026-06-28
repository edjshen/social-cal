'use client';
import { Fragment, useState, useTransition } from 'react';
import { dayLabel, timeLabel } from '@/lib/format';
import Pill from './primitives/Pill';
import { deleteEvent } from '@/lib/actions/events';
import CreateSheet from './CreateSheet';

export default function PlansClient({ events, meId }: { events: any[]; meId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCancel(id: string) {
    if (!window.confirm('Cancel this plan?')) return;
    startTransition(() => {
      deleteEvent(id);
    });
  }

  let last = '';
  return (
    <>
      <div className="topbar">
        <div>
          <div className="kicker">Plans</div>
          <div className="h-title">What you're in</div>
        </div>
        <button className="btn sm" onClick={() => setOpen(true)}>
          ＋ New
        </button>
      </div>
      {events.length === 0 && (
        <div className="empty">
          No plans yet.
          <br />
          Tap ＋ to make one — or set an intention like "free for lunch".
        </div>
      )}
      <div className="feed">
        {events.map((ev) => {
          const dl = dayLabel(ev.startTime);
          const head =
            dl !== last ? (
              <div className="daylabel" key={'d' + ev.id}>
                {dl}
              </div>
            ) : null;
          last = dl;
          const role =
            ev.creator?.id === meId ? 'Hosting' : ev.myRsvp === 'going' ? "You're in" : ev.myRsvp;
          return (
            <Fragment key={ev.id}>
              {head}
              <div className="card">
                <div className="row between">
                  <Pill type={ev.type} recurring={!!ev.recurring} />
                  <span className="meta">{timeLabel(ev.startTime)}</span>
                </div>
                <div className="ev-title">{ev.title}</div>
                <div className="meta">
                  {ev.location || ''}
                  {ev.attendeeCount ? (
                    <>
                      <span className="dot" />
                      {ev.attendeeCount} in
                    </>
                  ) : null}
                </div>
                <div className="row between" style={{ marginTop: 10 }}>
                  <span className="btn sm in">{role}</span>
                  {ev.creator?.id === meId && (
                    <button
                      className="btn sm"
                      onClick={() => handleCancel(ev.id)}
                      disabled={isPending}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
      <CreateSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
