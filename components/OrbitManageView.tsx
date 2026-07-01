'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Avatar from './primitives/Avatar';
import Sheet from './primitives/Sheet';
import { CAL_COLORS } from './calendar/util';
import { timeLabel } from '@/lib/format';
import {
  renameOrbit,
  setOrbitColor,
  deleteOrbit,
  addOrbitMember,
  removeOrbitMember,
  leaveOrbit,
} from '@/lib/actions/orbits';

type PublicUser = {
  id: string;
  handle: string;
  displayName: string;
  avatar: string;
  initials: string;
};
type Member = PublicUser & { role: string };
type OrbitLite = { id: string; name: string; color: string | null };
type Upcoming = {
  id: string;
  title?: string;
  startTime: string;
  location?: string;
  recurring?: string | null;
};

export function orbitHex(color: string | null): string {
  return CAL_COLORS.find((c) => c.key === color)?.hex || '#9B8CFF';
}

export default function OrbitManageView({
  orbit,
  isOwner,
  meId,
  members,
  candidates,
  upcoming,
}: {
  orbit: OrbitLite;
  isOwner: boolean;
  meId: string;
  members: Member[];
  candidates: PublicUser[];
  upcoming: Upcoming[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(orbit.name);
  const [color, setColor] = useState<string>(orbit.color || '');
  const [busy, setBusy] = useState(false);

  function run(fn: () => Promise<unknown>, after?: () => void) {
    startTransition(async () => {
      await fn();
      after ? after() : router.refresh();
    });
  }

  function saveEdits() {
    setBusy(true);
    startTransition(async () => {
      if (name.trim() && name.trim() !== orbit.name) await renameOrbit(orbit.id, name.trim());
      if ((color || null) !== orbit.color) await setOrbitColor(orbit.id, color || null);
      setBusy(false);
      setEditOpen(false);
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!confirm(`Delete "${orbit.name}"? Its shared calendar goes away for everyone.`)) return;
    run(
      () => deleteOrbit(orbit.id),
      () => router.push('/you')
    );
  }

  function confirmLeave() {
    if (!confirm(`Leave "${orbit.name}"?`)) return;
    run(
      () => leaveOrbit(orbit.id),
      () => router.push('/you')
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <span className="orbit-dot lg" style={{ background: orbitHex(orbit.color) }} />
          <div>
            <div className="kicker">Orbit calendar</div>
            <div className="h-title">{orbit.name}</div>
          </div>
        </div>
        <Link href="/you" className="btn sm">
          Done
        </Link>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '12px 2px 0' }}>
        Everyone here shares one calendar. Any event a member toggles onto this orbit shows up for
        the whole group.
      </p>

      <div className="row" style={{ gap: 10, marginTop: 14 }}>
        {isOwner ? (
          <button className="btn sm" onClick={() => setEditOpen(true)}>
            Edit orbit
          </button>
        ) : (
          <button className="btn sm" onClick={confirmLeave}>
            Leave orbit
          </button>
        )}
      </div>

      <div className="sub-h">Members ({members.length})</div>
      {members.map((m) => (
        <div key={m.id} className="reg">
          <Avatar user={m} size="lg" />
          <div className="info">
            <div className="nm">
              {m.displayName}
              {m.id === meId && <span className="muted"> · you</span>}
            </div>
            <div className="sub">{m.role === 'owner' ? 'Owner' : '@' + m.handle}</div>
          </div>
          {isOwner && m.role !== 'owner' && (
            <button className="btn sm" onClick={() => run(() => removeOrbitMember(orbit.id, m.id))}>
              Remove
            </button>
          )}
          {!isOwner && m.id === meId && (
            <button className="btn sm" onClick={confirmLeave}>
              Leave
            </button>
          )}
        </div>
      ))}

      <div className="sub-h">Add from your orbit</div>
      {candidates.length === 0 ? (
        <div className="empty" style={{ padding: 18 }}>
          Everyone you&apos;re connected to is already here. Add more people from{' '}
          <Link href="/circles" style={{ color: 'var(--violet)' }}>
            My Orbit
          </Link>
          .
        </div>
      ) : (
        candidates.map((u) => (
          <div key={u.id} className="reg">
            <Avatar user={u} size="lg" />
            <div className="info">
              <div className="nm">{u.displayName}</div>
              <div className="sub">@{u.handle}</div>
            </div>
            <button className="btn sm in" onClick={() => run(() => addOrbitMember(orbit.id, u.id))}>
              Add
            </button>
          </div>
        ))
      )}

      <div className="sub-h">Upcoming on this calendar</div>
      {upcoming.length === 0 ? (
        <div className="empty" style={{ padding: 18 }}>
          Nothing yet. When you create an event, toggle this orbit on to share it here.
        </div>
      ) : (
        upcoming.map((ev) => {
          const d = new Date(ev.startTime);
          return (
            <div key={ev.id} className="up">
              <div className="when">
                <b>{d.getDate()}</b>
                <span>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              </div>
              <div className="body">
                <div className="t">
                  {ev.title}
                  {ev.recurring && <span style={{ color: 'var(--violet)' }}> ↻</span>}
                </div>
                <div className="s">
                  {timeLabel(ev.startTime)}
                  {ev.location ? ' · ' + ev.location : ''}
                </div>
              </div>
            </div>
          );
        })
      )}

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <h3>Edit orbit</h3>
        <div className="field">
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
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
        <button className="btn solid block" disabled={busy} onClick={saveEdits}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          className="btn block"
          style={{ marginTop: 10, color: 'var(--rose, #FF5E87)' }}
          onClick={confirmDelete}
        >
          Delete orbit
        </button>
      </Sheet>
    </>
  );
}
