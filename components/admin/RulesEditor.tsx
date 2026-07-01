'use client';
import { useState, useTransition } from 'react';
import type { GlobalRewardRules } from '@/lib/db/schema';
import { saveGlobalRules } from '@/lib/actions/admin';

// The two v1 global bonuses (PRD §7.2). Stored as a free-form JSON object on the
// rules row; this editor exposes the known keys with a raw-JSON escape hatch.
type Bonuses = {
  sceneExplorer?: { on?: boolean; points?: number; n?: number };
  crossOrgStreak?: { on?: boolean; points?: number; windowDays?: number };
  [k: string]: unknown;
};

function num(v: string, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function RulesEditor({ rules }: { rules?: GlobalRewardRules }) {
  const initial = (rules?.bonuses ?? {}) as Bonuses;
  const [basePoints, setBasePoints] = useState(String(rules?.basePoints ?? 100));

  const se = initial.sceneExplorer ?? {};
  const xs = initial.crossOrgStreak ?? {};
  const [seOn, setSeOn] = useState(se.on !== false);
  // Defaults mirror DEFAULT_GLOBAL_RULES (lib/domain/rewards.ts) — the v1 economy baseline.
  const [sePoints, setSePoints] = useState(String(se.points ?? 150));
  const [seN, setSeN] = useState(String(se.n ?? 3));
  const [xsOn, setXsOn] = useState(xs.on !== false);
  const [xsPoints, setXsPoints] = useState(String(xs.points ?? 50));
  const [xsWindow, setXsWindow] = useState(String(xs.windowDays ?? 14));

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setErr(null);
    setMsg(null);
    const bonuses: Bonuses = {
      ...initial,
      sceneExplorer: { on: seOn, points: num(sePoints, 0), n: num(seN, 3) },
      crossOrgStreak: { on: xsOn, points: num(xsPoints, 0), windowDays: num(xsWindow, 14) },
    };
    start(async () => {
      try {
        await saveGlobalRules({ basePoints, bonuses: JSON.stringify(bonuses) });
        setMsg('Saved.');
      } catch (e) {
        setErr((e as Error)?.message ?? 'Save failed');
      }
    });
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="field">
        <label>Base points per valid check-in</label>
        <input
          type="text"
          inputMode="numeric"
          value={basePoints}
          onChange={(e) => setBasePoints(e.target.value)}
        />
      </div>

      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={seOn}
            onChange={(e) => setSeOn(e.target.checked)}
            style={{ width: 'auto', marginRight: 6 }}
          />
          Scene explorer bonus
        </label>
        <div className="row" style={{ gap: 10 }}>
          <span className="muted">points</span>
          <input
            type="text"
            inputMode="numeric"
            value={sePoints}
            onChange={(e) => setSePoints(e.target.value)}
            style={{ maxWidth: 120 }}
          />
          <span className="muted">after N distinct orgs</span>
          <input
            type="text"
            inputMode="numeric"
            value={seN}
            onChange={(e) => setSeN(e.target.value)}
            style={{ maxWidth: 120 }}
          />
        </div>
      </div>

      <div className="field">
        <label>
          <input
            type="checkbox"
            checked={xsOn}
            onChange={(e) => setXsOn(e.target.checked)}
            style={{ width: 'auto', marginRight: 6 }}
          />
          Cross-org streak bonus
        </label>
        <div className="row" style={{ gap: 10 }}>
          <span className="muted">points</span>
          <input
            type="text"
            inputMode="numeric"
            value={xsPoints}
            onChange={(e) => setXsPoints(e.target.value)}
            style={{ maxWidth: 120 }}
          />
          <span className="muted">window (days)</span>
          <input
            type="text"
            inputMode="numeric"
            value={xsWindow}
            onChange={(e) => setXsWindow(e.target.value)}
            style={{ maxWidth: 120 }}
          />
        </div>
      </div>

      {err && <div className="error">{err}</div>}
      {msg && (
        <div className="muted" style={{ marginTop: 8 }}>
          {msg}
        </div>
      )}
      <button className="btn solid" onClick={save} disabled={pending} style={{ marginTop: 10 }}>
        {pending ? 'Saving…' : 'Save rules'}
      </button>
    </div>
  );
}
