'use client';
import { useState } from 'react';
import { startOfDay } from '@/lib/domain/dates';
import { timeLabel } from '@/lib/format';

export default function MonthGrid({ events, monthISO }: { events: any[]; monthISO?: string }) {
  const now = new Date();
  const refDate = monthISO ? new Date(monthISO) : now;
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const first = new Date(y, m, 1);
  const next = new Date(y, m + 1, 1);

  const today = startOfDay(new Date()).getTime();
  const [selDay, setSelDay] = useState<string>(() => startOfDay(new Date()).toISOString());

  // Build byDay map
  const byDay: Record<number, any[]> = {};
  for (const e of events) {
    const k = startOfDay(e.startTime).getTime();
    if (!byDay[k]) byDay[k] = [];
    byDay[k].push(e);
  }

  // Grid starts on the Sunday before (or on) the 1st
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());

  const sel = startOfDay(selDay).getTime();

  // Build 6-week grid (may break early once we pass next month)
  const rows: React.ReactNode[] = [];
  for (let w = 0; w < 6; w++) {
    const cells: React.ReactNode[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + w * 7 + i);
      const k = startOfDay(d).getTime();
      const inM = d.getMonth() === m;
      const evs = inM ? (byDay[k] || []) : [];
      const types = [...new Set(evs.map((e: any) => (e.busy ? 'busy' : e.type)))].slice(0, 3) as string[];
      const hot = evs.some((e: any) => e.proof && e.proof.count >= 3);
      const cls = [
        inM ? '' : 'out',
        k === today ? 'today' : '',
        k === sel ? 'sel' : '',
        hot ? 'hot' : '',
      ]
        .filter(Boolean)
        .join(' ');
      cells.push(
        <button
          key={i}
          className={`cell ${cls}`}
          onClick={() => setSelDay(d.toISOString())}
        >
          <span className="n">{d.getDate()}</span>
          <div className="dots">
            {types.map((t) => (
              <span key={t} className={`dot ${t}`} />
            ))}
          </div>
        </button>
      );
    }
    rows.push(<div key={w} className="wkrow">{cells}</div>);
    const after = new Date(gridStart);
    after.setDate(gridStart.getDate() + (w + 1) * 7);
    if (after >= next) break;
  }

  // Agenda for selected day
  const selEvs = (byDay[sel] || []).slice().sort(
    (a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  const selD = new Date(selDay);
  const isToday = sel === today;

  const agendaItems =
    selEvs.length > 0 ? (
      selEvs.map((e: any) =>
        e.busy ? (
          <div key={e.id} className="ag">
            <span className="tm">{timeLabel(e.startTime)}</span>
            <span className="bar busy" />
            <span className="t faint">Busy</span>
          </div>
        ) : (
          <div key={e.id} className="ag">
            <span className="tm">{timeLabel(e.startTime)}</span>
            <span className={`bar ${e.type === 'intention' ? 'free' : e.type}`} />
            <span className="t">
              {e.title || ''}
              {e.recurring ? ' ↻' : ''}
              <small>
                {e.location || ''}
                {e.proof && e.proof.count ? ' · ' + e.proof.count + ' going' : ''}
              </small>
            </span>
          </div>
        )
      )
    ) : (
      <div className="empty" style={{ padding: 20 }}>
        Open day.
      </div>
    );

  return (
    <>
      <div className="cal-h">
        <div className="mo">
          {first.toLocaleDateString('en-US', { month: 'long' })} <span>{y}</span>
        </div>
      </div>
      <div className="mo-wd">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      {rows}
      <div className="mo-agenda">
        <div className="kicker">
          {selD.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          {isToday ? ' · Today' : ''}
        </div>
        {agendaItems}
      </div>
    </>
  );
}
