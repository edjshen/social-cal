// Small presentational bits shared by the rewards surfaces. No hooks → usable in
// server or client components.
import type { ResolvedTier } from '@/lib/domain/rewards';

export function TierBadge({ tier }: { tier: ResolvedTier }) {
  const label = tier.current?.name ?? 'Newcomer';
  return <span className={`tier-badge${tier.current ? ' has' : ''}`}>{label}</span>;
}

export function TierProgress({ tier, earned }: { tier: ResolvedTier; earned: number }) {
  if (!tier.next) {
    return <div className="tier-progress-note">Top tier reached</div>;
  }
  const remaining = Math.max(0, tier.next.minPoints - earned);
  return (
    <div className="tier-progress">
      <div className="tier-progress-bar">
        <span style={{ width: `${Math.round(tier.progress * 100)}%` }} />
      </div>
      <div className="tier-progress-note">
        {remaining} pts to <b>{tier.next.name}</b>
      </div>
    </div>
  );
}

export function PointsPill({ value, label }: { value: number; label?: string }) {
  return (
    <span className="pts-pill">
      {value}
      {label ? ` ${label}` : ' pts'}
    </span>
  );
}
