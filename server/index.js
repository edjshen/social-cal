const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('./db');
const { avatarFor, initials } = require('./domain');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'orbit-dev-secret-change-me';
const PUBLIC = path.join(__dirname, '..', 'public');

app.use(express.json());
app.use(express.static(PUBLIC));

/* ------------------------------------------------------------------ auth */
function sign(user) {
  return jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
}
function readToken(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) return null;
  try {
    return jwt.verify(t, JWT_SECRET).uid;
  } catch {
    return null;
  }
}
function requireAuth(req, res, next) {
  const uid = readToken(req);
  if (!uid || !db.find('users', (u) => u.id === uid)) return res.status(401).json({ error: 'Unauthorized' });
  req.uid = uid;
  next();
}

/* -------------------------------------------------------------- domain */
function userById(id) {
  return db.find('users', (u) => u.id === id);
}
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, handle: u.handle, displayName: u.displayName, avatar: u.avatar, initials: initials(u.displayName) };
}
function accepted(c) {
  return c.status === 'accepted';
}
function areConnected(a, b) {
  return !!db.find(
    'connections',
    (c) => accepted(c) && ((c.aId === a && c.bId === b) || (c.aId === b && c.bId === a))
  );
}
function myConnectionIds(me) {
  const ids = new Set();
  for (const c of db.filter('connections', (c) => accepted(c) && (c.aId === me || c.bId === me))) {
    ids.add(c.aId === me ? c.bId : c.aId);
  }
  return ids;
}
function connectionStatus(me, other) {
  const c = db.find(
    'connections',
    (c) => (c.aId === me && c.bId === other) || (c.aId === other && c.bId === me)
  );
  if (!c) return 'none';
  if (c.status === 'accepted') return 'connected';
  return c.requestedBy === me ? 'pending_out' : 'pending_in';
}
// The tier `owner` has placed `other` into ('inner' | 'orbit' | null).
function tierOf(owner, other) {
  const p = db.find('placements', (p) => p.ownerId === owner && p.otherId === other);
  return p ? p.tier : null;
}

// Can `viewer` see the *content* (title/details) of `event`?
function canSeeContent(viewer, ev) {
  if (ev.visibility === 'public') return true;
  if (!viewer) return false;
  if (ev.creatorId === viewer) return true;
  if (!areConnected(ev.creatorId, viewer)) return false;
  const tier = tierOf(ev.creatorId, viewer) || 'orbit';
  if (ev.visibility === 'orbit') return true; // inner + orbit both see content
  if (ev.visibility === 'inner') return tier === 'inner';
  return false;
}
// Can `viewer` at least see that this time is busy (free/busy), even without content?
function canSeeBusy(viewer, ev) {
  if (canSeeContent(viewer, ev)) return true;
  if (!viewer) return false;
  return areConnected(ev.creatorId, viewer);
}

const ATTEND = ['going', 'down', 'maybe'];
function attendanceFor(eventId) {
  return db.filter('attendance', (a) => a.eventId === eventId);
}
function myRsvp(uid, eventId) {
  const a = db.find('attendance', (a) => a.eventId === eventId && a.userId === uid);
  return a ? a.rsvp : null;
}
function socialProof(viewer, eventId) {
  const mine = myConnectionIds(viewer);
  const going = attendanceFor(eventId).filter((a) => ATTEND.includes(a.rsvp) && mine.has(a.userId));
  return {
    count: going.length,
    sample: going.slice(0, 3).map((a) => publicUser(userById(a.userId))),
  };
}
function attendees(eventId) {
  return attendanceFor(eventId)
    .filter((a) => ATTEND.includes(a.rsvp))
    .map((a) => ({ ...publicUser(userById(a.userId)), rsvp: a.rsvp }));
}

function enrich(ev, viewer, { detail = false } = {}) {
  const content = canSeeContent(viewer, ev);
  if (!content) {
    // Free/busy only — a blocked time with no details.
    return {
      id: ev.id,
      type: 'busy',
      busy: true,
      startTime: ev.startTime,
      endTime: ev.endTime,
      visibility: ev.visibility,
    };
  }
  const out = {
    id: ev.id,
    type: ev.type,
    title: ev.title,
    description: ev.description || '',
    location: ev.location || '',
    startTime: ev.startTime,
    endTime: ev.endTime || null,
    recurring: ev.recurring || null,
    visibility: ev.visibility,
    creator: publicUser(userById(ev.creatorId)),
    proof: socialProof(viewer, ev.id),
    myRsvp: viewer ? myRsvp(viewer, ev.id) : null,
    attendeeCount: attendanceFor(ev.id).filter((a) => ATTEND.includes(a.rsvp)).length,
  };
  if (detail) out.attendees = attendees(ev.id);
  return out;
}

/* helpers for date windows */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function notExpired(ev) {
  return !ev.expiresAt || new Date(ev.expiresAt) > new Date();
}

/* ------------------------------------------------------------- routes */
app.get('/api/health', (req, res) => res.json({ ok: true, users: db.col('users').length, events: db.col('events').length }));

app.post('/api/auth/register', async (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const handle = String(username).toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!handle) return res.status(400).json({ error: 'Invalid username' });
  if (db.find('users', (u) => u.handle === handle)) return res.status(400).json({ error: 'Username taken' });
  const user = db.insert('users', {
    id: uuid(),
    handle,
    displayName: displayName || username,
    passwordHash: await bcrypt.hash(password, 10),
    bio: '',
    scenes: [],
    avatar: avatarFor(handle),
    shareId: uuid().slice(0, 8),
    ghost: false,
    createdAt: new Date().toISOString(),
  });
  res.json({ token: sign(user), user: me(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const handle = String(username || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const user = db.find('users', (u) => u.handle === handle);
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash)))
    return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: sign(user), user: me(user) });
});

function me(u) {
  return {
    ...publicUser(u),
    bio: u.bio,
    scenes: u.scenes || [],
    ghost: !!u.ghost,
    shareId: u.shareId,
  };
}

app.get('/api/me', requireAuth, (req, res) => res.json(me(userById(req.uid))));

app.put('/api/me', requireAuth, (req, res) => {
  const { displayName, bio, scenes, ghost } = req.body || {};
  const patch = {};
  if (displayName !== undefined) patch.displayName = displayName;
  if (bio !== undefined) patch.bio = bio;
  if (scenes !== undefined) patch.scenes = scenes;
  if (ghost !== undefined) patch.ghost = !!ghost;
  res.json(me(db.update('users', req.uid, patch)));
});

/* people + circles */
app.get('/api/users', requireAuth, (req, res) => {
  const others = db.filter('users', (u) => u.id !== req.uid).map((u) => ({
    ...publicUser(u),
    status: connectionStatus(req.uid, u.id),
    tier: tierOf(req.uid, u.id),
  }));
  res.json(others);
});

app.post('/api/connections', requireAuth, (req, res) => {
  const { toId } = req.body || {};
  const other = userById(toId);
  if (!other || toId === req.uid) return res.status(400).json({ error: 'Invalid user' });
  if (connectionStatus(req.uid, toId) !== 'none') return res.json({ ok: true });
  db.insert('connections', { id: uuid(), aId: req.uid, bId: toId, status: 'pending', requestedBy: req.uid, createdAt: new Date().toISOString() });
  res.json({ ok: true });
});

app.post('/api/connections/:id/accept', requireAuth, (req, res) => {
  const c = db.find('connections', (c) => c.id === req.params.id);
  if (!c || c.bId !== req.uid || c.status !== 'pending') return res.status(400).json({ error: 'Nothing to accept' });
  db.update('connections', c.id, { status: 'accepted' });
  res.json({ ok: true });
});

app.get('/api/circles', requireAuth, (req, res) => {
  const ids = myConnectionIds(req.uid);
  const list = [...ids].map((id) => ({ user: publicUser(userById(id)), tier: tierOf(req.uid, id) || 'orbit' }));
  const pending = db
    .filter('connections', (c) => c.status === 'pending' && c.bId === req.uid)
    .map((c) => ({ id: c.id, user: publicUser(userById(c.aId)) }));
  res.json({
    inner: list.filter((x) => x.tier === 'inner'),
    orbit: list.filter((x) => x.tier !== 'inner'),
    requests: pending,
  });
});

app.put('/api/placements', requireAuth, (req, res) => {
  const { otherId, tier } = req.body || {};
  if (!['inner', 'orbit'].includes(tier)) return res.status(400).json({ error: 'Bad tier' });
  if (!areConnected(req.uid, otherId)) return res.status(400).json({ error: 'Not connected' });
  const existing = db.find('placements', (p) => p.ownerId === req.uid && p.otherId === otherId);
  if (existing) db.update('placements', existing.id, { tier });
  else db.insert('placements', { id: uuid(), ownerId: req.uid, otherId, tier });
  res.json({ ok: true });
});

/* events */
app.post('/api/events', requireAuth, (req, res) => {
  const { type, title, description, location, startTime, endTime, recurring, visibility, expiresAt } = req.body || {};
  if (!title || !startTime) return res.status(400).json({ error: 'Title and start time required' });
  const ev = db.insert('events', {
    id: uuid(),
    creatorId: req.uid,
    type: ['intention', 'plan', 'event', 'scene'].includes(type) ? type : 'event',
    title,
    description: description || '',
    location: location || '',
    startTime: new Date(startTime).toISOString(),
    endTime: endTime ? new Date(endTime).toISOString() : null,
    recurring: recurring || null,
    visibility: ['inner', 'orbit', 'public'].includes(visibility) ? visibility : 'inner',
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    createdAt: new Date().toISOString(),
  });
  db.insert('attendance', { id: uuid(), eventId: ev.id, userId: req.uid, rsvp: 'going', createdAt: new Date().toISOString() });
  res.json(enrich(ev, req.uid, { detail: true }));
});

app.get('/api/events/:id', (req, res) => {
  const viewer = readToken(req);
  const ev = db.find('events', (e) => e.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  if (!canSeeContent(viewer, ev)) return res.status(403).json({ error: 'Private' });
  res.json(enrich(ev, viewer, { detail: true }));
});

app.post('/api/events/:id/rsvp', requireAuth, (req, res) => {
  const ev = db.find('events', (e) => e.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  if (!canSeeContent(req.uid, ev)) return res.status(403).json({ error: 'Private' });
  const rsvp = ['down', 'maybe', 'cant', 'going'].includes(req.body.rsvp) ? req.body.rsvp : 'down';
  const existing = db.find('attendance', (a) => a.eventId === ev.id && a.userId === req.uid);
  if (existing) db.update('attendance', existing.id, { rsvp });
  else db.insert('attendance', { id: uuid(), eventId: ev.id, userId: req.uid, rsvp, createdAt: new Date().toISOString() });
  res.json(enrich(ev, req.uid, { detail: true }));
});

app.delete('/api/events/:id', requireAuth, (req, res) => {
  const ev = db.find('events', (e) => e.id === req.params.id);
  if (!ev || ev.creatorId !== req.uid) return res.status(403).json({ error: 'Not allowed' });
  db.remove('attendance', (a) => a.eventId === ev.id);
  db.remove('events', (e) => e.id === ev.id);
  res.json({ ok: true });
});

/* discover — this week, social proof */
app.get('/api/discover', requireAuth, (req, res) => {
  const conns = myConnectionIds(req.uid);
  const from = startOfToday();
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  const items = db
    .filter('events', (ev) => {
      if (!notExpired(ev)) return false;
      const t = new Date(ev.startTime);
      if (t < from || t >= to) return false;
      const relevant = ev.creatorId === req.uid || conns.has(ev.creatorId) || ev.visibility === 'public';
      return relevant && canSeeContent(req.uid, ev);
    })
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .map((ev) => enrich(ev, req.uid));
  res.json({ events: items });
});

/* calendar grid — my events + visible circle events (busy for inner-only) */
app.get('/api/calendar', requireAuth, (req, res) => {
  const start = req.query.start ? new Date(req.query.start) : startOfToday();
  const end = req.query.end ? new Date(req.query.end) : new Date(start.getTime() + 31 * 864e5);
  const conns = myConnectionIds(req.uid);
  const items = db
    .filter('events', (ev) => {
      const t = new Date(ev.startTime);
      if (t < start || t >= end) return false;
      if (ev.creatorId === req.uid) return true;
      if (ev.visibility === 'public') return true;
      if (conns.has(ev.creatorId)) return canSeeBusy(req.uid, ev);
      return false;
    })
    .map((ev) => enrich(ev, req.uid))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  res.json({ events: items });
});

/* profile — public-aware */
app.get('/api/profile/:handle', (req, res) => {
  const viewer = readToken(req);
  const u = db.find('users', (x) => x.handle === req.params.handle || x.shareId === req.params.handle);
  if (!u) return res.status(404).json({ error: 'Not found' });
  if (u.ghost && viewer !== u.id) return res.status(404).json({ error: 'Not found' });
  const from = startOfToday();
  const upcoming = db
    .filter('events', (ev) => ev.creatorId === u.id && new Date(ev.startTime) >= from && notExpired(ev))
    .filter((ev) => canSeeContent(viewer, ev))
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .slice(0, 12)
    .map((ev) => enrich(ev, viewer));
  const out = {
    user: { ...publicUser(u), bio: u.bio, scenes: u.scenes || [] },
    upcoming,
    isSelf: viewer === u.id,
    connection: viewer && viewer !== u.id ? connectionStatus(viewer, u.id) : null,
  };
  if (viewer === u.id) {
    out.stats = {
      regulars: computeRegulars(u.id).regulars.length,
      plans: db.filter('attendance', (a) => a.userId === u.id && ATTEND.includes(a.rsvp)).length,
      scenes: (u.scenes || []).length,
    };
  }
  res.json(out);
});

/* regulars — co-presence engine, private to caller */
function computeRegulars(me) {
  const myEvents = db.filter('attendance', (a) => a.userId === me && ATTEND.includes(a.rsvp)).map((a) => a.eventId);
  const tally = new Map(); // otherId -> {count, last, contexts:Set}
  for (const eid of myEvents) {
    const ev = db.find('events', (e) => e.id === eid);
    if (!ev) continue;
    for (const a of attendanceFor(eid)) {
      if (a.userId === me || !ATTEND.includes(a.rsvp)) continue;
      const t = tally.get(a.userId) || { count: 0, last: null, contexts: new Set() };
      t.count += 1;
      const when = new Date(ev.startTime);
      if (!t.last || when > new Date(t.last)) t.last = ev.startTime;
      if (ev.location || ev.title) t.contexts.add((ev.type === 'intention' ? 'lunch' : ev.title.split(' ')[0]).toLowerCase());
      tally.set(a.userId, t);
    }
  }
  const rows = [...tally.entries()]
    .map(([id, t]) => ({
      user: publicUser(userById(id)),
      count: t.count,
      last: t.last,
      contexts: [...t.contexts].slice(0, 3),
    }))
    .filter((r) => r.user)
    .sort((a, b) => b.count - a.count || new Date(b.last) - new Date(a.last));
  return {
    regulars: rows.filter((r) => r.count >= 3),
    rising: rows.filter((r) => r.count === 2),
  };
}
app.get('/api/regulars', requireAuth, (req, res) => res.json(computeRegulars(req.uid)));

/* slow digest (stub of the batched-notification model) */
app.get('/api/digest', requireAuth, (req, res) => {
  const conns = myConnectionIds(req.uid);
  const from = startOfToday();
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  const week = db.filter('events', (ev) => {
    const t = new Date(ev.startTime);
    return t >= from && t < to && (conns.has(ev.creatorId) || ev.creatorId === req.uid) && canSeeContent(req.uid, ev);
  });
  res.json({
    thisWeek: week.length,
    converging: week
      .map((ev) => ({ ev, proof: socialProof(req.uid, ev.id).count }))
      .filter((x) => x.proof >= 3)
      .map((x) => ({ title: x.ev.title, count: x.proof })),
  });
});

/* account-free pages + SPA fallback */
app.get(['/u/:handle', '/e/:id'], (req, res) => res.sendFile(path.join(PUBLIC, 'view.html')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`◐ Orbit running on http://localhost:${PORT}`));
}
module.exports = app;
