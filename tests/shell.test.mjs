/* The service worker's offline list must name every file the app serves,
   otherwise the app breaks with no connection. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const shell = eval(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1]);

test('offline list: every served file is named', () => {
  const served = ['index.html', 'manifest.webmanifest'];
  for (const dir of ['css', 'js', 'vendor', 'icons']) for (const f of fs.readdirSync(path.join(ROOT, dir))) served.push(dir + '/' + f);
  const missing = served.filter((f) => !shell.includes(f));
  assert.deepEqual(missing, []);
});

test('offline list: every named file exists', () => {
  const gone = shell.filter((f) => f !== './' && !fs.existsSync(path.join(ROOT, f)));
  assert.deepEqual(gone, []);
});

test('offline list: every script and stylesheet the page loads is named', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|webmanifest|png|svg))"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 3);
  assert.deepEqual(refs.filter((f) => !shell.includes(f)), []);
});
