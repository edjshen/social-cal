'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from '../rooms.module.css';
import ConnectionBadge from './ConnectionBadge';
import Countdown from './Countdown';
import Composer from './Composer';
import CastSheet from './CastSheet';
import { createRoomSync } from '../_client/net/sync.js';
import { listMessages } from '../_client/store/messages.js';
import { expireRoom } from '../_client/store/rooms.js';
import { profilePub } from '../_client/store/profiles.js';

/**
 * In-room chat surface. Owns one RoomSync for the room's lifetime: messages,
 * presence, optimistic send, the live countdown, and the connection badge.
 */
export default function RoomView({ room, profile, nodeId, onLeave, onExpired }) {
  const [connState, setConnState] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [roster, setRoster] = useState([]);
  const [expiresAt, setExpiresAt] = useState(room.expiresAt ?? null);
  const [serverOffset, setServerOffset] = useState(0);
  const [expired, setExpired] = useState(room.status === 'expired');
  const [showCast, setShowCast] = useState(false);
  const syncRef = useRef(null);
  const scrollRef = useRef(null);
  const vibratedRef = useRef(false);

  const selfPub = useMemo(() => profilePub(profile), [profile]);

  // Open + per-event rooms derive their key from public data (the three words /
  // the event link), so anyone who has those can read along. Be honest about it.
  const isPublic = room.mode === 'open' || room.event;

  useEffect(() => {
    let alive = true;

    async function reload() {
      if (!alive) return;
      const rows = await listMessages(room.id);
      if (!alive) return;
      setMessages(rows);
      const list = syncRef.current ? syncRef.current.presenceList() : [];
      setRoster(list);
      // Signature arrival moment: first time we see another raver, pulse.
      if (!vibratedRef.current && list.some((p) => !p.isSelf)) {
        vibratedRef.current = true;
        try {
          navigator.vibrate?.(30);
        } catch {
          /* not supported */
        }
      }
    }

    const sync = createRoomSync({
      room,
      profile,
      nodeId,
      hooks: {
        onState: (s) => alive && setConnState(s),
        onChange: () => reload(),
        onServerTime: ({ expiresAt: exp, offset }) => {
          if (!alive) return;
          setExpiresAt(exp);
          setServerOffset(offset);
        },
        onExpired: async () => {
          await expireRoom(room.id);
          if (!alive) return;
          setExpired(true);
          onExpired?.(room.id);
        },
      },
    });
    syncRef.current = sync;
    sync.start();
    reload();

    return () => {
      alive = false;
      sync.close();
      syncRef.current = null;
    };
    // Re-init only when the room or presenting profile changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, profile.id]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const rosterByPub = useMemo(() => {
    const map = new Map();
    for (const p of roster) map.set(p.pub, p);
    return map;
  }, [roster]);

  function identityFor(pub) {
    if (pub === selfPub) {
      return { handle: profile.handle, avatar: profile.avatar, isSelf: true };
    }
    const p = rosterByPub.get(pub);
    if (p) return { handle: p.handle, avatar: p.avatar, isSelf: false };
    return { handle: pub.slice(0, 6), avatar: '👤', isSelf: false };
  }

  // Server-clock countdown without touching the sync ref during render.
  const serverNow = useCallback(() => Date.now() + serverOffset, [serverOffset]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--mf-border)',
        }}
      >
        <button
          type="button"
          className={styles.btn}
          onClick={onLeave}
          aria-label="back to rooms"
          style={{ padding: '0.4rem 0.6rem' }}
        >
          ‹
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <strong
            style={{
              fontSize: '0.95rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {room.words}
          </strong>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <ConnectionBadge state={expired ? 'expired' : connState} />
            <Countdown expiresAt={expiresAt} serverNow={serverNow} />
          </div>
        </div>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => setShowCast((v) => !v)}
          style={{ padding: '0.45rem 0.7rem' }}
        >
          cast
        </button>
      </header>

      {/* Public-room honesty banner */}
      {isPublic ? (
        <div
          role="note"
          className={styles.muted}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.75rem',
            background: 'var(--mf-surface-2)',
            borderBottom: '1px solid var(--mf-border)',
          }}
        >
          public room — anyone with the {room.event ? 'event link' : 'three words'} can read along.
          not private.
        </div>
      ) : null}

      {/* Roster */}
      <div
        style={{
          display: 'flex',
          gap: '0.35rem',
          padding: '0.5rem 1rem',
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--mf-border)',
        }}
      >
        {roster.length === 0 ? (
          <span className={styles.muted} style={{ fontSize: '0.78rem' }}>
            just you so far…
          </span>
        ) : (
          roster.map((p) => (
            <span
              key={p.pub}
              title={p.handle}
              className="mfRosterAvatar"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.78rem',
                background: 'var(--mf-surface-2)',
                border: '1px solid var(--mf-border)',
                borderRadius: 999,
                padding: '0.15rem 0.5rem',
              }}
            >
              <span aria-hidden="true">{p.avatar}</span>
              {p.handle}
              {p.isSelf ? ' (you)' : ''}
            </span>
          ))
        )}
      </div>

      {showCast ? (
        <div style={{ padding: '0.75rem 1rem' }}>
          <CastSheet room={room} onClose={() => setShowCast(false)} />
        </div>
      ) : null}

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {messages.length === 0 ? (
          <p className={styles.muted} style={{ textAlign: 'center', marginTop: '2rem' }}>
            this room is empty and lives for 24h. say hi 👋
          </p>
        ) : (
          messages.map((m) => <MessageRow key={m.id} m={m} identity={identityFor(m.profilePub)} />)
        )}
      </div>

      {/* Composer */}
      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--mf-border)' }}>
        <Composer
          disabled={expired}
          onSend={(text) => syncRef.current?.sendText(text)}
          onReact={(emoji) => syncRef.current?.sendReaction(emoji, null)}
        />
      </div>

      <style>{`
        .mfRosterAvatar { animation: mfPop 0.32s cubic-bezier(.2,1.4,.4,1) both; }
        @keyframes mfPop { from { transform: scale(0.5); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      `}</style>
    </div>
  );
}

function MessageRow({ m, identity }) {
  const isSelf = identity.isSelf;
  const undecryptable = m.body?.undecryptable;

  if (m.kind === 'reaction') {
    return (
      <div
        className="mfRosterAvatar"
        style={{
          fontSize: '0.8rem',
          color: 'var(--mf-muted)',
          alignSelf: isSelf ? 'flex-end' : 'flex-start',
        }}
      >
        {identity.avatar} {identity.handle} reacted {m.body?.emoji || '•'}
      </div>
    );
  }

  const earlier = m.hlc && m.at - m.hlc.wallMillis > 5000;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isSelf ? 'flex-end' : 'flex-start',
        gap: '0.15rem',
      }}
    >
      <span style={{ fontSize: '0.72rem', color: 'var(--mf-muted)' }}>
        {identity.avatar} {identity.handle}
        {earlier ? ' · sent earlier' : ''}
      </span>
      <div
        style={{
          maxWidth: '78%',
          padding: '0.5rem 0.7rem',
          borderRadius: 14,
          background: isSelf ? 'var(--mf-accent)' : 'var(--mf-surface-2)',
          color: isSelf ? '#0a0a0f' : 'var(--mf-text)',
          border: isSelf ? 'none' : '1px solid var(--mf-border)',
          opacity: m.state === 'sending' ? 0.6 : 1,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          fontStyle: undecryptable ? 'italic' : 'normal',
        }}
      >
        {undecryptable ? '🔒 couldn’t decrypt this message' : m.body?.text}
      </div>
      {isSelf ? (
        <span style={{ fontSize: '0.65rem', color: 'var(--mf-muted)' }}>
          {m.state === 'sending' ? 'sending…' : 'sent'}
        </span>
      ) : null}
    </div>
  );
}
