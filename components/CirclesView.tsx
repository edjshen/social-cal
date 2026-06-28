'use client';
import { useTransition } from 'react';
import Link from 'next/link';
import Avatar from './primitives/Avatar';
import { acceptRequest, setTier, addPerson } from '@/lib/actions/connections';

type PublicUser = {
  id: string;
  handle: string;
  displayName: string;
  avatar: string;
  initials: string;
};
type ListItem = { user: PublicUser | null; tier: 'inner' | 'orbit' };
type RequestItem = { id: string; user: PublicUser | null };
type OtherUser = PublicUser & { status: string; tier: string | null };

export default function CirclesView({
  inner,
  orbit,
  requests,
  addable,
  pending,
}: {
  inner: ListItem[];
  orbit: ListItem[];
  requests: RequestItem[];
  addable: OtherUser[];
  pending: OtherUser[];
}) {
  const [, startTransition] = useTransition();

  function handleAccept(id: string) {
    startTransition(() => {
      acceptRequest(id);
    });
  }

  function handleSetTier(userId: string, tier: 'inner' | 'orbit') {
    startTransition(() => {
      setTier(userId, tier);
    });
  }

  function handleAddPerson(id: string) {
    startTransition(() => {
      addPerson(id);
    });
  }

  function TierRow({ item }: { item: ListItem }) {
    if (!item.user) return null;
    return (
      <div className="reg">
        <Avatar user={item.user} size="lg" />
        <div className="info">
          <div className="nm">{item.user.displayName}</div>
          <div className="sub">@{item.user.handle}</div>
        </div>
        <div className="seg" style={{ margin: 0, width: 150 }}>
          {(['inner', 'orbit'] as const).map((t) => (
            <button
              key={t}
              className={item.tier === t ? 'on' : ''}
              onClick={() => handleSetTier(item.user!.id, t)}
            >
              {t === 'inner' ? 'Inner' : 'Outer'}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="kicker">People</div>
          <div className="h-title">Your circles</div>
        </div>
        <Link href="/you" className="btn sm">
          Done
        </Link>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '12px 2px 0' }}>
        Inner Circle sees what you&apos;re doing; Outer Circle sees when you&apos;re free.
      </p>

      {requests.length > 0 && (
        <>
          <div className="sub-h">Requests</div>
          {requests.map(
            (r) =>
              r.user && (
                <div key={r.id} className="reg">
                  <Avatar user={r.user} size="lg" />
                  <div className="info">
                    <div className="nm">{r.user.displayName}</div>
                    <div className="sub">wants to connect</div>
                  </div>
                  <button className="btn sm in" onClick={() => handleAccept(r.id)}>
                    Accept
                  </button>
                </div>
              )
          )}
        </>
      )}

      {inner.length > 0 && (
        <>
          <div className="sub-h">Inner circle</div>
          {inner.map((item) => (
            <TierRow key={item.user?.id} item={item} />
          ))}
        </>
      )}

      {orbit.length > 0 && (
        <>
          <div className="sub-h">Outer circle</div>
          {orbit.map((item) => (
            <TierRow key={item.user?.id} item={item} />
          ))}
        </>
      )}

      {addable.length > 0 && (
        <>
          <div className="sub-h">Add people</div>
          {addable.map((u) => (
            <div key={u.id} className="reg">
              <Avatar user={u} size="lg" />
              <div className="info">
                <div className="nm">{u.displayName}</div>
                <div className="sub">@{u.handle}</div>
              </div>
              <button className="btn sm" onClick={() => handleAddPerson(u.id)}>
                Add
              </button>
            </div>
          ))}
        </>
      )}

      {pending.length > 0 && (
        <>
          <div className="sub-h">Requested</div>
          {pending.map((u) => (
            <div key={u.id} className="reg">
              <Avatar user={u} size="lg" />
              <div className="info">
                <div className="nm">{u.displayName}</div>
                <div className="sub">request sent</div>
              </div>
              <span className="btn sm" style={{ opacity: 0.6 }}>
                Pending
              </span>
            </div>
          ))}
        </>
      )}
    </>
  );
}
