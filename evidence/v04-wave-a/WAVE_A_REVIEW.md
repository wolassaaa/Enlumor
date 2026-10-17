# Wave A aggregate review (A1 + A2)

## Final aggregate verdict (db77821 plus scoped rollback fix)
- Product spec compliance and code quality: **PASS for automated implementation**. No actionable product findings identified across A1 + A2.
- Aggregate spec/quality review gate: **PASS**. The one Important/P2 rollback-completeness finding was resolved and independently checked in the single scoped re-review below. No outstanding actionable findings.
- Full A1/Wave A completion: **HELD**. Real DeepSeek acceptance remains **NOT EXECUTED**; local-paper reading and mock-provider tests do not clear the live-service or packaged live acceptance gate. Wave B remains held.

## Resolved finding (initial review record)
### [P2] Restore every changed existing product file in the rollback copy
Location: `D:/codex project/Enlumor/.worktrees/v04-wave-ab/scripts/check-wave-a-rollback.mjs:15-18`; supporting manifest `D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/v04-wave-a/originals.json`.
The script copies current `src`, restores only manifest entries, removes the new dispatcher, and builds this as the original application. The manifest omits changed `src/renderer/pdf-reader.ts`, so the rollback copy keeps A2 readiness/geometry validation. Its successful auto selector proves one restored behavior, not restoration of the original application. This makes the current original-app rollback completion evidence incomplete.

Read-only reproduction against the already-created copy (no build or app launch):
- `git diff --no-index -- src/renderer/pdf-reader.ts .cache/wave-a-rollback/run-Ov6ilC/src/renderer/pdf-reader.ts`: no diff, exit 0.
- `git rev-parse 'a7ff6aa:src/renderer/pdf-reader.ts'`: `3626e80858ecf024982bc98311ebf8f70630b7bc`, exit 0.
- `git hash-object --path=src/renderer/pdf-reader.ts .cache/wave-a-rollback/run-Ov6ilC/src/renderer/pdf-reader.ts`: `c5bb08768552fa1f7db7b1caf0685fdef7b14602`, exit 0.
- Copy lines 148/150 retain `!this.ready`, `!this.viewer.pdfDocument`, and `validateAnnotation(mark,this.active.pageCount)` from A2.

Suggested fix: add the exact baseline reader snapshot and hash; make rollback fail if a changed existing product source is absent from the manifest or a newly added source survives restoration. Rerun bounded-copy rollback and refresh its evidence. Preserve the modified live source. Parent has acknowledged this finding and is preparing the scoped fix.

## Aggregate product checks
- `src/main/cruise-requests.ts:13-22`: non-whitespace delivered output is required before success. Existing current-job and aborted-job checks suppress both late deltas and completion; finalization only clears its own job. A1 introduces no protocol/platform changes.
- `src/renderer/CruisePanel.tsx:10-18,38-52`: no automatic advancement timer/selector/countdown remains. Explicit start/continue/explain/skip operations retain their prior user-triggered meaning. Pause, background, manual takeover and unmount preserve cancellation/epoch behavior; persistence acknowledgement/retry remains.
- `src/main/cruise-sessions.ts:7-14` and `src/shared/cruise.ts:10`: both load and save normalize old auto records to manual/paused, including auto-finished; results and original model metadata remain. Manual-finished stays finished. Existing SQLite authority, validation and annotation storage are unchanged; no destructive migration is introduced.
- `src/renderer/reading-commands.ts:1-11` and `src/renderer/pdf-reader.ts:147-150`: finite typed/runtime switch dispatches only existing reader-bound location, temporary-focus clear and pause paths. Actual active document/fingerprint/readiness/page/geometry guards precede focus. No arbitrary IPC, model tool execution or annotation framework is introduced.
- Tests exercise the real request manager/reducer/SQLite/reader methods. The 21,050 ms foreground hold checks stable quote and ready status with one request; a separate actual cover window verifies blur pause. Old auto rows are directly seeded after exit and retain nonempty annotations/results on restart. Failure/retry checks assert no incomplete cache, one recovered answer, unchanged annotations/PDF hash and no retry by itself.
- `tests/e2e/native-apis.spec.ts:1-4` replaces the missing benchmark dependency with two real generated pages while retaining native local protocol calls and page-1-present/page-2-absent payload assertions. No hidden weakening was found.

## Additional tooling and evidence
- `scripts/check-wave-a-paper.mjs` opens an explicit real PDF in a temporary profile, locates the saved actual block and independently invokes PyMuPDF verify-block; it checks original SHA256, manual mode and observed browser-network requests. The inspected JSON records 11 pages and the title block "Attention Is All You Need". This is genuine title-anchor reader evidence, not full-paper or live-provider acceptance. Its Chromium webRequest counter is not a universal Node-fetch audit; this run has no configured model profile and is explicitly marked NOT_EXECUTED for API acceptance.
- The rollback script creates a fresh child of `.cache/wave-a-rollback`, verifies resolved restore targets stay within that child, hashes originals/restored targets, and checks live manifest sources remain unchanged. Its defect is missing source coverage, not an unbounded restoration target.
- Reports record A1 41 focused/121 full units plus 12 Electron; A2 139 units/build/typecheck plus 10 Electron passing. Reviewed these as recorded evidence, not reviewer reruns. Existing color/SQLite/Vite warnings are not new findings.

## Review method / boundaries
Read the approved baseline, both briefs/reports and task reviews, supplied aggregate filtered diff (a7ff6aa..db77821), and named implementation/tests/scripts/evidence. No source edits, fullsuite reruns, UI launches, rebuilds, provider calls or subagents were used. Only this report was written. The frontend-review skill's referenced checklist files are absent in the installed skill; review used its available instructions and the concrete task/spec contracts. Parent candidate packaging is independent work in progress and is not asserted completed here.


## Single scoped re-review: P2 resolved
Reviewed `wave-a-rollback-fix.diff`, the added original snapshot, negative guard evidence, completed rollback log, and the resulting restored copy. No second broad product review, test suite, build or UI launch was performed.
- `scripts/check-wave-a-rollback.mjs:12-15` now enumerates committed `src` changes from the pinned baseline to HEAD. It fails for missing modified-source originals, unknown added-source removals, or unsupported statuses before building the copy. This covers all six current Wave A product source changes; the dispatcher is removed explicitly.
- Manifest now includes `src/renderer/pdf-reader.ts`. Direct SHA256 check matches `a6499ee8206f8416b97d010fa573be85cb3773c60bb812e9cff570dcc90c5114`.
- Both the snapshot and actual new `.cache/wave-a-rollback/run-YbzVso/src/renderer/pdf-reader.ts` have normalized Git blob hash `3626e80858ecf024982bc98311ebf8f70630b7bc`, equal to baseline a7ff6aa. Live reader remains modified (`c5bb08768552fa1f7db7b1caf0685fdef7b14602`); the new dispatcher is absent from the restored copy.
- `ROLLBACK_GUARD_RED.txt` records deliberate omitted-reader rejection: `Error: Missing source original: src/renderer/pdf-reader.ts`, `EXIT=1`. The negative case therefore catches the reviewed defect rather than merely asserting a successful selector.
- `ROLLBACK.log` records actual rebuilt-copy execution: `ROLLBACK: SOURCE_COVERAGE=PASS; ORIGINAL_HASHES=PASS; ORIGINAL_APP_START=PASS; PDF_READ=PASS; AUTO_OPTION_RESTORED=YES; LIVE_SOURCE_UNCHANGED=YES`. Parent reports exit 0. The earlier incomplete-manifest run is retained separately, not overwritten as valid evidence.
- Verdict: **P2 closed; aggregate automated implementation/evidence review PASS**, with no remaining actionable finding from this review.

### Additional requested launcher check
`D:/codex project/Enlumor/.worktrees/v04-wave-ab/Wave A 验收.cmd` sets its working directory from `%~dp0`, quotes the candidate EXE and explicit `--user-data-dir`, and uses the required empty `start` title. The referenced `.cache/v04-wave-a-package/win-unpacked/Enlumor.exe` exists. The profile resolves to this worktree's `.cache/wave-a-live-userdata`, not the ordinary user profile. The missing-EXE branch exits 1. Static path/argument inspection: **PASS**; reviewer did not launch it.

### Gate distinction remains unchanged
The parent's separately reported candidate unit/Python/packaged suites and package checks are not live DeepSeek acceptance and were not rerun or independently re-audited here. Real provider acceptance and packaged live acceptance remain **NOT EXECUTED**, so full Wave A/release and Wave B remain held despite this aggregate review PASS.
