/* Talkography statistics: pure functions over a session. No DOM and no storage, so they run under Node for tests.

   A session is { seats: [{name, me?}], turns: [{seat, t, type, star?, note?}], markers: [{t, label}], elapsed }.
   Times are milliseconds on the discussion clock. A seat with me: true is the teacher or facilitator;
   everyone else is a student. */

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
const list = (xs) => xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];

/* Gini coefficient of a list of counts: 0 is perfectly even, towards 1 is one person doing it all. */
export function gini(xs) {
  const n = xs.length;
  if (!n) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  if (!mean) return null;
  let d = 0;
  for (const a of xs) for (const b of xs) d += Math.abs(a - b);
  return d / (2 * n * n * mean);
}

export function computeStats(session, endMs) {
  const T = session.turns;
  const lastT = T.length ? T[T.length - 1].t : 0;
  const end = Math.max(endMs == null ? (session.elapsed || 0) : endMs, lastT);
  const per = session.seats.map((s, i) => ({ i, name: s.name || 'Person ' + (i + 1), me: !!s.me, turns: 0, talk: 0, types: {}, stars: 0, links: {}, first: null, last: null }));
  const pairs = {}, n = per.length;
  const matrix = per.map(() => per.map(() => 0));
  let hand = 0, s2s = 0;
  T.forEach((t, k) => {
    const p = per[t.seat];
    if (!p) return;
    p.turns++;
    p.types[t.type] = (p.types[t.type] || 0) + 1;
    if (t.star) p.stars++;
    if (p.first === null) p.first = t.t;
    p.last = t.t;
    p.talk += Math.max(0, (k + 1 < T.length ? T[k + 1].t : end) - t.t);
    if (k > 0) {
      const a = T[k - 1].seat, b = t.seat;
      if (a !== b && per[a]) {
        hand++;
        if (!per[a].me && !p.me) s2s++;
        p.links[a] = 1; per[a].links[b] = 1;
        matrix[a][b]++;
        const key = a < b ? a + '-' + b : b + '-' + a;
        pairs[key] = (pairs[key] || 0) + 1;
      }
    }
  });
  const studs = per.filter((p) => !p.me), me = per.filter((p) => p.me)[0] || null;
  const studentTurns = studs.reduce((s, p) => s + p.turns, 0);
  const g = gini(studs.map((p) => p.turns));
  return {
    per, pairs, matrix, end, total: T.length, hand, s2s,
    students: studs, me, studentTurns, meTurns: me ? me.turns : 0,
    heard: studs.filter((p) => p.turns).length,
    balance: g === null ? null : Math.round(100 * (1 - g)),
    possiblePairs: n * (n - 1) / 2, usedPairs: Object.keys(pairs).length,
    typeTotal: (k) => per.reduce((s, p) => s + (p.types[k] || 0), 0),
    studentTypeTotal: (k) => studs.reduce((s, p) => s + (p.types[k] || 0), 0)
  };
}

/* Plain-English observations, as HTML strings (names are escaped). typeList is [{k, label, on}]. */
export function insights(session, st, typeList) {
  const out = [], T = session.turns, studs = st.students, n = studs.length;
  const on = (k) => (typeList || []).some((t) => t.k === k && t.on);
  if (!st.total) return ['No contributions logged yet.'];
  if (st.me) {
    out.push('<b>Student talk:</b> students made ' + st.studentTurns + ' of ' + st.total + ' contributions (' + pct(st.studentTurns, st.total) + '%); ' + esc(st.me.name) + ' made ' + st.meTurns + '.');
    if (st.hand) out.push(pct(st.s2s, st.hand) + '% of hand-overs went straight from student to student' + (st.s2s * 2 >= st.hand ? ': the discussion ran between them.' : ': most talk still came through ' + esc(st.me.name) + ', a hub-and-spoke pattern.'));
  }
  const sorted = studs.slice().sort((a, b) => b.turns - a.turns);
  if (st.studentTurns && n) {
    const top = sorted[0];
    out.push('<b>' + esc(top.name) + '</b> made the most contributions: ' + top.turns + ' (' + pct(top.turns, st.studentTurns) + '% of student contributions, against an even share of about ' + Math.round(100 / n) + '%).');
    const third = Math.max(1, Math.round(n / 3));
    if (n >= 4) out.push('The most active ' + third + ' of ' + n + ' made ' + pct(sorted.slice(0, third).reduce((s, p) => s + p.turns, 0), st.studentTurns) + '% of student contributions (an even spread would be about ' + pct(third, n) + '%).');
  }
  const silent = studs.filter((p) => !p.turns);
  if (silent.length) out.push('Not heard: <b>' + list(silent.map((p) => esc(p.name))) + '</b>.');
  else if (n) out.push('Every voice was heard; the last person to join in did so at ' + fmt(Math.max.apply(null, studs.map((p) => p.first))) + '.');
  const even = n ? st.studentTurns / n : 0;
  const quiet = studs.filter((p) => p.turns && p.turns < even / 2);
  if (quiet.length) out.push('Contributed less than half an even share: ' + list(quiet.map((p) => esc(p.name))) + '.');
  if (!st.me && st.hand) {
    const inv = st.per.map((p) => ({ p, c: Object.keys(st.pairs).reduce((s, k) => { const ab = k.split('-').map(Number); return s + (ab[0] === p.i || ab[1] === p.i ? st.pairs[k] : 0); }, 0) })).sort((a, b) => b.c - a.c)[0];
    const share = pct(inv.c, st.hand);
    out.push(share >= 50 ? 'The talk ran through <b>' + esc(inv.p.name) + '</b>, who was part of ' + share + '% of hand-overs: a hub-and-spoke pattern rather than a web.' : 'Hand-overs were spread out: no one was part of more than ' + share + '% of them.');
  }
  const best = Object.keys(st.pairs).sort((a, b) => st.pairs[b] - st.pairs[a])[0];
  if (best && st.pairs[best] > 1) { const ab = best.split('-').map(Number); out.push('Most frequent exchange: ' + esc(st.per[ab[0]].name) + ' and ' + esc(st.per[ab[1]].name) + ' (' + plural(st.pairs[best], 'time') + ').'); }
  let gap = 0, at = 0;
  for (let k = 1; k < T.length; k++) { const d = T[k].t - T[k - 1].t; if (d > gap) { gap = d; at = k; } }
  if (gap >= 20000) out.push('Longest stretch before the next speaker: ' + fmt(gap) + ', after ' + esc(st.per[T[at - 1].seat].name) + ' at ' + fmt(T[at - 1].t) + '.');
  const q = st.studentTypeTotal('Q'), askers = studs.filter((p) => p.types.Q);
  if (on('Q')) out.push(q ? 'Students asked ' + plural(q, 'question') + ', from ' + plural(askers.length, 'person', 'people') + (askers.length <= 3 ? ' (' + list(askers.map((p) => esc(p.name))) + ')' : '') + '.' : 'No student questions were recorded.');
  if (on('T') && st.typeTotal('T')) out.push(plural(st.typeTotal('T'), 'reference') + ' to the text.');
  if ((on('B') || on('C')) && (st.typeTotal('B') || st.typeTotal('C'))) out.push(plural(st.typeTotal('B'), 'contribution') + ' built on someone else; ' + plural(st.typeTotal('C'), 'challenge') + '.');
  if (on('I') && st.typeTotal('I')) out.push(plural(st.typeTotal('I'), 'interruption') + ' recorded.');
  const stars = T.filter((t) => t.star).length;
  if (stars) out.push(plural(stars, 'standout contribution') + ' starred.');
  return out;
}

/* Split the discussion at its topic markers. Always returns at least one slice. */
export function topicSlices(session, st) {
  const marks = (session.markers || []).slice().sort((a, b) => a.t - b.t);
  const bounds = [{ t: 0, label: marks.length ? 'Opening' : 'Whole discussion' }].concat(marks.map((m, i) => ({ t: m.t, label: m.label || 'Topic ' + (i + 2) })));
  return bounds.map((b, i) => {
    const to = i + 1 < bounds.length ? bounds[i + 1].t : st.end;
    const turns = session.turns.filter((t) => t.t >= b.t && (t.t < to || i + 1 === bounds.length));
    const speakers = new Set(turns.filter((t) => !(session.seats[t.seat] || {}).me).map((t) => t.seat));
    return { label: b.label, from: b.t, to, turns: turns.length, students: turns.filter((t) => !(session.seats[t.seat] || {}).me).length, voices: speakers.size };
  }).filter((s, i) => i > 0 || s.turns || s.to > 0 || bounds.length === 1);
}

/* A short, second-person summary for one student, for a printed feedback slip. */
export function feedback(session, st, i, typeList) {
  const p = st.per[i], n = st.students.length, lines = [];
  const on = (k) => (typeList || []).some((t) => t.k === k && t.on);
  const label = (k) => { const t = (typeList || []).filter((x) => x.k === k)[0]; return t ? t.label.toLowerCase() : k; };
  const even = n ? 100 / n : 0, share = pct(p.turns, st.studentTurns);
  if (!p.turns) {
    lines.push('You did not speak in this discussion.');
    return { name: p.name, turns: 0, share: 0, lines, next: 'Next time, aim to make one contribution in the first five minutes.' };
  }
  lines.push('You contributed ' + plural(p.turns, 'time') + ': ' + share + '% of the group’s contributions (an even share would be about ' + Math.round(even) + '%).');
  const kinds = (typeList || []).filter((t) => t.k !== 'S' && p.types[t.k]).map((t) => p.types[t.k] + ' × ' + t.label);
  if (kinds.length) lines.push('That included: ' + kinds.join(', ') + '.');
  const links = Object.keys(p.links).map((k) => st.per[+k]).filter((x) => x && !x.me).map((x) => x.name);
  if (links.length) lines.push('You spoke directly before or after ' + plural(links.length, 'person', 'different people') + (links.length <= 4 ? ': ' + list(links) : '') + '.');
  lines.push('You first spoke at ' + fmt(p.first) + '.');
  const starred = session.turns.filter((t) => t.seat === i && t.star);
  if (starred.length) lines.push('Standout moment' + (starred.length > 1 ? 's' : '') + ': ' + (starred.map((t) => t.note).filter(Boolean).join('; ') || plural(starred.length, 'contribution') + ' starred') + '.');
  let next;
  if (share > even * 1.8 && n >= 4) next = 'You had a lot to say. Try inviting a quieter voice in by name.';
  else if (on('Q') && !p.types.Q) next = 'Try asking a question that brings someone else in.';
  else if (on('B') && !p.types.B) next = 'Try building on someone else’s point, naming them as you do.';
  else if (on('T') && !p.types.T) next = 'Back up a point with a ' + label('T') + '.';
  else if (share < even / 2) next = 'Aim to come in a little earlier and a little more often.';
  else next = 'Keep doing what you did, and try a kind of contribution you used least.';
  return { name: p.name, turns: p.turns, share, lines, next };
}

/* Compare several sessions of the same group. People are matched by name (case-insensitive). */
export function trend(sessions) {
  const ordered = sessions.slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const key = (name) => String(name || '').trim().toLowerCase();
  const names = [], seen = {};
  const rows = ordered.map((s) => {
    const st = computeStats(s);
    const share = {};
    st.students.forEach((p) => {
      const k = key(p.name);
      if (!k) return;
      if (!seen[k]) { seen[k] = true; names.push({ key: k, name: p.name }); }
      share[k] = st.studentTurns ? Math.round(100 * p.turns / st.studentTurns) : 0;
    });
    return {
      id: s.id, date: s.date, title: s.title, total: st.total, balance: st.balance,
      heard: pct(st.heard, st.students.length), questions: st.studentTypeTotal('Q'),
      s2s: st.me && st.hand ? pct(st.s2s, st.hand) : null, share
    };
  });
  return { names, rows };
}
