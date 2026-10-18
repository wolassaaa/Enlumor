# Wave A aggregate review — 7b87bdb..85e50d8

## Verdict

**NEEDS FIXES / offline closeout not yet approved.** Task 1's bounded current-block follow-up and Task 2's manual-control cancellation are functionally consistent after the retained-selection popover correction. No additional correctness/security/cache-preservation blocker was found. The current packaged candidate fails an existing dense-ink performance gate twice, so local readiness is not complete. **Real DeepSeek acceptance remains NOT EXECUTED / NOT PASSED.** No publication, Surfing B, shared-foundation expansion, or frontend rewrite follows from this review.

Reviewed worktree: `D:/codex project/Enlumor/.worktrees/v04-wave-ab`.

## Findings

### Critical

None identified.

### Important

**[P2] Resolve the reproduced dense-ink mutation budget failure before approving the aggregate candidate.**

- Location: `D:/codex project/Enlumor/.worktrees/v04-wave-ab/tests/e2e/dense-ink.spec.ts:21-25`; investigate the changed notification wiring at `D:/codex project/Enlumor/.worktrees/v04-wave-ab/src/renderer/main.tsx:305` and its interaction with the existing annotation list at lines 308-310.
- Raw `evidence/v051-wave-a/FINAL_EXE_E2E.txt` records `136 passed (6.1m)` / `1 failed`: the 1000 x 256 point erase/save/undo case reports `Expected: <= 50`, `Received: 52` for `mutationWorstLongTaskMs`.
- Raw `evidence/v051-wave-a/DENSE_DIAGNOSTIC.txt` reproduces the same failure with `2 passed (10.4s)` / `1 failed`, `Received: 54`. The diagnostic's other measured values remain within their original thresholds (scroll p95 13.8 ms, pointer p95 2.4 ms, frame p95 9.3 ms, save 1.4 ms, erase/undo 389 ms). Those successes do not override the failed mutation assertion.
- The dense fixture never opens Cruise. Nevertheless the newly added annotation `onClickCapture` always increments App-level `cruiseTakeover`, including erase-tool and undo clicks. This is a concrete unnecessary state update with Cruise closed and a focused investigation target. **Its causal contribution to the 52/54 ms task has not been established**: existing handlers also update App state, and React may batch those updates. The regression must not be described as conclusively attributable to an extra render without measurement.
- Required disposition: retain both failures; investigate/fix the smallest demonstrated cause while keeping the <=50 ms threshold, existing viewport/source/cache assertions, and active-Cruise cancellation intact. A closed-Cruise no-op notification is a narrow candidate, not proof of a fix. Recheck the targeted dense case and then the final built candidate suite under controller ownership. Do not average away the failure or substitute the historical pre-correction 133/133 result.

### Minor

No additional actionable product-code finding. Existing SQLite experimental, NO_COLOR/FORCE_COLOR, Vite chunk-size, line-ending and electron-builder scheduler advisories remain known evidence, not newly introduced dependencies or a pristine-build claim.

## Aggregate correctness and security checks

| Area | Code-backed assessment |
| --- | --- |
| Main input bounds | `src/main/cruise-requests.ts:11-15` rejects malformed/null/array/non-object followUp, non-string/blank/>1000 question and non-string/>8192 previousAnswer before verification or generation. Inclusive limits are exercised in the actual request tests. Validation precedes replacement of the active request. |
| Current block / source verification | Existing block quote bound 1200 and geometry validation remain. The focused outside-diff IPC check at `src/main/index.ts:52-70` confirms sender/main-frame filtering, workspace-verified document/fingerprint/page checks and `verify-block` before generation; no follow-up bypass was added. |
| Outbound payload | The normal branch still serializes exactly `{blockId,text}`. The follow-up branch explicitly serializes only current `{blockId,text,question,previousAnswer?}`. It does not enumerate extra input properties, other pages, persistent annotations, or previous follow-up messages. The prompt distinguishes prior model interpretation from original evidence and question data from operational instructions. This is prompt guidance, not an assertion that models can never be influenced by text. |
| Request ownership / cancellation | Both routes share one main active controller and current-job guard. Renderer followJob checks request ID, reader, epoch, block, profile and document; ownership is cleared synchronously before cancellation IPC. Late success/error/delta are ignored after a terminal event or invalidation. Context changes and pause/settings/background/unmount cancel via the same mechanism. |
| Retry / previousAnswer | Retry resets follow-up output, preserves the question after cancellation/error, and requires an explicit action. Previous answer is selected only from the current ordinary completed cache entry matching displayed normal text, with error excluded and a slice to 8192. Failed partials and earlier follow-up answers are not used. |
| Cache / persistence independence | Follow-up state is component-session-only. `CruisePanel` persistence includes ordinary `state.results`, not follow-up state. The unchanged reducer accepts text only for its own active ordinary request ID; follow-up events therefore do not populate ordinary results. Existing finite ReadingCommand and session schema remain unchanged. |
| Manual control | Nonempty selection, toolbar/search/layout/divider/sidebar/annotation and now retained-selection popover actions reach existing takeover. The four corrective tests retain selection before starting the request and inject late request-ID events after the actual floating action, covering the originally missed sequence rather than relying on an earlier selection cancellation. |
| Original PDF / annotations / user database | Added fixtures use generated PDFs, temporary independent userData and localhost responses; they compare source SHA256 and ordinary session/annotation state, and the popover fixtures permit only the intended explicit user annotation. No new source-writing, annotation-writing, migration or personal-profile path is introduced by the product diff. These fixture checks do not claim to have inspected the user's personal database. |
| Scope | Four changed production files: cruise-requests.ts, CruisePanel.tsx, main.tsx, style.css. No dependency/protocol/schema/general platform rewrite, external retrieval, auto-resume, or autonomous service request was introduced. |

## Focused rollback audit

Inspected `scripts/check-v051-wave-a-rollback.mjs`, `evidence/v051-wave-a/originals.json`, `ROLLBACK.sh`, `ROLLBACK_RUN.txt`, the current source change list and the manifest files themselves. No rollback/build/app run was initiated by this reviewer.

- The manifest contains **32 entries: 30 source files plus 2 tests**, rather than 32 production-source files. Read-only SHA256 inspection found **0 snapshot/manifest mismatches**.
- The actual source delta against 7b87bdb contains only four M paths, all covered by originals: main/cruise-requests.ts, renderer/CruisePanel.tsx, renderer/main.tsx and renderer/style.css. The current `git status --short -- src` was empty. There are no current added/untracked source files being silently omitted. The script rejects unsupported change kinds and checks coverage of every modified source path.
- Restoration occurs in a newly generated `.cache/v051-wave-a-rollback/run-*` copy. Resolved original destinations must remain below that copy; added-source deletion, if needed, is restricted below the copy's src directory. Snapshot hashes are checked before copying and restored bytes immediately afterward. No recursive deletion or move occurs. The checked-in working source remains the modified candidate.
- The wrapper changes to the worktree root and invokes the Node verifier. The verifier copies source/python/package/index into the isolated tree, restores snapshots, compiles main and renderer there, creates a generated PDF and launches with a copy-local `--user-data-dir`. It does not use or restore a personal user database or mutate an original PDF.
- The recorded literal result is `ROLLBACK: SOURCE_COVERAGE=PASS; ORIGINAL_HASHES=PASS; PDF_READ=PASS; FOLLOWUP_ABSENT=YES; MANUAL_RETAINED=YES; LIVE_SOURCE_UNCHANGED=YES`. Its assertions genuinely read the generated PDF, locate original text, require the new follow-up input to be absent, require the old advance-mode selector to be absent, and compare all manifest-listed live target hashes against their pre-run values.
- Interpret `MANUAL_RETAINED=YES` narrowly: this script asserts absence of the advance-mode selector; it does **not itself test an old auto session transitioning to paused, persistence/restart, or zero provider requests**. Those behaviors belong to the separately retained session/Electron tests. The rollback evidence should not be advertised as testing more than its actual assertions.
- This is an isolated source-behavior rollback verification, not a full repository/documents/history rollback. Current source coverage and path guards are sufficient for this four-file candidate. Parent retains ownership of the final four-artifact verification, exact execution/exit accounting, and rerunning rollback after any corrective source change.

## Evidence and review boundaries

Read the closeout plan; aggregate-review.diff; task-1 report/review; task-2 report/review/rereview; progress ledger; actual changed production modules; relevant request and Electron test additions; raw final package/full-EXE/dense logs and selected task evidence. The task-1 request GREEN log records 24/24 and exit 0; task-2 corrective unit log records 152/152 and exit 0; corrective popover log records 4/4 and exit 0. The original popover review was a real P2 and its scoped rereview correctly marks it addressed; that scoped PASS did not certify the later aggregate performance gate.

Concrete outside-diff checks were limited to the existing IPC verification boundary, reducer/ReadingCommand ownership, dense-test workload and annotation commit/list path, and parent rollback script/manifest assertions. No general recrawl, test, build, app/UI session, credentials, real provider request, source edit, Git mutation, or additional agent was performed. The frontend review skill's referenced checklist directory was not present; the actual code and supplied acceptance requirements were used. **Only this report was created.**

## Readiness / gates

1. Task 1 and corrected Task 2 functional implementation: no additional blocker found in this aggregate review.
2. Aggregate offline readiness: **NOT APPROVED**, pending the reproduced dense mutation failure correction and final candidate suite/performance/local-paper/four-artifact closeout evidence. Preserve startup median <=1500 ms, frame p95 <=34 ms, save p95 <=20 ms, body canvases <=30 and thumbnails <=8; do not relax the separate existing mutation <=50 ms assertion.
3. Real DeepSeek connection, exact model ID, real paper explanation, current-block follow-up, pause/resume, disconnect/manual retry and restart: **NOT EXECUTED**. Offline passes alone never authorize publication or moving to Surfing/UI work.