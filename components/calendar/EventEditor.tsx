'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sheet from '../primitives/Sheet';
import { createEvent, updateEvent } from '@/lib/actions/events';
import { CalEvent, CAL_COLORS, toDateInput, toLocalInput } from './util';
import RecurScopePrompt, { type Scope } from './RecurScopePrompt';

const TYPES: [string, string][] = [
  ['intention', 'Free'],
  ['plan', 'Plan'],
  ['event', 'Event'],
  ['scene', 'Scene'],
];
const VIS: [string, string][] = [
  ['inner', 'Inner circle'],
  ['orbit', 'Outer circle'],
  ['public', 'Public'],
];
const RECUR: [string, string][] = [
  ['', 'Does not repeat'],
  ['daily', 'Daily'],
  ['weekly', 'Weekly'],
  ['weekday', 'Every weekday (Mon–Fri)'],
  ['monthly', 'Monthly'],
  ['yearly', 'Yearly'],
];

type Init = {
  existing?: CalEvent;
  startISO?: string;
  endISO?: string;
};

export default function EventEditor({
  open,
  init,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  init: Init;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const ex = init.existing;
  const isEdit = !!ex;

  const s0 = ex ? new Date(ex.startTime) : init.startISO ? new Date(init.startISO) : defaultStart();
  const e0 = ex?.endTime
    ? new Date(ex.endTime)
    : init.endISO
      ? new Date(init.endISO)
      : new Date(s0.getTime() + 3600000);

  const [title, setTitle] = useState(ex?.title || '');
  const [allDay, setAllDay] = useState(!!ex?.allDay);
  const [start, setStart] = useState(s0);
  const [end, setEnd] = useState(e0);
  const [type, setType] = useState(ex?.type && ex.type !== 'busy' ? ex.type : 'event');
  const [vis, setVis] = useState(ex?.visibility || 'inner');
  const [recur, setRecur] = useState(ex?.recurring || '');
  const [color, setColor] = useState<string>(ex?.color || '');
  const [location, setLocation] = useState(ex?.location || '');
  const [desc, setDesc] = useState(ex?.description || '');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState('');
  const [scopeAsk, setScopeAsk] = useState(false);
  // Editing a generated occurrence of a series → ask which instances to change.
  const isOccurrence = !!ex?.occurrence;

  function save() {
    if (!title.trim()) {
      setErr('Add a title');
      return;
    }
    if (isEdit && isOccurrence) {
      setScopeAsk(true);
      return;
    }
    void commit();
  }

  async function commit(scope?: Scope) {
    setPending(true);
    setErr('');
    try {
      const startISO = (allDay ? atMidnight(start) : start).toISOString();
      const endISO = (allDay ? atMidnight(end) : end).toISOString();
      const payload = {
        type,
        title: title.trim(),
        description: desc,
        location,
        startTime: startISO,
        endTime: endISO,
        recurring: recur || null,
        allDay,
        color: color || null,
        visibility: vis,
      };
      if (isEdit) await updateEvent(ex!.id, payload, scope ? { scope } : undefined);
      else await createEvent(payload);
      setPending(false);
      setScopeAsk(false);
      onOpenChange(false);
      onSaved();
      router.refresh();
    } catch (e: any) {
      setPending(false);
      setScopeAsk(false);
      setErr(e?.message || 'Could not save');
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <h3>{isEdit ? 'Edit event' : 'New event'}</h3>

      <div className="field">
        <input
          autoFocus
          type="text"
          placeholder="Add title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ fontSize: 18 }}
        />
      </div>

      <label className="ce-switch">
        <span>All-day</span>
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
      </label>

      <div className="row" style={{ gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Starts</label>
          {allDay ? (
            <input
              type="date"
              value={toDateInput(start)}
              onChange={(e) => setStart(syncDate(start, e.target.value))}
            />
          ) : (
            <input
              type="datetime-local"
              value={toLocalInput(start)}
              onChange={(e) => setStart(new Date(e.target.value))}
            />
          )}
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Ends</label>
          {allDay ? (
            <input
              type="date"
              value={toDateInput(end)}
              onChange={(e) => setEnd(syncDate(end, e.target.value))}
            />
          ) : (
            <input
              type="datetime-local"
              value={toLocalInput(end)}
              onChange={(e) => setEnd(new Date(e.target.value))}
            />
          )}
        </div>
      </div>

      <div className="field">
        <label>Repeat</label>
        <select value={recur} onChange={(e) => setRecur(e.target.value)}>
          {RECUR.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Location</label>
        <input
          type="text"
          placeholder="Add location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Type</label>
        <div className="chips">
          {TYPES.map(([v, l]) => (
            <span
              key={v}
              className={`chip pick ${type === v ? 'on' : ''}`}
              onClick={() => setType(v)}
            >
              {l}
            </span>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Color</label>
        <div className="ce-colors">
          <span
            className={`ce-sw ce-auto${color === '' ? ' on' : ''}`}
            onClick={() => setColor('')}
            title="Default (by type)"
          >
            A
          </span>
          {CAL_COLORS.map((c) => (
            <span
              key={c.key}
              className={`ce-sw${color === c.key ? ' on' : ''}`}
              style={{ background: c.hex }}
              onClick={() => setColor(c.key)}
              title={c.name}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <label>Who can see it</label>
        <div className="chips">
          {VIS.map(([v, l]) => (
            <span
              key={v}
              className={`chip pick ${vis === v ? 'on' : ''}`}
              onClick={() => setVis(v)}
            >
              {l}
            </span>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Description</label>
        <textarea placeholder="Add notes" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>

      {err && <div className="error">{err}</div>}
      <button className="btn solid block" disabled={pending} onClick={save}>
        {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add to calendar'}
      </button>

      {scopeAsk && (
        <RecurScopePrompt
          open={scopeAsk}
          title="Save recurring event"
          onOpenChange={setScopeAsk}
          onPick={(s) => commit(s)}
        />
      )}
    </Sheet>
  );
}

function defaultStart() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}
function atMidnight(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function syncDate(prev: Date, val: string) {
  const [y, m, day] = val.split('-').map(Number);
  const x = new Date(prev);
  x.setFullYear(y, m - 1, day);
  return x;
}
