'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sheet from '../primitives/Sheet';
import { deleteEvent, setRsvp } from '@/lib/actions/events';
import { CalEvent, eventColorHex, fmtTime, MONTHS, WEEKDAYS } from './util';
import RecurScopePrompt, { type Scope } from './RecurScopePrompt';

const RECUR_LABEL: Record<string, string> = {
  daily: 'Repeats daily',
  weekly: 'Repeats weekly',
  weekday: 'Every weekday',
  monthly: 'Repeats monthly',
  yearly: 'Repeats yearly',
};
const RSVPS: [string, string][] = [
  ['going', 'Going'],
  ['maybe', 'Maybe'],
  ['cant', "Can't"],
];

export default function EventDetail({
  ev,
  meId,
  onOpenChange,
  onEdit,
  onChanged,
}: {
  ev: CalEvent;
  meId: string;
  onOpenChange: (o: boolean) => void;
  onEdit: (ev: CalEvent) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [scopeAsk, setScopeAsk] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rsvp, setLocalRsvp] = useState(ev.myRsvp || null);
  const mine = ev.creator?.id === meId;
  const isOccurrence = !!ev.occurrence;
  const start = new Date(ev.startTime);
  const end = ev.endTime ? new Date(ev.endTime) : null;
  const dateLine = `${WEEKDAYS[start.getDay()]}, ${MONTHS[start.getMonth()]} ${start.getDate()}`;
  const timeLine = ev.allDay
    ? 'All day'
    : `${fmtTime(ev.startTime)}${end ? ' – ' + fmtTime(ev.endTime!) : ''}`;

  function remove() {
    if (isOccurrence) {
      setScopeAsk(true);
      return;
    }
    setConfirmDelete(true);
  }
  async function doDelete(scope?: Scope) {
    setPending(true);
    try {
      await deleteEvent(ev.id, scope ? { scope } : undefined);
      setScopeAsk(false);
      onOpenChange(false);
      onChanged();
      router.refresh();
    } finally {
      setPending(false);
    }
  }
  async function doRsvp(v: 'going' | 'maybe' | 'cant') {
    setLocalRsvp(v);
    await setRsvp(ev.seriesId || ev.id, v);
    onChanged();
    router.refresh();
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <div className="ed-head">
        <span className="ed-swatch" style={{ background: eventColorHex(ev) }} />
        <h3 style={{ margin: 0 }}>{ev.busy ? 'Busy' : ev.title || '(no title)'}</h3>
      </div>

      <div className="ed-line">
        <strong>{dateLine}</strong>
        <span className="muted">{timeLine}</span>
      </div>
      {ev.recurring && <div className="ed-meta">{RECUR_LABEL[ev.recurring] || 'Repeats'}</div>}
      {ev.location && <div className="ed-meta">📍 {ev.location}</div>}
      {ev.creator?.displayName && (
        <div className="ed-meta">
          {mine ? 'You’re hosting' : `Hosted by ${ev.creator.displayName}`}
          {(ev.attendeeCount ?? 0) > 1 ? ` · ${ev.attendeeCount} going` : ''}
        </div>
      )}
      {ev.description && <p className="ed-desc">{ev.description}</p>}

      {!ev.busy && !mine && (
        <div className="ed-rsvp">
          {RSVPS.map(([v, l]) => (
            <button
              key={v}
              className={`btn sm${rsvp === v ? ' in' : ''}`}
              onClick={() => doRsvp(v as any)}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {mine && !ev.busy && (
        <div className="row" style={{ gap: 10, marginTop: 18 }}>
          {confirmDelete ? (
            <>
              <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>
                Delete?
              </span>
              <button className="btn" onClick={() => doDelete()} disabled={pending}>
                Yes, delete
              </button>
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button className="btn block" onClick={() => onEdit(ev)} style={{ marginTop: 0 }}>
                Edit
              </button>
              <button className="btn" onClick={remove} disabled={pending}>
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {scopeAsk && (
        <RecurScopePrompt
          open={scopeAsk}
          title="Delete recurring event"
          onOpenChange={setScopeAsk}
          onPick={(s) => doDelete(s)}
        />
      )}
    </Sheet>
  );
}
