/* End-to-end test: serves the app on localhost and drives it in headless Chromium.
   Run with: npm run test:e2e   (needs Playwright: npm install --no-save playwright && npx playwright install chromium)
   All names used here are invented. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok   ' + name); } else { fail++; console.log('FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); } }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 }, acceptDownloads: true });
const outside = [];
await ctx.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) route.continue(); else { outside.push(u); route.abort(); } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const tap = async (i) => { const r = await page.locator('[data-seat="' + i + '"] rect').nth(1).boundingBox(); await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(30); };
const state = () => page.evaluate(() => { const p = JSON.parse(localStorage.getItem('talkography:v3:prefs')); return { prefs: p, cur: JSON.parse(localStorage.getItem('talkography:v3:s:' + p.currentId)), index: JSON.parse(localStorage.getItem('talkography:v3:index') || '[]'), groups: JSON.parse(localStorage.getItem('talkography:v3:groups') || '[]') }; });
const sideText = () => page.locator('#side').innerText();

try {
  /* ----- Setup ----- */
  await page.goto(BASE);
  await page.waitForSelector('#go');
  check('opens on Setup with eight invented names', (await page.locator('[data-name]').count()) === 8);
  await page.fill('#title', 'Macbeth, Act 1');
  await page.fill('#planned', '20');
  await page.click('#minus'); await page.click('#minus');
  await page.check('#withMe');
  check('six students and a teacher seat', (await page.locator('[data-name]').count()) === 7);
  await page.click('[data-layout="horseshoe"]');
  await page.fill('[data-name="0"]', 'Asha');
  await page.fill('[data-typelabel="T"]', 'Evidence');
  await page.uncheck('[data-typeon="I"]');
  await page.click('#saveGroup'); await page.fill('#dlgIn', 'Year 12 English'); await page.click('.dialog [data-v="ok"]');
  let s = await state();
  check('group saved with its seats', s.groups.length === 1 && s.groups[0].seats.length === 7 && s.cur.groupId === s.groups[0].id);
  check('layout and type choices remembered', s.prefs.layout === 'horseshoe' && s.prefs.types.find((t) => t.k === 'T').label === 'Evidence' && s.prefs.types.find((t) => t.k === 'I').on === false);
  // drag a seat
  const b0 = await page.locator('[data-seat="1"] rect').nth(1).boundingBox();
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2); await page.mouse.down(); await page.mouse.move(b0.x + b0.width / 2 + 90, b0.y + b0.height / 2 + 40, { steps: 6 }); await page.mouse.up();
  const moved = (await state()).cur.seats[1];
  check('dragging moves a seat', moved.x !== s.cur.seats[1].x);

  /* ----- Discuss ----- */
  await page.click('#go');
  check('type bar hides the switched-off type', (await page.locator('#chooser [data-type]').count()) === 5 && (await page.locator('#chooser [data-type="I"]').count()) === 0);
  for (const i of [6, 0, 1, 2, 0, 3]) await tap(i);      // teacher is seat 6
  await page.click('#chooser [data-type="Q"]');
  await page.click('#starBtn');
  await tap(1); await page.click('#chooser [data-type="T"]');
  await tap(3); // will be undone
  await page.click('#undo');
  await page.click('#topic'); await page.fill('#dlgIn', 'The witches'); await page.click('.dialog [data-v="ok"]');
  await tap(4); await page.keyboard.press('b');
  await tap(0);
  s = await state();
  check('contributions recorded in order with types', s.cur.turns.map((t) => t.seat + t.type).join(' ') === '6S 0S 1S 2S 0S 3Q 1T 4B 0S', s.cur.turns.map((t) => t.seat + t.type).join(' '));
  check('star, topic and clock recorded', s.cur.turns[5].star === true && s.cur.markers.length === 1 && s.cur.markers[0].label === 'The witches' && s.cur.elapsed > 0);
  let txt = await sideText();
  check('live panel shows who is not yet heard and student talk', /NOT YET HEARD \(1\)/i.test(txt) && /student talk/i.test(txt), txt.slice(0, 200));
  // edit an earlier contribution from the log
  await page.click('[data-side="log"]');
  await page.click('[data-edit="1"]');
  await page.click('#edTypes [data-ty="C"]'); await page.fill('#edNote', 'Opened the debate'); await page.click('.dialog [data-v="ok"]');
  s = await state();
  check('editing a logged contribution changes its type and note', s.cur.turns[1].type === 'C' && s.cur.turns[1].note === 'Opened the debate');
  check('log lists every contribution and the topic', (await page.locator('ol.log li').count()) === 10);
  // hide and show the side panel
  await page.click('#menuBtn'); await page.click('[data-m="side"]');
  check('side panel can be hidden', await page.isHidden('#side'));
  await page.click('#menuBtn'); await page.click('[data-m="side"]');

  /* ----- Report ----- */
  await page.click('[data-tab="report"]'); await page.waitForTimeout(700);
  check('report draws five charts', (await page.locator('.chart svg').count()) === 5);
  txt = await sideText();
  check('report has observations about students and the teacher', /Student talk:/.test(txt) && /hand-overs went straight from student to student/.test(txt) && /Not heard:/.test(txt));
  check('report has a topic table and highlights', /By topic/i.test(txt) && /The witches/.test(txt) && /Highlights and notes/i.test(txt) && /Opened the debate/.test(txt));
  check('one feedback slip per student', (await page.locator('.slip').count()) === 6 && /Something to try:/.test(txt));
  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
  const csvText = fs.readFileSync(await csv.path(), 'utf8');
  check('CSV export has every contribution with topic and teacher columns', csvText.split('\n').length === 10 && /is_teacher/.test(csvText) && /The witches/.test(csvText) && /Evidence/.test(csvText), csvText.split('\n')[0]);
  await page.click('#presentBtn');
  check('present view shows the map with names', (await page.isVisible('#present')) && /Asha/.test(await page.locator('#present').innerText()));
  await page.click('#presentNames');
  check('present view can show seat numbers instead of names', !/Asha/.test(await page.locator('#present svg').innerHTML()));
  await page.click('#presentClose');

  /* ----- A second discussion with the same group, then the Library ----- */
  await page.click('#newDiscussion');
  s = await state();
  check('new discussion keeps the group and leaves the old one in the Library', s.cur.turns.length === 0 && s.cur.groupId === s.groups[0].id && s.index.length === 1 && s.cur.seats[0].name === 'Asha');
  await page.fill('#title', 'Macbeth, Act 2');
  await page.click('#go');
  for (const i of [0, 1, 2, 3, 4, 5, 0, 2]) await tap(i);
  await page.click('[data-tab="library"]'); await page.waitForTimeout(300);
  check('library lists both discussions', (await page.locator('[data-open]').count()) === 2);
  await page.selectOption('#libFilter', (await state()).groups[0].id); await page.waitForTimeout(700);
  check('group trends draw two charts', (await page.locator('.chart svg').count()) === 2);
  const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
  const backup = JSON.parse(fs.readFileSync(await bk.path(), 'utf8'));
  check('backup holds both discussions and the group', backup.app === 'talkography' && backup.sessions.length === 2 && backup.groups.length === 1);

  /* ----- Import an older export ----- */
  const old = path.join(os.tmpdir(), 'talkography-old-' + Date.now() + '.json');
  fs.writeFileSync(old, JSON.stringify({ title: 'Older format', seats: [{ name: 'Fox', x: 300, y: 300 }, { name: 'Owl', x: 600, y: 300 }], turns: [{ seat: 0, t: 1000, type: 'S' }, { seat: 1, t: 4000, type: 'E' }], elapsed: 9000 }));
  await page.setInputFiles('#restore', old); await page.waitForTimeout(400);
  fs.unlinkSync(old);
  s = await state();
  check('an older saved discussion imports into the Library', s.index.length === 3 && s.index.some((e) => e.title === 'Older format'));
  await page.selectOption('#libFilter', 'all');
  await page.click('[data-open="' + s.index.find((e) => e.title === 'Older format').id + '"]'); await page.waitForTimeout(500);
  check('opening it shows its report, with the old type mapped', /Older format/.test(await sideText()) && (await state()).cur.turns[1].type === 'T');

  /* ----- Persistence and offline ----- */
  await page.reload(); await page.waitForSelector('#tabs');
  s = await state();
  check('everything survives a reload', s.index.length === 3 && s.groups.length === 1 && s.cur.title === 'Older format');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  check('service worker is controlling the page', await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)));
  await ctx.setOffline(true);
  await page.reload().catch(() => {}); await page.waitForTimeout(600);
  check('the app opens with no connection', (await page.title()) === 'Talkography' && (await page.locator('#tabs button').count()) === 4);
  await page.click('[data-tab="report"]'); await page.waitForTimeout(600);
  check('charts still draw offline', (await page.locator('.chart svg').count()) === 5);
  await ctx.setOffline(false);

  /* ----- Deleting ----- */
  await page.click('[data-tab="library"]');
  await page.click('#wipe'); await page.click('.dialog [data-v="ok"]'); await page.waitForTimeout(300);
  s = await state();
  check('delete everything clears the device', s.index.length === 0 && s.groups.length === 0 && s.cur.turns.length === 0);

  check('no page errors', errors.length === 0, errors);
  check('no requests left the device', outside.length === 0, outside);
} catch (e) {
  fail++; console.log('FAIL (exception) ' + (e && e.stack || e));
} finally {
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
