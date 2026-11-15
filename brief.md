# Talkography

**Slug:** talkography    **Tier:** P    **Home:** its own repository (`TSTPeter/talkography`)
**Requested by:** Peter Fotheringham    **Will look after it:** Peter Fotheringham (to confirm)    **Date:** 2026-11-15

This carries over the brief from the ProductionSite prototype (`prototypes/talkography/`, intake issue 1097 in the TST ProductionSite repository, dated 2026-11-09) and records what changed when it became a project of its own.

## What and why
An iPad web app for recording a seminar-style discussion (the Harkness method) as it happens. The observer sets the number of people, drags their names into place to match the room, and taps whoever is speaking. Each tap draws a line from the previous speaker, so the map of the conversation builds up live, and a bar under the map marks what kind of contribution it was.

It replaces recording a Harkness discussion on paper. The idea started with rudimentary voice recognition; that was dropped in favour of touch, which is quicker, more reliable and sends nothing anywhere.

Added in the standalone version:

- A Library on the device: every discussion is kept until deleted, with backup to a file and restore.
- Groups (a saved set of names and seats) and trends across a group's discussions.
- An optional teacher seat, so student talk and student-to-student hand-overs can be reported.
- Topic markers, starred contributions with notes, and an editable log.
- Feedback slips per student, a present view for the shared screen, layout presets, a planned length, renamable types.
- Offline use as an installed web app.

- **Outcomes:** unknown, Peter to confirm (what should be different once it exists).
- **Who will use it:** teachers or facilitators observing a discussion. Whether that is TST's own sessions, schools or a client is to confirm.

## How we'll know it worked
Unknown, Peter to confirm.

## Data
- **About people:** none in this repository. It ships with invented placeholder names (Fox, Owl, Hare and so on), and the tests use invented names. An observer can type real first names, which are then stored in that device's browser and in any file they export.
- **Least needed:** first names or monikers. No surnames, no other details, no audio.
- **Who is controller:** not applicable while the data is synthetic. Used with a school's or a client's people, it would be the school or client.
- **Kept for:** this is the main change from the prototype. The prototype kept only the current discussion. This version keeps every discussion on the device until the observer deletes it (one at a time, by group, or "Delete everything on this device"), or clears the browser's website data. Nothing is kept anywhere else.
- **Outside services that see it:** none. The chart library (Apache ECharts 5.5.1, Apache License 2.0) is in `vendor/`, the page carries no tracking, and the end-to-end test fails if any request leaves the device.
- **High-risk categories:** none in this repository. Used for real in schools it would record named children over time (the Library and the trends are a record of each child's participation), and the feedback slips are written about individual children.

## Decision
Tier P: synthetic data only, for trying the idea. It uses no database, no server function and no outside service.

Before it is used for real with named people it needs: an owner and a measure (above), a decision on whose data it is, a privacy notice, a retention period, and, for schools, a DPIA, because it would hold children's names and a running record of their participation. If it is to be a TST tool in real use, that goes through TST's promotion process first.

## Open questions
- What should be different once it exists, and how will we know it worked? (Peter)
- Who is it for first: TST sessions, schools, or a client? (Peter)
- Will Peter look after it, including when he moves on to other work? (Peter)
- Should the repository be public (free GitHub Pages hosting) or private? (Peter)
