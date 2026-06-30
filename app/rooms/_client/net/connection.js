/**
 * Connection state machine: idle -> connecting -> connected -> reconnecting ->
 * offline, plus terminal `expired`. The backend is a DIFFERENT origin, so all
 * URLs come from NEXT_PUBLIC_ROOM_API_BASE.
 *
 * Each mechanism kills a specific failure:
 *  - jittered backoff -> thundering-herd reconnects
 *  - app heartbeat (ping/pong) -> silent zombie sockets after cell handoffs
 *  - /health reachability probe -> captive-portal false "online" (we never
 *    trust navigator.onLine alone)
 *  - resume cursor (in sync.js via hello.resumeFromSeq) -> full reloads
 *
 * Frames are validated with the shared zod schema; malformed frames are dropped.
 */
import { backoffDelay } from './backoff.js';
import { parseServerFrame } from '@/lib/mayfly/shared/protocol.js';

function apiBase() {
  return (process.env.NEXT_PUBLIC_ROOM_API_BASE || '').replace(/\/$/, '');
}

const HEARTBEAT_MS = 25000;

/**
 * @param {string} roomId  base64url room id (the WS path segment)
 * @param {{ onState:(s:string)=>void, onFrame:(f:object)=>void }} hooks
 */
export function createConnection(roomId, hooks) {
  const base = apiBase();
  let ws = null;
  let attempt = 0;
  let heartbeat = null;
  let awaitingPong = false;
  let closedByApp = false;

  async function reachable() {
    if (!base) return false;
    try {
      const r = await fetch(`${base}/health`, { cache: 'no-store' });
      return r.ok;
    } catch {
      return false;
    }
  }

  function open() {
    if (!base) {
      // No relay configured — stay offline rather than throwing.
      hooks.onState('offline');
      return;
    }
    hooks.onState(attempt === 0 ? 'connecting' : 'reconnecting');
    // Relay admission token (H-2): appended only when the gate minted one
    // (null during rollout, before ROOM_RELAY_SECRET is set on both sides).
    const t = hooks.token;
    const q = t ? `?t=${encodeURIComponent(t)}` : '';
    const wsUrl = `${base.replace(/^http/, 'ws')}/room/${roomId}${q}`;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      onDrop();
      return;
    }
    ws.onopen = () => {
      attempt = 0;
      hooks.onState('connected');
      startHeartbeat();
    };
    ws.onmessage = (e) => handleRaw(e.data);
    ws.onclose = (e) => onClose(e);
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        /* noop */
      }
    };
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeat = setInterval(() => {
      if (awaitingPong) {
        // No pong since last tick — the socket is a zombie. Tear it down.
        try {
          ws?.close();
        } catch {
          /* noop */
        }
        return;
      }
      awaitingPong = true;
      send({ type: 'ping' });
    }, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    awaitingPong = false;
  }

  function handleRaw(data) {
    if (typeof data !== 'string') return;
    const frame = parseServerFrame(data);
    if (!frame) return; // drop malformed / hostile frames
    if (frame.type === 'pong') {
      awaitingPong = false;
      return;
    }
    hooks.onFrame(frame);
  }

  function onClose(e) {
    // A 410-on-upgrade or a clean 'expired' close (code 1000, reason expired)
    // means the room is gone; sync.js also handles the `expired` frame.
    if (e && e.code === 1000 && e.reason === 'expired') {
      stopHeartbeat();
      hooks.onState('expired');
      return;
    }
    onDrop();
  }

  async function onDrop() {
    stopHeartbeat();
    if (closedByApp) return;
    // navigator.onLine is only a hint — confirm with the /health probe.
    const online = (typeof navigator === 'undefined' || navigator.onLine) && (await reachable());
    hooks.onState(online ? 'reconnecting' : 'offline');
    const delay = backoffDelay(attempt++);
    setTimeout(() => {
      if (!closedByApp) open();
    }, delay);
  }

  function send(frame) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
      return true;
    }
    return false;
  }

  return {
    start: () => {
      closedByApp = false;
      attempt = 0;
      open();
    },
    send,
    isOpen: () => (ws ? ws.readyState === WebSocket.OPEN : false),
    close: () => {
      closedByApp = true;
      stopHeartbeat();
      try {
        ws?.close();
      } catch {
        /* noop */
      }
    },
  };
}
