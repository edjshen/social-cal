'use client';
import { useState } from 'react';
import Segmented from './primitives/Segmented';
import EventCard from './EventCard';
import WeekGrid from './WeekGrid';
import MonthGrid from './MonthGrid';
import { dayLabel } from '@/lib/format';

export default function DiscoverClient({ events, meId, week, month }: { events: any[]; meId: string; week?: any; month?: any }) {
  const [view, setView] = useState('discover');
  const seg = <Segmented options={[{ value: 'discover', label: 'Discover' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} value={view} onChange={setView} />;
  if (view === 'week') return <>{seg}<WeekGrid events={week?.events ?? []} weekStartISO={week?.weekStartISO} /></>;
  if (view === 'month') return <>{seg}<MonthGrid events={month?.events ?? []} monthISO={month?.monthISO} /></>;
  let last = '';
  return (
    <>
      <div className="topbar"><div><div className="kicker">Discover</div><div className="h-title">This week</div></div></div>
      {seg}
      {events.length === 0 && <div className="empty">Nothing on the radar this week.<br />Tap ＋ to start something.</div>}
      {events.map((ev) => { const dl = dayLabel(ev.startTime); const head = dl !== last ? <div className="daylabel" key={'d' + ev.id}>{dl}</div> : null; last = dl; return <div key={ev.id}>{head}<EventCard ev={ev} meId={meId} /></div>; })}
      {events.length > 0 && <div className="footnote">— that's your week —</div>}
    </>
  );
}
