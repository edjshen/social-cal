'use client';
import { useState } from 'react';
import { redeemPerk, type RedeemResult } from '@/lib/actions/rewards';

// Redeem a perk → debit points, mint a one-time code. Org perks are honored by
// the organizer's door scanner; platform `auto-digital` perks fulfill instantly.
export default function RedeemButton({
  perkId,
  perkScope, // 'platform' or an orgId
  pointCost,
  spendable,
  disabledReason,
}: {
  perkId: string;
  perkScope: 'platform' | string;
  pointCost: number;
  spendable: number;
  disabledReason?: string;
}) {
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [busy, setBusy] = useState(false);
  const affordable = spendable >= pointCost;

  async function go() {
    setBusy(true);
    const r = await redeemPerk({ perkScope, perkId });
    setResult(r);
    setBusy(false);
  }

  if (result?.ok) {
    return (
      <div className="redeem-out">
        {result.autoFulfilled ? (
          <span className="redeem-done">Unlocked ✓</span>
        ) : (
          <>
            <span className="redeem-code">{result.code}</span>
            <span className="sub">Show this at the door — expires in 15 min</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="redeem">
      <button
        className="btn sm solid"
        onClick={go}
        disabled={busy || !affordable || !!disabledReason}
      >
        {busy ? '…' : `Redeem · ${pointCost}`}
      </button>
      {disabledReason ? (
        <span className="sub">{disabledReason}</span>
      ) : !affordable ? (
        <span className="sub">{pointCost - spendable} more pts</span>
      ) : null}
      {result && !result.ok && <span className="scan-err">{result.reason}</span>}
    </div>
  );
}
