/* Talkography app: wiring, the live map, Setup and Discuss. Report and Library markup lives in pages.js. */
import { W, H, MIN_SEATS, MAX_SEATS, NAMES, store, save, savePrefs, saveGroups, now, uid, clamp, esc, fmt, plural, clone, tokenWidth,
  types, activeTypes, typeLabel, makeSeats, layout, freshSession, switchTo, loadSession, deleteSession, deleteGroup, exportAll, importAll, wipeAll, groupById } from './core.js';
import { computeStats, topicSlices } from './stats.js';
import { drawReport, drawTrend, disposeCharts, resizeCharts } from './charts.js';
import { mapSVG, reportHTML, libraryHTML, presentHTML, trendFor } from './pages.js';

const $ = (id) => document.getElementById(id);
const S = () => store.cur;
let tab = S().turns.length ? 'discuss' : 'setup';
let sideView = 'live', libFilter = 'all', presentAnon = false;
const DRAG_PX = 12;

/* ---------- Small UI helpers ---------- */
let toastTimer;
function flash(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function fileBase() { const t = (S().title || 'discussion').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'discussion'; return 'talkography-' + t + '-' + S().date.slice(0, 10); }
const stats = () => computeStats(S(), now());
const lastTurn = () => S().turns[S().turns.length - 1];
const nameOf = (i) => (S().seats[i] && S().seats[i].name) || 'Person ' + (i + 1);
const hasMe = () => S().seats.some((s) => s.me);
const studentCount = () => S().seats.filter((s) => !s.me).length;

/* A dialog. buttons: [{label, kind, value}] ; onClose(value, dialogEl) is called with the chosen value. */
function dialog(html, buttons, onClose) {
  const o = document.createElement('div'); o.className = 'modal';
  o.innerHTML = '<div class="dialog" role="dialog" aria-modal="true">' + html + '<div class="actions">' + buttons.map((b) => '<button class="btn ' + (b.kind || '') + '" data-v="' + esc(b.value) + '">' + esc(b.label) + '</button>').join('') + '</div></div>';
  const close = (v) => { const el = o.querySelector('.dialog'); document.removeEventListener('keydown', key); const keep = onClose && v != null ? onClose(v, el) : undefined; if (keep !== false) o.remove(); else document.addEventListener('keydown', key); };
  function key(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', key); o.remove(); } }
  o.addEventListener('click', (e) => { const b = e.target.closest('.actions [data-v]'); if (e.target === o) { document.removeEventListener('keydown', key); o.remove(); } else if (b) close(b.dataset.v); });
  document.addEventListener('keydown', key);
  document.body.appendChild(o);
  const first = o.querySelector('input,select,textarea') || o.querySelector('.actions .primary') || o.querySelector('.actions button');
  if (first) first.focus();
  return o;
}
function confirmDialog(title, body, ok, fn, danger) {
  dialog('<h3>' + esc(title) + '</h3><p>' + esc(body) + '</p>', [{ label: 'Cancel', value: 'no' }, { label: ok, value: 'ok', kind: danger ? 'danger' : 'primary' }], (v) => { if (v === 'ok') fn(); });
}
function promptDialog(title, label, value, ok, fn, max) {
  const o = dialog('<h3>' + esc(title) + '</h3><div class="label">' + esc(label) + '</div><input class="field" id="dlgIn" maxlength="' + (max || 40) + '" value="' + esc(value || '') + '" autocomplete="off">',
    [{ label: 'Cancel', value: 'no' }, { label: ok, value: 'ok', kind: 'primary' }], (v, el) => { if (v === 'ok') fn(el.querySelector('#dlgIn').value.trim()); });
  o.querySelector('#dlgIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = e.target.value.trim(); o.remove(); fn(v); } });
}

/* ---------- The clock ---------- */
function start() { const c = S(); if (!c.runStart) { c.runStart = Date.now(); renderHeader(); } }
function pause() { const c = S(); if (c.runStart) { c.elapsed = now(); c.runStart = null; save(); renderHeader(); } }

/* ---------- Recording ---------- */
function logTurn(i) {
  const c = S(), last = lastTurn();
  if (last && last.seat === i) { flash(nameOf(i) + ' is already the latest speaker'); return; }
  if (!c.turns.length) c.date = new Date().toISOString();
  start();
  c.turns.push({ seat: i, t: now(), type: 'S' });
  save(); render();
}
function setType(k) { const l = lastTurn(); if (!l) return; l.type = k; save(); render(); }
function toggleStar() { const l = lastTurn(); if (!l) return; if (l.star) delete l.star; else l.star = true; save(); render(); }
function undo() { const t = S().turns.pop(); if (t) { flash('Removed ' + nameOf(t.seat)); save(); render(); } }
function addTopic() {
  promptDialog('New topic', 'Name it, or leave blank', '', 'Add topic', (label) => {
    start(); S().markers.push({ t: now(), label: label.slice(0, 40) }); S().markers.sort((a, b) => a.t - b.t);
    save(); render(); flash('Topic marked at ' + fmt(now()));
  });
}

function editTurn(k) {
  const c = S(), t = c.turns[k]; if (!t) return;
  let type = t.type, star = !!t.star;
  const typeBtns = () => types().filter((x) => x.on || x.k === type).map((x) => '<button type="button" data-ty="' + x.k + '" class="' + (x.k === type ? 'on' : '') + '" style="border-color:var(--' + x.k + ')' + (x.k === type ? ';background:var(--' + x.k + ')' : '') + '"><span class="k">' + x.k + '</span>' + esc(x.label) + '</button>').join('');
  const o = dialog('<h3>Contribution at ' + fmt(t.t) + '</h3>'
    + '<div class="label">Who spoke</div><select class="field" id="edSeat">' + c.seats.map((s, i) => '<option value="' + i + '"' + (i === t.seat ? ' selected' : '') + '>' + esc(nameOf(i)) + '</option>').join('') + '</select>'
    + '<div class="label">Kind of contribution</div><div class="types" id="edTypes" style="grid-auto-flow:row;grid-template-columns:repeat(3,1fr)">' + typeBtns() + '</div>'
    + '<div class="label">Standout</div><button type="button" class="star' + (star ? ' on' : '') + '" id="edStar" aria-pressed="' + star + '">★</button>'
    + '<div class="label">Note (optional)</div><input class="field" id="edNote" maxlength="140" value="' + esc(t.note || '') + '" placeholder="What made it stand out?" autocomplete="off">',
  [{ label: 'Delete', value: 'del', kind: 'danger left' }, { label: 'Cancel', value: 'no' }, { label: 'Save', value: 'ok', kind: 'primary' }], (v, el) => {
    if (v === 'del') { c.turns.splice(k, 1); flash('Contribution deleted'); }
    else if (v === 'ok') {
      t.seat = +el.querySelector('#edSeat').value; t.type = type;
      if (star) t.star = true; else delete t.star;
      const note = el.querySelector('#edNote').value.trim().slice(0, 140);
      if (note) t.note = note; else delete t.note;
    } else return;
    save(); render();
  });
  o.querySelector('#edTypes').addEventListener('click', (e) => { const b = e.target.closest('[data-ty]'); if (!b) return; type = b.dataset.ty; o.querySelector('#edTypes').innerHTML = typeBtns(); });
  o.querySelector('#edStar').addEventListener('click', (e) => { star = !star; e.currentTarget.classList.toggle('on', star); e.currentTarget.setAttribute('aria-pressed', star); });
}
function editMarker(i) {
  const m = S().markers[i]; if (!m) return;
  dialog('<h3>Topic at ' + fmt(m.t) + '</h3><div class="label">Name</div><input class="field" id="mkIn" maxlength="40" value="' + esc(m.label) + '" autocomplete="off">',
    [{ label: 'Delete', value: 'del', kind: 'danger left' }, { label: 'Cancel', value: 'no' }, { label: 'Save', value: 'ok', kind: 'primary' }], (v, el) => {
      if (v === 'del') S().markers.splice(i, 1); else if (v === 'ok') m.label = el.querySelector('#mkIn').value.trim().slice(0, 40); else return;
      save(); render();
    });
}

/* ---------- Header ---------- */
function renderClock() {
  $('clock').textContent = fmt(now());
  const p = $('plan'), planned = S().planned * 60000;
  if (!planned) { p.textContent = ''; p.className = ''; return; }
  const left = planned - now();
  p.textContent = left >= 0 ? fmt(left) + ' left' : fmt(-left) + ' over';
  p.className = left < 0 ? 'over' : '';
}
function renderHeader() {
  Array.prototype.forEach.call($('tabs').children, (b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'); });
  const rb = $('runBtn'), c = S();
  rb.textContent = c.runStart ? 'Pause' : (c.elapsed ? 'Resume' : 'Start');
  rb.className = 'btn' + (c.runStart ? '' : ' primary');
  const wide = tab === 'report' || tab === 'library';
  $('main').classList.toggle('wide', wide);
  $('main').classList.toggle('nostats', tab === 'discuss' && !!store.prefs.hideSide);
  applySplit();
  renderClock();
}

/* ---------- Map and type bar ---------- */
function renderRoom() {
  if (tab === 'report' || tab === 'library') return;
  $('room').innerHTML = mapSVG(S(), stats(), { data: tab !== 'setup', live: tab === 'discuss' });
}
function typeButtons(current) {
  return activeTypes().map((t) => {
    const on = current === t.k;
    return '<button data-type="' + t.k + '" class="' + (on ? 'on' : '') + '" style="border-color:var(--' + t.k + ')' + (on ? ';background:var(--' + t.k + ')' : '') + '"><span class="k">' + t.k + '</span>' + esc(t.label) + '</button>';
  }).join('');
}
function renderChooser() {
  const ch = $('chooser'), last = lastTurn();
  ch.classList.toggle('show', tab === 'discuss');
  ch.classList.toggle('idle', !last);
  ch.innerHTML = '<div class="who">' + (last ? 'Latest<b>' + esc(nameOf(last.seat)) + '</b>' : 'Tap whoever<b>speaks first</b>') + '</div><div class="types">' + typeButtons(last ? last.type : '') + '</div>'
    + '<button class="star' + (last && last.star ? ' on' : '') + '" id="starBtn" aria-label="Mark as a standout contribution" aria-pressed="' + !!(last && last.star) + '">★</button>';
}

/* ---------- Setup ---------- */
function setupHTML() {
  const c = S(), locked = c.turns.length > 0, kind = store.prefs.layout || 'circle';
  let h = '<h2>Discussion</h2><input class="field" id="title" placeholder="Title or text (optional)" maxlength="60" value="' + esc(c.title) + '">';
  h += '<div class="row" style="margin-top:8px"><label class="hint" for="planned" style="margin:0">Planned length</label><input class="field" id="planned" type="number" min="0" max="180" inputmode="numeric" style="width:84px" value="' + (c.planned || '') + '" placeholder="none"><span class="hint" style="margin:0">minutes</span></div>';

  h += '<h2>Group</h2><select class="field" id="group"' + (locked ? ' disabled' : '') + '><option value="">One-off (no group)</option>' + store.groups.map((g) => '<option value="' + esc(g.id) + '"' + (c.groupId === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('') + '</select>';
  h += '<div class="row" style="margin-top:8px">' + (c.groupId ? '<span class="hint" style="margin:0">Names and seats are saved with this group.</span>' : '<button class="btn small" id="saveGroup">Save as a group</button><span class="hint" style="margin:0">to reuse these names and compare discussions over time.</span>') + '</div>';

  h += '<h2>People</h2><div class="row"><div class="stepper"><button class="btn" id="minus" aria-label="One fewer"' + (locked ? ' disabled' : '') + '>&minus;</button><span>' + studentCount() + '</span><button class="btn" id="plus" aria-label="One more"' + (locked ? ' disabled' : '') + '>+</button></div>'
    + '<label class="check"><input type="checkbox" id="withMe"' + (hasMe() ? ' checked' : '') + (locked ? ' disabled' : '') + '>Include me (the teacher) as a seat</label></div>';
  if (locked) h += '<p class="hint">The number of people is fixed once a discussion has contributions. Start a new discussion to change it.</p>';
  h += '<div class="seg" style="margin-top:10px" id="layouts">' + [['circle', 'Circle'], ['horseshoe', 'Horseshoe'], ['rows', 'Two rows']].map((x) => '<button data-layout="' + x[0] + '" class="' + (kind === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>';
  h += '<p class="hint">Pick a layout, then drag names on the map to match where people are sitting. Tap a name on the map to edit it here.</p>';
  h += '<div class="names">';
  c.seats.forEach((s, i) => { h += '<span class="num">' + (s.me ? 'T' : (i + 1)) + '</span><input class="field" data-name="' + i + '" value="' + esc(s.name) + '" maxlength="20" autocomplete="off" autocapitalize="words" spellcheck="false">'; });
  h += '</div>';

  h += '<h2>Contribution types</h2><p class="hint">Rename them or switch some off to match your own coding. Every contribution counts as the first type unless you choose another.</p><div class="typelist">';
  types().forEach((t) => { h += '<span class="k" style="background:var(--' + t.k + ')">' + t.k + '</span><input class="field" data-typelabel="' + t.k + '" value="' + esc(t.label) + '" maxlength="18" autocomplete="off">'
    + '<label class="check"><input type="checkbox" data-typeon="' + t.k + '"' + (t.on ? ' checked' : '') + (t.k === 'S' ? ' disabled' : '') + ' aria-label="Use ' + esc(t.label) + '"></label>'; });
  h += '</div>';
  h += '<h2>Ready?</h2><button class="btn primary" id="go">Go to discussion</button>';
  return h;
}

/* ---------- Discuss: live figures and the log ---------- */
function liveHTML() {
  const c = S(), st = stats(), T = c.turns, cur = now(), last = lastTurn(), studs = st.students, n = studs.length;
  if (!T.length) return '<h2>Live</h2><p class="hint">Tap whoever speaks first; the clock starts then. Each tap draws a line from the previous speaker. Use the bar under the map to say what kind of contribution it was, and the star to mark a standout. You can drag a name if someone moves seat.</p><div class="row"><button class="btn" id="topic">New topic</button></div>';
  const on = (k) => activeTypes().some((t) => t.k === k);
  const win = Math.min(5 * 60000, cur), recent = T.filter((t) => t.t > cur - 5 * 60000).length;
  let h = '<div class="mini">';
  h += '<div class="kpi"><b>' + T.length + '</b><span>contributions</span></div>';
  h += '<div class="kpi"><b>' + st.heard + ' / ' + n + '</b><span>voices heard</span></div>';
  h += '<div class="kpi"><b>' + (st.balance === null ? '-' : st.balance + '%') + '</b><span>balance</span></div>';
  h += st.me ? '<div class="kpi"><b>' + Math.round(100 * st.studentTurns / st.total) + '%</b><span>student talk</span></div>'
             : '<div class="kpi"><b>' + (win >= 60000 ? (recent / (win / 60000)).toFixed(1) : '-') + '</b><span>per minute, last 5 min</span></div>';
  h += '</div>';

  const alerts = [], tail = T.slice(-6), set = {};
  tail.forEach((t) => { set[t.seat] = 1; });
  const two = Object.keys(set);
  if (tail.length === 6 && two.length === 2) alerts.push('Back-and-forth between <b>' + esc(nameOf(+two[0])) + '</b> and <b>' + esc(nameOf(+two[1])) + '</b> for the last 6 turns.');
  const last10 = T.slice(-10), cnt = {};
  last10.forEach((t) => { cnt[t.seat] = (cnt[t.seat] || 0) + 1; });
  const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  if (last10.length >= 8 && c.seats.length >= 4 && cnt[top] >= 4) alerts.push(c.seats[+top].me ? 'You have made ' + cnt[top] + ' of the last ' + last10.length + ' contributions.' : '<b>' + esc(nameOf(+top)) + '</b> made ' + cnt[top] + ' of the last ' + last10.length + ' contributions.');
  const since = (k) => { for (let j = T.length - 1; j >= 0; j--) if (T[j].type === k) return T.length - 1 - j; return -1; };
  if (T.length >= 12 && on('Q')) { const q = since('Q'); if (q < 0) alerts.push('No ' + esc(typeLabel('Q').toLowerCase()) + 's recorded yet.'); else if (q >= 12) alerts.push('No ' + esc(typeLabel('Q').toLowerCase()) + 's in the last ' + q + ' contributions.'); }
  if (T.length >= 12 && on('T')) { const x = since('T'); if (x < 0) alerts.push('No ' + esc(typeLabel('T').toLowerCase()) + 's yet.'); else if (x >= 12) alerts.push('No ' + esc(typeLabel('T').toLowerCase()) + 's in the last ' + x + ' contributions.'); }
  if (c.planned && cur > c.planned * 60000) alerts.push('Past the planned ' + c.planned + ' minutes.');
  if (alerts.length) h += '<div class="alerts">' + alerts.map((x) => '<div class="alert">' + x + '</div>').join('') + '</div>';

  const silent = studs.filter((p) => !p.turns);
  h += silent.length ? '<h2>Not yet heard (' + silent.length + ')</h2><div class="chips">' + silent.map((p) => '<span class="chip quiet">' + esc(p.name) + '</span>').join('') + '</div>' : '<div class="alert good">Everyone has spoken.</div>';

  const even = n ? st.studentTurns / n : 0, scale = Math.max(even * 1.5, 1, ...st.per.map((p) => p.turns));
  h += '<h2>Participation</h2><div class="plist">';
  st.per.slice().sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0) || b.turns - a.turns || a.i - b.i).forEach((p) => {
    const segs = types().map((t) => (p.types[t.k] ? '<i style="width:' + (100 * p.types[t.k] / scale) + '%;background:var(--' + t.k + ')"></i>' : '')).join('');
    const ago = p.last === null ? 'not yet' : fmt(cur - p.last), stale = p.last !== null && cur - p.last > 5 * 60000;
    h += '<div class="prow' + (last && last.seat === p.i ? ' cur' : '') + (p.me ? ' me' : '') + '"><span class="nm">' + esc(p.name) + '</span><span class="pbar">' + segs + (p.me ? '' : '<em style="left:' + (100 * even / scale) + '%"></em>') + '</span><span class="ct">' + p.turns + '</span><span class="ago' + (stale ? ' stale' : '') + '">' + ago + '</span></div>';
  });
  h += '</div><p class="hint">Bars are contributions by type; the thin line is an even share. The right-hand column is time since each person last spoke.</p>';

  h += '<h2>Contribution types</h2><div class="chips">' + types().filter((t) => t.on || st.typeTotal(t.k)).map((t) => '<span class="chip"><i style="background:var(--' + t.k + ')"></i>' + esc(t.label) + ' <b>' + st.typeTotal(t.k) + '</b></span>').join('') + '</div>';
  h += '<div class="row" style="margin-top:14px"><button class="btn" id="topic">New topic</button><button class="btn" id="undo">Undo last</button></div>';
  return h;
}
function logHTML() {
  const c = S();
  const items = c.turns.map((t, k) => ({ t: t.t, turn: t, k })).concat(c.markers.map((m, i) => ({ t: m.t, marker: m, i }))).sort((a, b) => b.t - a.t || (a.marker ? 1 : -1));
  if (!items.length) return '<p class="hint">Nothing logged yet.</p>';
  let h = '<p class="hint">Tap any line to change who spoke, the type, a star or a note, or to delete it.</p><ol class="log">';
  items.forEach((x) => {
    if (x.marker) h += '<li class="marker"><button data-marker="' + x.i + '"><span class="tm">' + fmt(x.t) + '</span><span>Topic: ' + esc(x.marker.label || 'untitled') + '</span></button></li>';
    else h += '<li><button data-edit="' + x.k + '"><span class="tm">' + fmt(x.t) + '</span><span>' + esc(nameOf(x.turn.seat)) + '</span>' + (x.turn.star ? '<span class="st">★</span>' : '') + (x.turn.note ? '<span class="nt">' + esc(x.turn.note) + '</span>' : '') + '<span class="tg" style="background:var(--' + x.turn.type + ')">' + esc(typeLabel(x.turn.type)) + '</span></button></li>';
  });
  return h + '</ol>';
}
function discussHTML() {
  return '<div class="seg" id="sideSeg" style="margin-bottom:12px"><button data-side="live" class="' + (sideView === 'live' ? 'on' : '') + '">Live</button><button data-side="log" class="' + (sideView === 'log' ? 'on' : '') + '">Log (' + S().turns.length + ')</button></div>'
    + (sideView === 'log' ? logHTML() : liveHTML());
}

/* ---------- Render ---------- */
function renderSide() {
  disposeCharts();
  const side = $('side'), keep = side.scrollTop;
  if (tab === 'setup') side.innerHTML = setupHTML();
  else if (tab === 'discuss') side.innerHTML = discussHTML();
  else if (tab === 'report') { const st = stats(); side.innerHTML = reportHTML(S(), st); drawReport(S(), st, types()); }
  else { if (libFilter !== 'all' && libFilter !== 'none' && !groupById(libFilter)) libFilter = 'all'; const tr = trendFor(libFilter); side.innerHTML = libraryHTML(libFilter, tr); if (tr) drawTrend(tr, types()); }
  side.scrollTop = keep;
}
function render() { renderHeader(); renderRoom(); renderChooser(); renderSide(); }
function go(t) { tab = t; render(); $('side').scrollTop = 0; }

/* ---------- Present ---------- */
function openPresent() { const p = $('present'); p.innerHTML = presentHTML(S(), stats(), presentAnon); p.hidden = false; }

/* ---------- Discussions and groups ---------- */
function newDiscussion(groupId) {
  const old = S(), had = old.turns.length;
  const g = groupId ? groupById(groupId) : (old.groupId ? groupById(old.groupId) : null);
  const next = freshSession(g ? g.seats : old.seats, g ? g.id : null);
  next.planned = old.planned;
  switchTo(next); sideView = 'live';
  go(g || !had ? 'setup' : 'discuss');
  flash(had ? 'Saved to the Library. Ready for a new discussion.' : 'Ready for a new discussion.');
}
function openSession(id) {
  const s = loadSession(id);
  if (!s) return flash('That discussion could not be opened');
  if (s.id !== S().id) switchTo(s);
  go('report');
}
function setStudents(n) {
  const c = S();
  if (c.turns.length) return flash('Start a new discussion to change the number of people');
  if (n < MIN_SEATS || n > MAX_SEATS) return flash('Between ' + MIN_SEATS + ' and ' + MAX_SEATS + ' people');
  const studs = c.seats.filter((s) => !s.me), me = c.seats.filter((s) => s.me);
  if (n > studs.length) {
    const used = new Set(studs.map((s) => s.name));
    const name = NAMES.find((x) => !used.has(x)) || 'Person ' + n;
    studs.push({ name, x: 500, y: 330 });
    flash('Added ' + name + ' in the middle: drag them into place');
  } else studs.pop();
  c.seats = studs.concat(me); save(); render();
}
function setMe(on) {
  const c = S();
  if (c.turns.length) return;
  const studs = c.seats.filter((s) => !s.me);
  if (on) { const p = layout(store.prefs.layout || 'circle', studs.length, true)[studs.length]; studs.push({ name: 'Teacher', x: p.x, y: p.y, me: true }); }
  c.seats = studs; save(); render();
}
function applyLayout(kind) {
  const c = S(), n = studentCount(), pos = layout(kind, n, hasMe());
  c.seats.forEach((s, i) => { s.x = pos[i].x; s.y = pos[i].y; });
  store.prefs.layout = kind; savePrefs(); save(); render();
}

/* ---------- Export ---------- */
function toCSV() {
  const c = S(), st = stats(), slices = topicSlices(c, st);
  const topic = (t) => { const s = slices.filter((x) => t >= x.from).pop(); return s ? s.label : ''; };
  const rows = [['turn', 'time', 'name', 'is_teacher', 'type', 'star', 'note', 'topic', 'previous_speaker']];
  c.turns.forEach((t, k) => rows.push([k + 1, fmt(t.t), nameOf(t.seat), c.seats[t.seat].me ? 1 : 0, typeLabel(t.type), t.star ? 1 : 0, t.note || '', topic(t.t), k ? nameOf(c.turns[k - 1].seat) : '']));
  return rows.map((r) => r.map((v) => { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\n');
}
function printSlips() { document.body.classList.add('print-slips'); window.print(); }
window.addEventListener('afterprint', () => { document.body.classList.remove('print-slips'); resizeCharts(); });
window.addEventListener('beforeprint', () => resizeCharts({ width: 680 }));

/* ---------- Menu ---------- */
function openMenu() {
  const any = S().turns.length > 0;
  let h = '';
  if (tab === 'discuss') h += '<button data-m="side" role="menuitem">' + (store.prefs.hideSide ? 'Show the side panel' : 'Hide the side panel') + '<small>' + (store.prefs.hideSide ? 'hidden' : 'shown') + '</small></button><button data-m="topic" role="menuitem">New topic</button><button data-m="undo" role="menuitem"' + (any ? '' : ' disabled') + '>Undo last</button><hr>';
  h += '<button data-m="present" role="menuitem"' + (any ? '' : ' disabled') + '>Present map</button>';
  h += '<button data-m="print" role="menuitem"' + (any ? '' : ' disabled') + '>Print report</button>';
  h += '<button data-m="save" role="menuitem"' + (any ? '' : ' disabled') + '>Save this discussion as a file</button><hr>';
  h += '<button data-m="new" role="menuitem">New discussion</button>';
  $('menu').innerHTML = h; $('menu').hidden = false; $('menuBtn').setAttribute('aria-expanded', 'true');
}
function closeMenu() { $('menu').hidden = true; $('menuBtn').setAttribute('aria-expanded', 'false'); }
function saveFile() { save(); download(fileBase() + '.json', JSON.stringify(Object.assign({}, S(), { elapsed: now(), runStart: null }), null, 2), 'application/json'); }
function printReport() { go('report'); setTimeout(() => window.print(), 600); }

/* ---------- Movable divider ---------- */
let split = clamp(parseFloat(store.prefs.split) || 0.63, 0.3, 0.8);
function applySplit() {
  const m = $('main');
  m.style.gridTemplateColumns = (m.classList.contains('wide') || m.classList.contains('nostats') || window.innerWidth <= 900) ? '' : 'minmax(0,' + split + 'fr) 14px minmax(0,' + (1 - split) + 'fr)';
}
let dragSplit = false;
$('divider').addEventListener('pointerdown', (e) => { dragSplit = true; $('divider').classList.add('drag'); try { $('divider').setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } e.preventDefault(); });
$('divider').addEventListener('pointermove', (e) => { if (!dragSplit) return; const r = $('main').getBoundingClientRect(); split = clamp((e.clientX - r.left) / r.width, 0.3, 0.8); applySplit(); });
function endSplit() { if (!dragSplit) return; dragSplit = false; $('divider').classList.remove('drag'); store.prefs.split = split; savePrefs(); }
$('divider').addEventListener('pointerup', endSplit);
$('divider').addEventListener('pointercancel', endSplit);
$('divider').addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { split = clamp(split + (e.key === 'ArrowLeft' ? -0.05 : 0.05), 0.3, 0.8); applySplit(); store.prefs.split = split; savePrefs(); e.preventDefault(); } });
window.addEventListener('resize', () => { applySplit(); resizeCharts(); });

/* ---------- Map: tap to log, drag to move ---------- */
let drag = null;
function toSvg(e) { const svg = $('room'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
$('room').addEventListener('pointerdown', (e) => {
  const g = e.target.closest('[data-seat]'); if (!g) return;
  const i = +g.dataset.seat, p = toSvg(e);
  drag = { i, sx: p.x, sy: p.y, ox: S().seats[i].x, oy: S().seats[i].y, moved: false, cx: e.clientX, cy: e.clientY };
  try { $('room').setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  e.preventDefault();
});
$('room').addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < DRAG_PX) return;
  drag.moved = true;
  const p = toSvg(e), s = S().seats[drag.i], hw = tokenWidth(nameOf(drag.i)) / 2;
  s.x = Math.round(clamp(drag.ox + p.x - drag.sx, hw + 4, W - hw - 4));
  s.y = Math.round(clamp(drag.oy + p.y - drag.sy, 34, H - 54));
  renderRoom();
});
$('room').addEventListener('pointerup', () => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.moved) { save(); return; }
  if (tab === 'setup') { const inp = document.querySelector('[data-name="' + d.i + '"]'); if (inp) { inp.scrollIntoView({ block: 'center' }); inp.focus(); inp.select(); } }
  else if (tab === 'discuss') logTurn(d.i);
});
$('room').addEventListener('pointercancel', () => { if (drag && drag.moved) save(); drag = null; });

/* ---------- Events ---------- */
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
$('runBtn').addEventListener('click', () => { if (S().runStart) pause(); else { start(); if (tab === 'setup') go('discuss'); else render(); } });
$('menuBtn').addEventListener('click', (e) => { e.stopPropagation(); if ($('menu').hidden) openMenu(); else closeMenu(); });
$('menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]'); if (!b || b.disabled) return;
  const m = b.dataset.m; closeMenu();
  if (m === 'side') { store.prefs.hideSide = !store.prefs.hideSide; savePrefs(); render(); }
  else if (m === 'topic') addTopic();
  else if (m === 'undo') undo();
  else if (m === 'present') openPresent();
  else if (m === 'print') printReport();
  else if (m === 'save') saveFile();
  else if (m === 'new') newDiscussion();
});
document.addEventListener('pointerdown', (e) => { if (!$('menu').hidden && !e.target.closest('.menuwrap')) closeMenu(); });
$('chooser').addEventListener('click', (e) => {
  if (e.target.closest('#starBtn')) return toggleStar();
  const b = e.target.closest('[data-type]'); if (b) setType(b.dataset.type);
});
$('present').addEventListener('click', (e) => {
  if (e.target.id === 'presentNames') { presentAnon = !presentAnon; openPresent(); }
  else if (e.target.id === 'presentClose') $('present').hidden = true;
});

$('side').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset, id = b.id;
  if (d.side) { sideView = d.side; renderSide(); return; }
  if (d.edit) return editTurn(+d.edit);
  if (d.marker) return editMarker(+d.marker);
  if (d.layout) return applyLayout(d.layout);
  if (d.open) return openSession(d.open);
  if (d.del) { const entry = store.index.filter((x) => x.id === d.del)[0]; return confirmDialog('Delete this discussion?', '“' + ((entry && entry.title) || 'Untitled discussion') + '” will be removed from this device. This cannot be undone.', 'Delete', () => { deleteSession(d.del); render(); flash('Discussion deleted'); }, true); }
  if (d.usegroup) return newDiscussion(d.usegroup);
  if (d.rengroup) { const g = groupById(d.rengroup); return promptDialog('Rename group', 'Name', g.name, 'Save', (v) => { if (v) { g.name = v.slice(0, 40); saveGroups(); render(); } }); }
  if (d.delgroup) { const g = groupById(d.delgroup); return confirmDialog('Delete this group?', '“' + g.name + '” will be removed. Its discussions stay in the Library as one-offs.', 'Delete group', () => { deleteGroup(d.delgroup); save(); render(); }, true); }
  if (id === 'plus') setStudents(studentCount() + 1);
  else if (id === 'minus') setStudents(studentCount() - 1);
  else if (id === 'go') go('discuss');
  else if (id === 'saveGroup') promptDialog('Save as a group', 'Group name, for example “Year 12 English”', S().title, 'Save group', (v) => {
    if (!v) return; const g = { id: uid(), name: v.slice(0, 40), seats: clone(S().seats) };
    store.groups.push(g); saveGroups(); S().groupId = g.id; save(); render(); flash('Group saved');
  });
  else if (id === 'topic') addTopic();
  else if (id === 'undo') undo();
  else if (id === 'presentBtn') openPresent();
  else if (id === 'csv') download(fileBase() + '.csv', toCSV(), 'text/csv');
  else if (id === 'json') saveFile();
  else if (id === 'print') window.print();
  else if (id === 'printSlips') printSlips();
  else if (id === 'newDiscussion') newDiscussion();
  else if (id === 'backup') download('talkography-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(exportAll(), null, 2), 'application/json');
  else if (id === 'wipe') confirmDialog('Delete everything?', 'Every discussion, group and setting on this device will be deleted. This cannot be undone. Back up first if you want to keep anything.', 'Delete everything', () => { wipeAll(); libFilter = 'all'; go('setup'); flash('Everything deleted'); }, true);
});
$('side').addEventListener('input', (e) => {
  const el = e.target, c = S();
  if (el.id === 'title') { c.title = el.value.slice(0, 60); save(); renderRoom(); }
  else if (el.id === 'planned') { c.planned = clamp(parseInt(el.value, 10) || 0, 0, 180); save(); renderClock(); }
  else if (el.dataset.name !== undefined) { c.seats[+el.dataset.name].name = el.value.slice(0, 20); save(); renderRoom(); }
  else if (el.dataset.typelabel) { const t = types().filter((x) => x.k === el.dataset.typelabel)[0]; t.label = el.value.trim().slice(0, 18) || t.label; savePrefs(); renderChooser(); }
});
$('side').addEventListener('change', (e) => {
  const el = e.target, c = S();
  if (el.id === 'withMe') setMe(el.checked);
  else if (el.dataset.typeon) { types().filter((x) => x.k === el.dataset.typeon)[0].on = el.checked; savePrefs(); renderChooser(); }
  else if (el.id === 'group') {
    if (c.turns.length) return;
    const g = groupById(el.value);
    c.groupId = g ? g.id : null;
    if (g) c.seats = clone(g.seats);
    save(); render();
  }
  else if (el.id === 'libFilter') { libFilter = el.value; renderSide(); }
  else if (el.id === 'restore' && el.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try { const n = importAll(JSON.parse(r.result)); render(); flash(n ? plural(n, 'discussion') + ' added to the Library' : 'Nothing new in that file'); }
      catch (_) { flash('That file is not a Talkography backup or discussion'); }
    };
    r.readAsText(el.files[0]);
  }
});
document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || document.querySelector('.modal')) return;
  if (e.key === 'Escape') { $('present').hidden = true; closeMenu(); return; }
  if (tab !== 'discuss') return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toUpperCase();
  if (k === '*') toggleStar();
  else if (activeTypes().some((t) => t.k === k) && lastTurn()) setType(k);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
setInterval(() => { if (S().runStart) renderClock(); }, 500);
setInterval(() => { if (S().runStart) { save(); if (tab === 'discuss' && sideView === 'live' && !store.prefs.hideSide && !document.querySelector('.modal')) renderSide(); } }, 5000);

/* ---------- Offline: cache the app after the first visit ---------- */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') && !/[?&]nosw=1/.test(location.search)) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ }); });
}

render();
