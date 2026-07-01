'use client';
import { useState, useTransition } from 'react';
import type { PlatformPerk } from '@/lib/db/schema';
import { savePlatformPerk, deletePlatformPerk } from '@/lib/actions/admin';

const FULFILLMENTS = ['auto-digital', 'partner-code', 'manual'] as const;
const SOURCES = ['first-party', 'sponsor', 'partner', 'org'] as const;

type Draft = {
  id?: string;
  title: string;
  description: string;
  pointCost: string;
  fulfillment: (typeof FULFILLMENTS)[number];
  source: (typeof SOURCES)[number];
  sponsorId: string;
  placement: string;
  segment: string;
  totalInventory: string;
  perUserLimit: string;
  active: boolean;
  validFrom: string;
  validTo: string;
};

function toDraft(p?: PlatformPerk): Draft {
  return {
    id: p?.id,
    title: p?.title ?? '',
    description: p?.description ?? '',
    pointCost: p ? String(p.pointCost) : '0',
    fulfillment: p?.fulfillment ?? 'auto-digital',
    source: p?.source ?? 'first-party',
    sponsorId: p?.sponsorId ?? '',
    placement: p ? String(p.placement) : '0',
    segment: p ? JSON.stringify(p.segment ?? {}, null, 0) : '{}',
    totalInventory: p?.totalInventory != null ? String(p.totalInventory) : '',
    perUserLimit: p?.perUserLimit != null ? String(p.perUserLimit) : '',
    active: p?.active ?? true,
    validFrom: p?.validFrom ?? '',
    validTo: p?.validTo ?? '',
  };
}

// `datetime-local` wants `YYYY-MM-DDTHH:mm`; trim a stored ISO string to that.
const dtLocal = (iso: string) => (iso ? iso.slice(0, 16) : '');

export default function PerkEditor({
  perk,
  startOpen = false,
}: {
  perk?: PlatformPerk;
  startOpen?: boolean;
}) {
  const isNew = !perk;
  const [open, setOpen] = useState(startOpen);
  const [d, setD] = useState<Draft>(() => toDraft(perk));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setD((prev) => ({ ...prev, [k]: v }));
  }

  function save() {
    setErr(null);
    start(async () => {
      try {
        await savePlatformPerk({
          id: d.id,
          title: d.title,
          description: d.description,
          pointCost: d.pointCost,
          fulfillment: d.fulfillment,
          source: d.source,
          sponsorId: d.sponsorId,
          placement: d.placement,
          segment: d.segment,
          totalInventory: d.totalInventory,
          perUserLimit: d.perUserLimit,
          active: d.active,
          validFrom: d.validFrom,
          validTo: d.validTo,
        });
        if (isNew) setD(toDraft(undefined));
        setOpen(isNew ? false : true);
      } catch (e) {
        setErr((e as Error)?.message ?? 'Save failed');
      }
    });
  }

  function remove() {
    if (!d.id) return;
    if (!confirm('Delete this perk?')) return;
    setErr(null);
    start(async () => {
      try {
        await deletePlatformPerk(d.id);
      } catch (e) {
        setErr((e as Error)?.message ?? 'Delete failed');
      }
    });
  }

  if (!open) {
    return (
      <button className="btn sm" onClick={() => setOpen(true)}>
        {isNew ? '+ New perk' : 'Edit'}
      </button>
    );
  }

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
          gap: 12,
        }}
      >
        <div className="field">
          <label>Title</label>
          <input type="text" value={d.title} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div className="field">
          <label>Point cost</label>
          <input
            type="text"
            inputMode="numeric"
            value={d.pointCost}
            onChange={(e) => set('pointCost', e.target.value)}
          />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Description</label>
          <textarea value={d.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="field">
          <label>Fulfillment</label>
          <select
            value={d.fulfillment}
            onChange={(e) => set('fulfillment', e.target.value as Draft['fulfillment'])}
          >
            {FULFILLMENTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Source</label>
          <select
            value={d.source}
            onChange={(e) => set('source', e.target.value as Draft['source'])}
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Sponsor ID (optional)</label>
          <input
            type="text"
            value={d.sponsorId}
            onChange={(e) => set('sponsorId', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Placement</label>
          <input
            type="text"
            inputMode="numeric"
            value={d.placement}
            onChange={(e) => set('placement', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Total inventory (blank = unlimited)</label>
          <input
            type="text"
            inputMode="numeric"
            value={d.totalInventory}
            onChange={(e) => set('totalInventory', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Per-user limit (blank = none)</label>
          <input
            type="text"
            inputMode="numeric"
            value={d.perUserLimit}
            onChange={(e) => set('perUserLimit', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Valid from</label>
          <input
            type="datetime-local"
            value={dtLocal(d.validFrom)}
            onChange={(e) => set('validFrom', e.target.value)}
          />
        </div>
        <div className="field">
          <label>Valid to</label>
          <input
            type="datetime-local"
            value={dtLocal(d.validTo)}
            onChange={(e) => set('validTo', e.target.value)}
          />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Segment / targeting (JSON)</label>
          <textarea value={d.segment} onChange={(e) => set('segment', e.target.value)} />
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={d.active}
              onChange={(e) => set('active', e.target.checked)}
              style={{ width: 'auto', marginRight: 6 }}
            />
            Active
          </label>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <button className="btn solid" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : isNew ? 'Create perk' : 'Save'}
        </button>
        <button className="btn" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
        {!isNew && (
          <button
            className="btn"
            onClick={remove}
            disabled={pending}
            style={{ marginLeft: 'auto', color: '#ff8088' }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
