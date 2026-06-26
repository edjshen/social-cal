/**
 * Mayfly room relay — Worker router.
 *
 * Routes:
 *   GET /health          CORS-enabled liveness probe (the client's cross-origin
 *                        reachability check hits this; see connection.js §11).
 *   GET /room/:id        WebSocket upgrade -> RoomDO stub (Origin-allowlisted).
 *
 * The Worker is a dumb encrypted relay: it never holds the room key, never
 * decrypts, never inspects message bodies. It validates the upgrade Origin and
 * forwards to the per-room Durable Object.
 */

export { RoomDO } from './room-do.js';

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://orbit.junting-mp3.workers.dev')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function corsHeaders(origin, allow) {
  const value = origin && allow.includes(origin) ? origin : allow[0];
  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allow = allowedOrigins(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, allow) });
    }

    if (url.pathname === '/health') {
      return new Response('ok', {
        status: 200,
        headers: { ...corsHeaders(origin, allow), 'Cache-Control': 'no-store' },
      });
    }

    const match = url.pathname.match(/^\/room\/([A-Za-z0-9_-]+)$/);
    if (match) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      // Browsers always send Origin on WS upgrades; reject disallowed origins.
      // (A null/absent Origin is a non-browser client — also rejected.)
      if (!origin || !allow.includes(origin)) {
        return new Response('forbidden origin', { status: 403 });
      }
      const id = env.ROOM.idFromName(match[1]);
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response('not found', { status: 404 });
  },
};
