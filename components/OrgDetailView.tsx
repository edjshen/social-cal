'use client';
import { useState } from 'react';
import { relTime } from '@/lib/format';
import type { OrgDetail } from '@/lib/rewards/queries';
import { setRewardRsvp, toggleFollowOrg } from '@/lib/actions/rewards';
import ScanCheckin from './ScanCheckin';
import RedeemButton from './RedeemButton';
import { TierBadge, TierProgress } from './rewards-bits';

export default function OrgDetailView({ detail }: { detail: OrgDetail }) {
  const { org, upcoming, perks, balance, tier, history } = detail;
  const [following, setFollowing] = useState(detail.following);
  const [pendingFollow, setPendingFollow] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function onFollow() {
    setPendingFollow(true);
    const r = await toggleFollowOrg(org.id);
    setFollowing(r.following);
    setPendingFollow(false);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="kicker">{org.name}</div>
          <div className="h-title">Your standing</div>
        </div>
        <button className="btn" onClick={onFollow} disabled={pendingFollow}>
          {following ? 'Following' : 'Follow'}
        </button>
      </div>

      <div className="standing-card">
        <div className="standing-top">
          <TierBadge tier={tier} />
          <span className="pts-big">{balance.spendable}</span>
          <span className="sub">spendable · {balance.earned} earned</span>
        </div>
        <TierProgress tier={tier} earned={balance.earned} />
        <button className="btn solid block" onClick={() => setScanning(true)}>
          Check in to an event
        </button>
      </div>

      <div className="sub-h">Upcoming</div>
      {!upcoming.length && <div className="empty">No upcoming events right now.</div>}
      {upcoming.map((e) => (
        <div className="reg" key={e.id}>
          <div className="info">
            <div className="nm">{e.title}</div>
            <div className="sub">
              {e.venueArea ? e.venueArea + ' · ' : ''}
              {relTime(e.startsAt)}
              {e.orgBasePoints > 0 ? ` · +${e.orgBasePoints} here` : ''}
              {detail.goingCounts[e.id] ? ` · ${detail.goingCounts[e.id]} going` : ''}
            </div>
          </div>
          <RsvpButton eventId={e.id} initial={detail.myRsvps[e.id] ?? null} />
        </div>
      ))}

      <div className="sub-h">Perks</div>
      {!perks.length && <div className="empty">This scene hasn&apos;t added perks yet.</div>}
      {perks.map((p) => (
        <div className="perk" key={p.id}>
          <div className="info">
            <div className="nm">{p.title}</div>
            {p.description && <div className="sub">{p.description}</div>}
            {p.minTier && <div className="sub">Requires {p.minTier}</div>}
          </div>
          <RedeemButton
            perkId={p.id}
            perkScope={org.id}
            pointCost={p.pointCost}
            spendable={balance.spendable}
            disabledReason={
              p.minTier && (tier.current?.name ?? '') !== p.minTier && !aboveTier(detail, p.minTier)
                ? `${p.minTier} only`
                : undefined
            }
          />
        </div>
      ))}

      {history.length > 0 && (
        <>
          <div className="sub-h">Your history</div>
          {history.slice(0, 12).map((h, i) => (
            <div className="hist-row" key={i}>
              <span>{h.label}</span>
              <span className="sub">
                {h.points ? `+${h.points} ` : ''}
                {relTime(h.at)}
              </span>
            </div>
          ))}
        </>
      )}

      {scanning && (
        <div className="rw-backdrop" onClick={() => setScanning(false)}>
          <div className="rw-sheet" onClick={(e) => e.stopPropagation()}>
            <ScanCheckin onClose={() => setScanning(false)} />
          </div>
        </div>
      )}
    </>
  );
}

// RSVP toggle for an upcoming reward event. RSVP'ing 'going' early unlocks the
// org's early-RSVP bonus at check-in.
function RsvpButton({ eventId, initial }: { eventId: string; initial: 'going' | 'cant' | null }) {
  const [status, setStatus] = useState<'going' | 'cant' | null>(initial);
  const [busy, setBusy] = useState(false);
  async function set(next: 'going' | 'cant') {
    setBusy(true);
    const r = await setRewardRsvp(eventId, next);
    setStatus(r.status);
    setBusy(false);
  }
  return (
    <button
      className={`btn sm${status === 'going' ? ' solid' : ''}`}
      onClick={() => set(status === 'going' ? 'cant' : 'going')}
      disabled={busy}
    >
      {status === 'going' ? 'Going' : 'RSVP'}
    </button>
  );
}

// Has the user earned at least the named tier (by threshold)?
function aboveTier(detail: OrgDetail, tierName: string): boolean {
  const t = detail.tiers.find((x) => x.name === tierName);
  if (!t) return true;
  return detail.balance.earned >= t.minPoints;
}
