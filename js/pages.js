/* Talkography pages: HTML builders for the Report, the Library and the present view. */
import { W, H, store, esc, fmt, plural, tokenWidth, types, activeTypes, typeLabel, groupById, loadSession } from './core.js';
import { computeStats, insights, topicSlices, feedback, trend } from './stats.js';

const niceDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/* The discussion map as SVG markup. Used for the live map, and (dark) for the present view. */
export function mapSVG(session, st, opts) {
  opts = opts || {};
  const dark = !!opts.dark, T = session.turns, last = T[T.length - 1], prev = T[T.length - 2];
  const showData = opts.data !== false, live = !!opts.live;
  const ink = dark ? '#f4f6f8' : 'var(--ink)', edge = dark ? '#8fb4f5' : 'var(--edge)', gold = dark ? '#f0c35a' : 'var(--teacher)';
  const label = (i) => (opts.anon ? (session.seats[i].me ? 'T' : String(i + 1)) : (session.seats[i].name || 'Person ' + (i + 1)));
  let h = '<defs><pattern id="dots' + (dark ? 'd' : '') + '" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="1.6" fill="' + (dark ? '#3a4a5a' : 'var(--seat-edge)') + '" opacity=".5"/></pattern>'
    + '<marker id="arrow' + (dark ? 'd' : '') + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="' + ink + '"/></marker></defs>';
  h += '<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="18" fill="url(#dots' + (dark ? 'd' : '') + ')"/>';
  if (session.title && !dark) h += '<text x="20" y="34" font-size="20" fill="var(--muted)">' + esc(session.title) + '</text>';
  if (showData) {
    Object.keys(st.pairs).forEach((key) => {
      const ab = key.split('-').map(Number), c = st.pairs[key], A = session.seats[ab[0]], B = session.seats[ab[1]];
      const viaMe = A.me || B.me, w = Math.min(2 + (c - 1) * 2.5, 16);
      h += '<line x1="' + A.x + '" y1="' + A.y + '" x2="' + B.x + '" y2="' + B.y + '" stroke="' + (viaMe ? gold : edge) + '" stroke-opacity="' + (viaMe ? .45 : .55) + '" stroke-width="' + w + '" stroke-linecap="round"' + (viaMe ? ' stroke-dasharray="2 9"' : '') + '/>';
      if (c > 1) {
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
        h += '<circle cx="' + mx + '" cy="' + my + '" r="13" fill="' + (dark ? '#14202b' : 'var(--panel)') + '" stroke="' + (viaMe ? gold : edge) + '" stroke-width="1.5"/>';
        h += '<text x="' + mx + '" y="' + (my + 5) + '" text-anchor="middle" font-size="14" font-weight="700" fill="' + ink + '">' + c + '</text>';
      }
    });
    if (live && last && prev && last.seat !== prev.seat) {
      const A = session.seats[prev.seat], B = session.seats[last.seat];
      const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
      let stop = Math.min((tokenWidth(label(last.seat)) / 2) / (Math.abs(dx / len) || 1e-6), 28 / (Math.abs(dy / len) || 1e-6)) + 6;
      stop = Math.min(stop, len - 10);
      h += '<line x1="' + A.x + '" y1="' + A.y + '" x2="' + (B.x - dx / len * stop) + '" y2="' + (B.y - dy / len * stop) + '" stroke="' + ink + '" stroke-width="2.5" stroke-dasharray="8 6" marker-end="url(#arrow' + (dark ? 'd' : '') + ')"/>';
    }
  }
  session.seats.forEach((s, i) => {
    const p = st.per[i], name = label(i), w = tokenWidth(name), speaking = live && showData && last && last.seat === i;
    const fill = speaking ? (dark ? '#8a6a12' : 'var(--hot)') : (dark ? '#1f3040' : 'var(--seat)');
    const stroke = speaking ? ink : (s.me ? gold : (dark ? '#4a5c6e' : 'var(--seat-edge)'));
    h += '<g data-seat="' + i + '" style="cursor:pointer">';
    h += '<rect x="' + (s.x - w / 2 - 8) + '" y="' + (s.y - 38) + '" width="' + (w + 16) + '" height="76" fill="transparent"/>';
    h += '<rect x="' + (s.x - w / 2) + '" y="' + (s.y - 28) + '" width="' + w + '" height="56" rx="28" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (speaking ? 3.5 : s.me ? 3 : 2) + '"' + (showData && !p.turns && !s.me ? ' stroke-dasharray="7 5"' : '') + '/>';
    h += '<text x="' + s.x + '" y="' + (s.y + 7) + '" text-anchor="middle" font-size="20" font-weight="650" fill="' + ink + '">' + esc(name) + '</text>';
    if (showData) {
      const bx = s.x + w / 2 - 4, by = s.y - 26;
      h += '<circle cx="' + bx + '" cy="' + by + '" r="15" fill="' + (p.turns ? (s.me ? gold : (dark ? '#8fb4f5' : 'var(--accent)')) : (dark ? '#2c3b4a' : 'var(--line)')) + '"/>';
      h += '<text x="' + bx + '" y="' + (by + 5) + '" text-anchor="middle" font-size="14" font-weight="700" fill="' + (p.turns ? (dark ? '#14202b' : 'var(--accent-ink)') : (dark ? '#b8c4d0' : 'var(--muted)')) + '">' + p.turns + '</text>';
      let marks = '';
      types().forEach((t) => { if (t.k !== 'S' && p.types[t.k]) marks += '<tspan fill="' + (dark ? '#f4f6f8' : 'var(--' + t.k + ')') + '">' + t.k + (p.types[t.k] > 1 ? p.types[t.k] : '') + ' </tspan>'; });
      if (p.stars) marks += '<tspan fill="' + gold + '">★' + (p.stars > 1 ? p.stars : '') + '</tspan>';
      if (marks) h += '<text x="' + s.x + '" y="' + (s.y + 48) + '" text-anchor="middle" font-size="15" font-weight="800" stroke="' + (dark ? '#14202b' : 'var(--bg)') + '" stroke-width="5" stroke-linejoin="round" paint-order="stroke">' + marks + '</text>';
    }
    h += '</g>';
  });
  return h;
}

function kpi(value, label, small) { return '<div class="kpi"><b>' + value + '</b><span>' + label + '</span>' + (small ? '<small>' + small + '</small>' : '') + '</div>'; }

export function reportHTML(session, st) {
  const T = types(), used = T.filter((t) => t.on || st.typeTotal(t.k)), n = st.students.length;
  const on = (k) => T.some((t) => t.k === k && t.on);
  const group = session.groupId ? groupById(session.groupId) : null;
  const maxT = Math.max(1, ...st.per.map((p) => p.turns));
  let h = '<div class="rhead"><div class="t"><h2>' + (session.title ? esc(session.title) : 'Discussion report') + '</h2>';
  h += '<div class="meta">' + niceDate(session.date) + ' · ' + plural(n, 'student') + (st.me ? ' and ' + esc(st.me.name) : '') + (group ? ' · ' + esc(group.name) : '') + '</div></div>';
  h += '<div class="row noprint"><button class="btn" id="presentBtn">Present map</button><button class="btn" id="csv">CSV</button><button class="btn" id="json">Save file</button><button class="btn primary" id="print">Print / PDF</button></div></div>';

  h += '<div class="kpis">';
  h += kpi(fmt(st.end), 'duration');
  h += kpi(st.total, 'contributions', st.end > 60000 ? (st.total / (st.end / 60000)).toFixed(1) + ' per minute' : '');
  h += kpi(st.heard + ' / ' + n, 'voices heard');
  h += kpi(st.balance === null ? 'n/a' : st.balance + '%', 'balance', '100% = perfectly even');
  h += st.me ? kpi((st.total ? Math.round(100 * st.studentTurns / st.total) : 0) + '%', 'student talk', st.hand ? Math.round(100 * st.s2s / st.hand) + '% student to student' : '')
             : kpi(st.usedPairs + ' / ' + st.possiblePairs, 'pairs connected');
  h += kpi((on('Q') ? st.studentTypeTotal('Q') : '-') + ' · ' + (on('T') ? st.typeTotal('T') : '-'), esc(typeLabel('Q').toLowerCase()) + 's · ' + esc(typeLabel('T').toLowerCase()) + 's');
  h += '</div><div class="cards">';

  h += '<div class="card span2"><h3>Observations</h3><ul class="notes">' + insights(session, st, T).map((x) => '<li>' + x + '</li>').join('') + '</ul></div>';
  if (st.total) {
    h += '<div class="card"><h3>Conversation map</h3><p class="sub">Laid out as the room. Circle size is contributions; line weight is how often two people spoke one after the other' + (st.me ? '; dashed gold lines run through ' + esc(st.me.name) : '') + '. Tap a person to highlight their connections.</p><div class="chart" id="ch-map"></div></div>';
    h += '<div class="card"><h3>Participation</h3><p class="sub">Contributions by type. The vertical rule marks an even share among students.</p><div class="chart" id="ch-part"></div></div>';
    h += '<div class="card span2"><h3>Timeline</h3><p class="sub">Each dot is a contribution, stars are standouts, and the grey line follows the hand-overs' + ((session.markers || []).length ? '; shaded bands are topics' : '') + '. Pinch or scroll to zoom. Tap a type in the legend to hide or show it.</p><div class="chart" id="ch-time"></div></div>';
    h += '<div class="card"><h3>Who responds to whom</h3><p class="sub">Read across: how often the person on the left was followed by each person along the bottom.</p><div class="chart" id="ch-heat"></div></div>';
    h += '<div class="card"><h3>Pace</h3><p class="sub">Contributions in each time slice, by type.</p><div class="chart" id="ch-pace"></div></div>';
  }

  const slices = topicSlices(session, st);
  if (slices.length > 1) {
    h += '<div class="card span2"><h3>By topic</h3><div class="wrap"><table class="rep"><thead><tr><th>Topic</th><th>From</th><th>Length</th><th>Contributions</th><th>From students</th><th>Voices</th></tr></thead><tbody>';
    slices.forEach((s) => { h += '<tr><td>' + esc(s.label) + '</td><td>' + fmt(s.from) + '</td><td>' + fmt(s.to - s.from) + '</td><td>' + s.turns + '</td><td>' + s.students + '</td><td>' + s.voices + ' / ' + n + '</td></tr>'; });
    h += '</tbody></table></div></div>';
  }
  const stars = session.turns.map((t, k) => ({ t, k })).filter((x) => x.t.star || x.t.note);
  if (stars.length) {
    h += '<div class="card span2"><h3>Highlights and notes</h3><ul class="notes">' + stars.map((x) => '<li><b>' + esc(st.per[x.t.seat].name) + '</b> at ' + fmt(x.t.t) + ' (' + esc(typeLabel(x.t.type).toLowerCase()) + ')' + (x.t.star ? ' ★' : '') + (x.t.note ? ': ' + esc(x.t.note) : '') + '</li>').join('') + '</ul></div>';
  }
  h += '</div>';

  h += '<div class="card" style="margin-top:14px"><h3>By person</h3><div class="legend" style="margin:8px 0">' + used.map((t) => '<span><i style="background:var(--' + t.k + ')"></i>' + t.k + ' ' + esc(t.label) + '</span>').join('') + '</div>';
  h += '<div class="wrap"><table class="rep"><thead><tr><th>Name</th><th class="barcell"></th><th>Turns</th><th>Share</th><th>Talk*</th>' + used.map((t) => '<th>' + t.k + '</th>').join('') + '<th>★</th><th>Links</th></tr></thead><tbody>';
  st.per.forEach((p) => {
    const bar = used.map((t) => (p.types[t.k] ? '<i style="width:' + (100 * p.types[t.k] / maxT) + '%;background:var(--' + t.k + ')"></i>' : '')).join('');
    h += '<tr' + (p.me ? ' class="me"' : '') + '><td>' + esc(p.name) + '</td><td class="barcell"><div class="bar">' + bar + '</div></td><td>' + p.turns + '</td><td>' + (p.me ? '-' : (st.studentTurns ? Math.round(100 * p.turns / st.studentTurns) : 0) + '%') + '</td><td>' + fmt(p.talk) + '</td>'
      + used.map((t) => '<td>' + (p.types[t.k] || 0) + '</td>').join('') + '<td>' + (p.stars || 0) + '</td><td>' + Object.keys(p.links).length + '</td></tr>';
  });
  h += '</tbody></table></div><p class="hint">*Talk is approximate: the time from each contribution until the next tap. Share is of student contributions. Links is how many different people each person spoke directly before or after. Balance is 100% minus the Gini coefficient of student contributions.</p></div>';

  if (st.total && n) {
    h += '<div class="card slipcard" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3>Feedback slips</h3><button class="btn small noprint" id="printSlips">Print the slips</button></div><p class="sub">One for each student, written to them, with something to try next time. Print and cut, or read them out.</p><div class="slips">';
    st.students.forEach((p) => {
      const f = feedback(session, st, p.i, T);
      h += '<div class="slip"><h4>' + esc(f.name) + '</h4><div class="when">' + (session.title ? esc(session.title) + ' · ' : '') + shortDate(session.date) + '</div>' + f.lines.map((l) => '<p>' + esc(l) + '</p>').join('') + '<p class="next">Something to try: ' + esc(f.next) + '</p></div>';
    });
    h += '</div></div>';
  }
  h += '<div class="row noprint" style="margin-top:18px"><button class="btn" id="newDiscussion">New discussion</button><span class="hint">This one stays in the Library.</span></div>';
  return h;
}

/* Sessions shown in the Library for a filter: 'all', 'none' (one-off) or a group id. Newest first. */
export function sessionsFor(filter) {
  return store.index.filter((e) => filter === 'all' || (filter === 'none' ? !e.groupId : e.groupId === filter)).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}
export function trendFor(filter) {
  if (filter === 'all' || filter === 'none') return null;
  const full = sessionsFor(filter).map((e) => loadSession(e.id)).filter(Boolean);
  return full.length >= 2 ? trend(full) : null;
}

export function libraryHTML(filter, tr) {
  const rows = sessionsFor(filter);
  let h = '<div class="rhead"><div class="t"><h2>Library</h2><div class="meta">' + plural(store.index.length, 'discussion') + ' and ' + plural(store.groups.length, 'group') + ' on this device</div></div>';
  h += '<div class="row"><button class="btn" id="backup"' + (store.index.length || store.groups.length ? '' : ' disabled') + '>Back up everything</button><label class="btn" style="display:inline-flex;align-items:center">Restore or open a file<input type="file" id="restore" accept="application/json,.json" style="display:none"></label></div></div>';

  h += '<div class="cards"><div class="card span2"><div class="row" style="justify-content:space-between"><h3>Discussions</h3><label class="row" style="gap:6px;font-size:14px">Show <select class="field" id="libFilter" style="width:auto"><option value="all"' + (filter === 'all' ? ' selected' : '') + '>All</option>'
    + store.groups.map((g) => '<option value="' + esc(g.id) + '"' + (filter === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('') + '<option value="none"' + (filter === 'none' ? ' selected' : '') + '>One-off (no group)</option></select></label></div>';
  if (!rows.length) h += '<p class="hint">' + (store.index.length ? 'No discussions in this group yet.' : 'Nothing here yet. Every discussion you record is kept here automatically, on this device only.') + '</p>';
  h += '<div class="sessions">';
  rows.forEach((e) => {
    const g = e.groupId ? groupById(e.groupId) : null;
    h += '<div class="srow' + (e.id === store.cur.id ? ' cur' : '') + '"><div><b>' + esc(e.title || 'Untitled discussion') + '</b><span>' + shortDate(e.date) + ' · ' + plural(e.turns, 'contribution') + ' · ' + fmt(e.elapsed) + ' · ' + plural(e.people, 'student') + (g ? ' · ' + esc(g.name) : '') + (e.id === store.cur.id ? ' · open now' : '') + '</span></div>'
      + '<div class="row"><button class="btn small" data-open="' + esc(e.id) + '">Open</button><button class="btn small danger" data-del="' + esc(e.id) + '">Delete</button></div></div>';
  });
  h += '</div></div>';

  if (tr) {
    h += '<div class="card"><h3>Share of the talk, discussion by discussion</h3><p class="sub">Each student’s share of student contributions each time. Blank means they were not in that discussion. People are matched by name.</p><div class="chart" id="ch-share"></div></div>';
    h += '<div class="card"><h3>Is the talk getting more even?</h3><p class="sub">Balance (100% is perfectly even), the proportion of students heard, and how often talk passed straight from student to student.</p><div class="chart" id="ch-balance"></div></div>';
  } else if (filter !== 'all' && filter !== 'none') {
    h += '<div class="card span2"><h3>Trends</h3><p class="hint">Record two or more discussions with this group and its trends appear here: each student’s share over time, and whether the talk is getting more even.</p></div>';
  } else if (store.groups.length) {
    h += '<div class="card span2"><h3>Trends</h3><p class="hint">Choose a group above to see how its discussions change over time.</p></div>';
  }

  h += '<div class="card span2"><h3>Groups</h3><p class="sub">A group is a saved set of names and seats, such as a class. Recording its discussions under one group lets you compare them over time. Make one from Setup with “Save as a group”.</p><div class="sessions">';
  if (!store.groups.length) h += '<p class="hint">No groups yet.</p>';
  store.groups.forEach((g) => {
    const count = store.index.filter((e) => e.groupId === g.id).length;
    h += '<div class="srow"><div><b>' + esc(g.name) + '</b><span>' + plural(g.seats.filter((s) => !s.me).length, 'student') + (g.seats.some((s) => s.me) ? ' and a teacher seat' : '') + ' · ' + plural(count, 'discussion') + '</span></div>'
      + '<div class="row"><button class="btn small" data-usegroup="' + esc(g.id) + '">New discussion</button><button class="btn small" data-rengroup="' + esc(g.id) + '">Rename</button><button class="btn small danger" data-delgroup="' + esc(g.id) + '">Delete</button></div></div>';
  });
  h += '</div></div>';

  h += '<div class="card span2"><h3>Your data</h3><p class="sub">Everything Talkography records stays in this browser on this device. Nothing is sent anywhere, and there are no accounts or tracking. Clearing the browser’s website data deletes it, so back up anything you want to keep.</p><button class="btn danger" id="wipe">Delete everything on this device</button></div></div>';
  return h;
}

export function presentHTML(session, st, anon) {
  const n = st.students.length;
  let figs = '';
  if (st.me) figs += '<div class="fig"><b>' + (st.total ? Math.round(100 * st.studentTurns / st.total) : 0) + '%</b><span>of the talk was yours</span></div>';
  if (st.me && st.hand) figs += '<div class="fig"><b>' + Math.round(100 * st.s2s / st.hand) + '%</b><span>of hand-overs went straight from one of you to another</span></div>';
  figs += '<div class="fig"><b>' + st.heard + ' of ' + n + '</b><span>voices heard</span></div>';
  if (st.balance !== null) figs += '<div class="fig"><b>' + st.balance + '%</b><span>balance (100% is perfectly even)</span></div>';
  if (activeTypes().some((t) => t.k === 'Q')) figs += '<div class="fig"><b>' + st.studentTypeTotal('Q') + '</b><span>' + esc(typeLabel('Q').toLowerCase()) + 's asked</span></div>';
  return '<div class="tools"><button id="presentNames">' + (anon ? 'Show names' : 'Show seat numbers') + '</button><button id="presentClose">Close</button></div>'
    + '<div class="eyebrow">' + (session.title ? esc(session.title) : 'Our discussion') + '</div><h2>How we talked</h2>'
    + '<div class="body"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + mapSVG(session, st, { dark: true, anon }) + '</svg><div class="figs">' + figs + '</div></div>';
}

export function statsNow(session, end) { return computeStats(session, end); }
