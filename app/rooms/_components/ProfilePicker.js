'use client';

import { useState } from 'react';
import styles from '../rooms.module.css';

const AVATARS = ['🦋', '🌙', '⚡', '🔮', '🌿', '🪩', '🛸', '🦊', '🐝', '🦉', '🌀', '🍄'];

/**
 * Choose which profile to present. No accounts — each device holds many
 * profiles, and you pick one per room. Also creates new profiles inline.
 */
export default function ProfilePicker({ profiles, selectedId, onSelect, onCreate, title }) {
  const [creating, setCreating] = useState(false);
  const [handle, setHandle] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);

  async function create() {
    const p = await onCreate({ handle, avatar });
    setCreating(false);
    setHandle('');
    onSelect(p.id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {title ? <h3 style={{ margin: 0, fontSize: '1rem' }}>{title}</h3> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {profiles.map((p) => {
          const active = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={styles.card}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                cursor: 'pointer',
                textAlign: 'left',
                borderColor: active ? 'var(--mf-accent)' : 'var(--mf-border)',
                boxShadow: active ? '0 0 0 1px var(--mf-accent)' : 'none',
                padding: '0.6rem 0.75rem',
              }}
            >
              <span style={{ fontSize: '1.4rem' }} aria-hidden="true">
                {p.avatar}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ fontSize: '0.95rem' }}>{p.handle}</strong>
                <span className={styles.muted} style={{ fontSize: '0.75rem' }}>
                  {p.vibe}
                </span>
              </span>
              {active ? (
                <span style={{ marginLeft: 'auto', color: 'var(--mf-accent)' }}>●</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {creating ? (
        <div
          className={styles.card}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        >
          <input
            className={styles.input}
            placeholder="handle (optional)"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            maxLength={32}
            aria-label="new handle"
          />
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                aria-label={`avatar ${a}`}
                onClick={() => setAvatar(a)}
                className={styles.btn}
                style={{
                  padding: '0.25rem 0.45rem',
                  borderColor: a === avatar ? 'var(--mf-accent)' : 'var(--mf-border)',
                }}
              >
                {a}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={create}>
              create
            </button>
            <button type="button" className={styles.btn} onClick={() => setCreating(false)}>
              cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={() => setCreating(true)}
        >
          + new profile
        </button>
      )}
    </div>
  );
}
