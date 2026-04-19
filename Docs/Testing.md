# Testing And Handoff

This document onboards the browser regression test framework and gives enough context for another agent/thread to continue without replaying the whole conversation.

## Current Test Shape

The app remains a no-build vanilla Node/HTML/CSS/JS project. The Playwright test framework is intentionally lightweight:

- `tests/run-playwright.js`: local test runner.
- `tests/e2e/*.spec.js`: browser specs.
- `public/app.js`: exposes `window.__ASSET_BROWSER_TEST__` as a narrow deterministic test seam.
- `test-results/`: failure screenshots, ignored by git.

The runner starts `server.js` on `http://localhost:3130` by default. It does not depend on a manually running app on port `3000`.

## Run Tests

From repo root:

```powershell
$env:NODE_PATH='C:\Users\rafan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& 'C:\Users\rafan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\run-playwright.js
```

To run against an already-running server:

```powershell
$env:ASSET_BROWSER_TEST_URL='http://localhost:3000'
$env:NODE_PATH='C:\Users\rafan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& 'C:\Users\rafan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\run-playwright.js
```

Expected current result:

```text
6 test(s) passed.
```

## Syntax Checks

Run these before or with the browser suite:

```powershell
& 'C:\Users\rafan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check server.js
& 'C:\Users\rafan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check public\app.js
& 'C:\Users\rafan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check tests\run-playwright.js
& 'C:\Users\rafan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check tests\e2e\animation-timeline.spec.js
```

## What Is Covered Now

Current coverage focuses on recent animation timeline work:

- frame thumbnails and timebar markers start at exact frame start times
- first frame starts at `0s`
- timeline zoom grows content and enables horizontal scroll
- zoom label/value stay stable at values like `2.5x`
- many frames grow the timeline instead of overlapping chips
- dense timelines keep an 8px click gap between frame chips
- paste zones fill the empty space between frame chips and select insertion points
- paused preview frame matches the green timeline cursor
- FPS inputs step in whole units
- hovering a timeline frame shows a large preview tooltip with frame number, source name, and bounds

## Failure Triage Rules

Classify every failure before editing:

- App bug: user-visible behavior is wrong, or the app logs an unexpected browser error.
- Test bug: selector/readiness is brittle, fixture/seam is invalid, or diagnostics catch expected browser noise.
- Harness bug: server lifecycle, Playwright launch, port conflict, or environment path issue.

Known first-run fixes already applied:

- Missing favicon 404 is routed to 204 by the runner.
- Synthetic timeline frames use an in-memory SVG, not `/assets/test/sheet.png`.
- The runner uses port `3130` by default so the suite owns its server.

## How To Add Tests

1. Add a spec under `tests/e2e/`.
2. Export tests as `{ name, async run({ page, assert }) { ... } }`.
3. Prefer stable user-visible assertions or `window.__ASSET_BROWSER_TEST__` readback.
4. Wait for `window.__ASSET_BROWSER_TEST__.ready` or another explicit readiness signal.
5. Avoid sleeps. Use `page.waitForFunction()` for state changes.
6. Keep screenshots as failure artifacts only unless adding visual regression intentionally.

## Test Seam Policy

Keep `window.__ASSET_BROWSER_TEST__` small and deterministic. Add only what a browser test needs to set up state or read stable outcomes. Do not expose broad mutation helpers that duplicate product logic.

Current seam methods:

- `setupTimeline(options)`: creates a synthetic animation timeline.
- `setPreviewSlot(slot)`: pauses preview and moves the timeline cursor.
- `readTimeline()`: returns timeline geometry, zoom label, FPS step, and preview index.

## Handoff Checklist

When picking this work up in a new context:

1. Read this file.
2. Read `task.md` for active checklist and future backlog. It is gitignored but maintained as the live handoff scratchpad.
3. Check `git status --short` so you know which changes are already in progress.
4. Run syntax checks.
5. Run the Playwright suite.
6. If adding coverage, start with the first unchecked backlog item in `task.md`.

## Backlog Direction

Recommended next coverage:

- grid smoke: page load, filters, pagination, empty/populated states
- recursive index smoke: `/api/index-status` and `/api/ls`
- image workspace smoke: open image, pan/zoom, center/reset, background option
- animation split smoke: deterministic grid split, click/select frames, overlay highlight
- timeline editing smoke: copy/cut/paste/remove/reorder
- persistence smoke: export/import/default autosave/template flow with temp data
