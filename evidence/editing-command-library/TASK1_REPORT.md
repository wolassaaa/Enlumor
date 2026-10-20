# Task 1 implementation report

## Status and scope

Implemented Task 1 only; ready for independent review. Commit `7ce6598adc545911a8d14e658f98554b40287329` (`feat: add editing command contracts and pure mark planning`). Base was `261e483139562ec1b41c54cb3d7b24947c7e2c0d`. The commit contains exactly the four assigned files:

- `D:/codex project/Enlumor/.worktrees/v04-wave-ab/src/shared/editing-commands.ts`
- `D:/codex project/Enlumor/.worktrees/v04-wave-ab/src/shared/editing-marks.ts`
- `D:/codex project/Enlumor/.worktrees/v04-wave-ab/src/shared/editing-planner.ts`
- `D:/codex project/Enlumor/.worktrees/v04-wave-ab/tests/editing-planner.test.ts`

No production UI, old Annotation/model/Workspace schema, original PDF, userdata, dependencies, or historical dirty screenshots were edited. No model/network/release/GitHub calls were made. Controller-owned state/ledger/evidence packaging/rollback were not edited or claimed as this implementation's work. Evidence and this report remain outside the implementation commit for controller packaging.

## Implementation/spec coverage

- Reuses CommandContext; defines seven-type EditMark, trusted EditActor, verified source anchors, environment, snapshots/tombstone versions, exact command union and discriminated prepared results.
- Validates each root by recursively inspecting own property descriptors before reading cloned data. Rejects getters without invoking them, custom prototypes, symbol/extra fields, sparse arrays, cycles/aliased mutable references, undefined/nonfinite values and oversized arrays. Host snapshots/anchors/bounds/actor/IDs receive the same cloning and validation treatment.
- Checks SHA256 fingerprint format, nonempty bounded identifiers, safe versions, color and text limits, canonical native geometry, path/endpoints, nondegeneracy and crop bounds including negative offsets. Note placement shifts presentation geometry only and stays inside page bounds. Text source content only comes from the verified anchor map.
- Implements list/get; seven-type create; color/note update; free geometry/endpoints; note placement; source-anchor replacement; deletion/visibility/retention; visible whole-ink erasing with the existing pure `strokeIntersectsEraser` helper and identity transform; 1–64-operation atomic planning; owned history requests; explicit versioned export snapshots; explicit export requests.
- No planner success is named committed. Every mutation has versioned before/after plus reversed inverse content. No-op mutations produce an empty delta array, without losing version dependencies or duplicate-target conflict detection.
- Trusted AI can prepare edits to current-session own unretained marks without confirmation. Changed protected user/other-session/retained marks set requiresConfirmation. Model confirmation/ownership fields are rejected. The executor must enforce/consume actual confirmation credentials; planning does not authorize persistence.
- Canonical digest sorts object keys and normalized identifier sets, preserves operation/geometry order, includes actor, context, normalized command, all captured version dependencies and branch payload. Export marks are sorted pageIndex/id. Digest includes no request timestamp or temporary path. Different request IDs with identical semantic content do not alter the content digest.
- Output clones are independent of inputs, and independent of each other across before/after/inverse/read/export fields.

## Downstream interfaces and required interpretation

`prepareEdit(input: unknown, snapshot: EditSnapshot, env: EditEnvironment): PreparedEdit` is synchronous and has no storage or UI side effects. Its success base contains `requestId`, `context`, `actor`, normalized `command`, `digest`, `dependencies: Record<string, number>`, and `requiresConfirmation`.

| kind | exclusive branch payload | meaning |
| --- | --- | --- |
| read | `read: EditMark | EditMark[]` | get versus list; no write/history |
| prepared | `deltas: EditDelta[]`, `inverse: EditDelta[]` | proposed changes only |
| history | `history: {type: 'undo_edit'|'redo_edit'; operationId}` | executor resolves persistent history/authorization |
| export_snapshot | `exportSnapshot: {context,marks,versions,digest}` | deep-copied selected versions, no actual PDF |
| export_request | `exportRequest: {snapshotId}` | actual export port still required |

Each delta is `{id,expectedVersion,before,after}`. Forward `after.version` is expectedVersion+1. Inverse entries are reversed, swap before/after contents, and set expectedVersion to forward expectedVersion+1. Their restoration content deliberately retains historical content versions; the executor must assign a fresh monotonically increasing version, never blindly persist an inverse `after.version`. Deletes need tombstone increment even though `after=null`. Missing and explicit zero versions both mean never created; positive tombstones reject new-ID reuse. MAX_SAFE_INTEGER is valid for reads, but changing it returns VERSION_CONFLICT rather than overflowing.

Dependencies contain targets even for no-op edits; erasing also captures hidden/non-hit page ink versions; exports capture candidates participating in filtering. Newly appearing objects require transaction-level snapshot/replanning checks: a per-object record alone is not a complete collection phantom guard. Task 2 must compare/reprepare under the atomic host transaction and consult durable receipts before allocation/replanning, as already specified in its own brief.

Creation IDs are taken in operation order from trusted newIds. The host must allocate sufficient IDs, deterministically reuse them for the same request during confirmation, and look up persistent receipts before allocating on retries. The planner does not allocate or persist IDs. A batch repeating a target fails BATCH_CONFLICT even if the first edit was a no-op or the second version mismatches.

`canonicalDigest` is exported for trusted normalized JSON data only; raw model input must go through `prepareEdit`'s descriptor-based parser, not directly into this serialization helper. Per explicit controller ruling, hashing uses synchronous standard `node:crypto.createHash`; this is a Node-side library stage with no DOM/Electron dependency, not a browser-compatible module. A future renderer adapter requires its own integration decision. Existing geometry.ts exports inspected before reuse are pure math; no old validators were loosened.

## TDD and literal command results

All evidence files are in `D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/editing-command-library/` and contain the actual command output plus explicit exit status:

| evidence file | command/input | literal result | exit |
| --- | --- | --- | --- |
| BASELINE.txt (existing controller evidence, not rerun here) | npm test at base | 261 passed | 0 |
| TASK1-RED.txt | npx vitest run tests/editing-planner.test.ts; no implementation files | Cannot find module '../src/shared/editing-planner'; 1 failed suite | 1 |
| TASK1-RED-ASSERTIONS.txt | same command; typed contracts + nonfunctional planner stub before implementation | 38 failed / 26 passed (64); expected false to be true | 1 |
| TASK1-EDGE-RED.txt | same command; independent duplicate-target patches before lookup correction | expected BATCH_CONFLICT, received VERSION_CONFLICT; 1 failed / 78 passed (79) | 1 |
| TASK1-VERSION-RED.txt | same command; MAX_SAFE_INTEGER read before boundary correction | expected kind read/ok true, received ok false; 1 failed / 79 passed (80) | 1 |
| TASK1-ZERO-RED.txt | same command; explicit never-created version 0 before allocator correction | expected false to be true; 1 failed / 80 passed (81) | 1 |
| TASK1-GREEN.txt | npx vitest run tests/editing-planner.test.ts; final four files | Test Files 1 passed (1); Tests 81 passed (81) | 0 |
| TASK1-UNIT.txt | npm test; final four files | Test Files 24 passed (24); Tests 342 passed (342) | 0 |
| TASK1-BUILD.txt | npm run build; final four files | tsc --noEmit && node scripts/build.mjs; built in 315ms | 0 |

`git diff --cached --check` returned exit 0 immediately before the exact four-file commit. A prior whole-tree `git diff --check` reported controller-owned `docs/WAVE_A_TASKS.md:83: new blank line at EOF`; it was not changed by this worker and was not staged. Later per-owned-file checks emitted no whitespace errors. These facts are distinct from the unit/build results.

## Self-review and concerns

- Checked all 16 command branches, seven create/style families, geometry versus anchor semantics, inverse source/retention/visibility preservation, caller/result alias isolation, strict host/model validation and confirmation flag derivation. Added test-first fixes for repeated target precedence, safe integer saturation and explicit zero versions.
- Existing warnings remain visible: full suite emits Node's SQLite ExperimentalWarning; application build emits the existing >500kB chunk warning. No tests fail, and no warning threshold was changed.
- Geometry representation deliberately remains canonical axis-aligned native quads, matching current screenRectToQuad/lineAnchor output; arbitrary skewed/rotated text quadrilaterals need a separate supported representation decision rather than quietly relying on old rectangular endpoint math.
- Placement is implemented only for notes and validated against translated quads; no floating-highlight/PDF-placement claim is made.
- Snapshot history, durable receipts/confirmation, concurrency and actual export remain executor/host responsibilities. This task does not claim persistence, PDF export, production registration, renderer migration, or completed product integration.
- Independent review is still required before Task 2. No blockers found within Task 1's agreed scope.

## Review fix round 1 — source quadrilaterals (P2)

**Review finding verified and fixed.** The initial axis-aligned-only validation was an implementation narrowing, not part of the approved source contract. This section supersedes the earlier canonical-rectangle rationale/concern for source geometry. Native PDF coordinates do not require axis-aligned text.

Base: `7ce6598adc545911a8d14e658f98554b40287329`. Fix commit: `5b0fd287006ce335b3a6e4c0d82c423046278c88` (`fix: preserve verified source quadrilaterals in edit planning`). Commit changes exactly `D:/codex project/Enlumor/.worktrees/v04-wave-ab/src/shared/editing-marks.ts` and `D:/codex project/Enlumor/.worktrees/v04-wave-ab/tests/editing-planner.test.ts`.

The validator now checks source/note quadrilateral strict convexity/nondegeneracy using PDF vertex perimeter order `[0,2,6,4]`, accepting either orientation without changing any source coordinate. Finite-coordinate and trusted page-bound checks remain intact. Path marks keep their rectangular bounding-quads restriction because endpoint containment uses that representation. No model geometry editing path was enabled for anchored marks; quote/page/quads still come only from verified anchors on creation/replacement.

Tests use literal skew quad `[0,20,30,25,0,2,30,7]`: creation and source replacement for all four anchor-capable types; list/get of an existing skewed mark; an unrelated read with an unused skewed trusted anchor; no input/result alias; rejection of geometry edits on anchored marks. Degenerate collinear, self-crossing, concave and out-of-page source examples remain rejected. Existing arrow/path skew-rejection tests still pass.

Exact commands and literal result summaries (complete actual output and exit status in `D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/editing-command-library/`):

| evidence | command/input | literal result | exit |
| --- | --- | --- | --- |
| TASK1-FIX1-RED.txt | npx vitest run tests/editing-planner.test.ts; skew regressions before fix | Tests 11 failed / 85 passed (96); valid source create/read/replacement returned ok false | 1 |
| TASK1-FIX1-GREEN.txt | npx vitest run tests/editing-planner.test.ts; after source-quad fix | Test Files 1 passed (1); Tests 96 passed (96) | 0 |
| TASK1-FIX1-UNIT.txt | npm test; after source-quad fix | Test Files 24 passed (24); Tests 357 passed (357) | 0 |
| TASK1-FIX1-BUILD.txt | npm run build; includes tsc --noEmit | built in 343ms | 0 |

`git diff --cached --check` returned exit 0 before committing exactly the two changed owned files. Source and evidence were reopened after verification. The known SQLite ExperimentalWarning and >500kB build-chunk warning remain disclosed; neither performance settings nor warnings were suppressed. No state/ledger/production/schema/data/dependency files were changed. P2 is addressed pending independent re-review; P3 remains existing nonblocking tooling noise.
