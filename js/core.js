/* Talkography core: constants, helpers, seat layouts, and everything that touches storage.
   All data stays in this browser (localStorage). Nothing is sent anywhere. */

export const W = 1000, H = 660, MIN_SEATS = 2, MAX_SEATS = 24;

export const NAMES = ['Fox', 'Owl', 'Hare', 'Wren', 'Otter', 'Badger', 'Heron', 'Lynx', 'Robin', 'Moth', 'Stag', 'Crow',
  'Seal', 'Newt', 'Kite', 'Vole', 'Mole', 'Swan', 'Lark', 'Pike', 'Finch', 'Toad', 'Hawk', 'Wasp'];

/* Contribution types. Keys are fixed (they are stored in every session); labels can be renamed and
   types switched off in Setup to match a school's own coding scheme. */
export const TYPE_DEFAULTS = [
  { k: 'S', label: 'Statement', on: true },
  { k: 'Q', label: 'Question', on: true },
  { k: 'T', label: 'Text reference', on: true },
  { k: 'B', label: 'Builds on', on: true },
  { k: 'C', label: 'Challenges', on: true },
  { k: 'I', label: 'Interrupts', on: true }
];

/* ---------- Helpers ---------- */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function fmt(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
export const clone = (v) => JSON.parse(JSON.stringify(v));
export function tokenWidth(name) { return Math.max(96, Math.round(String(name).length * 12.5 + 48)); }

/* ---------- Seat layouts ---------- */
/* Returns n seat positions, plus one more (the teacher's) at the end when withMe is true. */
export function layout(kind, n, withMe) {
  const out = [];
  if (kind === 'rows') {
    const top = Math.ceil(n / 2), bot = n - top;
    for (let i = 0; i < top; i++) out.push({ x: Math.round(W * (i + 1) / (top + 1)), y: 170 });
    for (let j = 0; j < bot; j++) out.push({ x: Math.round(W * (bot - j) / (bot + 1)), y: 430 });
    if (withMe) out.push({ x: 500, y: 575 });
    return out;
  }
  if (kind === 'horseshoe') {
    // A U open at the top (towards the board): down the left, along the bottom, up the right.
    const pts = [[150, 110], [150, 520], [850, 520], [850, 110]];
    const seg = [410, 700, 410], total = 1520;
    for (let i = 0; i < n; i++) {
      let d = total * (i + 0.5) / n, k = 0;
      while (k < 2 && d > seg[k]) { d -= seg[k]; k++; }
      const a = pts[k], b = pts[k + 1], f = d / seg[k];
      out.push({ x: Math.round(a[0] + (b[0] - a[0]) * f), y: Math.round(a[1] + (b[1] - a[1]) * f) });
    }
    if (withMe) out.push({ x: 500, y: 90 });
    return out;
  }
  // circle (an oval, like a Harkness table)
  const m = withMe ? n + 1 : n;
  for (let i = 0; i < n; i++) {
    const a = withMe ? Math.PI / 2 + (i + 1) * 2 * Math.PI / m : -Math.PI / 2 + i * 2 * Math.PI / m;
    out.push({ x: Math.round(500 + 390 * Math.cos(a)), y: Math.round(325 + 240 * Math.sin(a)) });
  }
  if (withMe) out.push({ x: 500, y: 565 });
  return out;
}

export function makeSeats(n, withMe, kind, old) {
  old = old || [];
  const pos = layout(kind || 'circle', n, withMe);
  const keep = old.filter((s) => !s.me), oldMe = old.filter((s) => s.me)[0];
  const used = new Set(keep.slice(0, n).map((s) => s.name));
  const seats = [];
  for (let i = 0; i < n; i++) {
    let name = keep[i] && keep[i].name;
    if (!name) { name = NAMES.find((x) => !used.has(x)) || 'Person ' + (i + 1); used.add(name); }
    seats.push({ name, x: pos[i].x, y: pos[i].y });
  }
  if (withMe) seats.push({ name: (oldMe && oldMe.name) || 'Teacher', x: pos[n].x, y: pos[n].y, me: true });
  return seats;
}

/* ---------- Storage ---------- */
const P = 'talkography:v3:';
function read(k, fallback) { try { const v = JSON.parse(localStorage.getItem(P + k)); return v == null ? fallback : v; } catch (e) { return fallback; } }
function write(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function drop(k) { try { localStorage.removeItem(P + k); } catch (e) { /* ignore */ } }

function mergeTypes(saved) {
  return TYPE_DEFAULTS.map((d) => {
    const s = (saved || []).filter((x) => x && x.k === d.k)[0];
    return { k: d.k, label: (s && typeof s.label === 'string' && s.label.trim()) ? s.label.trim().slice(0, 18) : d.label, on: d.k === 'S' ? true : (s ? s.on !== false : true) };
  });
}

/* Accepts a session in the current shape, or an older export (Talkography v2, the first Harkness tracker,
   or the AI Enterprise Discussion console) and returns a clean current-shape session, or null. */
export function normalise(s) {
  if (!s || !Array.isArray(s.seats) || !Array.isArray(s.turns)) return null;
  const seats = s.seats.filter((x) => x && isFinite(x.x) && isFinite(x.y)).map((x) => {
    const seat = { name: String(x.first || x.name || '').slice(0, 20), x: clamp(+x.x, 0, W), y: clamp(+x.y, 0, H) };
    if (x.me) seat.me = true;
    return seat;
  });
  if (seats.length < 1) return null;
  const known = new Set(TYPE_DEFAULTS.map((t) => t.k));
  const turns = s.turns.filter((t) => t && t.seat >= 0 && t.seat < seats.length).map((t) => {
    let type = t.type === 'E' ? 'T' : t.type; // the console called text references "Evidence"
    if (!known.has(type)) type = 'S';
    const turn = { seat: +t.seat, t: Math.max(0, +t.t || 0), type };
    if (t.star) turn.star = true;
    if (t.note) turn.note = String(t.note).slice(0, 140);
    return turn;
  }).sort((a, b) => a.t - b.t);
  const markers = (Array.isArray(s.markers) ? s.markers : []).filter((m) => m && isFinite(m.t)).map((m) => ({ t: Math.max(0, +m.t), label: String(m.label || '').slice(0, 40) })).sort((a, b) => a.t - b.t);
  const last = turns.length ? turns[turns.length - 1].t : 0;
  return {
    id: typeof s.id === 'string' && s.id ? s.id : uid(),
    title: String(s.title || '').slice(0, 60),
    groupId: typeof s.groupId === 'string' ? s.groupId : null,
    date: typeof s.date === 'string' && !isNaN(Date.parse(s.date)) ? s.date : new Date().toISOString(),
    seats, turns, markers,
    elapsed: Math.max(+s.elapsed || 0, last),
    runStart: null,
    planned: clamp(+s.planned || 0, 0, 180)
  };
}

export function freshSession(seats, groupId) {
  return { id: uid(), title: '', groupId: groupId || null, date: new Date().toISOString(), seats: clone(seats), turns: [], markers: [], elapsed: 0, runStart: null, planned: 0 };
}

export const store = { prefs: read('prefs', {}), groups: read('groups', []), index: read('index', []), cur: null };
if (!Array.isArray(store.groups)) store.groups = [];
if (!Array.isArray(store.index)) store.index = [];
store.prefs.types = mergeTypes(store.prefs.types);
store.cur = normalise(read('s:' + store.prefs.currentId, null)) || freshSession(makeSeats(8, false, 'circle'));

export const types = () => store.prefs.types;
export const activeTypes = () => store.prefs.types.filter((t) => t.on);
export const typeLabel = (k) => { const t = store.prefs.types.filter((x) => x.k === k)[0]; return t ? t.label : k; };
export function now() { const c = store.cur; return c.elapsed + (c.runStart ? Date.now() - c.runStart : 0); }
export const students = (s) => s.seats.filter((x) => !x.me);
export const groupById = (id) => store.groups.filter((g) => g.id === id)[0] || null;

function indexEntry(s) {
  return { id: s.id, title: s.title, date: s.date, groupId: s.groupId, turns: s.turns.length, elapsed: s.elapsed, people: students(s).length };
}

/* Save the discussion in progress. Once it has a contribution it also appears in the Library. */
export function save() {
  const c = store.cur, snap = Object.assign({}, c, { elapsed: now(), runStart: null });
  write('s:' + c.id, snap);
  const at = store.index.findIndex((e) => e.id === c.id);
  if (c.turns.length || at >= 0) {
    const entry = indexEntry(snap);
    if (at >= 0) store.index[at] = entry; else store.index.push(entry);
    write('index', store.index);
  }
  // A group's saved names and seats follow the discussion only while it is being set up, so opening an
  // older discussion from the Library never overwrites the group's current roster.
  if (c.groupId && !c.turns.length) {
    const g = groupById(c.groupId);
    if (g) { g.seats = clone(c.seats); write('groups', store.groups); }
  }
  store.prefs.currentId = c.id;
  write('prefs', store.prefs);
}
export function savePrefs() { write('prefs', store.prefs); }
export function saveGroups() { write('groups', store.groups); }

export function loadSession(id) { return normalise(read('s:' + id, null)); }

/* Leave the current discussion (it stays in the Library if it has contributions) and make s current. */
export function switchTo(s) {
  const old = store.cur;
  if (old.runStart) { old.elapsed = now(); old.runStart = null; }
  save();
  if (!old.turns.length && !store.index.some((e) => e.id === old.id)) drop('s:' + old.id);
  store.cur = s;
  save();
}

export function deleteSession(id) {
  drop('s:' + id);
  store.index = store.index.filter((e) => e.id !== id);
  write('index', store.index);
  if (store.cur.id === id) { store.cur = freshSession(store.cur.seats, store.cur.groupId); save(); }
}

export function deleteGroup(id) {
  store.groups = store.groups.filter((g) => g.id !== id);
  saveGroups();
  store.index.forEach((e) => { if (e.groupId === id) e.groupId = null; });
  write('index', store.index);
  store.index.forEach((e) => { const s = read('s:' + e.id, null); if (s && s.groupId === id) { s.groupId = null; write('s:' + e.id, s); } });
  if (store.cur.groupId === id) store.cur.groupId = null;
}

export function exportAll() {
  save();
  return {
    app: 'talkography', version: 3, exported: new Date().toISOString(),
    types: store.prefs.types, groups: store.groups,
    sessions: store.index.map((e) => read('s:' + e.id, null)).filter(Boolean)
  };
}

/* Merge a backup (or a single saved discussion) into this device. Returns how many discussions were added or updated. */
export function importAll(data) {
  let sessions = [];
  if (data && data.app === 'talkography' && Array.isArray(data.sessions)) {
    sessions = data.sessions;
    (Array.isArray(data.groups) ? data.groups : []).forEach((g) => {
      if (!g || typeof g.id !== 'string' || !Array.isArray(g.seats)) return;
      const clean = { id: g.id, name: String(g.name || 'Group').slice(0, 40), seats: (normalise({ seats: g.seats, turns: [] }) || { seats: [] }).seats };
      const at = store.groups.findIndex((x) => x.id === g.id);
      if (at >= 0) store.groups[at] = clean; else store.groups.push(clean);
    });
    saveGroups();
  } else if (data && Array.isArray(data.seats) && Array.isArray(data.turns)) {
    sessions = [data];
  }
  let count = 0;
  sessions.forEach((raw) => {
    const s = normalise(raw);
    if (!s || !s.turns.length || s.id === store.cur.id) return;
    if (s.groupId && !groupById(s.groupId)) s.groupId = null;
    write('s:' + s.id, s);
    const at = store.index.findIndex((e) => e.id === s.id), entry = indexEntry(s);
    if (at >= 0) store.index[at] = entry; else store.index.push(entry);
    count++;
  });
  write('index', store.index);
  return count;
}

export function wipeAll() {
  try { Object.keys(localStorage).filter((k) => k.indexOf(P) === 0).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
  store.prefs = { types: mergeTypes(null) }; store.groups = []; store.index = [];
  store.cur = freshSession(makeSeats(8, false, 'circle'));
  save();
}
