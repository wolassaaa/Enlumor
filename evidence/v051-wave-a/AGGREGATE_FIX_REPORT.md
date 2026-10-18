# Aggregate P2 correction — closed-Cruise notification work

## Result and handoff

- Worktree: `D:/codex project/Enlumor/.worktrees/v04-wave-ab`; base `85e50d8f3726ce6da9c2b5a331d0a271a3c512ff`.
- Correction commit: **`2165ece9823525addf98727d0e60900400debfc8`**, `perf: skip Cruise takeover updates while panel is closed`.
- Exactly two committed files: `src/renderer/main.tsx` and `tests/cruise-takeover.test.ts` (70 insertions / 12 deletions). No dependency, schema, protocol, PDF reader, persistence, stylesheet, or UI rewrite.
- Existing strict dense gate passed locally for all three counts; full unit passed 155/155; all **23** open-Cruise manual-control/popover late-event cases passed. These are developer-build results, not a new packaged/full-suite acceptance claim.
- Foreground Electron **UI lease released** after the 23-case run; no further foreground tests or builds planned by this implementer. Controller owns scoped rereview, final candidate rebuild/full 137-case suite and refreshed parent four-artifact/isolated rollback verification.
- Real DeepSeek acceptance remains **NOT EXECUTED**. No release, push, real service request, credential read or additional agent was performed.

## Investigation and cause confidence

The original evidence remains intact: `evidence/v051-wave-a/FINAL_EXE_E2E.txt` records 136 pass / 1 fail with dense mutation 52 ms, and `DENSE_DIAGNOSTIC.txt` records 2 pass / 1 fail with 54 ms against the unchanged <=50 ms assertion. The historical 133-case result is not the corrected candidate.

One focused pre-fix CPU profile was run against the existing local 85e50d8 build. **It passed**, mutationWorstLongTaskMs=0 and eraseUndoMs=404; its filename `TASK2-perf-profile-RED.txt` denotes pre-fix stage, not a fabricated failed performance result. The 657.898 ms profile contains 360 samples: React synchronous work sampled 31.513 ms inclusive, scheduler work 16.894 ms, reader setMarks 14.304 ms, unattributed browser/native `(program)` 361.310 ms, GC 9.485 ms. Those inclusive samples are neither individual long-task durations nor proof of an extra render. Raw CPU profile and derived summary are retained.

Code tracing confirmed all annotation capture clicks incremented App state with Cruise closed; toolbar/sidebar/popover/selection notifications had the same unconditional update. The annotation handlers also set parts/drawing/busy state, so React batching can combine work. **Attribution of the original 52/54 ms task specifically to a separate takeover render remains unproven.** The focused profile's pre-fix PASS also demonstrates timing variability; it is not legitimate to claim the correction alone explains the difference.

The smallest correction removes this concrete unnecessary state enqueue rather than speculatively refactoring PDF rendering/reconciliation: every existing notification uses `notifyCruiseTakeover()`, which calls the existing setter only when `cruiseOpenRef.current` is true. The ref tracks current panel state because PdfReader's selection callback is installed once and otherwise captures initial closed state. Nonempty selection remains required; empty/programmatic selection callbacks do not notify. Open-Cruise ownership/cancellation and all existing capture boundaries remain intact.

Confidence is high in the **closed-panel no-op property**: a deterministic test drives the actual App JSX capture handlers and real once-installed selection callback through mocked hooks, without production instrumentation. Before the correction four closed-panel captures scheduled four state calls and selection incorrectly incremented; after correction those calls disappear, open captures still increment, and the initially installed selection callback observes later open/close state. Confidence that this alone eliminates every dense timing outlier is limited; the controller's unchanged final packaged gate remains authoritative.

## Exact execution evidence

All commands used cwd `D:/codex project/Enlumor/.worktrees/v04-wave-ab`. Electron inputs were generated PDFs, independent temporary userData and (for Cruise controls) localhost SSE fixtures, never the real service. All listed raw text logs end with literal `EXIT: <status>`.

| Stage | Exact command / environment | Literal observed result | Exit |
| --- | --- | --- | --- |
| Pre-fix focused profile | `$env:ENLUMOR_PROFILE_INK='1'; $env:ENLUMOR_EVIDENCE_DIR='evidence/v051-wave-a/TASK2-perf-profile-RED'; Remove-Item Env:ENLUMOR_TEST_APP -ErrorAction SilentlyContinue; npx playwright test tests/e2e/dense-ink.spec.ts -g 'dense 1000'` | `1 passed (6.2s)`; dense1000 scroll12.700000017881393, pointer2.5999999940395355, frame8.899999976158142, save1, eraseUndo404, mutation0 ms | 0 |
| Notification RED, before production edit | `npx vitest run tests/cruise-takeover.test.ts` | `Tests  2 failed \| 1 passed (3)`; closed capture expected `[]`, received four function calls; closed selection expected `0`, received `1` | 1 |
| Same notification GREEN | `npx vitest run tests/cruise-takeover.test.ts` | `Test Files  1 passed (1)`; `Tests  3 passed (3)` | 0 |
| Corrected developer build | `npm run build` | `✓ 36 modules transformed.`; `✓ built in 344ms` | 0 |
| Existing strict dense cases | `Remove-Item Env:ENLUMOR_PROFILE_INK -ErrorAction SilentlyContinue; Remove-Item Env:ENLUMOR_TEST_APP -ErrorAction SilentlyContinue; $env:ENLUMOR_EVIDENCE_DIR='evidence/v051-wave-a/TASK2-perf-dense-GREEN'; npx playwright test tests/e2e/dense-ink.spec.ts` | `3 passed (10.7s)`; counts30/300/1000 mutationWorstLongTaskMs all `0`; dense1000 eraseUndo377 ms | 0 |
| All open-Cruise control guards | `$env:ENLUMOR_EVIDENCE_DIR='evidence/v051-wave-a/TASK2-perf-controls'; Remove-Item Env:ENLUMOR_TEST_APP -ErrorAction SilentlyContinue; npx playwright test tests/e2e/cruise.spec.ts -g 'follow-up manual\|retained-selection popover'` | `23 passed (58.2s)`; 19 manual controls plus all four retained-selection actions with old HTTP/IPC delta/done/error | 0 |
| Full unit | `npm test` | `Test Files  22 passed (22)`; `Tests  155 passed (155)` | 0 |
| Whitespace | `git diff --check -- src/renderer/main.tsx tests/cruise-takeover.test.ts` | no diagnostics | 0 |
| Exact-path commit | `git -c user.name=Codex -c user.email=codex@local commit --only -m "perf: skip Cruise takeover updates while panel is closed" -- src/renderer/main.tsx tests/cruise-takeover.test.ts` (after exact-path `git add`) | `[feat/v04-wave-ab 2165ece] perf: skip Cruise takeover updates while panel is closed`; `2 files changed, 70 insertions(+), 12 deletions(-)` | 0 |

Corrected dense1000 JSON literally records scrollP95Ms=12.5, pointerP95Ms=2.699999988079071, frameP95Ms=9.200000017881393, saveMs=0.800000011920929, eraseUndoMs=377, mutationLongTasks=0, mutationWorstLongTaskMs=0, pointer-loop longTasks=0. A zero long-task metric means no observed >=50 ms task, not zero mutation work. The original <=50, pointer<=8, frame/scroll<=34, save<=20, erase/undo<=1000 assertions, unchanged ink-node identity reuse, final sidebar source visibility/focus/Enter/flash checks all remain enabled and passed. No thresholds or tests were relaxed.

## Retained files and hashes

Evidence root: `D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/v051-wave-a/`.

- `TASK2-perf-profile-RED.txt`, `TASK2-perf-profile-RED/dense-1000.json`, `TASK2-perf-profile-RED/profile-1000.json`, `TASK2-perf-profile-summary.txt`.
- `TASK2-perf-notify-RED.txt`, `TASK2-perf-notify-GREEN.txt`, `TASK2-perf-build.txt`, `TASK2-perf-dense-GREEN.txt`, `TASK2-perf-dense-GREEN/dense-{30,300,1000}.json`.
- `TASK2-perf-controls-GREEN.txt`, `TASK2-perf-unit-FULL.txt`, `TASK2-perf-diff-check.txt`, `TASK2-perf-commit.txt`.
- Existing Cruise test code hardcodes the 19 `TASK2-manual-*.png` screenshot paths; this run regenerated those existing untracked images. No screenshot assertion was removed. Parent was informed; those image writes are not described as untouched original evidence.
- Parent-owned state/checklist/BACKLOG/.gitattributes, existing aggregate review, originals manifest/snapshots, MODIFIED_FILE/DIFF/VERIFICATION/ROLLBACK artifacts and rollback script were not edited. Existing parent working changes were neither staged nor restored. Parent retains all four-artifact/rollback responsibility.

Byte SHA256 (original read directly from Git, modified working source left changed):

```text
85e50d8 src/renderer/main.tsx 5733849a087e5a4bb72c726747da93479cbb345130f054677243441427715ba8
2165ece src/renderer/main.tsx d629d0ef629929a11bd6ca336a21eef34504dd0b1238a4c93685600c846a91ff
2165ece tests/cruise-takeover.test.ts 49ff6351eb950a100a61e989288c1fb186b40ce1cdae373a3c95a9fb74e16174
```

The report, raw logs, JSON results, profile JSON and both committed files were reopened after writing. Known SQLite experimental, NO_COLOR/FORCE_COLOR and Vite chunk advisories remain visible in raw logs; they were not converted into failures or omitted from a pristine-build claim.
