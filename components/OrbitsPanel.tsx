'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sheet from './primitives/Sheet';
import { CAL_COLORS } from './calendar/util';
import { orbitHex } from './OrbitManageView';
import { createOrbit } from '@/lib/actions/orbits';

export type OrbitRow = {
  id: string;
  name: string;
  color: string | null;
  role: string;
  memberCount: number;
};

export default function OrbitsPanel({ orbits }: { orbits: OrbitRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function create() {
    if (!name.trim()) {
      setErr('Name your orbit');
      return;
    }
    setErr('');
    setBusy(true);
    startTransition(async () => {
      try {
        const { id } = await createOrbit({ name: name.trim(), color: color || null });
        setBusy(false);
        setOpen(false);
        setName('');
        setColor('');
        router.push('/orbits/' + id);
      } catch (e) {
        setBusy(false);
        setErr((e as Error)?.message || 'Could not create orbit');
      }
    });
  }

  return (
    <>
      <div className="row" style={{ alignItems: 'center', marginTop: 6 }}>
        <div className="sub-h" style={{ flex: 1, marginBottom: 0 }}>
          Orbits
        </div>
        <button className="btn sm" onClick={() => setOpen(true)}>
          + New
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '6px 2px 10px' }}>
        Group people into a shared calendar. Events you toggle onto an orbit show up for every
        member.
      </p>

      {orbits.length === 0 ? (
        <div className="empty" style={{ padding: 18 }}>
          No orbits yet. Create one to share a calendar with a group.
        </div>
      ) : (
        orbits.map((o) => (
          <Link key={o.id} href={'/orbits/' + o.id} className="reg orbit-row">
            <span className="orbit-dot lg" style={{ background: orbitHex(o.color) }} />
            <div className="info">
              <div className="nm">{o.name}</div>
              <div className="sub">
                {o.memberCount} {o.memberCount === 1 ? 'member' : 'members'}
                {o.role === 'owner' ? ' · Owner' : ''}
              </div>
            </div>
            <span className="btn sm">Open</span>
          </Link>
        ))
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <h3>New orbit</h3>
        <div className="field">
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Climbing crew"
            maxLength={60}
            autoFocus
          />
        </div>
        <div className="field">
          <label>Calendar color</label>
          <div className="ce-colors">
            <button
              type="button"
              className={`ce-sw ce-auto${color === '' ? ' on' : ''}`}
              onClick={() => setColor('')}
              title="Default"
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
        {err && <div className="error">{err}</div>}
        <button className="btn solid block" disabled={busy} onClick={create}>
          {busy ? 'Creating…' : 'Create orbit'}
        </button>
      </Sheet>
    </>
  );
}
