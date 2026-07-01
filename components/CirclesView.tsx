'use client';
import { useTransition } from 'react';
import Link from 'next/link';
import Avatar from './primitives/Avatar';
import { acceptRequest, addPerson } from '@/lib/actions/connections';

type PublicUser = {
  id: string;
  handle: string;
  displayName: string;
  avatar: string;
  initials: string;
};
type RequestItem = { id: string; user: PublicUser | null };
type OtherUser = PublicUser & { status: string };

export default function CirclesView({
  orbit,
  requests,
  addable,
  pending,
}: {
  orbit: PublicUser[];
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

  function handleAddPerson(id: string) {
    startTransition(() => {
      addPerson(id);
    });
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="kicker">People</div>
          <div className="h-title">My Orbit</div>
        </div>
        <Link href="/you" className="btn sm">
          Done
        </Link>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '12px 2px 0' }}>
        Everyone in your orbit sees what you&apos;re up to. Group a few of them into a shared{' '}
        <Link href="/you" style={{ color: 'var(--violet)' }}>
          orbit calendar
        </Link>{' '}
        from your You page.
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

      <div className="sub-h">My orbit</div>
      {orbit.length === 0 ? (
        <div className="empty" style={{ padding: 20 }}>
          No one here yet. Add people below to start your orbit.
        </div>
      ) : (
        orbit.map((u) => (
          <div key={u.id} className="reg">
            <Avatar user={u} size="lg" />
            <div className="info">
              <div className="nm">{u.displayName}</div>
              <div className="sub">@{u.handle}</div>
            </div>
          </div>
        ))
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
