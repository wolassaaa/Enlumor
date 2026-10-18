# Wave A aggregate final scoped rereview — 85e50d8..2165ece

## Verdict

**PASS — prior aggregate P2 ADDRESSED; no new fix-induced correctness or code-quality blocker found.** This is exactly one fix-only rereview, not a second broad aggregate review. The corrected source and supplied final packaged evidence satisfy the scoped offline functional/performance gate. Parent-owned final four-artifact, current-paper, and isolated rollback accounting remain separate closeout responsibilities; this report does not claim to have executed them.

**Real DeepSeek acceptance remains NOT EXECUTED / NOT PASSED.** This offline review does not authorize release/publication, Surfing, shared-foundation expansion, or a UI rewrite.

Reviewed worktree: `D:/codex project/Enlumor/.worktrees/v04-wave-ab`.
Verified HEAD: `2165ece9823525addf98727d0e60900400debfc8`.

## Prior findings disposition

| Prior finding | Disposition | Basis |
| --- | --- | --- |
| Important P2: reproduced dense1000 mutation 52/54 ms exceeded unchanged <=50 ms gate | **ADDRESSED** | The concrete closed-Cruise state enqueue is removed; deterministic actual-handler tests distinguish closed/open state and the once-installed callback. Targeted dense run passes 3/3, open-Cruise controls pass 23/23, and the final packaged candidate passes 137/137 including all dense cases and manual/popover cancellation cases. Original failures remain preserved rather than averaged or discarded. |
| Critical | None to disposition | Prior aggregate review recorded none. |
| Minor | None to disposition | Prior aggregate review recorded no additional actionable product-code finding. Existing tool/build advisories remain evidence. |

The older retained-selection-popover P2 was already addressed before this fix range. This correction retains its capture boundary and all four final packaged cases pass; it is not reopened as a new broad review.

## Fix-only code/spec assessment

- Git confirms exactly two committed paths in this range: `src/renderer/main.tsx` and new `tests/cruise-takeover.test.ts`, 70 insertions / 12 deletions. Working source and the test show no pending delta against HEAD. The supplied review diff agrees with the actual commit diff.
- `src/renderer/main.tsx:29-31` adds a stable ref object containing the current Cruise-open state and one notification function. Every former takeover setter site now calls that function. It invokes the existing functional increment only while Cruise is open. Other event handlers, state updates, annotation mutations, and navigation actions are retained.
- `src/renderer/main.tsx:93` still filters empty selections. The once-installed PdfReader callback retains its initial notification closure, but that closure reads the stable ref updated on subsequent App renders, avoiding the stale-initial-false failure a direct captured boolean guard would introduce.
- Capture boundaries remain on topbar/library/toolbar/annotation/block-list/popover; explicit navigation/search/layout/divider routes remain guarded at their existing positions. The corrected popover cancellation behavior is preserved.
- No request payload, validation, ownership/cancellation implementation, ordinary cache, persistence schema, dependency, PDF rendering code, stylesheet, or protocol changed in this correction. No production profiling hooks were introduced.
- The three new tests execute real App JSX handler functions and the real reader-construction selection callback, with mocked React hooks and PdfReader. They are appropriately narrow notification tests, not a claim to simulate React scheduling or prove elapsed-time causality. Closed captures assert no state setter calls; open captures assert increments; the retained callback is checked after both open and close renders, including an empty-selection no-op. Separate actual Electron cases supply integration coverage.

**Code quality: PASS for this bounded fix. Spec compliance: PASS for closed-panel no-op with active-Cruise manual takeover retained. No new actionable issue found in the fix.**

## Raw evidence inspected

All paths below are beneath `D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/v051-wave-a/`.

| Evidence | Literal observation / interpretation |
| --- | --- |
| `PERF_FAILED_EXE_E2E.txt` | `1 failed`, `136 passed (6.1m)`; `Expected: <= 50`, `Received: 52`. This is the preserved original failing full candidate log formerly named FINAL_EXE_E2E.txt in historical reports. |
| `DENSE_DIAGNOSTIC.txt` | `1 failed`, `2 passed (10.4s)`; `Expected: <= 50`, `Received: 54`. |
| `TASK2-perf-profile-RED.txt` | `1 passed (6.2s)`, `EXIT: 0`; pre-fix mutationWorstLongTaskMs=0 and eraseUndoMs=404. RED is a stage filename, not a failed outcome. |
| `TASK2-perf-notify-RED.txt` | `Tests 2 failed \| 1 passed (3)`, `EXIT: 1`. |
| `TASK2-perf-notify-GREEN.txt` | `Test Files 1 passed (1)`; `Tests 3 passed (3)`; `EXIT: 0`. |
| `TASK2-perf-dense-GREEN.txt` | `3 passed (10.7s)`, `EXIT: 0`; all three mutationWorstLongTaskMs values are 0. |
| `TASK2-perf-controls-GREEN.txt` | `23 passed (58.2s)`, `EXIT: 0`; 19 manual-control cases and 4 retained-selection popover cases. |
| `TASK2-perf-unit-FULL.txt` | `Test Files 22 passed (22)`; `Tests 155 passed (155)`; `EXIT: 0`. |
| `FINAL_EXE_E2E.txt` | `137 passed (5.4m)`; all 23 manual/popover cases and all three dense cases are individually recorded as passing. This is the corrected final packaged run, not the preserved failed run. |
| `final/dense-1000.json` | count=1000, pointsPerStroke=256; scrollP95Ms=10.800000011920929, pointerP95Ms=2.4000000059604645, frameP95Ms=9.299999982118607, saveMs=1.199999988079071, eraseUndoMs=365, mutationLongTasks=0, mutationWorstLongTaskMs=0. Matches the final full-suite DENSE_INK line. |
| `FINAL_PACKAGE_CHECK.txt` | `PACKAGED_READER: PASS`; packaged=true; `EDGE_PDF_OPEN: PASS (visual screenshot requires inspection)`. This report makes no new visual-inspection claim. |
| `FINAL_PORTABLE_CHECK.txt` | `PORTABLE_STARTUP_SQLITE: PASS`; `PORTABLE_NO_PYTHON_OPEN_EXPORT: PASS`. |
| `FINAL_TEXT_BENCH.txt` | Startup median 444.3044 ms; portable median 378.6182 ms; frame p95 11.100000023841858 ms; save p95 5.9000000059604645 ms; body/thumbnail canvases 8/4. |
| `FINAL_SCAN_BENCH.txt` | Startup median 473.2576 ms; portable median 360.9178 ms; frame p95 13.5 ms; save p95 5.4000000059604645 ms; body/thumbnail canvases 8/3. |
| `FINAL_PERFORMANCE_GATE.txt` | `final-text: ORIGINAL_PERFORMANCE_BUDGET=PASS`; `final-scanned: ORIGINAL_PERFORMANCE_BUDGET=PASS`. |

The supplied parent execution evidence reports exit 0 for the final packaged suite. The final raw suite/package/benchmark text files inspected here do not themselves embed EXIT markers; their literal PASS/results and parent-reported process status are distinguished rather than fabricating raw lines. Exact final command/exit accounting belongs in the parent's refreshed verification ledger.

`tests/e2e/dense-ink.spec.ts` has no delta in the fix range. The actual assertions still require mutation <=50 ms, pointer <=8 ms, frame/scroll <=34 ms, save <=20 ms, erase/undo <=1000 ms, no pointer-loop long tasks, retained ink-node identity, final annotation-source visibility/focus/Enter/flash and stroke count. No threshold or functional assertion was relaxed. The original startup median <=1500 ms, frame p95 <=34 ms, save p95 <=20 ms, body canvases <=30 and thumbnails <=8 also remain satisfied by the supplied final measurements.

Zero mutationWorstLongTaskMs means no observed long task in that instrumented interval, **not zero mutation work**. The passing pre-fix profile establishes variability; the correction demonstrably removes an unnecessary state enqueue, but the specific causal contribution of that enqueue to the original 52/54 ms tasks remains unproven. The fix report accurately preserves that distinction. Passing current gates resolves this finding; it does not establish that future timing outliers are impossible.

## Source identity and review boundary

Read-only SHA256 matches the implementer report:

- `src/renderer/main.tsx`: `d629d0ef629929a11bd6ca336a21eef34504dd0b1238a4c93685600c846a91ff`.
- `tests/cruise-takeover.test.ts`: `49ff6351eb950a100a61e989288c1fb186b40ce1cdae373a3c95a9fb74e16174`.

Read the prior aggregate review, full fix report, supplied fix diff, actual commit diff, directly affected source/selection initialization, new tests, unchanged dense assertions, and relevant raw evidence above. No test rerun, build, app/UI run, provider request, credential read, source edit, Git mutation, or additional agent was performed. The frontend review skill's referenced checklist directory is absent locally; the actual code and acceptance requirements were used. **Only this report was created and reopened.**

Final decision: **aggregate P2 ADDRESSED; scoped code-quality/spec and offline functional/performance review PASS.** Parent completes or records its separate final closeout evidence. Real-provider acceptance remains a distinct unmet release gate.

