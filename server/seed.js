// Seed a demo graph that matches the mockups. Run: npm run seed
// All demo accounts use password "orbit".
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('./db');
const { avatarFor } = require('./domain');

async function main() {
  db.reset();
  const now = new Date();
  const at = (days, h, m = 0) => {
    const x = new Date(now);
    x.setDate(x.getDate() + days);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const hash = await bcrypt.hash('orbit', 10);

  const U = {};
  const mkUser = (handle, displayName, bio = '', scenes = []) => {
    const u = {
      id: uuid(),
      handle,
      displayName,
      passwordHash: hash,
      bio,
      scenes,
      avatar: avatarFor(handle),
      shareId: handle, // friendly account-free links: /u/ed
      ghost: false,
      createdAt: now.toISOString(),
    };
    db.insert('users', u);
    U[handle] = u;
    return u;
  };

  mkUser('ed', 'Ed Shen', 'techno, climbing, natural wine. always down for lunch.', ['Climbing', 'Techno', 'Natural wine', 'PLUR']);
  mkUser('maya', 'Maya Chen', 'sunsets, lunch dates, bouldering.', ['Climbing', 'Film']);
  mkUser('dev', 'Dev Rao', 'wine, records, late dinners.', ['Natural wine', 'Vinyl']);
  mkUser('nina', 'Nina Park', 'run club + climbing gym regular.', ['Running', 'Climbing']);
  mkUser('theo', 'Theo Lin', 'always at the warehouse.', ['Techno', 'Nightlife']);
  mkUser('sam', 'Sam Ortiz', 'natural wine + pottery.', ['Natural wine', 'Ceramics']);
  mkUser('plur', 'PLUR.NYC', 'NYC underground — shows & community.', ['Techno', 'Community']);
  mkUser('jordan', 'Jordan Reyes', 'new in town.', []);

  const connect = (a, b) =>
    db.insert('connections', { id: uuid(), aId: U[a].id, bId: U[b].id, status: 'accepted', requestedBy: U[a].id, createdAt: now.toISOString() });
  const place = (owner, other, tier) => db.insert('placements', { id: uuid(), ownerId: U[owner].id, otherId: U[other].id, tier });

  for (const h of ['maya', 'dev', 'nina', 'theo', 'sam', 'plur']) connect('ed', h);
  connect('maya', 'nina');
  connect('dev', 'sam');
  // a pending request *to* Ed so the Circles screen has an invite to accept
  db.insert('connections', { id: uuid(), aId: U.jordan.id, bId: U.ed.id, status: 'pending', requestedBy: U.jordan.id, createdAt: now.toISOString() });

  // Ed's tiers
  for (const h of ['maya', 'dev', 'nina']) place('ed', h, 'inner');
  for (const h of ['theo', 'sam', 'plur']) place('ed', h, 'orbit');
  // reciprocal placements so Ed can see their inner content
  for (const h of ['maya', 'dev', 'nina']) place(h, 'ed', 'inner');
  for (const h of ['theo', 'sam']) place(h, 'ed', 'orbit');
  place('plur', 'ed', 'orbit');

  const ev = (opts) => {
    const e = {
      id: uuid(),
      creatorId: U[opts.creator].id,
      type: opts.type || 'event',
      title: opts.title,
      description: opts.description || '',
      location: opts.location || '',
      startTime: opts.start,
      endTime: opts.end || null,
      recurring: opts.recurring || null,
      visibility: opts.visibility || 'inner',
      expiresAt: opts.expiresAt || null,
      createdAt: now.toISOString(),
    };
    db.insert('events', e);
    db.insert('attendance', { id: uuid(), eventId: e.id, userId: e.creatorId, rsvp: 'going', createdAt: now.toISOString() });
    return e.id;
  };
  const attend = (eid, h, rsvp) => db.insert('attendance', { id: uuid(), eventId: eid, userId: U[h].id, rsvp, createdAt: now.toISOString() });

  /* ---- this week (Discover / Week / Month) ---- */
  const lunch = ev({ creator: 'maya', type: 'intention', title: 'Lunch — anyone around?', location: 'Devoción, Williamsburg', start: at(0, 12, 30), end: at(0, 14), visibility: 'inner', expiresAt: at(0, 23, 59) });
  attend(lunch, 'nina', 'down');
  attend(lunch, 'theo', 'down'); // Ed deliberately not yet → Discover shows "I'm down"

  const run = ev({ creator: 'ed', type: 'plan', title: 'Evening run', location: 'Brooklyn Bridge', start: at(0, 18, 30), end: at(0, 19, 30), recurring: 'weekly', visibility: 'orbit' });
  attend(run, 'dev', 'down');
  attend(run, 'nina', 'down');
  attend(run, 'theo', 'down');

  const wine = ev({ creator: 'dev', type: 'event', title: 'Natural wine night', location: 'Ruffian, East Village', start: at(1, 20), end: at(1, 23), visibility: 'orbit' });
  attend(wine, 'maya', 'down');
  attend(wine, 'nina', 'down');
  attend(wine, 'sam', 'down');
  attend(wine, 'theo', 'maybe');

  const runThu = ev({ creator: 'ed', type: 'plan', title: 'Evening run', location: 'Brooklyn Bridge', start: at(2, 18, 30), end: at(2, 19, 30), recurring: 'weekly', visibility: 'orbit' });
  attend(runThu, 'dev', 'down');

  const warehouse = ev({ creator: 'plur', type: 'scene', title: 'Warehouse: SHØLT', location: 'Bushwick', start: at(3, 23), end: at(4, 4), visibility: 'public' });
  for (const h of ['maya', 'dev', 'nina', 'theo', 'sam']) attend(warehouse, h, 'down');

  const climb = ev({ creator: 'ed', type: 'event', title: 'Climbing @ VITAL', location: 'Greenpoint', start: at(4, 10), end: at(4, 12), visibility: 'inner' });
  attend(climb, 'nina', 'down');
  attend(climb, 'maya', 'down');

  const standing = ev({ creator: 'ed', type: 'plan', title: 'Standing lunch', location: 'rotating spot', start: at(6, 12, 30), end: at(6, 14), recurring: 'weekly', visibility: 'inner' });
  attend(standing, 'maya', 'down');

  ev({ creator: 'ed', type: 'event', title: 'Pottery class', location: 'Gowanus', start: at(8, 19), end: at(8, 21), visibility: 'public' });

  /* ---- past co-presence (powers Regulars) ---- */
  const coffee = ev({ creator: 'maya', type: 'intention', title: 'Coffee + work', location: 'Devoción', start: at(-3, 11), end: at(-3, 13), visibility: 'inner' });
  attend(coffee, 'ed', 'going');
  attend(coffee, 'sam', 'down');

  const climbPast = ev({ creator: 'nina', type: 'event', title: 'Climbing session', location: 'VITAL', start: at(-7, 10), end: at(-7, 12), visibility: 'inner' });
  attend(climbPast, 'ed', 'going');
  attend(climbPast, 'maya', 'down');

  const winePast = ev({ creator: 'dev', type: 'event', title: 'Wine + records', location: 'home', start: at(-10, 20), end: at(-10, 23), visibility: 'orbit' });
  attend(winePast, 'ed', 'going');
  attend(winePast, 'sam', 'down');

  const showPast = ev({ creator: 'plur', type: 'scene', title: 'Show: Nowadays', location: 'Ridgewood', start: at(-14, 22), end: at(-13, 3), visibility: 'public' });
  attend(showPast, 'ed', 'going');
  attend(showPast, 'theo', 'down');

  console.log('Seeded:', {
    users: db.col('users').length,
    connections: db.col('connections').length,
    events: db.col('events').length,
    attendance: db.col('attendance').length,
  });
  console.log('Demo login → username: ed   password: orbit');
}

main();
