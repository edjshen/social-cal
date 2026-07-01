'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sheet from './primitives/Sheet';
import { createEvent } from '@/lib/actions/events';
import { myOrbits } from '@/lib/actions/orbits';
import { orbitHex } from './OrbitManageView';

const TYPES = [
  ['intention', 'Free / intention'],
  ['plan', 'Plan'],
  ['event', 'Event'],
] as const;
// Personal-calendar audience (who among your own graph sees it).
const AUDIENCE = [
  ['private', 'Just me'],
  ['orbit', 'My Orbit'],
  ['public', 'Public'],
] as const;
type OrbitOpt = { id: string; name: string; color: string | null };
const defaultStart = () => {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function CreateSheet({
  open,
  onOpenChange,
  prefill,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prefill?: { type?: string; title?: string; recurring?: boolean };
}) {
  const router = useRouter();
  const [type, setType] = useState(prefill?.type || 'event');
  const [vis, setVis] = useState('orbit');
  const [orbits, setOrbits] = useState<OrbitOpt[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState('');

  // Load the user's orbit calendars when the sheet opens so they can toggle the
  // event onto any of them.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    myOrbits()
      .then((os) => alive && setOrbits(os.map((o) => ({ id: o.id, name: o.name, color: o.color }))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  const toggleOrbit = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit(form: FormData) {
    const title = String(form.get('title') || '');
    if (!title) {
      setErr('Add a title');
      return;
    }
    setErr('');
    const start = String(form.get('start'));
    const expiresAt =
      type === 'intention'
        ? (() => {
            const d = new Date(start);
            d.setHours(23, 59, 0, 0);
            return d.toISOString();
          })()
        : null;
    setPending(true);
    await createEvent({
      type,
      title,
      location: String(form.get('location') || ''),
      startTime: start,
      endTime: String(form.get('end') || '') || null,
      recurring: form.get('rec') ? 'weekly' : null,
      visibility: vis,
      orbitIds: picked,
      expiresAt,
    });
    setPending(false);
    onOpenChange(false);
    router.push('/plans');
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <h3>Make something</h3>
      <form action={submit}>
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
          <label>Title</label>
          <input
            name="title"
            type="text"
            defaultValue={prefill?.title || ''}
            placeholder="Natural wine night"
          />
        </div>
        <div className="field">
          <label>Where</label>
          <input name="location" type="text" placeholder="Ruffian, East Village" />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Start</label>
            <input name="start" type="datetime-local" defaultValue={defaultStart()} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>End</label>
            <input name="end" type="datetime-local" />
          </div>
        </div>
        <label className="row" style={{ gap: 9, margin: '0 0 14px' }}>
          <input
            name="rec"
            type="checkbox"
            defaultChecked={!!prefill?.recurring}
            style={{ width: 'auto' }}
          />{' '}
          <span className="muted">Repeats weekly (standing)</span>
        </label>
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
        {err && <div className="error">{err}</div>}
        <button className="btn solid block" disabled={pending}>
          Add to my calendar
        </button>
      </form>
    </Sheet>
  );
}
