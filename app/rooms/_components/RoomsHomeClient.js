'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from '../rooms.module.css';
import ProfilePicker from './ProfilePicker';
import CatchListener from './CatchListener';
import RoomView from './RoomView';
import PhoneGate from './PhoneGate';
import { PHONE_MARKETING_CONSENT } from './copy';
import { hasIndexedDb } from '../_client/store/db.js';
import { getNodeId } from '../_client/store/device.js';
import {
  ensureDefaultProfile,
  createProfile,
  listProfiles,
  getProfile,
  profilePub,
} from '../_client/store/profiles.js';
import {
  listRooms,
  getRoom,
  createSealedRoom,
  createOpenRoom,
  saveJoinedRoom,
  setRoomProfile,
  forgetRoom,
  markGateCleared,
} from '../_client/store/rooms.js';
import { parseFragment, buildFragment } from '@/lib/mayfly/shared/credential.js';
import { fromB64, keyFromFragment, keyToFragment } from '@/lib/mayfly/shared/crypto.js';

const PROFILE_KEY = 'mf-selected-profile';

function fragmentFor(room) {
  return `#${buildFragment(room.id, keyToFragment(room.key), {
    event: room.event,
    expiresAt: room.desiredExpiresAt,
  })}`;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok, data };
}

export default function RoomsHomeClient() {
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [nodeId, setNodeId] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [current, setCurrent] = useState(null);
  // When set, a PhoneGate overlay is shown: { purpose, submit, onCancel }.
  const [gate, setGate] = useState(null);
  // Deep-link intent from the floating launcher (?go=listen|scan|words).
  const [catchIntent, setCatchIntent] = useState(null);

  const refreshRooms = useCallback(async () => {
    setRooms(await listRooms());
  }, []);

  const enterRoom = useCallback(
    async (record, profileId) => {
      const pid = profileId ?? record.profileId ?? selectedProfileId;
      if (pid && record.profileId !== pid) await setRoomProfile(record.id, pid);
      const fresh = await getRoom(record.id);
      if (typeof window !== 'undefined') window.location.hash = fragmentFor(fresh);
      setCurrent(fresh);
    },
    [selectedProfileId]
  );

  const handleCredential = useCallback(
    async (parsed, profileId) => {
      const idBytes = fromB64(parsed.id);
      const key = keyFromFragment(parsed.k);
      const room = await saveJoinedRoom({
        idBytes,
        key,
        profileId: profileId ?? null,
        event: parsed.event,
        desiredExpiresAt: parsed.expiresAt,
      });
      await refreshRooms();
      return room;
    },
    [refreshRooms]
  );

  // Enter a room, applying the phone/log gate per the room's type:
  //  - event room  → open: best-effort participant log, then enter
  //  - ad-hoc room → require phone verification (once), unless already cleared
  const enterWithGate = useCallback(
    async (room) => {
      const profile = await getProfile(room.profileId || selectedProfileId);
      const pub = profile ? profilePub(profile) : null;

      if (room.event) {
        const { data } = await postJson('/api/rooms/join', {
          roomId: room.id,
          isEvent: true,
          eventSlug: room.eventSlug,
          words: room.words,
          expiresAt: room.desiredExpiresAt,
          handle: profile?.handle,
          profilePub: pub,
        }).catch(() => ({ ok: false, data: {} }));
        await markGateCleared(room.id, data?.relayToken ?? null);
        await enterRoom(room, selectedProfileId);
        return;
      }
      if (room.gateCleared) {
        await enterRoom(room, selectedProfileId);
        return;
      }
      setGate({
        purpose: 'join this room',
        onCancel: () => setGate(null),
        submit: async ({ phone, code, consent }) => {
          const { ok, data } = await postJson('/api/rooms/join', {
            roomId: room.id,
            isEvent: false,
            phone,
            code,
            consent,
            handle: profile?.handle,
            profilePub: pub,
          });
          if (!ok) return { ok: false, error: data.error || 'could not join' };
          await markGateCleared(room.id, data?.relayToken ?? null);
          await refreshRooms();
          setGate(null);
          await enterRoom(room, selectedProfileId);
          return { ok: true };
        },
      });
    },
    [selectedProfileId, enterRoom, refreshRooms]
  );

  // Bootstrap: device, profiles, rooms, then handle any incoming fragment.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!hasIndexedDb()) {
        setSupported(false);
        setReady(true);
        return;
      }
      const nid = await getNodeId();
      const profs = await ensureDefaultProfile();
      if (!alive) return;
      const stored =
        (typeof localStorage !== 'undefined' && localStorage.getItem(PROFILE_KEY)) || null;
      const sel = profs.find((p) => p.id === stored)?.id || profs[0].id;
      setNodeId(nid);
      setProfiles(profs);
      setSelectedProfileId(sel);
      await refreshRooms();

      const parsed = typeof window !== 'undefined' ? parseFragment(window.location.hash) : null;
      if (parsed) {
        const room = await handleCredential(parsed, sel);
        if (alive) await enterWithGate(room);
      } else if (typeof window !== 'undefined') {
        // Launcher deep-link (?go=create|listen|scan|words).
        const go = new URLSearchParams(window.location.search).get('go');
        if (go) {
          window.history.replaceState(null, '', window.location.pathname);
          if (go === 'create') {
            // Defer until profiles state is committed.
            setTimeout(() => newRoom('sealed'), 0);
          } else if (go === 'listen' || go === 'scan' || go === 'words') {
            if (alive) setCatchIntent(go);
          }
        }
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to hash changes (back button, externally-opened links).
  useEffect(() => {
    if (!ready) return;
    function onHash() {
      const parsed = parseFragment(window.location.hash);
      if (parsed) {
        (async () => {
          const room = await handleCredential(parsed, selectedProfileId);
          await enterWithGate(room);
        })();
      } else {
        setCurrent(null);
        refreshRooms();
      }
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [ready, selectedProfileId, handleCredential, enterWithGate, refreshRooms]);

  function selectProfile(id) {
    setSelectedProfileId(id);
    if (typeof localStorage !== 'undefined') localStorage.setItem(PROFILE_KEY, id);
  }

  async function addProfile(input) {
    const p = await createProfile(input);
    setProfiles(await listProfiles());
    return p;
  }

  async function newRoom(mode) {
    // Room is generated locally first (id/key); the relay DO isn't created until
    // we connect. Creating a room requires phone verification (logged server
    // side); if the user bails or fails, we forget the local room.
    const room =
      mode === 'open'
        ? await createOpenRoom(selectedProfileId)
        : await createSealedRoom(selectedProfileId);
    await refreshRooms();
    setGate({
      purpose: 'create a room',
      onCancel: async () => {
        await forgetRoom(room.id);
        await refreshRooms();
        setGate(null);
      },
      submit: async ({ phone, code, consent }) => {
        const { ok, data } = await postJson('/api/rooms/create', {
          phone,
          code,
          consent,
          roomId: room.id,
          words: room.words,
          mode: room.mode,
          expiresAt: room.desiredExpiresAt,
        });
        if (!ok) return { ok: false, error: data.error || 'could not create' };
        await markGateCleared(room.id, data?.relayToken ?? null);
        await refreshRooms();
        setGate(null);
        await enterRoom(room, selectedProfileId);
        return { ok: true };
      },
    });
  }

  function leaveRoom() {
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
    setCurrent(null);
    refreshRooms();
  }

  async function onExpired() {
    await refreshRooms();
  }

  async function dropRoom(id) {
    await forgetRoom(id);
    await refreshRooms();
  }

  // ── render ───────────────────────────────────────────────
  if (!ready) {
    return (
      <div className={styles.wrap} style={{ justifyContent: 'center', alignItems: 'center' }}>
        <span className={styles.muted}>loading…</span>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className={styles.wrap}>
        <Brand />
        <p className={styles.muted}>
          this device can’t store rooms locally (private mode / no IndexedDB). rooms need local
          storage to work.
        </p>
      </div>
    );
  }

  if (current) {
    const profile = profiles.find((p) => p.id === (current.profileId || selectedProfileId));
    return (
      <RoomView
        room={current}
        profile={profile}
        nodeId={nodeId}
        onLeave={leaveRoom}
        onExpired={onExpired}
      />
    );
  }

  const activeRooms = rooms.filter((r) => r.status !== 'expired');
  const goneRooms = rooms.filter((r) => r.status === 'expired');

  if (gate) {
    return (
      <div className={styles.wrap} style={{ justifyContent: 'center', gap: '1rem' }}>
        <Brand />
        <PhoneGate purpose={gate.purpose} onSubmit={gate.submit} onCancel={gate.onCancel} />
      </div>
    );
  }

  return (
    <div className={styles.wrap} style={{ gap: '1.25rem' }}>
      <Brand />

      <section
        className={styles.card}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      >
        <ProfilePicker
          title="you’re showing up as"
          profiles={profiles}
          selectedId={selectedProfileId}
          onSelect={selectProfile}
          onCreate={addProfile}
        />
      </section>

      <section style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => newRoom('sealed')}
        >
          + new room
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={() => newRoom('open')}
          title="anyone who hears the three words can join"
        >
          + open room (public)
        </button>
      </section>

      <section
        className={styles.card}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
      >
        <strong>catch a room</strong>
        <CatchListener
          intent={catchIntent}
          onCatch={async ({ idBytes, key, event = false, expiresAt = null }) => {
            const room = await saveJoinedRoom({
              idBytes,
              key,
              profileId: selectedProfileId,
              event,
              desiredExpiresAt: expiresAt,
            });
            await refreshRooms();
            await enterWithGate(room);
          }}
        />
      </section>

      {activeRooms.length > 0 ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <strong style={{ fontSize: '0.9rem' }} className={styles.muted}>
            your rooms
          </strong>
          {activeRooms.map((r) => (
            <button
              key={r.id}
              type="button"
              className={styles.card}
              onClick={() => enterWithGate(r)}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: '1.2rem' }}>
                {r.isHost ? '✨' : '🌀'}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ fontSize: '0.9rem' }}>{r.words}</strong>
                <span className={styles.muted} style={{ fontSize: '0.72rem' }}>
                  {r.mode === 'open' ? 'open' : 'sealed'} · {r.status}
                </span>
              </span>
            </button>
          ))}
        </section>
      ) : null}

      {goneRooms.length > 0 ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <strong style={{ fontSize: '0.8rem' }} className={styles.muted}>
            gone
          </strong>
          {goneRooms.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                className={styles.muted}
                style={{ fontSize: '0.8rem', textDecoration: 'line-through' }}
              >
                {r.words}
              </span>
              <button
                type="button"
                className={styles.btn}
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                onClick={() => dropRoom(r.id)}
              >
                forget
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <p
        className={styles.muted}
        style={{ fontSize: '0.72rem', marginTop: 'auto', paddingTop: '1rem' }}
      >
        rooms vanish 24h after they’re made. no accounts. sealed rooms are end-to-end encrypted —
        the key lives only in the link. open &amp; event rooms are public: anyone with the three
        words or event link can read along.
      </p>
      <p className={styles.muted} style={{ fontSize: '0.62rem', lineHeight: 1.4, opacity: 0.7 }}>
        {PHONE_MARKETING_CONSENT}
      </p>
    </div>
  );
}

function Brand() {
  return (
    <div className={styles.brand}>
      <span className={styles.brandDot} />
      rooms
      <span className={styles.muted} style={{ fontWeight: 400, fontSize: '0.8rem' }}>
        · ephemeral chat
      </span>
    </div>
  );
}
