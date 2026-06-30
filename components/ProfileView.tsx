'use client';
import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Avatar from './primitives/Avatar';
import Sheet from './primitives/Sheet';
import Icon from './primitives/Icon';
import { timeLabel } from '@/lib/format';
import { updateProfile } from '@/lib/actions/profile';
import { logout } from '@/lib/actions/auth';
import { isNative, nativeShare, nativeCopy } from '@/lib/native/bridge.js';
import type { ProfileData } from '@/lib/db/profile';

const VIS: Record<string, [string, string]> = {
  inner: ['inner', 'Inner'],
  orbit: ['orbit', 'Outer'],
  public: ['public', 'Public'],
};

export default function ProfileView({ data }: { data: ProfileData }) {
  const { user, upcoming, isSelf, stats } = data;
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dn, setDn] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio || '');
  const [scenes, setScenes] = useState((user.scenes || []).join(', '));
  // Initialize from the user's CURRENT ghost state — hardcoding false here let a
  // ghost user silently un-ghost themselves by saving any other edit.
  const [ghost, setGhost] = useState(!!user.ghost);
  const [, startTransition] = useTransition();

  function openEdit() {
    setDn(user.displayName);
    setBio(user.bio || '');
    setScenes((user.scenes || []).join(', '));
    setGhost(!!user.ghost);
    setSheetOpen(true);
  }

  function saveProfile() {
    const parsedScenes = scenes
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    startTransition(async () => {
      await updateProfile({ displayName: dn, bio, scenes: parsedScenes, ghost });
      setSheetOpen(false);
      router.refresh();
    });
  }

  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(location.origin);
  }, []);
  const fullLink = (origin || '') + '/u/' + user.handle;
  const displayLink = origin
    ? (origin + '/u/' + user.handle).replace(/^https?:\/\//, '')
    : user.handle;

  // Share the profile link. Native shell → OS share sheet (then clipboard) via
  // the injected Capacitor plugins; else Web Share; else clipboard. Mirrors the
  // room-cast cascade in app/rooms/_client/cast/link.js (kept inline rather than
  // abstracted — only two call sites). ponytail: duplicates ~6 lines on purpose.
  async function copyLink() {
    const url = location.origin + '/u/' + user.handle;
    if (isNative()) {
      const res = await nativeShare({ title: '@' + user.handle, url });
      if (res === 'shared' || res === 'cancelled') return;
      if (await nativeCopy(url)) return;
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: '@' + user.handle, url });
        return;
      } catch (err) {
        if (err && (err as Error).name === 'AbortError') return;
      }
    }
    navigator.clipboard?.writeText(url);
  }

  const s: { regulars?: number; plans?: number; scenes?: number } = stats || {};

  return (
    <>
      <div className="banner" />
      <div className="pf-head pf-grid">
        <div className="pf-aside">
          <Avatar user={user} size="xl" className="pf-av" />
          <div className="pf-name">{user.displayName}</div>
          <div className="pf-handle">@{user.handle}</div>
          {user.bio && <div className="pf-bio">{user.bio}</div>}
          {(user.scenes || []).length > 0 && (
            <div className="chips" style={{ marginTop: 13 }}>
              {(user.scenes || []).map((s) => (
                <span key={s} className="chip">
                  {s}
                </span>
              ))}
            </div>
          )}
          <div className="linkrow">
            <div className="linkbox">
              <Icon name="link" /> {displayLink}
            </div>
            <button className="btn solid" onClick={copyLink}>
              Share
            </button>
          </div>
          <div className="row" style={{ gap: 10, marginTop: 10 }}>
            {isSelf && (
              <button className="btn sm" onClick={openEdit}>
                Edit profile
              </button>
            )}
            <Link href="/circles" className="btn sm">
              Circles
            </Link>
            <form action={logout} style={{ marginLeft: 'auto' }}>
              <button type="submit" className="btn sm">
                Log out
              </button>
            </form>
          </div>
        </div>
        <div className="pf-main">
          <div className="kicker" style={{ margin: '22px 0 6px' }}>
            What I&apos;m going to
          </div>
          {upcoming.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}>
              Nothing upcoming yet.
            </div>
          ) : (
            upcoming.map((ev: any) => {
              if (ev.busy) return null;
              const d = new Date(ev.startTime);
              const [vc, vl] = VIS[ev.visibility] || VIS.inner;
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
                  <span className="vis">
                    <Icon name={vc as any} /> {vl}
                  </span>
                </div>
              );
            })
          )}
          {isSelf && (
            <div className="statline">
              <div>
                <b>{s.regulars || 0}</b>
                <span>regulars</span>
              </div>
              <div>
                <b>{s.plans || 0}</b>
                <span>plans</span>
              </div>
              <div>
                <b>{s.scenes || 0}</b>
                <span>scenes</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <h3>Edit profile</h3>
        <div className="field">
          <label>Display name</label>
          <input type="text" value={dn} onChange={(e) => setDn(e.target.value)} />
        </div>
        <div className="field">
          <label>Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        <div className="field">
          <label>Scenes (comma separated)</label>
          <input type="text" value={scenes} onChange={(e) => setScenes(e.target.value)} />
        </div>
        <label className="row" style={{ gap: 9, margin: '4px 0 16px' }}>
          <input
            type="checkbox"
            checked={ghost}
            onChange={(e) => setGhost(e.target.checked)}
            style={{ width: 'auto' }}
          />
          <span className="muted">Ghost mode — hide my profile</span>
        </label>
        <button className="btn solid block" onClick={saveProfile}>
          Save
        </button>
      </Sheet>
    </>
  );
}
