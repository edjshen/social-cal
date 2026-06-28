'use client';
import {
  CalEvent,
  addDays,
  eventColorHex,
  isToday,
  startOfDay,
  startOfWeek,
  WEEKDAYS_NARROW,
} from './util';

export default function MonthView({
  anchor,
  events,
  onPickDay,
  onOpenEvent,
}: {
  anchor: Date;
  events: CalEvent[];
  onPickDay: (d: Date) => void;
  onOpenEvent: (ev: CalEvent) => void;
}) {
  const monthFirst = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(monthFirst);
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  // trim to 5 rows when the 6th is entirely next month
  const rows =
    cells[35] &&
    cells[35].getMonth() !== anchor.getMonth() &&
    cells[28].getMonth() !== anchor.getMonth()
      ? 5
      : 6;

  const byDay = new Map<number, CalEvent[]>();
  for (const ev of events) {
    const k = startOfDay(ev.startTime).getTime();
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(ev);
  }

  return (
    <div className="mv">
      <div className="mv-wd">
        {WEEKDAYS_NARROW.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>
      <div className="mv-grid" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {cells.slice(0, rows * 7).map((d, i) => {
          const inMonth = d.getMonth() === anchor.getMonth();
          const evs = (byDay.get(startOfDay(d).getTime()) || [])
            .slice()
            .sort(
              (a, b) =>
                Number(!!b.allDay) - Number(!!a.allDay) ||
                new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
            );
          const today = isToday(d);
          return (
            <button
              key={i}
              className={`mv-cell${inMonth ? '' : ' out'}`}
              onClick={() => onPickDay(d)}
            >
              <span className={`mv-n${today ? ' today' : ''}`}>{d.getDate()}</span>
              <div className="mv-chips">
                {evs.slice(0, 3).map((ev) => (
                  <span
                    key={ev.id}
                    className="mv-chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenEvent(ev);
                    }}
                    style={
                      ev.busy
                        ? { background: 'rgba(255,255,255,.08)', color: 'var(--dim)' }
                        : ev.allDay
                          ? { background: eventColorHex(ev), color: '#0c0a0e' }
                          : { color: '#fff' }
                    }
                  >
                    {!ev.allDay && !ev.busy && (
                      <span className="mv-dot" style={{ background: eventColorHex(ev) }} />
                    )}
                    {ev.busy ? 'Busy' : ev.title || '(no title)'}
                  </span>
                ))}
                {evs.length > 3 && <span className="mv-more">+{evs.length - 3}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
