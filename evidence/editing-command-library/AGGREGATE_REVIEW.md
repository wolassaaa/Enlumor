# Aggregate review — editing command library, two-task batch

Date: 2026-10-20
Base: `261e483139562ec1b41c54cb3d7b24947c7e2c0d`
Head: `4567301740b42db5976f54225183b928f9db55b4`
Reviewed implementation: eight changed files, including Task 1 source-quad fix `5b0fd28` and Task 2 executor. This review does not reopen the earlier reading-command foundation.

## Method and evidence boundary

Read the approved two-task plan and v2 spec, progress ledger and its rulings/deferred item, Task 1 downstream interface and superseding final fix section, Task 2 report, and the combined diff in bounded chunks. Judgments below follow the actual changed code and tests, not the reports' pass labels. The eight-file changed-path list was independently checked against the requested Git range.

Also inspected the controller rollback script, shell entrypoint, ORIGINALS.json, successful rollback log and retained first-failure log. Per review instructions, no existing test/build suite was rerun, no Git state changed, no implementation file edited, and no integration launched. This report is the sole review-authored file.

## Strengths

- **Source evidence remains separate from free geometry.** Creation/replacement of anchored marks obtains quote/page/quads exclusively from validated host anchors; geometry edits cannot retarget anchored marks. Note placement validates translated vertices without rewriting source coordinates. The fixed source validator accepts either orientation of strictly convex skew quadrilaterals in PDF vertex order; path bounding rectangles remain a separate representation. Negative crop origins survive both shared validation and the SQLite tests.
- **The producer/consumer contract is consistent.** The executor uses the shared request, snapshot, environment, mark, delta and prepared-result types. It resolves the planner's history request rather than treating it as a commit. Forward/inverse contents preserve origin and source information while actual undo/redo versions are recomputed monotonically.
- **Trust and confirmation are explicit.** Model identity, source quote and approval fields are not accepted command parameters. Descriptor-based copying precedes parsing. Host confirmation binds request key, actor/session, complete context, concrete digest and before/after deltas; verification and consumption occur within the same transaction as the writes. AI undo/redo also checks original-operation and redo-branch ownership, not merely current mark provenance.
- **Replay identity is correctly distinct from preview identity.** Persistent receipt lookup precedes anchor resolution/ID allocation and live revision/abort checks. Stable replay normalization retains command/expected versions but excludes reading revision; the concrete prepared digest includes revision/dependencies/differences. Deterministic IDs therefore survive preview retries without letting old approvals authorize new differences.
- **The write boundary rejects changed plans.** Inside the synchronous transaction the executor rechecks receipts and live identity, re-reads snapshot/history, replans, compares concrete digest and page bounds, verifies approval, then writes deltas, tombstones, history, receipt and credential consumption. The eraser's collection dependencies plus replan detect new strokes; final cancellation/context checks throw through rollback. The SQLite adapter actually uses BEGIN IMMEDIATE/COMMIT/ROLLBACK, with SQL-state assertions for contention and each failed write stage.
- **Durable outcomes and targeted history are not conflated with UI state.** Lost-reply recovery consults receipts without reapplying writes; committed results preserve their original document attribution after cancellation or a document switch. Targeted histories compare current versions/tombstones, retain audit rows and original provenance, and implement the ledger's executor-owned redo branch. New edits clear only that actor/session's branch; failed cleanup rolls back.
- **Capability documentation is candid.** The matrix distinguishes all 16 parsed commands from isolated execution and production connection. Queries/no-ops/export snapshots never claim durable save; actual PDF export returns unsupported, not a fabricated path. The test host remains under tests/helpers and no production Workspace, old Annotation validator, IPC, preload or dependency is changed by this range.

## Issues

### Critical (must fix)

None found in the reviewed two-task library/test-host batch.

### Important (should fix)

None found in the reviewed two-task library/test-host batch.

### Minor (nice to have)

No new actionable finding. The ledger's already-deferred Node SQLite experimental warning and existing bundle-size warning remain deferred; the implementation does not suppress either warning or relax thresholds. This is not new evidence of product performance acceptance.

## Ledger rulings checked

1. **Synchronous Node SHA256:** code uses standard node:crypto rather than custom cryptography. This matches the explicitly Node-side library ruling; shared-file placement is not treated as a claim of renderer compatibility.
2. **Redo ownership:** undo stores its executing actor separately in redoActor; new edits clear matching redoActor branches; cross-owner AI redo requires approval. The original actor remains intact. Dedicated real-SQLite regression tests exercise both branch clearing and confirmation.
3. **Source-quad P2:** the final implementation and skew/degenerate/source-edit tests match the last Task 1 fix section. The superseded axis-aligned-source justification is not accepted as current behavior.
4. **Deferred tooling warnings:** retained explicitly above; no hidden unresolved per-task issue was discovered in the ledger.

## Controller-support rollback audit

- `scripts/check-editing-command-library-rollback.mjs` reconstructs an isolated baseline copy from the fixed base commit, then overlays byte-preserving ORIGINALS snapshots. It does not reset or delete live checkout files. `evidence/editing-command-library/ROLLBACK.sh` invokes that script from the project root with fail-fast shell settings.
- Independently read the 77-entry ORIGINALS manifest and recomputed every recorded snapshot SHA256: `ORIGINAL_COUNT=77`, `SNAPSHOT_HASH_MISMATCHES=0`.
- Independently compared all 77 reconstructed files in `.cache/editing-command-library-rollback/run-758bSR` with their manifest hashes: `RESTORED_COUNT=77`, `RESTORED_HASH_MISMATCHES=0`. The inspected restored shared directory has no added editing-library source files.
- The existing `ROLLBACK_TEST.txt` records 23 test files / 261 tests passed, `EXIT_STATUS=0`, and the literal summary `ROLLBACK: ORIGINAL_HASHES=PASS; BASELINE_261_TESTS=PASS; EDITING_LIBRARY_ABSENT_IN_COPY=YES; LIVE_MODIFIED_FILES_UNCHANGED=YES`. The script implements the live-source before/after hash check underlying that last claim. This review audited that evidence rather than rerunning the baseline suite.
- The first attempted extraction failure remains visible in `ROLLBACK_ATTEMPT1_TAR_PATH.txt`: Git Bash tar interpreted the Windows drive colon as a remote host (`tar: Cannot connect to D: resolve failed`, `EXIT_STATUS=1`). The current script selects Windows System32/tar.exe; the successful subsequent run is separately recorded.
- Interpretation: this proves isolated baseline reconstruction/exact-byte restoration and the recorded live-source isolation check. It is not an in-place production rollback, database migration recovery, or a power-loss durability exercise.

## Declined to judge

- Production Workspace/schema migration and legacy-annotation import: explicitly outside this batch; no production adapter or migration is introduced.
- Actual reader rendering, floating placement, shared human/AI UI entrypoints, and stale-receipt visual suppression: no UI integration exists here; the reviewed result attribution supports but does not implement those future effects.
- Real selected-snapshot PDF output and unsupported placement rendering: the exporter is intentionally absent and returns unsupported; fixture hash isolation is not export acceptance.
- Production receipt retention quotas, process-kill/power-loss recovery, and production host compliance with synchronous transaction/revision obligations: the temporary SQLite fixture demonstrates local transactional behavior, not the future deployed adapter's lifecycle.
- Renderer/browser compatibility of the Node-side shared modules: deliberately deferred by the explicit SHA256 ruling.
- Full product/EXE performance or release readiness: neither implemented nor tested by this batch; historical reader acceptance is not counted as new verification.

## Recommendations

Preserve the documented host obligations as acceptance criteria for the later integration batch: one storage authority, context-revision invalidation for source changes, immediate atomic commit after the synchronous callback, durable receipt retention/recovery, attribution checks before UI effects, and explicit export support. Do not register these commands in production merely because the isolated capability matrix is complete.

## Assessment

**Spec compliance within approved batch: Pass.**

**Code quality within approved batch: Pass.**

**Ready to merge within this batch: Yes.**

The shared planner and executor agree on source semantics, authorization, digests, version evolution and transaction results; the targeted tests and inspected SQL implementation substantiate those library-level claims. No new blocking or important actionable defect was found. This verdict does not authorize or claim production Workspace/UI/API/PDF integration, release, or new EXE acceptance.
