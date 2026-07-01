'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AnchoredSheet, { type Anchor } from '../primitives/AnchoredSheet';
import { createEvent, updateEvent } from '@/lib/actions/events';
import { myOrbits } from '@/lib/actions/orbits';
import { orbitHex } from '../OrbitManageView';
import { CalEvent, CAL_COLORS, toDateInput, toLocalInput } from './util';
import RecurScopePrompt, { type Scope } from './RecurScopePrompt';

const TYPES: [string, string][] = [
  ['intention', 'Free'],
  ['plan', 'Plan'],
  ['event', 'Event'],
  ['scene', 'Scene'],
];
// Personal-calendar audience for the event.
const AUDIENCE: [string, string][] = [
  ['private', 'Just me'],
  ['orbit', 'My Orbit'],
  ['public', 'Public'],
];
type OrbitOpt = { id: string; name: string; color: string | null };
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
  anchor,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  init: Init;
  anchor?: Anchor;
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
  // Legacy 'inner' events read as 'My Orbit' in the collapsed model.
  const [vis, setVis] = useState(ex?.visibility === 'inner' ? 'orbit' : ex?.visibility || 'orbit');
  const [orbits, setOrbits] = useState<OrbitOpt[]>([]);
  const [picked, setPicked] = useState<string[]>((ex?.orbits || []).map((o) => o.id));
  const [recur, setRecur] = useState(ex?.recurring || '');
  const [color, setColor] = useState<string>(ex?.color || '');
  const [location, setLocation] = useState(ex?.location || '');
  const [desc, setDesc] = useState(ex?.description || '');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState('');
  const [scopeAsk, setScopeAsk] = useState(false);
  // Editing a generated occurrence of a series → ask which instances to change.
  const isOccurrence = !!ex?.occurrence;

  // Load the user's orbit calendars so the event can be toggled onto any of them.
  useEffect(() => {
    let alive = true;
    myOrbits()
      .then((os) => alive && setOrbits(os.map((o) => ({ id: o.id, name: o.name, color: o.color }))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const toggleOrbit = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

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
        orbitIds: picked,
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
    <AnchoredSheet open={open} onOpenChange={onOpenChange} anchor={anchor}>
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
            <button
              key={v}
              type="button"
              className={`chip pick ${type === v ? 'on' : ''}`}
              onClick={() => setType(v)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Color</label>
        <div className="ce-colors">
          <button
            type="button"
            className={`ce-sw ce-auto${color === '' ? ' on' : ''}`}
            onClick={() => setColor('')}
            title="Default (by type)"
          >
            A
          </button>
          {CAL_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`ce-sw${color === c.key ? ' on' : ''}`}
              style={{ background: c.hex }}
              onClick={() => setColor(c.key)}
              title={c.name}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <label>Add to calendars</label>
        <div className="chips">
          {AUDIENCE.map(([v, l]) => (
            <button
              key={v}
              type="button"
              className={`chip pick ${vis === v ? 'on' : ''}`}
              onClick={() => setVis(v)}
            >
              {l}
            </button>
          ))}
        </div>
        {orbits.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {orbits.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`chip pick orbit-chip ${picked.includes(o.id) ? 'on' : ''}`}
                onClick={() => toggleOrbit(o.id)}
              >
                <span className="orbit-dot" style={{ background: orbitHex(o.color) }} />
                {o.name}
              </button>
            ))}
          </div>
        )}
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
    </AnchoredSheet>
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
