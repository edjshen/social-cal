'use client';
import { useState } from 'react';
import { relTime } from '@/lib/format';
import Avatar from './primitives/Avatar';
import CreateSheet from './CreateSheet';

type Regular = { user: any; count: number; last: string | null; contexts: string[] };

export default function RegularsView({
  regulars,
  rising,
}: {
  regulars: Regular[];
  rising: Regular[];
}) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<
    { type?: string; title?: string; recurring?: boolean } | undefined
  >();

  function openStanding(firstName: string) {
    setPrefill({ type: 'plan', recurring: true, title: `Standing plan with ${firstName}` });
    setOpen(true);
  }

  const top = regulars[0];

  return (
    <>
      <div className="topbar">
        <div>
          <div className="kicker">Regulars</div>
          <div className="h-title">Familiar faces</div>
        </div>
      </div>
      <div style={{ margin: '12px 2px 0' }}>
        <span className="priv">Only you can see this</span>
      </div>
      {!regulars.length && !rising.length && (
        <div className="empty">
          No regulars yet.
          <br />
          The more you show up, the more the people you keep seeing surface here.
        </div>
      )}
      {top && (
        <div className="insight">
          <p>
            You &amp; <b>{top.user.displayName.split(' ')[0]}</b> have overlapped{' '}
            <b>{top.count}×</b> — make it a ritual?
          </p>
          <button
            className="btn solid block"
            onClick={() => openStanding(top.user.displayName.split(' ')[0])}
          >
            Suggest a standing plan
          </button>
        </div>
      )}
      {regulars.map((r) => (
        <div className="reg" key={r.user.id}>
          <Avatar user={r.user} size="lg" />
          <div className="info">
            <div className="nm">
              {r.user.displayName} <span className="ct">{r.count}× this month</span>
            </div>
            <div className="sub">
              {r.contexts.length ? 'usually ' + r.contexts.join(' + ') : 'seen recently'}
              {r.last ? ' · last ' + relTime(r.last) : ''}
            </div>
          </div>
          <button className="btn sm" onClick={() => openStanding(r.user.displayName.split(' ')[0])}>
            Standing plan
          </button>
        </div>
      ))}
      {rising.length > 0 && (
        <>
          <div className="sub-h">Becoming regulars</div>
          {rising.map((r) => (
            <div className="reg" key={r.user.id}>
              <Avatar user={r.user} size="lg" />
              <div className="info">
                <div className="nm">
                  {r.user.displayName} <span className="trend">↑ trending</span>
                </div>
                <div className="sub">
                  {r.contexts.length ? 'usually ' + r.contexts.join(' + ') : 'seen recently'}
                  {r.last ? ' · last ' + relTime(r.last) : ''}
                </div>
              </div>
              <button
                className="btn sm"
                onClick={() => openStanding(r.user.displayName.split(' ')[0])}
              >
                Say hi
              </button>
            </div>
          ))}
        </>
      )}
      {(regulars.length > 0 || rising.length > 0) && (
        <div className="footnote">
          Private to you. Counts &amp; faces — never a behavioral dossier.
        </div>
      )}
      <CreateSheet open={open} onOpenChange={setOpen} prefill={prefill} />
    </>
  );
}
