import { startOfDay } from '@/lib/domain/dates';

const PXH = 29;
const BASE = 8;

const TIMES: [string, number][] = [
  ['8 AM', 0],
  ['12 PM', 116],
  ['4 PM', 232],
  ['8 PM', 348],
  ['12 AM', 462],
];

const HOUR_LINES = [116, 232, 348];

export default function WeekGrid({ events, weekStartISO }: { events: any[]; weekStartISO?: string }) {
  const ws = weekStartISO
    ? new Date(weekStartISO)
    : (() => {
        const x = startOfDay(new Date());
        const wd = (x.getDay() + 6) % 7;
        x.setDate(x.getDate() - wd);
        return x;
      })();

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws);
    d.setDate(d.getDate() + i);
    return d;
  });

  const today = startOfDay(new Date()).getTime();

  const headDays = days.map((d, i) => {
    const on = startOfDay(d).getTime() === today;
    return (
      <div key={i} className={on ? 'today' : ''}>
        <div className="wd">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        <div className="dt">{d.getDate()}</div>
      </div>
    );
  });

  const cols = days.map((d, i) => {
    const on = startOfDay(d).getTime() === today;
    const dayEvs = events.filter(
      (e) => startOfDay(e.startTime).getTime() === startOfDay(d).getTime()
    );
    const blocks = dayEvs.map((e) => {
      const s = new Date(e.startTime);
      const hrs = s.getHours() + s.getMinutes() / 60;
      const top = Math.max(0, (hrs - BASE) * PXH);
      const dur = e.endTime ? (new Date(e.endTime).getTime() - s.getTime()) / 36e5 : 1;
      const h = Math.max(16, dur * PXH);
      const cls = e.busy ? 'busy' : e.type;
      const label = e.busy ? '' : (e.title || '').split(' ').slice(0, 2).join(' ');
      return (
        <div
          key={e.id}
          className={`ev ${cls}`}
          style={{ top, height: h }}
        >
          {label}
        </div>
      );
    });
    return (
      <div key={i} className={`wk-col${on ? ' today' : ''}`}>
        {blocks}
      </div>
    );
  });

  // open evenings: weekdays with no event starting >= 17:00
  const mineEve = new Set(
    events
      .filter((e) => !e.busy && new Date(e.startTime).getHours() >= 17)
      .map((e) => startOfDay(e.startTime).getTime())
  );
  const open = days.filter((d) => !mineEve.has(startOfDay(d).getTime())).length;

  return (
    <>
      <div className="cal-h">
        <div className="mo">
          {ws.toLocaleDateString('en-US', { month: 'long' })} <span>{ws.getFullYear()}</span>
        </div>
        <div className="note">
          {open} open<br />evening{open === 1 ? '' : 's'}
        </div>
      </div>
      <div className="wk-days">{headDays}</div>
      <div className="wk-grid">
        <div className="wk-times">
          {TIMES.map(([t, y]) => (
            <span key={t} style={{ top: y }}>
              {t}
            </span>
          ))}
        </div>
        {HOUR_LINES.map((y) => (
          <div key={y} className="wk-line" style={{ top: y }} />
        ))}
        <div className="wk-cols">{cols}</div>
      </div>
    </>
  );
}
