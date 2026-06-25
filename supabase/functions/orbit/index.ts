// Orbit — partygoer side, deployed as a Supabase Edge Function inside the
// `every-party` project. Talks to the isolated `orbit` Postgres schema over a
// direct connection (service role bypasses RLS; access is enforced in code).
// Frontend assets are streamed from a pinned commit of the public repo.
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const SHA = "2c6cdeae9b7c40b2a06278310329cda90922da21";
const RAW = `https://raw.githubusercontent.com/edjshen/social-cal/${SHA}/public`;
const SECRET = "orbit-edge-hmac-v1-7f3a9c";
const sql = postgres(Deno.env.get("SUPABASE_DB_URL"), { prepare: false });
const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---------- crypto: HMAC token + PBKDF2 password ---------- */
function b64u(bytes: Uint8Array | ArrayBuffer): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/"); while (str.length % 4) str += "=";
  const bin = atob(str); const o = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o;
}
let _key: CryptoKey | null = null;
async function hkey() {
  if (!_key) _key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return _key;
}
async function makeToken(uid: string) {
  const p = b64u(enc.encode(JSON.stringify({ uid, exp: Date.now() + 30 * 864e5 })));
  const sig = await crypto.subtle.sign("HMAC", await hkey(), enc.encode(p));
  return p + "." + b64u(sig);
}
async function readToken(req: Request): Promise<string | null> {
  const t = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!t || !t.includes(".")) return null;
  const [p, s] = t.split(".");
  try {
    if (!(await crypto.subtle.verify("HMAC", await hkey(), unb64u(s), enc.encode(p)))) return null;
    const d = JSON.parse(dec.decode(unb64u(p)));
    if (!d.exp || d.exp < Date.now()) return null;
    return d.uid;
  } catch { return null; }
}
async function pbkdf2(pw: string, salt: Uint8Array, iter: number) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, k, 256));
}
async function hashPassword(pw: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await pbkdf2(pw, salt, 100000);
  return `pbkdf2$100000$${btoa(String.fromCharCode(...salt))}$${btoa(String.fromCharCode(...h))}`;
}
async function verifyPassword(pw: string, stored: string) {
  const parts = String(stored).split("$"); if (parts.length !== 4) return false;
  const salt = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  const exp = Uint8Array.from(atob(parts[3]), (c) => c.charCodeAt(0));
  const h = await pbkdf2(pw, salt, parseInt(parts[1]));
  if (h.length !== exp.length) return false;
  let d = 0; for (let i = 0; i < h.length; i++) d |= h[i] ^ exp[i]; return d === 0;
}

/* ---------- domain helpers (operate on a loaded snapshot) ---------- */
const PAL = ["#FF8A5B,#FF5E87","#5FD3A6,#3FA7C2","#9B8CFF,#6C7BFF","#FFC178,#FF8A5B","#FF5E87,#9B8CFF","#5FD3A6,#6C7BFF","#FFC178,#FF5E87","#9B8CFF,#FF5E87"];
function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
const initials = (n: string) => (n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const iso = (t: any) => t == null ? null : (t instanceof Date ? t.toISOString() : new Date(t).toISOString());
const ATTEND = ["going", "down", "maybe"];
const publicUser = (u: any) => u ? { id: u.id, handle: u.handle, displayName: u.display_name, avatar: u.avatar, initials: initials(u.display_name) } : null;
const meJson = (u: any) => ({ ...publicUser(u), bio: u.bio, scenes: u.scenes || [], ghost: !!u.ghost, shareId: u.share_id });
async function loadD() {
  const [users, connections, placements, events, attendance] = await Promise.all([
    sql`select * from orbit.users`, sql`select * from orbit.connections`, sql`select * from orbit.placements`,
    sql`select * from orbit.events`, sql`select * from orbit.attendance`,
  ]);
  return { users, connections, placements, events, attendance };
}
const userById = (D: any, id: string) => D.users.find((u: any) => u.id === id);
const accepted = (c: any) => c.status === "accepted";
const areConnected = (D: any, a: string, b: string) => D.connections.some((c: any) => accepted(c) && ((c.a_id === a && c.b_id === b) || (c.a_id === b && c.b_id === a)));
function myConnIds(D: any, me: string) { const s = new Set<string>(); for (const c of D.connections) if (accepted(c) && (c.a_id === me || c.b_id === me)) s.add(c.a_id === me ? c.b_id : c.a_id); return s; }
function connStatus(D: any, me: string, o: string) { const c = D.connections.find((c: any) => (c.a_id === me && c.b_id === o) || (c.a_id === o && c.b_id === me)); if (!c) return "none"; if (c.status === "accepted") return "connected"; return c.requested_by === me ? "pending_out" : "pending_in"; }
const tierOf = (D: any, owner: string, other: string) => { const p = D.placements.find((p: any) => p.owner_id === owner && p.other_id === other); return p ? p.tier : null; };
function canSeeContent(D: any, v: string | null, ev: any) {
  if (ev.visibility === "public") return true;
  if (!v) return false;
  if (ev.creator_id === v) return true;
  if (!areConnected(D, ev.creator_id, v)) return false;
  const tier = tierOf(D, ev.creator_id, v) || "orbit";
  if (ev.visibility === "orbit") return true;
  if (ev.visibility === "inner") return tier === "inner";
  return false;
}
function canSeeBusy(D: any, v: string | null, ev: any) { if (canSeeContent(D, v, ev)) return true; if (!v) return false; return areConnected(D, ev.creator_id, v); }
const attFor = (D: any, eid: string) => D.attendance.filter((a: any) => a.event_id === eid);
const myRsvp = (D: any, uid: string, eid: string) => { const a = D.attendance.find((a: any) => a.event_id === eid && a.user_id === uid); return a ? a.rsvp : null; };
function proof(D: any, v: string, eid: string) { const mine = myConnIds(D, v); const g = attFor(D, eid).filter((a: any) => ATTEND.includes(a.rsvp) && mine.has(a.user_id)); return { count: g.length, sample: g.slice(0, 3).map((a: any) => publicUser(userById(D, a.user_id))) }; }
const attendees = (D: any, eid: string) => attFor(D, eid).filter((a: any) => ATTEND.includes(a.rsvp)).map((a: any) => ({ ...publicUser(userById(D, a.user_id)), rsvp: a.rsvp }));
function enrich(D: any, ev: any, v: string | null, detail = false) {
  if (!canSeeContent(D, v, ev)) return { id: ev.id, type: "busy", busy: true, startTime: iso(ev.start_time), endTime: iso(ev.end_time), visibility: ev.visibility };
  const out: any = { id: ev.id, type: ev.type, title: ev.title, description: ev.description || "", location: ev.location || "", startTime: iso(ev.start_time), endTime: iso(ev.end_time), recurring: ev.recurring || null, visibility: ev.visibility, creator: publicUser(userById(D, ev.creator_id)), proof: proof(D, v as string, ev.id), myRsvp: v ? myRsvp(D, v, ev.id) : null, attendeeCount: attFor(D, ev.id).filter((a: any) => ATTEND.includes(a.rsvp)).length };
  if (detail) out.attendees = attendees(D, ev.id);
  return out;
}
function startOfTodayUTC() { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; }
const notExpired = (ev: any) => !ev.expires_at || new Date(ev.expires_at) > new Date();
function computeRegulars(D: any, me: string) {
  const mine = D.attendance.filter((a: any) => a.user_id === me && ATTEND.includes(a.rsvp)).map((a: any) => a.event_id);
  const tally = new Map<string, any>();
  for (const eid of mine) {
    const ev = D.events.find((e: any) => e.id === eid); if (!ev) continue;
    for (const a of attFor(D, eid)) {
      if (a.user_id === me || !ATTEND.includes(a.rsvp)) continue;
      const t = tally.get(a.user_id) || { count: 0, last: null, contexts: new Set<string>() };
      t.count++; const w = new Date(ev.start_time); if (!t.last || w > new Date(t.last)) t.last = iso(ev.start_time);
      t.contexts.add((ev.type === "intention" ? "lunch" : String(ev.title).split(" ")[0]).toLowerCase());
      tally.set(a.user_id, t);
    }
  }
  const rows = [...tally.entries()].map(([id, t]) => ({ user: publicUser(userById(D, id)), count: t.count, last: t.last, contexts: [...t.contexts].slice(0, 3) })).filter((r) => r.user).sort((a, b) => b.count - a.count || (+new Date(b.last) - +new Date(a.last)));
  return { regulars: rows.filter((r) => r.count >= 3), rising: rows.filter((r) => r.count === 2) };
}

/* ---------- frontend ---------- */
const CT: Record<string, string> = { js: "application/javascript; charset=utf-8", css: "text/css; charset=utf-8", svg: "image/svg+xml", json: "application/json" };
const _cache = new Map<string, string>();
async function asset(name: string) { if (_cache.has(name)) return _cache.get(name)!; const body = await (await fetch(`${RAW}/${name}`)).text(); _cache.set(name, body); return body; }
const SW = "self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>self.clients.claim());";
const manifest = (base: string) => JSON.stringify({ name: "Orbit", short_name: "Orbit", description: "Your social calendar is your profile.", start_url: base + "/", scope: base + "/", display: "standalone", background_color: "#0C0B10", theme_color: "#0C0B10", icons: [{ src: base + "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }] });
const pageHtml = (base: string, script: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1"><meta name="theme-color" content="#0C0B10"><title>Orbit</title><link rel="icon" href="${base}/icon.svg"><link rel="manifest" href="${base}/manifest.webmanifest"><link rel="stylesheet" href="${base}/orbit.css"><script>window.ORBIT_BASE=${JSON.stringify(base)}</script></head><body><div id="app"><div class="shell"><div class="main"><div class="empty">Loading…</div></div></div></div><script src="${base}/${script}"></script></body></html>`;
async function serveFrontend(path: string, base: string, cors: Record<string, string>) {
  const h = (ct: string, body: string) => new Response(body, { headers: { ...cors, "content-type": ct } });
  if (path === "/app.js") return h(CT.js, await asset("app.js"));
  if (path === "/orbit.css") return h(CT.css, await asset("orbit.css"));
  if (path === "/view.js") return h(CT.js, await asset("view.js"));
  if (path === "/icon.svg") return h(CT.svg, await asset("icon.svg"));
  if (path === "/manifest.webmanifest") return h(CT.json, manifest(base));
  if (path === "/sw.js") return h(CT.js, SW);
  if (path.startsWith("/u/") || path.startsWith("/e/")) return h("text/html; charset=utf-8", pageHtml(base, "view.js"));
  return h("text/html; charset=utf-8", pageHtml(base, "app.js"));
}

/* ---------- server ---------- */
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const i = url.pathname.indexOf("/orbit");
  const base = i >= 0 ? url.pathname.slice(0, i + 6) : "";
  let path = i >= 0 ? url.pathname.slice(i + 6) : url.pathname;
  if (!path) path = "/";
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "content-type": "application/json" } });
  if (!path.startsWith("/api/")) return await serveFrontend(path, base, cors);

  try {
    const seg = path.split("/").filter(Boolean); // ["api", ...]
    const method = req.method;
    const body: any = (method === "POST" || method === "PUT") ? await req.json().catch(() => ({})) : {};
    const uid = await readToken(req);
    const need = () => { if (!uid) throw { status: 401, message: "Unauthorized" }; return uid; };

    if (seg[1] === "health") { const D = await loadD(); return json({ ok: true, users: D.users.length, events: D.events.length }); }

    if (seg[1] === "auth" && seg[2] === "register" && method === "POST") {
      const handle = String(body.username || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (!handle || !body.password) return json({ error: "Username and password required" }, 400);
      if ((await sql`select 1 from orbit.users where handle=${handle}`).length) return json({ error: "Username taken" }, 400);
      const ph = await hashPassword(body.password);
      const u = (await sql`insert into orbit.users(handle,display_name,password_hash,avatar,share_id) values(${handle},${body.displayName || body.username},${ph},${PAL[hashStr(handle) % PAL.length]},${crypto.randomUUID().slice(0, 8)}) returning *`)[0];
      return json({ token: await makeToken(u.id), user: meJson(u) });
    }
    if (seg[1] === "auth" && seg[2] === "login" && method === "POST") {
      const handle = String(body.username || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
      const u = (await sql`select * from orbit.users where handle=${handle}`)[0];
      if (!u || !(await verifyPassword(body.password || "", u.password_hash))) return json({ error: "Invalid credentials" }, 401);
      return json({ token: await makeToken(u.id), user: meJson(u) });
    }

    if (seg[1] === "me" && method === "GET") { need(); const u = userById(await loadD(), uid); if (!u) return json({ error: "Unauthorized" }, 401); return json(meJson(u)); }
    if (seg[1] === "me" && method === "PUT") {
      need(); const cur = userById(await loadD(), uid);
      const nd = body.displayName !== undefined ? body.displayName : cur.display_name;
      const nb = body.bio !== undefined ? body.bio : cur.bio;
      const ns = body.scenes !== undefined ? body.scenes : (cur.scenes || []);
      const ng = body.ghost !== undefined ? !!body.ghost : cur.ghost;
      const u = (await sql`update orbit.users set display_name=${nd}, bio=${nb}, scenes=${sql.json(ns)}, ghost=${ng} where id=${uid} returning *`)[0];
      return json(meJson(u));
    }

    if (seg[1] === "users" && method === "GET") {
      need(); const D = await loadD();
      return json(D.users.filter((u: any) => u.id !== uid).map((u: any) => ({ ...publicUser(u), status: connStatus(D, uid as string, u.id), tier: tierOf(D, uid as string, u.id) })));
    }

    if (seg[1] === "connections" && seg.length === 2 && method === "POST") {
      need(); const D = await loadD(); const toId = body.toId;
      if (!toId || toId === uid || !userById(D, toId)) return json({ error: "Invalid user" }, 400);
      if (connStatus(D, uid as string, toId) !== "none") return json({ ok: true });
      await sql`insert into orbit.connections(a_id,b_id,status,requested_by) values(${uid},${toId},'pending',${uid})`;
      return json({ ok: true });
    }
    if (seg[1] === "connections" && seg[3] === "accept" && method === "POST") {
      need(); const r = await sql`update orbit.connections set status='accepted' where id=${seg[2]} and b_id=${uid} and status='pending'`;
      if (r.count === 0) return json({ error: "Nothing to accept" }, 400);
      return json({ ok: true });
    }
    if (seg[1] === "circles" && method === "GET") {
      need(); const D = await loadD(); const list = [...myConnIds(D, uid as string)].map((id) => ({ user: publicUser(userById(D, id)), tier: tierOf(D, uid as string, id) || "orbit" }));
      const requests = D.connections.filter((c: any) => c.status === "pending" && c.b_id === uid).map((c: any) => ({ id: c.id, user: publicUser(userById(D, c.a_id)) }));
      return json({ inner: list.filter((x) => x.tier === "inner"), orbit: list.filter((x) => x.tier !== "inner"), requests });
    }
    if (seg[1] === "placements" && method === "PUT") {
      need(); if (!["inner", "orbit"].includes(body.tier)) return json({ error: "Bad tier" }, 400);
      const D = await loadD(); if (!areConnected(D, uid as string, body.otherId)) return json({ error: "Not connected" }, 400);
      await sql`insert into orbit.placements(owner_id,other_id,tier) values(${uid},${body.otherId},${body.tier}) on conflict (owner_id,other_id) do update set tier=excluded.tier`;
      return json({ ok: true });
    }

    if (seg[1] === "events" && seg.length === 2 && method === "POST") {
      need(); if (!body.title || !body.startTime) return json({ error: "Title and start time required" }, 400);
      const type = ["intention", "plan", "event", "scene"].includes(body.type) ? body.type : "event";
      const vis = ["inner", "orbit", "public"].includes(body.visibility) ? body.visibility : "inner";
      const ev = (await sql`insert into orbit.events(creator_id,type,title,description,location,start_time,end_time,recurring,visibility,expires_at) values(${uid},${type},${body.title},${body.description || ""},${body.location || ""},${new Date(body.startTime)},${body.endTime ? new Date(body.endTime) : null},${body.recurring || null},${vis},${body.expiresAt ? new Date(body.expiresAt) : null}) returning *`)[0];
      await sql`insert into orbit.attendance(event_id,user_id,rsvp) values(${ev.id},${uid},'going')`;
      return json(enrich(await loadD(), ev, uid, true));
    }
    if (seg[1] === "events" && seg.length === 3 && method === "GET") {
      const D = await loadD(); const ev = D.events.find((e: any) => e.id === seg[2]);
      if (!ev) return json({ error: "Not found" }, 404);
      if (!canSeeContent(D, uid, ev)) return json({ error: "Private" }, 403);
      return json(enrich(D, ev, uid, true));
    }
    if (seg[1] === "events" && seg[3] === "rsvp" && method === "POST") {
      need(); const D0 = await loadD(); const ev = D0.events.find((e: any) => e.id === seg[2]);
      if (!ev) return json({ error: "Not found" }, 404);
      if (!canSeeContent(D0, uid, ev)) return json({ error: "Private" }, 403);
      const rsvp = ["down", "maybe", "cant", "going"].includes(body.rsvp) ? body.rsvp : "down";
      await sql`insert into orbit.attendance(event_id,user_id,rsvp) values(${seg[2]},${uid},${rsvp}) on conflict (event_id,user_id) do update set rsvp=excluded.rsvp`;
      return json(enrich(await loadD(), ev, uid, true));
    }
    if (seg[1] === "events" && seg.length === 3 && method === "DELETE") {
      need(); const r = await sql`delete from orbit.events where id=${seg[2]} and creator_id=${uid}`;
      if (r.count === 0) return json({ error: "Not allowed" }, 403);
      return json({ ok: true });
    }

    if (seg[1] === "discover" && method === "GET") {
      need(); const D = await loadD(); const conns = myConnIds(D, uid as string);
      const from = startOfTodayUTC(); const to = new Date(from); to.setUTCDate(to.getUTCDate() + 7);
      const events = D.events.filter((ev: any) => {
        if (!notExpired(ev)) return false; const t = new Date(ev.start_time); if (t < from || t >= to) return false;
        return (ev.creator_id === uid || conns.has(ev.creator_id) || ev.visibility === "public") && canSeeContent(D, uid, ev);
      }).sort((a: any, b: any) => +new Date(a.start_time) - +new Date(b.start_time)).map((ev: any) => enrich(D, ev, uid));
      return json({ events });
    }
    if (seg[1] === "calendar" && method === "GET") {
      need(); const D = await loadD(); const conns = myConnIds(D, uid as string);
      const start = url.searchParams.get("start") ? new Date(url.searchParams.get("start")!) : startOfTodayUTC();
      const end = url.searchParams.get("end") ? new Date(url.searchParams.get("end")!) : new Date(start.getTime() + 31 * 864e5);
      const events = D.events.filter((ev: any) => {
        const t = new Date(ev.start_time); if (t < start || t >= end) return false;
        if (ev.creator_id === uid) return true; if (ev.visibility === "public") return true;
        if (conns.has(ev.creator_id)) return canSeeBusy(D, uid, ev); return false;
      }).map((ev: any) => enrich(D, ev, uid)).sort((a: any, b: any) => +new Date(a.startTime) - +new Date(b.startTime));
      return json({ events });
    }
    if (seg[1] === "profile" && method === "GET") {
      const D = await loadD(); const u = D.users.find((x: any) => x.handle === seg[2] || x.share_id === seg[2]);
      if (!u || (u.ghost && uid !== u.id)) return json({ error: "Not found" }, 404);
      const from = startOfTodayUTC();
      const upcoming = D.events.filter((e: any) => e.creator_id === u.id && new Date(e.start_time) >= from && notExpired(e)).filter((e: any) => canSeeContent(D, uid, e)).sort((a: any, b: any) => +new Date(a.start_time) - +new Date(b.start_time)).slice(0, 12).map((e: any) => enrich(D, e, uid));
      const out: any = { user: { ...publicUser(u), bio: u.bio, scenes: u.scenes || [] }, upcoming, isSelf: uid === u.id, connection: uid && uid !== u.id ? connStatus(D, uid, u.id) : null };
      if (uid === u.id) { const reg = computeRegulars(D, u.id); out.stats = { regulars: reg.regulars.length, plans: D.attendance.filter((a: any) => a.user_id === u.id && ATTEND.includes(a.rsvp)).length, scenes: (u.scenes || []).length }; }
      return json(out);
    }
    if (seg[1] === "regulars" && method === "GET") { need(); return json(computeRegulars(await loadD(), uid as string)); }
    if (seg[1] === "digest" && method === "GET") {
      need(); const D = await loadD(); const conns = myConnIds(D, uid as string);
      const from = startOfTodayUTC(); const to = new Date(from); to.setUTCDate(to.getUTCDate() + 7);
      const week = D.events.filter((ev: any) => { const t = new Date(ev.start_time); return t >= from && t < to && (conns.has(ev.creator_id) || ev.creator_id === uid) && canSeeContent(D, uid, ev); });
      return json({ thisWeek: week.length, converging: week.map((ev: any) => ({ ev, p: proof(D, uid as string, ev.id).count })).filter((x: any) => x.p >= 3).map((x: any) => ({ title: x.ev.title, count: x.p })) });
    }

    return json({ error: "Not found" }, 404);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, e?.status || 500);
  }
});
