'use client';
import {
  CalEvent,
  eventColorHex,
  fmtTime,
  isToday,
  MONTHS_SHORT,
  startOfDay,
  WEEKDAYS,
} from './util';

// Agenda / "Schedule" list, grouped by day, like Google Calendar's Schedule view.
export default function ScheduleView({
  anchor,
  events,
  onOpenEvent,
}: {
  anchor: Date;
  events: CalEvent[];
  onOpenEvent: (ev: CalEvent) => void;
}) {
  const start = startOfDay(anchor);
  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  // Group into days that actually have events, within the loaded window.
  const groups = new Map<number, CalEvent[]>();
  for (const ev of sorted) {
    const k = startOfDay(ev.startTime).getTime();
    if (k < start.getTime()) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(ev);
  }
  const days = [...groups.keys()].sort((a, b) => a - b);

  if (!days.length) {
    return (
      <div className="empty" style={{ padding: '60px 16px' }}>
        Nothing scheduled.
        <br />
        Tap ＋ to add something.
      </div>
    );
  }

  return (
    <div className="sv">
      {days.map((k) => {
        const d = new Date(k);
        const evs = groups.get(k)!;
        const today = isToday(d);
        return (
          <div key={k} className="sv-day">
            <div className={`sv-date${today ? ' today' : ''}`}>
              <div className="sv-dnum">{d.getDate()}</div>
              <div className="sv-dmeta">
                <span className="sv-dwd">{WEEKDAYS[d.getDay()]}</span>
                <span className="sv-dmo">{MONTHS_SHORT[d.getMonth()]}</span>
              </div>
            </div>
            <div className="sv-evs">
              {evs.map((ev) => (
                <button key={ev.id} className="sv-ev" onClick={() => onOpenEvent(ev)}>
                  <span className="sv-bar" style={{ background: eventColorHex(ev) }} />
                  <span className="sv-time">{ev.allDay ? 'All day' : fmtTime(ev.startTime)}</span>
                  <span className="sv-body">
                    <span className="sv-title">{ev.busy ? 'Busy' : ev.title || '(no title)'}</span>
                    {!ev.busy && (ev.location || (ev.attendeeCount ?? 0) > 1) && (
                      <span className="sv-sub">
                        {ev.location || ''}
                        {ev.location && (ev.attendeeCount ?? 0) > 1 ? ' · ' : ''}
                        {(ev.attendeeCount ?? 0) > 1 ? `${ev.attendeeCount} going` : ''}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
