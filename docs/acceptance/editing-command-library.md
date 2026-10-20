# Editing command library — isolated acceptance

## Delivered boundary

This batch implements a Node-side library, not production reader integration. `runEditingCommand(input, host, signal)` uses the shared planner/mark contract; `queryEditingReceipt(input, host)` recovers durable success without changing any state. No window/preload API, production IPC, Workspace/Annotation migration, user database, model call, UI effect, dependency or PDF-writing port is added.

`tests/helpers/editing-sqlite-store.ts` is exclusively a test host. Every test opens a new `node:sqlite` file beneath `mkdtempSync(tmpdir())`. The five temporary tables are marks, tombstones, operations, receipts and confirmations. They are not a second production storage authority. Two independent `DatabaseSync` connections exercise real `BEGIN IMMEDIATE` locking and rollback.

## Per-command capability matrix

“Execute” below means library execution against the real temporary SQLite host, **not** a command registered in the production application. All 16 commands strictly parse and prepare in the shared planner; history preparation in that planner is a typed request resolved by this executor.

| Command | Parsing / preparation | Executor / isolated SQL behavior | Production application |
| --- | --- | --- | --- |
| list_marks | Strict command; sorted cloned marks | `read`; no edit/history/receipt writes | Not connected |
| get_mark | Strict ID; existence check | `read`; no edit/history/receipt writes | Not connected |
| create_mark | Seven validated types; trusted anchors/actor/IDs | All seven types commit mark/version/history/receipt atomically | Not connected |
| update_mark | Color/note whitelist; expected version | Version-checked atomic content/style deltas | Not connected |
| set_mark_geometry | Free note/line/arrow/ink; native crop/path checks | Atomic geometry update; anchored text geometry remains rejected | Not connected |
| set_mark_placement | Note-only bounded display offset | Atomic placement; source quote/quads remain unchanged | Not connected; no floating UI claim |
| replace_mark_anchor | Trusted verified quote/page/quads | Atomic source replacement, including convex skew quads | Not connected |
| delete_marks | Explicit versioned target set | Atomic deletion plus incremented tombstones; undo restores content at a new version | Not connected |
| set_marks_visibility | Explicit boolean independent of retention | Atomic state change; hidden marks stay persisted | Not connected |
| set_marks_retention | Explicit boolean independent of visibility/origin | Atomic state change; retained protected content needs AI confirmation | Not connected |
| erase_ink | Visible whole-stroke intersection, not partial-path cutting | Atomic selected stroke deletion; hidden ink remains | Not connected |
| apply_edit_batch | 1–64 mutations; all validate, no duplicate target | One transaction/history/receipt; any invalid target yields zero writes | Not connected |
| undo_edit | Explicit operationId | Resolves durable edit group; checks all current versions/authorization; writes fresh monotonic versions and audit row | Not connected |
| redo_edit | Explicit operationId | Checks group state, redo eligibility/owner, versions and confirmation; restores forward content at fresh versions | Not connected |
| prepare_mark_export | Explicit origin/ID/hidden selection and captured versions | `prepared` snapshot only; hidden/unretained marks may be selected; no history/receipt or file | Not connected |
| export_marked_pdf | Strict snapshotId request | `unsupported` / `UNSUPPORTED`; no actual exporter, fake path or file | Not connected; real PDF export deferred |

## Result and replay contract

Only side-effecting successfully persisted operations return `committed`, with documentId, fingerprint, operationId, receiptId and changed-object versions **at that commit**. Querying or replaying a receipt returns that original durable fact, not a claim that the current page/object is still at those versions. Reads return `read`; export snapshots and no-op edits return `prepared`, never “saved”. The other statuses are confirmation_required, conflict, canceled, unsupported and error.

Runtime error codes supplement the planner codes: EDIT_CANCELED, CONFIRMATION_REQUIRED, CONFIRMATION_INVALID, REQUEST_ID_REUSED, COMMIT_UNCERTAIN, STORE_BUSY, EDIT_FAILED and UNSUPPORTED. COMMIT_UNCERTAIN is not success or cancellation; the caller may query the receipt, and the executor never automatically re-applies that uncertain operation.

The idempotency key is SHA256(documentId, fingerprint, trusted actor identity including AI session, requestId). A separate stable SHA256 of the canonical command (including all expected object versions) is stored with the receipt. Identifier sets are sorted; batch and geometry order are preserved. Reading-context revision deliberately does not enter that replay digest. An existing matching receipt is checked before context/signal validation, anchor resolution, ID allocation or planning, so revision/page changes and retries after restart do not erase a successful fact. Reusing that key with a different command/expected version returns REQUEST_ID_REUSED.

`queryEditingReceipt` is read-only and returns null if no receipt exists. Old-document receipts preserve original attribution. This library performs no current-view effects; a future UI adapter must compare returned documentId/fingerprint with its live view before applying any visual effects.

## Host, confirmation and atomicity obligations

The host supplies trusted context, actor, bounds, verified anchors, snapshots, operations and confirmation credentials. All source/actor changes invalidate context.revision. Reads, including recovery, have no side effects. A snapshot must be internally consistent. Source geometry and crop offsets remain native PDF values; no source quote/quads come from model input.

`allocateIds(requestKey,count)` returns `deriveEditingIds(requestKey,count)`: ordinal i becomes `mark-` + standard node:crypto SHA256(`${requestKey}:${i}`). Existing marks and positive tombstones reject ID reuse. Receipt retries allocate nothing. Preview and confirmed retries derive identical creation IDs; operation/receipt IDs also derive deterministically from requestKey.

Confirmation is obtained only from host.getConfirmation(binding). The binding includes request key, trusted actor, full context and planner before/after digest/deltas. Unlike replay identity, this prepared digest includes revision, snapshot dependencies and concrete changes. The token refers to a durable unconsumed host credential; the transaction verifies the complete binding. Protected user/other-session/retained marks require confirmation for AI. User-targeted undo of AI groups is allowed; AI undo/redo involving other actors, including a user-owned redo branch, requires confirmation of the actual inverse/forward differences. Model confirmation/ownership fields are rejected.

`host.transaction` is a single synchronous callback boundary: BEGIN IMMEDIATE (or equivalent isolation), re-read receipt/snapshot/history/confirmation, replan and compare the prepared digest to reject object changes and collection phantoms, write deltas/versions/tombstones/history/receipt, consume credential, final cancel/context/actor check, then immediately COMMIT. Any throw rolls everything back, including credential consumption and redo eligibility. There is no await or external callback between returning from the body and the host's actual COMMIT. Host adapters must classify unknown commit outcomes as COMMIT_UNCERTAIN and must not replay writes internally.

The successful durable COMMIT is the linearization point. Before it, cancellation/context changes roll back all writes. After it, late abort/page/document changes preserve committed success, even if the transaction reply is lost. On a thrown transaction outcome, the executor consults the persisted receipt once; a matching success is returned without running the operation again.

## Targeted history and branch ownership

An edit group's original operationId, actor, forward deltas and inverse content remain stored. Each undo/redo adds its own audit row identifying the executing actor, action and targetOperationId, and changes the target group's applied/undone state and expected current versions. All restores increment versions; delete/restore uses tombstones, so neither undo nor ID recreation silently reintroduces an old version (ABA).

The actor who **executes undo** owns that resulting redo branch (`redoActor`); original group provenance does not change. A new edit clears only undone redo eligibility belonging to its current trusted actor/session. Thus a user undoing an AI group followed by a new user edit clears that user's redo; an unrelated AI edit does not. Another source modifying a target causes undo/redo version conflict rather than overwriting its content. History write failures leave target state and branch eligibility unchanged.

## Verification and remaining gates

Executor tests assert actual SQL row counts, mark/tombstone versions, history state, receipts and consumed flags, rather than only mocked port calls. Coverage includes all command families, seven creation types, two competing executors/connections, real lock contention, each write-stage failure, durable close/reopen, lost reply after COMMIT, request reuse, source/actor/confirmation binding, before/after-commit cancellation, collection phantoms, source PDF/control-database hash isolation and targeted cross-origin redo branches.

Run from `D:/codex project/Enlumor/.worktrees/v04-wave-ab`:

```powershell
npx vitest run tests/editing-planner.test.ts tests/editing-executor.test.ts
npm test
npm run build
```

Actual RED/GREEN/unit/build output and exit statuses live in `evidence/editing-command-library/TASK2-*.txt`; the Task 2 report records exact counts. The isolated source PDF test hashes a generated one-page PDF before and after and also verifies an independent control SQLite file remains byte-identical. That proves file isolation, not production PDF rendering/export.

Production Workspace migration, personal-data backups/recovery, importing legacy annotations, real reader display, floating layout, shared human/AI entrypoints and selected-snapshot PDF export remain later integration gates. This batch does not repeat or reclassify historical reader/EXE acceptance as new tests, and does not claim the complete editing product is launched.
