'use client';
import Link from 'next/link';
import type { Wallet } from '@/lib/rewards/queries';
import RedeemButton from './RedeemButton';
import { TierBadge } from './rewards-bits';

// Global wallet shown on Profile: the platform-wide spendable balance + rank,
// per-org tier badges, and the first-party platform perks catalog.
export default function RewardsWallet({ wallet }: { wallet: Wallet }) {
  const { global, perOrg, platformPerks } = wallet;
  return (
    <section className="wallet">
      <div className="sub-h">Rewards</div>

      <div className="wallet-global">
        <div className="wallet-global-num">{global.spendable}</div>
        <div className="sub">global points · {global.earned} earned all-time</div>
      </div>

      {perOrg.length > 0 && (
        <div className="wallet-orgs">
          {perOrg.map(({ org, balance, tier }) => (
            <Link className="wallet-org" key={org.id} href={`/organizations/${org.slug}`}>
              <span className="nm">{org.name}</span>
              <span className="wallet-org-right">
                <TierBadge tier={tier} />
                <span className="pts-pill">{balance.spendable}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="sub-h">Platform rewards</div>
      {!platformPerks.length && (
        <div className="empty">No platform rewards available right now.</div>
      )}
      {platformPerks.map((p) => (
        <div className="perk" key={p.id}>
          <div className="info">
            <div className="nm">{p.title}</div>
            {p.description && <div className="sub">{p.description}</div>}
          </div>
          <RedeemButton
            perkId={p.id}
            perkScope="platform"
            pointCost={p.pointCost}
            spendable={global.spendable}
          />
        </div>
      ))}
    </section>
  );
}
