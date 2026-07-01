// barycal -> poisys bridge client (return sync). Best-effort: a failed report
// must never break the partygoer's check-in/redeem — points are credited locally
// first and the report is fire-and-forget with the signed envelope.

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { BRIDGE_SIG_HEADER, BRIDGE_TS_HEADER, signPayload } from './bridge';
import type { CheckinReport, RedemptionIssueReport } from './bridge';

interface BridgeEnv {
  BRIDGE_SECRET?: string;
  POISYS_BRIDGE_URL?: string;
}

function bridgeEnv(): BridgeEnv {
  const env = getCloudflareContext().env as unknown as BridgeEnv;
  return {
    BRIDGE_SECRET: env.BRIDGE_SECRET ?? process.env.BRIDGE_SECRET,
    POISYS_BRIDGE_URL: env.POISYS_BRIDGE_URL ?? process.env.POISYS_BRIDGE_URL,
  };
}

async function postSigned(path: string, payload: unknown): Promise<void> {
  const { BRIDGE_SECRET, POISYS_BRIDGE_URL } = bridgeEnv();
  // Bridge not configured (e.g. solo/local dev) — silently skip return sync.
  if (!BRIDGE_SECRET || !POISYS_BRIDGE_URL) return;
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const sig = await signPayload(BRIDGE_SECRET, ts, body);
  try {
    await fetch(`${POISYS_BRIDGE_URL.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [BRIDGE_TS_HEADER]: String(ts),
        [BRIDGE_SIG_HEADER]: sig,
      },
      body,
    });
  } catch {
    // Swallow — a retry/outbox is a follow-up (PRD §9.4); never throw to the UI.
  }
}

export function reportCheckin(report: CheckinReport): Promise<void> {
  return postSigned('/bridge/checkins.report', report);
}

export function reportRedemptionIssued(report: RedemptionIssueReport): Promise<void> {
  return postSigned('/bridge/redemptions.issue', report);
}
