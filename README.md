# Talkography

A Harkness discussion tracker for an iPad. Lay out the room, tap whoever speaks, and Talkography draws the conversation as it happens, then reports on it.

It is a plain web page: no accounts, no server, no build step. Everything it records stays in the browser on the device.

## What it does

**Setup**
- 2 to 24 people, with invented placeholder names to start from.
- An optional teacher seat, so the report can separate student talk from yours.
- Layout presets (circle, horseshoe, two rows), then drag names to match the room.
- Groups: save a class's names and seats once and reuse them for every discussion.
- A planned length, shown as time left beside the clock.
- Contribution types can be renamed or switched off (Statement, Question, Text reference, Builds on, Challenges, Interrupts).

**Discuss**
- Tap a name each time someone speaks. A line is drawn from the previous speaker, and it thickens as two people keep exchanging.
- A bar under the map marks the type of the latest contribution, and a star marks a standout one.
- Topic markers split the discussion into sections.
- The side panel shows live figures: voices heard, balance, student talk, each person's share against an even share, time since each person last spoke, and prompts when a pattern forms (two people trading turns, one voice dominating, no questions for a while, running past the planned length).
- The Log tab lists every contribution. Tap a line to change who spoke, the type, the star or a note, or to delete it.
- Drag the divider to give the map or the panel more room, or hide the panel from the menu.

**Report**
- Headline figures and plain-English observations.
- Five charts: the conversation map laid out as the room, participation by type, a timeline with topic bands, who responds to whom, and pace.
- A table by topic, the starred moments and notes, and a table by person.
- A feedback slip for each student, written to them, with something to try next time. Print them separately and cut them up.
- A present view for the shared screen ("How we talked"), with the option of seat numbers in place of names.
- Export to CSV, save as a file, or print to PDF.

**Library**
- Every discussion is saved on the device automatically.
- For a group, trends across its discussions: each student's share each time, and whether the talk is getting more even.
- Back up everything to one file, restore it on another device, and open files saved by earlier versions.
- Delete one discussion, one group, or everything on the device.

**Keyboard** (with a keyboard attached): the first letter of a type (S, Q, T, B, C, I) sets the latest contribution's type, `*` stars it, Ctrl or Cmd + Z undoes it, Escape closes the menu or the present view.

## Your data

Talkography sends nothing anywhere. There is no tracking, no sign-in and no outside service: the chart library is in `vendor/` and the app makes no network requests after it has loaded. The end-to-end test fails if any request leaves the device.

What you record is kept in the browser's storage for that site on that device, until you delete it from the Library or clear the browser's website data. A backup file is an ordinary file wherever you save it, so treat it as you would any record of a class.

If you use it with real students, their first names end up on the device and in any file you export. Check that fits your school's rules before you do. The names in this repository's tests and screenshots are invented. `brief.md` has more on this.

## Running it

It needs to be served over HTTP, not opened as a file (browsers will not load its modules or its offline cache from `file://`).

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Putting it on an iPad

The iPad needs to reach it at an HTTPS address once. After that it works with no connection.

1. Host the folder on any static host. This repository includes a workflow for GitHub Pages: in the repository's Settings, Pages, set Source to "GitHub Actions", then run "Publish to GitHub Pages" from the Actions tab. (Pages on a private repository needs a paid GitHub plan; on a free plan the repository has to be public.)
2. Open the address in Safari on the iPad.
3. Share, then "Add to Home Screen". It opens full screen from its own icon.

The workflow publishes only the files the app serves (`index.html`, `sw.js`, `manifest.webmanifest`, `css/`, `js/`, `vendor/`, `icons/`).

## Tests

```bash
npm test
```

runs the unit tests for the statistics and checks the offline file list (Node 22, nothing to install).

```bash
npm install --no-save playwright
```

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

drives the app in headless Chromium: setup, recording, editing, the report, exports, the Library, importing an old file, reloading, and running with no connection.

Both run on every pull request (`.github/workflows/ci.yml`).

## How it is put together

| File | What it holds |
|---|---|
| `index.html`, `css/app.css` | The page shell and styles (light and dark) |
| `js/core.js` | Constants, seat layouts, storage, the Library and groups |
| `js/stats.js` | The figures: balance, hand-overs, observations, topics, feedback, trends. No browser code, so it runs under Node |
| `js/charts.js` | The ECharts charts |
| `js/pages.js` | The map, report, Library and present view as HTML |
| `js/app.js` | Everything interactive |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline use and the home-screen icon |
| `vendor/echarts.min.js` | Apache ECharts 5.5.1 (Apache License 2.0) |

**When you change any served file, change `VERSION` in `sw.js`.** That is what tells a device to fetch the new copy. `npm test` fails if a served file is missing from the offline list.

Balance is 100% minus the Gini coefficient of the students' contribution counts, so 100% means everyone contributed equally. "Talk" time for a person is approximate: the time from each of their contributions until the next tap.

## Where it came from

Talkography started as a prototype on TST's ProductionSite (`prototypes/talkography/`, intake issue 1097 there). That copy is a single file and is unchanged. This repository is the standalone version, with the Library, groups, the teacher seat, topics, feedback slips, trends and offline use added.
