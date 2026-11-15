/* Unit tests for js/stats.js. Run with: npm test  (or: node --test tests/) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { gini, computeStats, insights, topicSlices, feedback, trend } from '../js/stats.js';

const TYPES = [
  { k: 'S', label: 'Statement', on: true }, { k: 'Q', label: 'Question', on: true }, { k: 'T', label: 'Text reference', on: true },
  { k: 'B', label: 'Builds on', on: true }, { k: 'C', label: 'Challenges', on: true }, { k: 'I', label: 'Interrupts', on: true }
];
const seats = (names, me) => names.map((name) => ({ name })).concat(me ? [{ name: 'Teacher', me: true }] : []);
const turn = (seat, sec, type = 'S', extra = {}) => Object.assign({ seat, t: sec * 1000, type }, extra);

test('gini: even, uneven and empty', () => {
  assert.equal(gini([3, 3, 3]), 0);
  assert.ok(Math.abs(gini([9, 0, 0]) - 2 / 3) < 1e-9);
  assert.equal(gini([0, 0]), null);
  assert.equal(gini([]), null);
});

test('computeStats: counts, talk time, pairs and matrix', () => {
  const s = { seats: seats(['Fox', 'Owl', 'Hare']), turns: [turn(0, 0), turn(1, 10, 'Q'), turn(0, 30), turn(2, 40, 'T', { star: true })], markers: [], elapsed: 60000 };
  const st = computeStats(s);
  assert.equal(st.total, 4);
  assert.deepEqual(st.per.map((p) => p.turns), [2, 1, 1]);
  assert.deepEqual(st.per.map((p) => p.talk), [20000, 20000, 20000]);
  assert.equal(st.pairs['0-1'], 2);
  assert.equal(st.pairs['0-2'], 1);
  assert.equal(st.matrix[0][1], 1);
  assert.equal(st.matrix[1][0], 1);
  assert.equal(st.hand, 3);
  assert.equal(st.heard, 3);
  assert.equal(st.typeTotal('Q'), 1);
  assert.equal(st.per[2].stars, 1);
  assert.equal(st.usedPairs, 2);
  assert.equal(st.possiblePairs, 3);
  assert.equal(st.me, null);
});

test('computeStats: the teacher is kept apart from students', () => {
  const s = { seats: seats(['Fox', 'Owl'], true), turns: [turn(2, 0, 'Q'), turn(0, 5), turn(1, 9), turn(2, 15), turn(0, 20)], markers: [], elapsed: 30000 };
  const st = computeStats(s);
  assert.equal(st.me.name, 'Teacher');
  assert.equal(st.meTurns, 2);
  assert.equal(st.studentTurns, 3);
  assert.equal(st.students.length, 2);
  assert.equal(st.hand, 4);
  assert.equal(st.s2s, 1); // only Fox to Owl
  assert.equal(st.studentTypeTotal('Q'), 0);
  assert.equal(st.typeTotal('Q'), 1);
});

test('computeStats: the end is never before the last contribution', () => {
  const st = computeStats({ seats: seats(['Fox', 'Owl']), turns: [turn(0, 0), turn(1, 100)], markers: [], elapsed: 5000 });
  assert.equal(st.end, 100000);
});

test('insights: names the quiet, the dominant and escapes names', () => {
  const s = { seats: seats(['<Fox>', 'Owl', 'Hare', 'Wren']), turns: [turn(0, 0), turn(1, 5), turn(0, 10), turn(1, 15), turn(0, 20), turn(1, 25), turn(0, 60)], markers: [], elapsed: 70000 };
  const text = insights(s, computeStats(s), TYPES).join(' ');
  assert.match(text, /&lt;Fox&gt;/);
  assert.doesNotMatch(text, /<Fox>/);
  assert.match(text, /Not heard: <b>Hare and Wren<\/b>/);
  assert.match(text, /Most frequent exchange: &lt;Fox&gt; and Owl \(6 times\)/);
  assert.match(text, /No student questions were recorded/);
  assert.match(text, /Longest stretch before the next speaker: 0:35/);
});

test('insights: nothing logged, and a switched-off type is not mentioned', () => {
  assert.deepEqual(insights({ seats: seats(['Fox']), turns: [], markers: [] }, computeStats({ seats: seats(['Fox']), turns: [], markers: [] }), TYPES), ['No contributions logged yet.']);
  const off = TYPES.map((t) => t.k === 'Q' ? Object.assign({}, t, { on: false }) : t);
  const s = { seats: seats(['Fox', 'Owl']), turns: [turn(0, 0), turn(1, 5)], markers: [], elapsed: 9000 };
  assert.doesNotMatch(insights(s, computeStats(s), off).join(' '), /question/i);
});

test('topicSlices: splits at markers and counts voices', () => {
  const s = { seats: seats(['Fox', 'Owl'], true), turns: [turn(0, 5), turn(1, 10), turn(2, 40), turn(0, 50)], markers: [{ t: 30000, label: 'Act 2' }], elapsed: 60000 };
  const slices = topicSlices(s, computeStats(s));
  assert.equal(slices.length, 2);
  assert.deepEqual(slices.map((x) => x.label), ['Opening', 'Act 2']);
  assert.deepEqual(slices.map((x) => x.turns), [2, 2]);
  assert.deepEqual(slices.map((x) => x.students), [2, 1]);
  assert.equal(slices[1].to, 60000);
  const one = topicSlices({ seats: seats(['Fox']), turns: [turn(0, 1)], markers: [], elapsed: 5000 }, computeStats({ seats: seats(['Fox']), turns: [turn(0, 1)], markers: [], elapsed: 5000 }));
  assert.deepEqual(one.map((x) => x.label), ['Whole discussion']);
});

test('feedback: speaks to the student and suggests a next step', () => {
  const s = { seats: seats(['Fox', 'Owl', 'Hare', 'Wren']), turns: [turn(0, 0), turn(1, 5, 'Q'), turn(0, 10, 'B', { star: true, note: 'Linked two ideas' }), turn(2, 15)], markers: [], elapsed: 20000 };
  const st = computeStats(s);
  const fox = feedback(s, st, 0, TYPES);
  assert.equal(fox.turns, 2);
  assert.equal(fox.share, 50);
  assert.match(fox.lines.join(' '), /You contributed 2 times: 50%/);
  assert.match(fox.lines.join(' '), /1 × Builds on/);
  assert.match(fox.lines.join(' '), /Standout moment: Linked two ideas/);
  assert.match(fox.next, /quieter voice/);
  const wren = feedback(s, st, 3, TYPES);
  assert.equal(wren.turns, 0);
  assert.match(wren.lines[0], /did not speak/);
  const hare = feedback(s, st, 2, TYPES);
  assert.match(hare.next, /asking a question/);
});

test('trend: orders by date and matches people by name', () => {
  const a = { id: 'a', date: '2026-11-01T10:00:00Z', title: 'One', seats: seats(['Fox', 'Owl']), turns: [turn(0, 0), turn(1, 5), turn(0, 9)], markers: [], elapsed: 10000 };
  const b = { id: 'b', date: '2026-10-01T10:00:00Z', title: 'Zero', seats: seats(['owl ', 'Hare'], true), turns: [turn(2, 0), turn(0, 5, 'Q'), turn(1, 9)], markers: [], elapsed: 10000 };
  const t = trend([a, b]);
  assert.deepEqual(t.rows.map((r) => r.id), ['b', 'a']);
  assert.deepEqual(t.names.map((n) => n.key), ['owl', 'hare', 'fox']);
  assert.equal(t.rows[0].share.owl, 50);
  assert.equal(t.rows[1].share.owl, 33);
  assert.equal(t.rows[1].share.hare, undefined);
  assert.equal(t.rows[0].questions, 1);
  assert.equal(t.rows[0].s2s, 50);
  assert.equal(t.rows[1].s2s, null);
});
