import { writeFileSync } from 'node:fs';
import { hashPassword } from '../lib/auth/password';

const now = new Date();
const at = (days: number, h: number, m = 0) => {
  const x = new Date(now); x.setDate(x.getDate() + days); x.setHours(h, m, 0, 0);
  return x.toISOString();
};
const PALETTE = [['#FF8A5B','#FF5E87'],['#5FD3A6','#3FA7C2'],['#9B8CFF','#6C7BFF'],['#FFC178','#FF8A5B'],['#FF5E87','#9B8CFF'],['#5FD3A6','#6C7BFF'],['#FFC178','#FF5E87'],['#9B8CFF','#FF5E87']];
const hashStr = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h*31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const avatarFor = (seed: string) => PALETTE[hashStr(seed) % PALETTE.length].join(',');
const id = () => crypto.randomUUID();
const q = (v: string | null) => (v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`);

async function main() {
  const pw = await hashPassword('orbit');
  const lines: string[] = ['DELETE FROM attendance;','DELETE FROM events;','DELETE FROM placements;','DELETE FROM connections;','DELETE FROM users;'];
  const U: Record<string, string> = {};
  const user = (handle: string, name: string, bio = '', scenes: string[] = []) => {
    const uid = id(); U[handle] = uid;
    lines.push(`INSERT INTO users (id,handle,display_name,password_hash,bio,scenes,avatar,share_id,ghost,created_at) VALUES (${q(uid)},${q(handle)},${q(name)},${q(pw)},${q(bio)},${q(JSON.stringify(scenes))},${q(avatarFor(handle))},${q(handle)},0,${q(now.toISOString())});`);
  };
  user('ed','Ed Shen','techno, climbing, natural wine. always down for lunch.',['Climbing','Techno','Natural wine','PLUR']);
  user('maya','Maya Chen','sunsets, lunch dates, bouldering.',['Climbing','Film']);
  user('dev','Dev Rao','wine, records, late dinners.',['Natural wine','Vinyl']);
  user('nina','Nina Park','run club + climbing gym regular.',['Running','Climbing']);
  user('theo','Theo Lin','always at the warehouse.',['Techno','Nightlife']);
  user('sam','Sam Ortiz','natural wine + pottery.',['Natural wine','Ceramics']);
  user('orbit','Orbit','NYC underground — shows & community.',['Techno','Community']);
  user('jordan','Jordan Reyes','new in town.',[]);

  const conn = (a: string, b: string, status: string, by: string) =>
    lines.push(`INSERT INTO connections (id,a_id,b_id,status,requested_by,created_at) VALUES (${q(id())},${q(U[a])},${q(U[b])},${q(status)},${q(U[by])},${q(now.toISOString())});`);
  for (const h of ['maya','dev','nina','theo','sam','orbit']) conn('ed', h, 'accepted', 'ed');
  conn('maya','nina','accepted','maya'); conn('dev','sam','accepted','dev');
  conn('jordan','ed','pending','jordan');

  const place = (o: string, x: string, tier: string) =>
    lines.push(`INSERT INTO placements (id,owner_id,other_id,tier) VALUES (${q(id())},${q(U[o])},${q(U[x])},${q(tier)});`);
  for (const h of ['maya','dev','nina']) place('ed', h, 'inner');
  for (const h of ['theo','sam','orbit']) place('ed', h, 'orbit');
  for (const h of ['maya','dev','nina']) place(h, 'ed', 'inner');
  for (const h of ['theo','sam']) place(h, 'ed', 'orbit');
  place('orbit','ed','orbit');

  const ev = (creator: string, type: string, title: string, location: string, start: string, end: string | null, visibility: string, recurring: string | null = null, expiresAt: string | null = null) => {
    const eid = id();
    lines.push(`INSERT INTO events (id,creator_id,type,title,description,location,start_time,end_time,recurring,visibility,expires_at,created_at) VALUES (${q(eid)},${q(U[creator])},${q(type)},${q(title)},'',${q(location)},${q(start)},${end===null?'NULL':q(end)},${recurring===null?'NULL':q(recurring)},${q(visibility)},${expiresAt===null?'NULL':q(expiresAt)},${q(now.toISOString())});`);
    lines.push(`INSERT INTO attendance (id,event_id,user_id,rsvp,created_at) VALUES (${q(id())},${q(eid)},${q(U[creator])},'going',${q(now.toISOString())});`);
    return eid;
  };
  const attend = (eid: string, h: string, rsvp: string) =>
    lines.push(`INSERT INTO attendance (id,event_id,user_id,rsvp,created_at) VALUES (${q(id())},${q(eid)},${q(U[h])},${q(rsvp)},${q(now.toISOString())});`);

  const lunch = ev('maya','intention','Lunch — anyone around?','Devoción, Williamsburg', at(0,12,30), at(0,14), 'inner', null, at(0,23,59));
  attend(lunch,'nina','down'); attend(lunch,'theo','down');
  const run = ev('ed','plan','Evening run','Brooklyn Bridge', at(0,18,30), at(0,19,30), 'orbit', 'weekly');
  attend(run,'dev','down'); attend(run,'nina','down'); attend(run,'theo','down');
  const wine = ev('dev','event','Natural wine night','Ruffian, East Village', at(1,20), at(1,23), 'orbit');
  attend(wine,'maya','down'); attend(wine,'nina','down'); attend(wine,'sam','down'); attend(wine,'theo','maybe');
  const runThu = ev('ed','plan','Evening run','Brooklyn Bridge', at(2,18,30), at(2,19,30), 'orbit', 'weekly'); attend(runThu,'dev','down');
  const warehouse = ev('orbit','scene','Warehouse: SHØLT','Bushwick', at(3,23), at(4,4), 'public');
  for (const h of ['maya','dev','nina','theo','sam']) attend(warehouse, h, 'down');
  const climb = ev('ed','event','Climbing @ VITAL','Greenpoint', at(4,10), at(4,12), 'inner'); attend(climb,'nina','down'); attend(climb,'maya','down');
  const standing = ev('ed','plan','Standing lunch','rotating spot', at(6,12,30), at(6,14), 'inner', 'weekly'); attend(standing,'maya','down');
  ev('ed','event','Pottery class','Gowanus', at(8,19), at(8,21), 'public');
  const coffee = ev('maya','intention','Coffee + work','Devoción', at(-3,11), at(-3,13), 'inner'); attend(coffee,'ed','going'); attend(coffee,'sam','down');
  const climbPast = ev('nina','event','Climbing session','VITAL', at(-7,10), at(-7,12), 'inner'); attend(climbPast,'ed','going'); attend(climbPast,'maya','down');
  const winePast = ev('dev','event','Wine + records','home', at(-10,20), at(-10,23), 'orbit'); attend(winePast,'ed','going'); attend(winePast,'sam','down');
  const showPast = ev('orbit','scene','Show: Nowadays','Ridgewood', at(-14,22), at(-13,3), 'public'); attend(showPast,'ed','going'); attend(showPast,'theo','down');

  writeFileSync('drizzle/seed.sql', lines.join('\n') + '\n');
  console.log(`Wrote drizzle/seed.sql (${lines.length} statements). Demo login → ed / orbit`);
}
main();
