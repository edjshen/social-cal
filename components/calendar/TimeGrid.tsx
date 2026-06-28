'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalEvent, fmtHour, fmtTime, isToday, startOfDay, sameDay, eventColorHex } from './util';
import { layoutDay } from './recur';

export const HOUR_PX = 52;
const SNAP_MIN = 15;

type Draft = { startISO: string; endISO: string };
type Drag =
  | { mode: 'create'; dayIndex: number; anchorMin: number; curMin: number }
  | {
      mode: 'move';
      ev: CalEvent;
      dayIndex: number;
      grabOffsetMin: number;
      curStartMin: number;
      durMin: number;
      moved: boolean;
    }
  | {
      mode: 'resize';
      ev: CalEvent;
      dayIndex: number;
      startMin: number;
      curEndMin: number;
      moved: boolean;
    };

function snap(min: number) {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}
function isoForDayMin(day: Date, min: number) {
  const d = startOfDay(day);
  d.setMinutes(min);
  return d.toISOString();
}

export default function TimeGrid({
  days,
  events,
  meId,
  onCreate,
  onOpenEvent,
  onMove,
}: {
  days: Date[];
  events: CalEvent[];
  meId: string;
  onCreate: (d: Draft) => void;
  onOpenEvent: (ev: CalEvent) => void;
  onMove: (ev: CalEvent, startISO: string, endISO: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  // Latest props for the once-on-mount pointer handlers to read (avoids stale
  // closures over `days`/callbacks after navigating to another week).
  const latest = useRef({ days, onCreate, onOpenEvent, onMove });
  latest.current = { days, onCreate, onOpenEvent, onMove };
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  // Scroll to ~7am on first mount.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_PX - 12;
  }, []);

  // Tick the current-time line every minute.
  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(t);
  }, []);

  // Split all-day (band) from timed (grid) events.
  const allDayByDay: CalEvent[][] = days.map(() => []);
  const timedByDay: CalEvent[][] = days.map(() => []);
  for (const ev of events) {
    const s = new Date(ev.startTime);
    const idx = days.findIndex((d) => sameDay(d, s));
    if (idx < 0) continue;
    if (ev.allDay) allDayByDay[idx].push(ev);
    else timedByDay[idx].push(ev);
  }
  const allDayRows = Math.max(0, ...allDayByDay.map((a) => a.length));

  function minFromPointer(e: PointerEvent | React.PointerEvent) {
    const cols = colsRef.current;
    if (!cols) return 0;
    // colsRef is inside the scroll container, so its rect.top already tracks the
    // scroll offset — clientY - rect.top is the true minutes-from-midnight.
    const rect = cols.getBoundingClientRect();
    const yy = (e as PointerEvent).clientY - rect.top;
    return Math.max(0, Math.min(1440, (yy / HOUR_PX) * 60));
  }
  function dayIndexFromPointer(e: PointerEvent) {
    const cols = colsRef.current;
    if (!cols) return 0;
    const n = latest.current.days.length;
    const rect = cols.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width / n;
    return Math.max(0, Math.min(n - 1, Math.floor(x / w)));
  }

  // ---- global pointer handlers. Attached once on mount (not gated on `drag`)
  // so a fast tap's pointerup is never missed to a listener-attach race. ----
  useEffect(() => {
    function onMoveEvt(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const min = minFromPointer(e);
      if (d.mode === 'create') {
        setDrag({ ...d, curMin: min });
      } else if (d.mode === 'move') {
        const newStart = snap(min - d.grabOffsetMin);
        const di = dayIndexFromPointer(e);
        setDrag({
          ...d,
          curStartMin: Math.max(0, Math.min(1440 - d.durMin, newStart)),
          dayIndex: di,
          moved: true,
        });
      } else if (d.mode === 'resize') {
        setDrag({ ...d, curEndMin: Math.max(d.startMin + SNAP_MIN, snap(min)), moved: true });
      }
    }
    function onUp() {
      const d = dragRef.current;
      if (!d) return;
      setDrag(null);
      const L = latest.current;
      const day = L.days[d.dayIndex];
      if (!day) return;
      if (d.mode === 'create') {
        const a = Math.min(d.anchorMin, d.curMin);
        const b = Math.max(d.anchorMin, d.curMin);
        const start = snap(a);
        const end = Math.max(start + SNAP_MIN, snap(b));
        L.onCreate({ startISO: isoForDayMin(day, start), endISO: isoForDayMin(day, end) });
      } else if (d.mode === 'move') {
        if (!d.moved) {
          L.onOpenEvent(d.ev);
        } else {
          const start = d.curStartMin;
          L.onMove(d.ev, isoForDayMin(day, start), isoForDayMin(day, start + d.durMin));
        }
      } else if (d.mode === 'resize') {
        if (d.moved) L.onMove(d.ev, d.ev.startTime, isoForDayMin(day, d.curEndMin));
      }
    }
    window.addEventListener('pointermove', onMoveEvt);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMoveEvt);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="tg">
      {/* all-day band */}
      {allDayRows > 0 && (
        <div className="tg-allday">
          <div className="tg-gutter tg-allday-label">all-day</div>
          <div className="tg-allday-cols">
            {days.map((d, i) => (
              <div key={i} className="tg-allday-col">
                {allDayByDay[i].map((ev) => (
                  <button
                    key={ev.id}
                    className="tg-allday-ev"
                    style={{ background: eventColorHex(ev) }}
                    onClick={() => onOpenEvent(ev)}
                  >
                    {ev.busy ? 'Busy' : ev.title || '(no title)'}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-body" style={{ height: 24 * HOUR_PX }}>
          <div className="tg-gutter">
            {Array.from({ length: 25 }, (_, h) => (
              <div key={h} className="tg-hr" style={{ top: h * HOUR_PX }}>
                <span>{fmtHour(h)}</span>
              </div>
            ))}
          </div>
          <div
            className="tg-cols"
            ref={colsRef}
            onPointerDown={(e) => {
              // background drag-to-create (ignore when starting on an event button)
              if ((e.target as HTMLElement).closest('.tg-ev')) return;
              const di = dayIndexFromPointer(e.nativeEvent);
              const min = snap(minFromPointer(e));
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              setDrag({ mode: 'create', dayIndex: di, anchorMin: min, curMin: min + 60 });
            }}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="tg-line" style={{ top: h * HOUR_PX }} />
            ))}
            {days.map((day, di) => {
              const laid = layoutDay(timedByDay[di]);
              const showNow = isToday(day);
              return (
                <div key={di} className={`tg-col${showNow ? ' tg-today' : ''}`}>
                  {laid.map((ev) => {
                    const s = new Date(ev.startTime);
                    const e = ev.endTime ? new Date(ev.endTime) : new Date(s.getTime() + 3600000);
                    let startMin = s.getHours() * 60 + s.getMinutes();
                    let endMin = (e.getTime() - startOfDay(day).getTime()) / 60000;
                    // active drag overrides
                    const dr = drag;
                    if (dr && dr.mode === 'move' && dr.ev.id === ev.id && dr.dayIndex === di) {
                      startMin = dr.curStartMin;
                      endMin = dr.curStartMin + dr.durMin;
                    }
                    if (dr && dr.mode === 'resize' && dr.ev.id === ev.id) endMin = dr.curEndMin;
                    if (dr && dr.mode === 'move' && dr.ev.id === ev.id && dr.dayIndex !== di)
                      return null;
                    endMin = Math.min(1440, Math.max(endMin, startMin + 15));
                    const top = (startMin / 60) * HOUR_PX;
                    const height = Math.max(14, ((endMin - startMin) / 60) * HOUR_PX);
                    const w = 100 / ev._cols;
                    const mine = ev.creator?.id === meId || ev.occurrence;
                    const col = eventColorHex(ev);
                    return (
                      <div
                        key={ev.id}
                        className={`tg-ev${ev.busy ? ' busy' : ''}`}
                        style={{
                          top,
                          height,
                          left: `calc(${ev._col * w}% + 1px)`,
                          width: `calc(${w}% - 2px)`,
                          background: ev.busy ? 'rgba(255,255,255,.10)' : col + '33',
                          borderLeft: `3px solid ${col}`,
                          color: ev.busy ? 'var(--dim)' : '#fff',
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (!mine || ev.busy) {
                            // not editable: tap to open only
                            return;
                          }
                          const min = minFromPointer(e);
                          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                          setDrag({
                            mode: 'move',
                            ev,
                            dayIndex: di,
                            grabOffsetMin: min - startMin,
                            curStartMin: startMin,
                            durMin: endMin - startMin,
                            moved: false,
                          });
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          // if it wasn't a drag (non-editable events), open here
                          if (!mine || ev.busy) onOpenEvent(ev);
                        }}
                      >
                        <div className="tg-ev-t">{ev.busy ? 'Busy' : ev.title || '(no title)'}</div>
                        {height > 30 && !ev.busy && (
                          <div className="tg-ev-s">{fmtTime(ev.startTime)}</div>
                        )}
                        {mine && !ev.busy && (
                          <div
                            className="tg-ev-resize"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                              setDrag({
                                mode: 'resize',
                                ev,
                                dayIndex: di,
                                startMin,
                                curEndMin: endMin,
                                moved: false,
                              });
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                  {/* drag-create ghost */}
                  {drag && drag.mode === 'create' && drag.dayIndex === di && (
                    <div
                      className="tg-ghost"
                      style={{
                        top: (Math.min(drag.anchorMin, drag.curMin) / 60) * HOUR_PX,
                        height: (Math.abs(drag.curMin - drag.anchorMin) / 60) * HOUR_PX,
                      }}
                    />
                  )}
                  {showNow && (
                    <div className="tg-now" style={{ top: (nowMin / 60) * HOUR_PX }}>
                      <span className="tg-now-dot" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
