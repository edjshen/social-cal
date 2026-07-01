'use client';
import { useState } from 'react';
import Link from 'next/link';
import { relTime } from '@/lib/format';
import type { OrgListItem } from '@/lib/rewards/queries';
import ScanCheckin from './ScanCheckin';
import { TierBadge } from './rewards-bits';

// Organizer-focused discovery: the list is sorted (server-side) by orgs with the
// soonest upcoming rewards event. Your standing (tier + points) with each shows
// inline. A floating "Check in" opens the scanner.
export default function OrganizationsView({ orgs }: { orgs: OrgListItem[] }) {
  const [scanning, setScanning] = useState(false);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="kicker">Organizations</div>
          <div className="h-title">Scenes with something coming up</div>
        </div>
        <button className="btn solid" onClick={() => setScanning(true)}>
          Check in
        </button>
      </div>

      {!orgs.length && (
        <div className="empty">
          No organizations yet.
          <br />
          When an organizer sends an event your way, they&apos;ll show up here.
        </div>
      )}

      {orgs.map(({ org, nextEvent, balance, tier, following }) => (
        <Link className="org-row" key={org.id} href={`/organizations/${org.slug}`}>
          <div className="org-avatar" aria-hidden>
            {org.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.avatar} alt="" />
            ) : (
              org.name.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="info">
            <div className="nm">
              {org.name}
              {following && <span className="ct">following</span>}
            </div>
            <div className="sub">
              {nextEvent
                ? `Next: ${nextEvent.title}${nextEvent.venueArea ? ' · ' + nextEvent.venueArea : ''} · ${relTime(nextEvent.startsAt)}`
                : 'No upcoming events'}
            </div>
          </div>
          <div className="org-standing">
            <TierBadge tier={tier} />
            {balance.earned > 0 && <span className="pts-pill">{balance.spendable} pts</span>}
          </div>
        </Link>
      ))}

      <div className="footnote">
        Show up, scan the venue code, earn points — globally and with each scene.
      </div>

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
