/* Account-free page: a shared profile (/u/:handle) or event (/e/:id). View + nudge. */
const app = document.getElementById('app');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const avatar = (u, size = 'sm') => `<span class="av ${size}" style="background:linear-gradient(135deg,${u.avatar})">${esc(u.initials)}</span>`;
const timeLabel = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const banner = () => `<div class="banner"></div>`;
const cta = (label) => `<a class="btn solid block" style="margin-top:22px" href="/">${label}</a>
  <div class="footnote">Orbit — your social calendar is your profile.<br>See when your people are free, and actually make plans.</div>`;

function shell(inner) { app.innerHTML = `<div class="shell"><div class="main">${inner}</div></div>`; }

async function load() {
  const parts = location.pathname.split('/').filter(Boolean);
  try {
    if (parts[0] === 'u') return renderProfile(parts[1]);
    if (parts[0] === 'e') return renderEvent(parts[1]);
    location.href = '/';
  } catch (e) {
    shell(`<div class="empty">This link isn't available.<br><a style="color:var(--accent)" href="/">Go to Orbit →</a></div>`);
  }
}

async function renderProfile(handle) {
  const r = await fetch('/api/profile/' + encodeURIComponent(handle));
  if (!r.ok) throw new Error();
  const { user: u, upcoming } = await r.json();
  const chips = (u.scenes || []).map((s) => `<span class="chip">${esc(s)}</span>`).join('');
  const list = upcoming.length ? upcoming.map((e) => `<div class="up"><div class="when"><b>${new Date(e.startTime).getDate()}</b><span>${new Date(e.startTime).toLocaleDateString('en-US', { weekday: 'short' })}</span></div><div class="body"><div class="t">${esc(e.title)}</div><div class="s">${timeLabel(e.startTime)}${e.location ? ' · ' + esc(e.location) : ''}</div></div></div>`).join('') : `<div class="empty" style="padding:20px">Nothing public right now.</div>`;
  shell(`${banner()}<div class="pf-head">${avatar(u, 'xl pf-av')}
    <div class="pf-name">${esc(u.displayName)}</div><div class="pf-handle">@${esc(u.handle)}</div>
    ${u.bio ? `<div class="pf-bio">${esc(u.bio)}</div>` : ''}
    ${chips ? `<div class="chips" style="margin-top:13px">${chips}</div>` : ''}
    <div class="kicker" style="margin:22px 0 6px">Going to</div>${list}
    ${cta('Follow ' + esc(u.displayName.split(' ')[0]) + ' on Orbit')}</div>`);
}

async function renderEvent(id) {
  const r = await fetch('/api/events/' + encodeURIComponent(id));
  if (!r.ok) throw new Error();
  const e = await r.json();
  const who = (e.attendees || []).slice(0, 6).map((a) => avatar(a)).join('');
  shell(`<div class="topbar" style="margin-bottom:16px"><div class="logo" style="display:flex;align-items:center;gap:8px;font-weight:600"><span style="width:18px;height:18px;border-radius:50%;background:var(--grad);display:inline-block"></span> Orbit</div></div>
    <div class="card" style="padding:20px">
      <span class="pill ${e.type === 'intention' ? 'free' : e.type}">${e.type}</span>
      <div class="ev-title" style="font-size:24px;font-family:var(--serif);font-weight:500">${esc(e.title)}</div>
      <div class="meta" style="margin-top:6px">${timeLabel(e.startTime)}</div>
      ${e.location ? `<div class="meta" style="margin-top:4px">${esc(e.location)}</div>` : ''}
      ${e.description ? `<div class="pf-bio">${esc(e.description)}</div>` : ''}
      <div class="row" style="margin-top:16px;gap:8px">${who}<span class="muted" style="font-size:13px">${e.attendeeCount} going</span></div>
    </div>
    ${cta("I'm down — open in Orbit")}`);
}

load();
