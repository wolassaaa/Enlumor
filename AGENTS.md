# Enlumor — notes for coding agents

Enlumor is a local-first PDF reading workspace: Electron + TypeScript + React, with a
Python (PyMuPDF) sidecar. Surfing is the in-app reading agent. License: AGPL-3.0-or-later.

## Where the truth is

- **Current state and next step: [docs/STATUS.md](docs/STATUS.md).** Any other doc that calls
  itself "current" is out of date; trust STATUS.md and the code on `main`.
- Build order: [docs/plans/2026-11-06-agent-system-plan.md](docs/plans/2026-11-06-agent-system-plan.md).
- Direction and what we will not do: [docs/VISION.md](docs/VISION.md).
- Problem list with file:line references: [docs/reviews/2026-11-06-system-review.md](docs/reviews/2026-11-06-system-review.md).
- Ideas only (not authorised work): [docs/BACKLOG.md](docs/BACKLOG.md).

## Commands

```
./setup.ps1                # once: .venv with PyMuPDF, npm ci, npm run build
npm run typecheck          # tsc --noEmit
npm test                   # vitest; some tests call .venv/Scripts/python.exe directly
npm run test:python        # unittest in tests/python (ENLUMOR_PYTHON overrides the interpreter)
npm run build && npm start # build and launch the app
npm run test:e2e           # Playwright + Electron; slow, takes the window focus
npm run acceptance         # REAL MODEL CALLS, costs money: ask the owner first
```

In a fresh git worktree, `node_modules` and `.venv` are missing. Install them, or link the
main checkout's copies (`New-Item -ItemType Junction`); both paths are gitignored.

## Working rules

- `git fetch` before starting. Branch from the latest `main`, one task per branch, one PR per task.
- Done means `npm run typecheck`, `npm test` and `npm run test:python` pass, and you paste the
  command output. Say plainly what you did not run.
- Real model calls only after the owner says yes. API keys live in environment variables or
  the app's encrypted store: never in files, commits, logs or command output.
- Only one Electron instance at a time on this machine. Two agents running e2e or acceptance
  at once fight over focus and spoil the measurements.
- Never use bare `git stash`; other sessions share the stash. Use a WIP commit instead.
- Product decisions (what Surfing is for, hiding Cruise, which providers to keep) belong to
  the owner. Write the options down; do not decide them in code.

## Things that will mislead you

- **Surfing and Cruise swapped roles.** The v0.5.1 product plan describes Surfing as "start
  reading without a question"; the code's Surfing is question answering, and "new Cruise" was
  later defined as the same thing. The old block-by-block Cruise is judged the wrong direction
  but still ships. Read STATUS.md, not the product plan, for who does what.
- **`src/renderer/main.tsx` is large** (one `App` with dozens of `useState`). Put new logic in
  a new module and import it. Many files use a compressed one-line style; do not add to it.
- `tests/cruise-takeover.test.ts` depends on effect order in `main.tsx`: the reader effect must
  stay first. Add new effects after it.
- While Surfing waits for an answer, scrolling, clicking, selecting text or leaving the window
  cancels the request (`notifyCruiseTakeover`). This is a known bug, locked in by tests.
- E2E specs write screenshots into `evidence/` unless `ENLUMOR_EVIDENCE_DIR` is set. Do not
  commit those changes.
- Benchmark QR codes must be drawn as one vector path; bitmaps or per-module squares do not
  decode. Decoding uses zxing-wasm, bundled, offline.
- The headline benchmark scores (6/6, 8/8, 13/14) are single runs across different code
  versions. Do not quote them as stable numbers.
- Only DeepSeek has been verified with a real key. Other providers are covered by fakes only.
