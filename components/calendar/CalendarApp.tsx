'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCalendar } from '@/lib/actions/calendar';
import {
  CalEvent,
  DAY_MS,
  MONTHS,
  addDays,
  addMonths,
  isToday,
  startOfDay,
  startOfWeek,
  WEEKDAYS,
} from './util';
import { expandEvents } from './recur';
import TimeGrid from './TimeGrid';
import MonthView from './MonthView';
import ScheduleView from './ScheduleView';
import EventEditor from './EventEditor';
import EventDetail from './EventDetail';

type View = 'day' | '3day' | 'week' | 'month' | 'schedule';
const VIEWS: [View, string][] = [
  ['day', 'Day'],
  ['3day', '3-day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['schedule', 'Schedule'],
];

export default function CalendarApp({
  initialEvents,
  initialFromISO,
  initialToISO,
  meId,
}: {
  initialEvents: CalEvent[];
  initialFromISO: string;
  initialToISO: string;
  meId: string;
}) {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [raw, setRaw] = useState<CalEvent[]>(initialEvents);
  const loaded = useRef({ from: new Date(initialFromISO), to: new Date(initialToISO) });
  const [viewMenu, setViewMenu] = useState(false);

  const [editor, setEditor] = useState<{
    open: boolean;
    existing?: CalEvent;
    startISO?: string;
    endISO?: string;
  }>({ open: false });
  const [detail, setDetail] = useState<CalEvent | null>(null);

  // ---- which calendar dates are visible for the current view ----
  const visible = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  // ---- lazy-load events to cover the visible range (+buffer) ----
  useEffect(() => {
    const need = visible;
    const have = loaded.current;
    if (need.start.getTime() >= have.from.getTime() && need.end.getTime() <= have.to.getTime())
      return;
    const from = new Date(Math.min(need.start.getTime(), have.from.getTime()) - 31 * DAY_MS);
    const to = new Date(Math.max(need.end.getTime(), have.to.getTime()) + 31 * DAY_MS);
    let cancelled = false;
    loadCalendar(from.toISOString(), to.toISOString()).then((evs) => {
      if (cancelled) return;
      loaded.current = { from, to };
      setRaw(evs as CalEvent[]);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // ---- expand recurrences across the visible window ----
  const events = useMemo(
    () => expandEvents(raw, addDays(visible.start, -1), addDays(visible.end, 1)),
    [raw, visible]
  );

  function refresh() {
    // re-pull the loaded window after a mutation
    const { from, to } = loaded.current;
    loadCalendar(from.toISOString(), to.toISOString()).then((evs) => setRaw(evs as CalEvent[]));
  }

  function go(dir: number) {
    setAnchor((a) => {
      if (view === 'month') return startOfDay(addMonths(a, dir));
      if (view === 'schedule') return startOfDay(addMonths(a, dir));
      const step = view === 'week' ? 7 : view === '3day' ? 3 : 1;
      return startOfDay(addDays(a, dir * step));
    });
  }
  function today() {
    setAnchor(startOfDay(new Date()));
  }

  const gridDays = useMemo(() => {
    if (view === 'day') return [startOfDay(anchor)];
    if (view === '3day') return [0, 1, 2].map((i) => addDays(startOfDay(anchor), i));
    if (view === 'week') {
      const ws = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    }
    return [];
  }, [view, anchor]);

  const title = `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
  const isGrid = view === 'day' || view === '3day' || view === 'week';

  return (
    <div className="cal-app">
      {/* header */}
      <div className="cal-top">
        <button className="cal-title" onClick={() => setViewMenu((v) => !v)}>
          {title}
          <svg viewBox="0 0 24 24" className="cal-caret">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div className="cal-nav">
          <button onClick={() => go(-1)} aria-label="Previous">
            <svg viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button className="cal-today" onClick={today}>
            Today
          </button>
          <button onClick={() => go(1)} aria-label="Next">
            <svg viewBox="0 0 24 24">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* view switcher */}
      {viewMenu && (
        <div className="cal-vmenu">
          {VIEWS.map(([v, l]) => (
            <button
              key={v}
              className={view === v ? 'on' : ''}
              onClick={() => {
                setView(v);
                setViewMenu(false);
              }}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {/* day-of-week header for grid views */}
      {isGrid && (
        <div className="cal-dayhead">
          {gridDays.map((d, i) => (
            <button
              key={i}
              className={`cal-dh${isToday(d) ? ' today' : ''}`}
              onClick={() => {
                setAnchor(startOfDay(d));
                setView('day');
              }}
            >
              <span className="cal-dh-wd">
                {WEEKDAYS[d.getDay()].slice(0, view === 'week' ? 1 : 3)}
              </span>
              <span className="cal-dh-n">{d.getDate()}</span>
            </button>
          ))}
        </div>
      )}

      {/* body */}
      <div className="cal-body">
        {isGrid && (
          <TimeGrid
            days={gridDays}
            events={events}
            meId={meId}
            onCreate={({ startISO, endISO }) => setEditor({ open: true, startISO, endISO })}
            onOpenEvent={(ev) => setDetail(ev)}
            onMove={(ev, startISO, endISO) => {
              // Dragging a single occurrence of a series creates a per-instance
              // override; only optimistically shift non-recurring events (whose
              // base row genuinely moves).
              if (ev.occurrence) {
                import('@/lib/actions/events').then(({ updateEvent }) =>
                  updateEvent(
                    ev.id,
                    { startTime: startISO, endTime: endISO },
                    { scope: 'single' }
                  ).then(refresh)
                );
              } else {
                optimisticMove(ev, startISO, endISO);
                import('@/lib/actions/events').then(({ updateEvent }) =>
                  updateEvent(ev.id, { startTime: startISO, endTime: endISO }).then(refresh)
                );
              }
            }}
          />
        )}
        {view === 'month' && (
          <MonthView
            anchor={anchor}
            events={events}
            onPickDay={(d) => {
              setAnchor(startOfDay(d));
              setView('day');
            }}
            onOpenEvent={(ev) => setDetail(ev)}
          />
        )}
        {view === 'schedule' && (
          <ScheduleView anchor={anchor} events={events} onOpenEvent={(ev) => setDetail(ev)} />
        )}
      </div>

      {/* FAB */}
      <button
        className="cal-fab"
        aria-label="Create event"
        onClick={() => {
          const now = new Date();
          const inView =
            now.getTime() >= visible.start.getTime() && now.getTime() < visible.end.getTime();
          const day = inView ? now : isGrid ? gridDays[0] || anchor : anchor;
          const base = startOfDay(day);
          base.setHours(now.getHours() + 1, 0, 0, 0);
          setEditor({
            open: true,
            startISO: base.toISOString(),
            endISO: new Date(base.getTime() + 3600000).toISOString(),
          });
        }}
      >
        <svg viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {editor.open && (
        <EventEditor
          open={editor.open}
          init={{ existing: editor.existing, startISO: editor.startISO, endISO: editor.endISO }}
          onOpenChange={(o) => setEditor((s) => ({ ...s, open: o }))}
          onSaved={refresh}
        />
      )}
      {detail && (
        <EventDetail
          ev={detail}
          meId={meId}
          onOpenChange={(o) => !o && setDetail(null)}
          onEdit={(ev) => {
            setDetail(null);
            setEditor({ open: true, existing: ev });
          }}
          onChanged={refresh}
        />
      )}
    </div>
  );

  // optimistic local shift so a dragged event doesn't jump back before the server round-trip
  function optimisticMove(ev: CalEvent, startISO: string, endISO: string) {
    const baseId = ev.seriesId || ev.id;
    setRaw((cur) =>
      cur.map((e) =>
        e.id === baseId
          ? {
              ...e,
              startTime: shiftBase(e, ev, startISO),
              endTime: shiftBaseEnd(e, ev, startISO, endISO),
            }
          : e
      )
    );
  }
}

function shiftBase(base: CalEvent, occ: CalEvent, newStartISO: string): string {
  // For a recurring series the visible occurrence was shifted; translate that
  // delta onto the stored base start so the optimistic render stays put.
  const delta = new Date(newStartISO).getTime() - new Date(occ.startTime).getTime();
  return new Date(new Date(base.startTime).getTime() + delta).toISOString();
}
function shiftBaseEnd(
  base: CalEvent,
  occ: CalEvent,
  newStartISO: string,
  newEndISO: string
): string {
  const dur = new Date(newEndISO).getTime() - new Date(newStartISO).getTime();
  return new Date(new Date(shiftBase(base, occ, newStartISO)).getTime() + dur).toISOString();
}

function rangeFor(view: View, anchor: Date): { start: Date; end: Date } {
  if (view === 'day') return { start: startOfDay(anchor), end: addDays(startOfDay(anchor), 1) };
  if (view === '3day') return { start: startOfDay(anchor), end: addDays(startOfDay(anchor), 3) };
  if (view === 'week') {
    const ws = startOfWeek(anchor);
    return { start: ws, end: addDays(ws, 7) };
  }
  if (view === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gs = startOfWeek(first);
    return { start: gs, end: addDays(gs, 42) };
  }
  // schedule
  return { start: startOfDay(anchor), end: addDays(startOfDay(anchor), 60) };
}
