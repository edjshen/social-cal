/* Orbit — mobile-first SPA. Talks to the API in server/index.js. */
const app = document.getElementById('app');
const state = { token: localStorage.getItem('orbit_token'), me: null, tab: 'discover', homeView: 'discover', selDay: null, authMode: 'login', err: '' };

/* ---------- helpers ---------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const r = await fetch(path, Object.assign({}, opts, { headers }));
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error || 'Error'), { status: r.status, body });
  return body;
}
const avatar = (u, size = 'sm') => `<span class="av ${size}" style="background:linear-gradient(135deg,${u.avatar})">${esc(u.initials)}</span>`;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const timeLabel = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
function dayLabel(iso) {
  const diff = Math.round((startOfDay(iso) - startOfDay(new Date())) / 864e5);
  const wd = new Date(iso).toLocaleDateString('en-US', { weekday: 'short' });
  if (diff === 0) return 'Today · ' + wd;
  if (diff === 1) return 'Tomorrow · ' + wd;
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long' });
}

const I = {
  discover: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor" stroke="none"/></svg>',
  plans: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>',
  create: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  regulars: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-22 12 12)"/><circle cx="20" cy="8.5" r="1.6" fill="currentColor" stroke="none"/></svg>',
  you: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
  free: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  standing: '<svg viewBox="0 0 24 24"><path d="M17 3l3 3-3 3"/><path d="M20 6H8a4 4 0 0 0-4 4"/><path d="M7 21l-3-3 3-3"/><path d="M4 18h12a4 4 0 0 0 4-4"/></svg>',
  event: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>',
  scene: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.5"/></svg>',
  inner: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  orbit: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0"/><path d="M16 6.5a3 3 0 0 1 0 5.5M21 19a6 6 0 0 0-4-5.6"/></svg>',
  public: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
};
const PILL = { intention: ['free', 'Free'], plan: ['standing', 'Plan'], event: ['event', 'Event'], scene: ['scene', 'Scene'], busy: ['busy', 'Busy'] };
const VIS = { inner: ['inner', 'Inner'], orbit: ['orbit', 'Circle'], public: ['public', 'Public'] };

/* ---------- shell ---------- */
function navHTML() {
  const t = (id, label) => `<button class="${state.tab === id ? 'on' : ''}" onclick="go('${id}')">${I[id]}${label}</button>`;
  return `<nav class="nav">${t('discover', 'Discover')}${t('plans', 'Plans')}<button onclick="openCreate()"><span class="create">${I.create}</span></button>${t('regulars', 'Regulars')}${t('you', 'You')}</nav>`;
}
function mount(inner, withNav) {
  app.innerHTML = withNav ? `<div class="shell"><div class="main">${inner}</div></div>${navHTML()}` : inner;
}

async function refresh() {
  try {
    if (!state.token) return mount(renderAuth(), false);
    if (!state.me) state.me = await api('/api/me');
    let html = '';
    if (state.tab === 'discover') html = await renderHome();
    else if (state.tab === 'plans') html = await renderPlans();
    else if (state.tab === 'regulars') html = await renderRegulars();
    else if (state.tab === 'you') html = await renderProfile();
    else if (state.tab === 'circles') html = await renderCircles();
    mount(html, true);
  } catch (e) {
    if (e.status === 401) { logout(); return; }
    mount(`<div class="shell"><div class="main"><div class="empty">Something went wrong.<br>${esc(e.message)}</div></div></div>` + navHTML(), false);
  }
}
window.go = (tab) => { state.tab = tab; refresh(); };

/* ---------- auth ---------- */
function renderAuth() {
  const reg = state.authMode === 'register';
  return `<div class="auth">
    <div class="logo"><span class="mark"></span> Orbit</div>
    <p class="tag">Your social calendar is your profile.</p>
    <div class="field"><label>Username</label><input id="u" type="text" autocapitalize="off" placeholder="ed"></div>
    ${reg ? '<div class="field"><label>Display name</label><input id="dn" type="text" placeholder="Ed Shen"></div>' : ''}
    <div class="field"><label>Password</label><input id="p" type="password" placeholder="••••••••"></div>
    <button class="btn solid block" onclick="${reg ? 'doRegister()' : 'doLogin()'}">${reg ? 'Create account' : 'Log in'}</button>
    ${state.err ? `<div class="error">${esc(state.err)}</div>` : ''}
    <div class="toggle-link" onclick="toggleAuth()">${reg ? 'Have an account? <b>Log in</b>' : 'New here? <b>Create account</b>'}</div>
    ${reg ? '' : '<div class="toggle-link faint" style="margin-top:22px">demo · <b>ed</b> / <b>orbit</b></div>'}
  </div>`;
}
window.toggleAuth = () => { state.authMode = state.authMode === 'login' ? 'register' : 'login'; state.err = ''; refresh(); };
async function auth(path, payload) {
  try {
    const r = await api(path, { method: 'POST', body: JSON.stringify(payload) });
    state.token = r.token; localStorage.setItem('orbit_token', r.token); state.me = r.user; state.err = ''; state.tab = 'discover';
    refresh();
  } catch (e) { state.err = e.message; refresh(); }
}
window.doLogin = () => auth('/api/auth/login', { username: val('u'), password: val('p') });
window.doRegister = () => auth('/api/auth/register', { username: val('u'), password: val('p'), displayName: val('dn') });
window.logout = () => { state.token = null; state.me = null; localStorage.removeItem('orbit_token'); refresh(); };
const val = (id) => (document.getElementById(id) || {}).value || '';

/* ---------- discover ---------- */
function eventCard(ev) {
  if (ev.busy) {
    return `<div class="card"><div class="row between"><span class="pill busy">${I.event} Busy</span><span class="meta">${timeLabel(ev.startTime)}</span></div><div class="ev-title faint" style="margin-bottom:0">A friend is busy</div></div>`;
  }
  const [pc, pl] = PILL[ev.type] || PILL.event;
  const proof = ev.proof && ev.proof.count
    ? `<div class="proof"><div class="stack">${ev.proof.sample.map((u) => avatar(u)).join('')}</div><span>${ev.proof.count} going</span></div>`
    : `<div class="proof"><span class="faint">be the first in</span></div>`;
  let action;
  if (ev.creator.id === state.me.id) action = `<span class="btn sm in">Hosting</span>`;
  else action = `<div class="row" style="gap:6px;margin-left:auto">${['down', 'maybe', 'cant'].map((v) =>
    `<button class="btn sm ${ev.myRsvp === v ? (v === 'cant' ? '' : 'in') : ''}" onclick="rsvp('${ev.id}','${v}')">${({ down: "I'm down", maybe: 'Maybe', cant: "Can't" })[v]}</button>`).join('')}</div>`;
  return `<div class="card">
    <div class="row between"><span class="pill ${pc}">${I[pc] || I.event} ${pl}${ev.recurring ? ' ·↻' : ''}</span><span class="meta">${timeLabel(ev.startTime)}</span></div>
    <div class="ev-title">${esc(ev.title)}</div>
    <div class="meta">${esc(ev.creator.displayName)}${ev.location ? '<span class="dot"></span>' + esc(ev.location) : ''}</div>
    <div class="row between" style="margin-top:12px">${proof}${action}</div>
  </div>`;
}
async function renderHome() {
  const seg = `<div class="seg">${['discover', 'week', 'month'].map((v) => `<button class="${state.homeView === v ? 'on' : ''}" onclick="setHome('${v}')">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`;
  if (state.homeView === 'week') return seg + (await renderWeek());
  if (state.homeView === 'month') return seg + (await renderMonth());
  const { events } = await api('/api/discover');
  let body = '';
  if (!events.length) body = `<div class="empty">Nothing on the radar this week.<br>Tap ＋ to start something.</div>`;
  let lastDay = '';
  for (const ev of events) {
    const dl = dayLabel(ev.startTime);
    if (dl !== lastDay) { body += `<div class="daylabel">${dl}</div>`; lastDay = dl; }
    body += eventCard(ev);
  }
  const head = `<div class="topbar"><div><div class="kicker">Discover</div><div class="h-title">This week</div></div></div>`;
  return head + seg + body + (events.length ? `<div class="footnote">— that's your week —</div>` : '');
}
window.setHome = (v) => { state.homeView = v; refresh(); };
window.rsvp = async (id, v) => { await api(`/api/events/${id}/rsvp`, { method: 'POST', body: JSON.stringify({ rsvp: v }) }); refresh(); };

/* ---------- week ---------- */
function mondayOf(d) { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }
async function renderWeek() {
  const ws = mondayOf(new Date()); const we = new Date(ws); we.setDate(we.getDate() + 7);
  const { events } = await api(`/api/calendar?start=${ws.toISOString()}&end=${we.toISOString()}`);
  const days = [...Array(7)].map((_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; });
  const today = startOfDay(new Date()).getTime();
  const headDays = days.map((d) => {
    const on = startOfDay(d).getTime() === today;
    return `<div class="${on ? 'today' : ''}"><div class="wd">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div><div class="dt">${d.getDate()}</div></div>`;
  }).join('');
  const PXH = 29, BASE = 8;
  const cols = days.map((d) => {
    const on = startOfDay(d).getTime() === today;
    const evs = events.filter((e) => startOfDay(e.startTime).getTime() === startOfDay(d).getTime());
    const blocks = evs.map((e) => {
      const s = new Date(e.startTime); const hrs = s.getHours() + s.getMinutes() / 60;
      const top = Math.max(0, (hrs - BASE) * PXH);
      const dur = e.endTime ? (new Date(e.endTime) - s) / 36e5 : 1;
      const h = Math.max(16, dur * PXH);
      const cls = e.busy ? 'busy' : e.type;
      const label = e.busy ? '' : esc(e.title.split(' ').slice(0, 2).join(' '));
      return `<div class="ev ${cls}" style="top:${top}px;height:${h}px">${label}</div>`;
    }).join('');
    return `<div class="wk-col ${on ? 'today' : ''}">${blocks}</div>`;
  }).join('');
  // open evenings: weekdays with no event starting >= 17:00 that I'm in
  const mineEve = new Set(events.filter((e) => !e.busy && new Date(e.startTime).getHours() >= 17).map((e) => startOfDay(e.startTime).getTime()));
  const open = days.filter((d) => !mineEve.has(startOfDay(d).getTime())).length;
  const times = [['8 AM', 0], ['12 PM', 116], ['4 PM', 232], ['8 PM', 348], ['12 AM', 462]];
  return `<div class="cal-h"><div class="mo">${ws.toLocaleDateString('en-US', { month: 'long' })} <span>${ws.getFullYear()}</span></div><div class="note">${open} open<br>evening${open === 1 ? '' : 's'}</div></div>
    <div class="wk-days">${headDays}</div>
    <div class="wk-grid">
      <div class="wk-times">${times.map(([t, y]) => `<span style="top:${y}px">${t}</span>`).join('')}</div>
      ${[116, 232, 348].map((y) => `<div class="wk-line" style="top:${y}px"></div>`).join('')}
      <div class="wk-cols">${cols}</div>
    </div>`;
}

/* ---------- month ---------- */
async function renderMonth() {
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1); const next = new Date(y, m + 1, 1);
  const { events } = await api(`/api/calendar?start=${first.toISOString()}&end=${next.toISOString()}`);
  if (!state.selDay) state.selDay = startOfDay(new Date()).toISOString();
  const byDay = {};
  for (const e of events) { const k = startOfDay(e.startTime).getTime(); (byDay[k] = byDay[k] || []).push(e); }
  const gridStart = new Date(first); gridStart.setDate(1 - first.getDay());
  const today = startOfDay(new Date()).getTime();
  const sel = startOfDay(state.selDay).getTime();
  let rows = '';
  for (let w = 0; w < 6; w++) {
    let cells = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(gridStart); d.setDate(gridStart.getDate() + w * 7 + i);
      const k = startOfDay(d).getTime(); const inM = d.getMonth() === m;
      const evs = inM ? (byDay[k] || []) : [];
      const types = [...new Set(evs.map((e) => (e.busy ? 'busy' : e.type)))].slice(0, 3);
      const hot = evs.some((e) => (e.proof && e.proof.count >= 3));
      const cls = [inM ? '' : 'out', k === today ? 'today' : '', k === sel ? 'sel' : '', hot ? 'hot' : ''].join(' ').trim();
      cells += `<button class="cell ${cls}" onclick="selectDay('${d.toISOString()}')"><span class="n">${d.getDate()}</span><div class="dots">${types.map((t) => `<span class="dot ${t}"></span>`).join('')}</div></button>`;
    }
    rows += `<div class="wkrow">${cells}</div>`;
    const after = new Date(gridStart); after.setDate(gridStart.getDate() + (w + 1) * 7);
    if (after >= next) break;
  }
  const selEvs = (byDay[sel] || []).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const selD = new Date(state.selDay);
  const isToday = sel === today;
  const agenda = selEvs.length
    ? selEvs.map((e) => e.busy
      ? `<div class="ag"><span class="tm">${timeLabel(e.startTime)}</span><span class="bar busy"></span><span class="t faint">Busy</span></div>`
      : `<div class="ag"><span class="tm">${timeLabel(e.startTime)}</span><span class="bar ${e.type === 'intention' ? 'free' : e.type}"></span><span class="t">${esc(e.title)}${e.recurring ? ' ↻' : ''}<small>${esc(e.location || '')}${e.proof && e.proof.count ? ' · ' + e.proof.count + ' going' : ''}</small></span></div>`).join('')
    : `<div class="empty" style="padding:20px">Open day.</div>`;
  return `<div class="cal-h"><div class="mo">${first.toLocaleDateString('en-US', { month: 'long' })} <span>${y}</span></div></div>
    <div class="mo-wd">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<div>${d}</div>`).join('')}</div>
    ${rows}
    <div class="mo-agenda"><div class="kicker">${selD.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${isToday ? ' · Today' : ''}</div>${agenda}</div>`;
}
window.selectDay = (iso) => { state.selDay = iso; refresh(); };

/* ---------- plans ---------- */
async function renderPlans() {
  const end = new Date(); end.setDate(end.getDate() + 60);
  const { events } = await api(`/api/calendar?start=${startOfDay(new Date()).toISOString()}&end=${end.toISOString()}`);
  const mine = events.filter((e) => !e.busy && (e.creator.id === state.me.id || e.myRsvp));
  let body = mine.length ? '' : `<div class="empty">No plans yet.<br>Tap ＋ to make one — or set an intention like “free for lunch”.</div>`;
  let last = '';
  for (const ev of mine) {
    const dl = dayLabel(ev.startTime); if (dl !== last) { body += `<div class="daylabel">${dl}</div>`; last = dl; }
    const [pc, pl] = PILL[ev.type] || PILL.event;
    const role = ev.creator.id === state.me.id ? 'Hosting' : (ev.myRsvp === 'going' ? "You're in" : ev.myRsvp);
    body += `<div class="card"><div class="row between"><span class="pill ${pc}">${I[pc] || I.event} ${pl}${ev.recurring ? ' ·↻' : ''}</span><span class="meta">${timeLabel(ev.startTime)}</span></div>
      <div class="ev-title">${esc(ev.title)}</div>
      <div class="meta">${esc(ev.location || '')}${ev.attendeeCount ? '<span class="dot"></span>' + ev.attendeeCount + ' in' : ''}</div>
      <div class="row between" style="margin-top:10px"><span class="btn sm in">${role}</span>${ev.creator.id === state.me.id ? `<button class="btn sm" onclick="del('${ev.id}')">Cancel</button>` : ''}</div></div>`;
  }
  return `<div class="topbar"><div><div class="kicker">Plans</div><div class="h-title">What you're in</div></div><button class="btn sm" onclick="openCreate()">＋ New</button></div>${body}`;
}
window.del = async (id) => { if (confirm('Cancel this plan?')) { await api(`/api/events/${id}`, { method: 'DELETE' }); refresh(); } };

/* ---------- regulars ---------- */
async function renderRegulars() {
  const { regulars, rising } = await api('/api/regulars');
  const head = `<div class="topbar"><div><div class="kicker">Regulars</div><div class="h-title">Familiar faces</div></div></div>
    <div style="margin:12px 2px 0"><span class="priv">${I.inner} Only you can see this</span></div>`;
  if (!regulars.length && !rising.length) return head + `<div class="empty">No regulars yet.<br>The more you show up, the more the people you keep seeing surface here.</div>`;
  const top = regulars[0];
  const insight = top ? `<div class="insight"><p>You &amp; <b>${esc(top.user.displayName.split(' ')[0])}</b> have overlapped <b>${top.count}×</b> — make it a ritual?</p><button class="btn solid block" onclick="makeStanding('${esc(top.user.displayName.split(' ')[0])}')">${I.standing} Suggest a standing plan</button></div>` : '';
  const row = (r, rising) => `<div class="reg">${avatar(r.user, 'lg')}<div class="info"><div class="nm">${esc(r.user.displayName)} ${rising ? '<span class="trend">↑ trending</span>' : `<span class="ct">${r.count}× this month</span>`}</div><div class="sub">${r.contexts.length ? 'usually ' + r.contexts.map(esc).join(' + ') : 'seen recently'}${r.last ? ' · last ' + relTime(r.last) : ''}</div></div><button class="btn sm" onclick="makeStanding('${esc(r.user.displayName.split(' ')[0])}')">${rising ? 'Say hi' : 'Standing plan'}</button></div>`;
  return head + insight + regulars.map((r) => row(r, false)).join('') +
    (rising.length ? `<div class="sub-h">Becoming regulars</div>` + rising.map((r) => row(r, true)).join('') : '') +
    `<div class="footnote">Private to you. Counts &amp; faces — never a behavioral dossier.</div>`;
}
function relTime(iso) {
  const days = Math.round((Date.now() - new Date(iso)) / 864e5);
  if (days <= 0) return 'today'; if (days === 1) return 'yesterday'; if (days < 14) return days + 'd ago'; return Math.round(days / 7) + 'w ago';
}
window.makeStanding = (name) => openCreate({ type: 'plan', recurring: 'weekly', title: name ? `Standing plan with ${name}` : 'Standing plan' });

/* ---------- profile ---------- */
async function renderProfile() {
  const p = await api('/api/profile/' + state.me.handle);
  const u = p.user;
  const chips = (u.scenes || []).map((s) => `<span class="chip">${esc(s)}</span>`).join('');
  const upcoming = p.upcoming.length ? p.upcoming.map((e) => {
    const d = new Date(e.startTime); const [vc, vl] = VIS[e.visibility] || VIS.inner;
    return `<div class="up"><div class="when"><b>${d.getDate()}</b><span>${d.toLocaleDateString('en-US', { weekday: 'short' })}</span></div>
      <div class="body"><div class="t">${esc(e.title)}${e.recurring ? ' <span style="color:var(--violet)">↻</span>' : ''}</div><div class="s">${timeLabel(e.startTime)}${e.location ? ' · ' + esc(e.location) : ''}</div></div>
      <span class="vis">${I[vc]} ${vl}</span></div>`;
  }).join('') : `<div class="empty" style="padding:24px">Nothing upcoming yet.</div>`;
  const s = p.stats || {};
  const link = location.origin + '/u/' + u.handle;
  return `<div class="banner"></div>
    <div class="pf-head">
      ${avatar(u, 'xl pf-av')}
      <div class="pf-name">${esc(u.displayName)}</div>
      <div class="pf-handle">@${esc(u.handle)}</div>
      ${u.bio ? `<div class="pf-bio">${esc(u.bio)}</div>` : ''}
      ${chips ? `<div class="chips" style="margin-top:13px">${chips}</div>` : ''}
      <div class="linkrow"><div class="linkbox">${I.link} ${esc(link.replace(/^https?:\/\//, ''))}</div><button class="btn solid" onclick="copyLink('${esc(link)}')">Share</button></div>
      <div class="row" style="gap:10px;margin-top:10px"><button class="btn sm" onclick="openEdit()">Edit profile</button><button class="btn sm" onclick="go('circles')">Circles</button><button class="btn sm" onclick="logout()" style="margin-left:auto">Log out</button></div>
      <div class="kicker" style="margin:22px 0 6px">What I'm going to</div>
      ${upcoming}
      <div class="statline"><div><b>${s.regulars || 0}</b><span>regulars</span></div><div><b>${s.plans || 0}</b><span>plans</span></div><div><b>${s.scenes || 0}</b><span>scenes</span></div></div>
    </div>`;
}
window.copyLink = (l) => { navigator.clipboard?.writeText(l); toast('Link copied'); };
window.openEdit = () => {
  const u = state.me;
  sheet(`<h3>Edit profile</h3>
    <div class="field"><label>Display name</label><input id="e-dn" type="text" value="${esc(u.displayName)}"></div>
    <div class="field"><label>Bio</label><textarea id="e-bio">${esc(u.bio || '')}</textarea></div>
    <div class="field"><label>Scenes (comma separated)</label><input id="e-sc" type="text" value="${esc((u.scenes || []).join(', '))}"></div>
    <label class="row" style="gap:9px;margin:4px 0 16px"><input type="checkbox" id="e-ghost" ${u.ghost ? 'checked' : ''} style="width:auto"> <span class="muted">Ghost mode — hide my profile</span></label>
    <button class="btn solid block" onclick="saveProfile()">Save</button>`);
};
window.saveProfile = async () => {
  const scenes = val('e-sc').split(',').map((x) => x.trim()).filter(Boolean);
  state.me = await api('/api/me', { method: 'PUT', body: JSON.stringify({ displayName: val('e-dn'), bio: val('e-bio'), scenes, ghost: document.getElementById('e-ghost').checked }) });
  closeSheet(); refresh();
};

/* ---------- circles ---------- */
async function renderCircles() {
  const [c, users] = await Promise.all([api('/api/circles'), api('/api/users')]);
  const reqs = c.requests.length ? `<div class="sub-h">Requests</div>` + c.requests.map((r) => `<div class="reg">${avatar(r.user, 'lg')}<div class="info"><div class="nm">${esc(r.user.displayName)}</div><div class="sub">wants to connect</div></div><button class="btn sm in" onclick="accept('${r.id}')">Accept</button></div>`).join('') : '';
  const tierRow = (x) => `<div class="reg">${avatar(x.user, 'lg')}<div class="info"><div class="nm">${esc(x.user.displayName)}</div><div class="sub">@${esc(x.user.handle)}</div></div>
    <div class="seg" style="margin:0;width:150px">${['inner', 'orbit'].map((t) => `<button class="${x.tier === t ? 'on' : ''}" onclick="setTier('${x.user.id}','${t}')">${t === 'inner' ? 'Inner' : 'Orbit'}</button>`).join('')}</div></div>`;
  const inner = c.inner.map(tierRow).join(''); const orbit = c.orbit.map(tierRow).join('');
  const addable = users.filter((u) => u.status === 'none');
  const pending = users.filter((u) => u.status === 'pending_out');
  const add = addable.length ? `<div class="sub-h">Add people</div>` + addable.map((u) => `<div class="reg">${avatar(u, 'lg')}<div class="info"><div class="nm">${esc(u.displayName)}</div><div class="sub">@${esc(u.handle)}</div></div><button class="btn sm" onclick="addPerson('${u.id}')">Add</button></div>`).join('') : '';
  const pend = pending.length ? `<div class="sub-h">Requested</div>` + pending.map((u) => `<div class="reg">${avatar(u, 'lg')}<div class="info"><div class="nm">${esc(u.displayName)}</div><div class="sub">request sent</div></div><span class="btn sm" style="opacity:.6">Pending</span></div>`).join('') : '';
  return `<div class="topbar"><div><div class="kicker">People</div><div class="h-title">Your circles</div></div><button class="btn sm" onclick="go('you')">Done</button></div>
    <p class="muted" style="font-size:13px;margin:12px 2px 0">Inner Circle sees what you're doing; Orbit sees when you're free.</p>
    ${reqs}
    ${inner ? `<div class="sub-h">Inner circle</div>${inner}` : ''}
    ${orbit ? `<div class="sub-h">Orbit</div>${orbit}` : ''}
    ${add}${pend}`;
}
window.accept = async (id) => { await api(`/api/connections/${id}/accept`, { method: 'POST' }); refresh(); };
window.setTier = async (otherId, tier) => { await api('/api/placements', { method: 'PUT', body: JSON.stringify({ otherId, tier }) }); refresh(); };
window.addPerson = async (id) => { await api('/api/connections', { method: 'POST', body: JSON.stringify({ toId: id }) }); refresh(); };

/* ---------- create sheet ---------- */
function defaultStart() { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d.toISOString().slice(0, 16); }
window.openCreate = (pre = {}) => {
  const types = [['intention', 'Free / intention'], ['plan', 'Plan'], ['event', 'Event']];
  const vis = [['inner', 'Inner'], ['orbit', 'Orbit'], ['public', 'Public']];
  sheet(`<h3>Make something</h3>
    <div class="field"><label>Type</label><div class="chips" id="c-type">${types.map(([v, l]) => `<span class="chip pick ${(pre.type || 'event') === v ? 'on' : ''}" data-v="${v}" onclick="pickType('${v}')">${l}</span>`).join('')}</div></div>
    <div class="field"><label>Title</label><input id="c-title" type="text" value="${esc(pre.title || '')}" placeholder="Natural wine night"></div>
    <div class="field"><label>Where</label><input id="c-loc" type="text" placeholder="Ruffian, East Village"></div>
    <div class="row" style="gap:10px"><div class="field" style="flex:1"><label>Start</label><input id="c-start" type="datetime-local" value="${defaultStart()}"></div><div class="field" style="flex:1"><label>End</label><input id="c-end" type="datetime-local"></div></div>
    <label class="row" style="gap:9px;margin:0 0 14px"><input type="checkbox" id="c-rec" ${pre.recurring ? 'checked' : ''} style="width:auto"> <span class="muted">Repeats weekly (standing)</span></label>
    <div class="field"><label>Who can see it</label><div class="chips" id="c-vis">${vis.map(([v, l]) => `<span class="chip pick ${v === 'inner' ? 'on' : ''}" data-v="${v}" onclick="pickVis('${v}')">${l}</span>`).join('')}</div></div>
    <button class="btn solid block" onclick="submitCreate()">Add to my calendar</button>`);
  window._ctype = pre.type || 'event'; window._cvis = 'inner';
};
window.pickType = (v) => { window._ctype = v; document.querySelectorAll('#c-type .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === v)); };
window.pickVis = (v) => { window._cvis = v; document.querySelectorAll('#c-vis .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === v)); };
window.submitCreate = async () => {
  const title = val('c-title'); if (!title) return toast('Add a title');
  const body = {
    type: window._ctype, title, location: val('c-loc'),
    startTime: val('c-start'), endTime: val('c-end') || null,
    recurring: document.getElementById('c-rec').checked ? 'weekly' : null,
    visibility: window._cvis,
    expiresAt: window._ctype === 'intention' ? (() => { const d = new Date(val('c-start')); d.setHours(23, 59, 0, 0); return d.toISOString(); })() : null,
  };
  await api('/api/events', { method: 'POST', body: JSON.stringify(body) });
  closeSheet(); state.tab = 'plans'; refresh(); toast('Added');
};

/* ---------- sheet + toast ---------- */
function sheet(inner) {
  const s = document.createElement('div'); s.className = 'scrim'; s.id = 'scrim';
  s.onclick = (e) => { if (e.target === s) closeSheet(); };
  s.innerHTML = `<div class="sheet"><div class="grab"></div>${inner}</div>`;
  document.body.appendChild(s);
}
window.closeSheet = () => { const s = document.getElementById('scrim'); if (s) s.remove(); };
function toast(msg) {
  const t = document.createElement('div'); t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:96px;left:50%;transform:translateX(-50%);background:#1c1a24;border:1px solid var(--bd);color:var(--ink);padding:10px 18px;border-radius:999px;z-index:80;font-size:13px;font-weight:600';
  document.body.appendChild(t); setTimeout(() => t.remove(), 1600);
}

/* ---------- boot ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
refresh();
