# Task 2 implementation report

## Status and exact files

Task 2 implemented and committed; ready for independent Task2Review. Commit `4567301740b42db5976f54225183b928f9db55b4` (`feat: execute mark edits with atomic receipts and targeted history`), based on Task 1 review-fix commit `5b0fd287006ce335b3a6e4c0d82c423046278c88`.

The commit contains exactly four owned files:

- `D:/codex project/Enlumor/.worktrees/v04-wave-ab/src/main/editing-executor.ts`
- `D:/codex project/Enlumor/.worktrees/v04-wave-ab/tests/editing-executor.test.ts`
- `D:/codex project/Enlumor/.worktrees/v04-wave-ab/tests/helpers/editing-sqlite-store.ts`
- `D:/codex project/Enlumor/.worktrees/v04-wave-ab/docs/acceptance/editing-command-library.md`

Task 1 files are unchanged. No production Workspace/Annotation schema, UI/IPC/preload, dependency, source PDF, userdata or historical screenshot was edited. No model/API/network/release/GitHub work occurred. Controller state/ledger and four-artifact/rollback packaging were not edited or claimed complete by this worker. This report and evidence stay outside the implementation commit for controller packaging.

## Public interfaces and host contract

- `runEditingCommand(input: unknown, host: EditHost, signal: AbortSignal): Promise<EditResult>`.
- `queryEditingReceipt(input: unknown, host: EditHost): Promise<EditResult | null>` is a read-only recovery operation, independent of live reading revision/signal. Missing receipts return null; matching committed receipts retain their original document/fingerprint/operation/version attribution.
- `deriveEditingIds(requestKey, count)` uses standard `node:crypto` SHA256(`${requestKey}:${ordinal}`), prefixed `mark-`. Host allocations must match these deterministic values. No new allocation occurs for an existing durable receipt or non-creation command. Existing IDs and positive tombstones reject new creation.
- `EditResult` uses only read, prepared, confirmation_required, committed, conflict, canceled, unsupported or error. `committed` contains documentId, fingerprint, operationId, receiptId and versions at commit time. Reads, no-op edits and export snapshots are never labeled saved/committed. `export_marked_pdf` has no exporter and returns UNSUPPORTED without a path.
- Shared `CommandContext`, `EditActor`, `EditSnapshot`, `EditEnvironment`, `EditDelta` and prepared payloads are reused. The additional host-side `readSnapshot` and `readOperation` are side-effect-free reads of the same authority, needed to prepare and obtain confirmation before the transaction; their results are re-read/revalidated inside the atomic callback. They do not introduce production storage or duplicate mark/context schemas.
- `EditHost.transaction` is a synchronous generic callback returning only after actual durable commit. `EditTransaction` supplies exactly readSnapshot/readReceipt/readOperation/readConfirmation/writeDeltas/writeHistory/writeReceipt/consumeConfirmation. The adapter isolates the callback and commits immediately on return, without awaits or external work in the gap. All failures must roll back; unknown commit outcomes are classified COMMIT_UNCERTAIN and are never automatically re-executed.
- The test-only SQLite adapter has temporary marks/tombstones/operations/receipts/confirmations tables, actual `BEGIN IMMEDIATE`/COMMIT/ROLLBACK and two real DatabaseSync connections. No transaction test uses a Map as persistence. The in-memory Map inside history planning only indexes a captured mark snapshot.

## Replay, confirmation and commit semantics

Idempotency key binds documentId + fingerprint + trusted actor identity (AI id/session included) + requestId. The separate request digest covers the canonical command and all expected versions, sorts semantic identifier sets, preserves geometry/batch order and excludes reading revision. Therefore a retry after page revision changes or abort can recover a durable receipt before allocation/replanning. A different command under the same key returns REQUEST_ID_REUSED.

The prepared digest remains the Task 1 snapshot/context/dependency/difference digest, not the replay digest. Host-only credentials bind requestKey, trusted actor, full context, digest and before/after deltas. The executor checks an unconsumed persisted credential inside the transaction and consumes it only together with successful marks/versions/history/receipt writes. Changed differences, revision, actor/session, document or consumed credential fail without consuming approval. Model identity/confirmation fields and accessor inputs are rejected.

Every write is prepared first. Under BEGIN IMMEDIATE, the executor re-reads the receipt, validates live context/actor/signal, re-prepares against current snapshot/history, compares the concrete digest (including collection phantom dependencies), verifies confirmation, and atomically writes deltas/tombstones, history, receipt and credential consumption. A final cancel/context/actor check throws through rollback immediately before the callback returns to COMMIT.

Actual successful SQLite COMMIT is the linearization point. Pre-commit abort/context switch rolls back all tables. Post-COMMIT abort/document switch leaves a committed result attributed to its original document. A deliberately lost reply is simulated by throwing COMMIT_UNCERTAIN after a real SQL COMMIT; the executor recovers the durable receipt once without repeating writes. Close/reopen tests independently verify persisted replay. No process-kill or power-failure durability claim is made.

## Targeted history and resolved branch decision

Undo/redo targets only an explicit original edit operation, with document/fingerprint, current versions/tombstones and actor authorization checked. Each adds an audit row retaining its executing actor and targetOperationId. Original operationId, actor and original deltas/inverse content stay intact; target applied/undone state/currentVersions change atomically. Restored contents receive currentVersion+1 rather than historical versions. Other-source edits cause conflict, never overwrite.

A load-bearing ambiguity was escalated and resolved by controller: **the actor who executes undo owns the resulting redo branch**, even when a user undoes an AI-origin group. The target stores redoActor separately from original actor. New edits clear eligibility only for matching trusted redoActor including AI session; other sources' new edits preserve that branch. Two new real-SQLite RED cases failed against original-actor cleanup, then passed after the correction. An additional RED showed AI could otherwise silently redo its own group after user undo; that cross-owner redo now requires bound confirmation. Failure after branch cleanup rolls back eligibility and all new writes.

## Literal TDD / verification evidence

All paths below are rooted at `D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/editing-command-library/`. Files contain actual output, exact command and exit status.

| Evidence | Exact command/input | Literal result | Exit |
| --- | --- | --- | --- |
| TASK2-RED.txt | `npx vitest run tests/editing-executor.test.ts`; executor absent | Cannot find module '../src/main/editing-executor'; 1 failed suite | 1 |
| TASK2-RED-ASSERTIONS.txt | `npx vitest run tests/editing-executor.test.ts`; nonfunctional runtime stub | Tests 31 failed (31); expected 'error' to be 'committed' | 1 |
| TASK2-GREEN-INITIAL.txt | `npx vitest run tests/editing-executor.test.ts`; first real runtime | Tests 2 failed / 29 passed (31) | 1 |
| TASK2-EDGE-INITIAL.txt | `npx vitest run tests/editing-executor.test.ts`; expanded SQL edges | Tests 41 passed (41) | 0 |
| TASK2-BRANCH-RED.txt | `npx vitest run tests/editing-executor.test.ts -t 'redo branch belongs'`; before branch-owner fix | Tests 2 failed / 45 skipped (47); redoActor missing and wrong redoEligible | 1 |
| TASK2-REDO-AUTH-RED.txt | `npx vitest run tests/editing-executor.test.ts -t 'redo authorization'`; before owner protection | Tests 1 failed / 47 skipped (48); expected confirmation_required, received committed | 1 |
| TASK2-BRANCH-GREEN.txt | `npx vitest run tests/editing-executor.test.ts`; owner/authorization correction | Tests 48 passed (48) | 0 |
| TASK2-EXECUTOR-GREEN.txt | `npx vitest run tests/editing-executor.test.ts --reporter verbose --silent=false`; final commit | Test Files 1 passed (1); Tests 59 passed (59) | 0 |
| TASK2-GREEN.txt | `npx vitest run tests/editing-planner.test.ts tests/editing-executor.test.ts`; final commit | Test Files 2 passed (2); Tests 155 passed (155) | 0 |
| TASK2-UNIT.txt | `npm test`; final commit | Test Files 25 passed (25); Tests 416 passed (416) | 0 |
| TASK2-BUILD.txt | `npm run build`; final commit | tsc --noEmit && node scripts/build.mjs; built in 325ms | 0 |
| TASK2-ISOLATION.txt | `npx vitest run tests/editing-executor.test.ts -t 'leaves source PDF unchanged' --reporter verbose --silent=false` | Tests 1 passed / 58 skipped (59); identical source/control-file hashes | 0 |

The initial runtime's two failures were test-fixture mistakes, not weakened assertions: the “new branch” test accidentally supplied an unchanged note (correctly returned prepared/no-op), and the cross-document history fixture returned old-document anchors (correctly rejected). The test now changes content and supplies no wrong-document anchors. Initial tsc inference errors were corrected before final full build. Extra edge/command-matrix tests supplement the original 31 test-first requirements.

The isolation test constructs a one-page PDF with valid catalog/pages/content/xref structure, never passes a PDF writer to the library, and records before/after SHA256 `a1ef8335cade47d55f16958cbb5d118b2a6255f52bdde980af943939822f08f7`. It also asserts an independently created SQLite control file remains byte-identical (`c663f6d1af7d7a412ccee25b88d8c483f92195d8ce9a947a723154c4ca22fc4b`). The evidence contains actual temporary paths; fixtures are closed and removed after tests. This proves selected-store/file isolation, not production PDF parsing/export.

`git diff --cached --check` passed immediately before the exact four-file commit. Earlier new blank lines at EOF in two owned files were removed. Git emitted normal CRLF/LF normalization notices during staging. Full suite shows Node's existing SQLite ExperimentalWarning; build shows the existing >500 kB chunk warning. No dependency, performance threshold or warning setting was altered.

## Self-review, gaps and handoff

Self-reviewed receipt-before-allocation order; stable replay versus concrete confirmation digests; model/host alias isolation; asynchronous source/confirmation cancellation gates; transaction replan/phantoms; actual SQL lock errors; all write-stage rollback; monotonic versions/delete tombstones; user/AI/session authorization; targeted history audits and executor-owned redo branches. Acceptance documentation enumerates parsing/preparation/execution/production connection status for each of the 16 commands, not merely command names. All seven creation types and geometry/placement/anchor/visibility/retention/erase families run against SQLite.

No blocker remains inside Task 2's library/test-host scope. Independent Task2Review and two-task whole-round review remain controller work. Production Workspace migration/import, personal-data backup/recovery, real reader UI/floating layout, shared human/AI entrypoints and actual selected-snapshot PDF export remain later integration gates. Existing historical 261/EXE141 results were neither rerun nor counted as new acceptance. Production adapter durability, receipt-retention quotas and real process/power-loss behavior still need integration design/testing; the fixture retains receipts for its entire database lifetime.

Sources, acceptance document, actual evidence logs and this report were reopened after verification. Controller owns any packaging hashes/diff/VERIFICATION/ROLLBACK artifacts and independent rollback exercise.
