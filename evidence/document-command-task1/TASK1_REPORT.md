# Task 1 executor report

Status: implemented and committed; fresh independent review pending with parent. Task 2 remains NOT STARTED.

- Worktree: `D:/codex project/Enlumor/.worktrees/v04-wave-ab`
- Base: `1c0179091940e8b55c4701dd1ee552df18998d43`
- Commit: `653acb4aff2a5bce07a9c457e6248834a1f89b80`
- Commit command: `git -c user.name=Codex -c user.email=codex@local commit -m "feat: add validated document command contracts and executor"`
- Literal commit result: `[feat/v04-wave-ab 653acb4] feat: add validated document command contracts and executor`; `3 files changed, 353 insertions(+)`; exit 0.

## Only committed files

1. `D:/codex project/Enlumor/.worktrees/v04-wave-ab/src/shared/document-commands.ts` — new finite contracts (five commands, host ports, fixed result/error union).
2. `D:/codex project/Enlumor/.worktrees/v04-wave-ab/src/renderer/reading-commands.ts` — strict unknown-input parsing and cancellable executor; original synchronous executeReadingCommand prefix unchanged.
3. `D:/codex project/Enlumor/.worktrees/v04-wave-ab/tests/document-commands.test.ts` — 95 new tests.

No applicable AGENTS.md found in workspace/project/worktree ancestry or src/tests. Read Task 1 brief, progress, design, TDD, writing-good-tests and verification skills. No new dependencies, command bus, model/API requests, credentials, IPC, DB, UI or actual PdfReader ports. Parent-owned docs/evidence/.gitattributes/rollback script were not staged.

## Behavior

- Exactly one whitelisted command per request; exact own keys at request/context/command levels (including symbol extras); strict nonempty bounded identifiers, SHA256 hex, safe revisions and integer page indexes. Invalid values produce COMMAND_INVALID before host access. Integer page boundary failures produce PAGE_OUT_OF_RANGE. Unusable request IDs correlate as empty string; usable IDs survive invalid other fields.
- Inputs snapshot their validated primitive values once; caller mutation or changing getters cannot retarget a pending operation. Returned/read/focused blocks snapshot native geometry.
- readPage output is runtime-checked, not trusted because typed: document/hash/requested page, passage ID length/nonblank/duplicates, quote and existing validateAnnotation page/geometry checks. Dense snapshot iteration rejects sparse arrays/quad coordinates missed by .some. Malformed host blocks produce COMMAND_FAILED for both read_page and show_evidence. Missing requested valid evidence produces EVIDENCE_NOT_FOUND. Models never supply geometry.
- Abort/source checks precede operations and follow each await. navigate/focus receive live fail-closed isCurrent callbacks for the adapter's actual effect boundary. Async rejection is classified canceled/stale if context changed, not by arbitrary host error text/code. Throwing host accessors yield fixed COMMAND_FAILED.
- Pause checks before its action but records actual completed paused result even if pause itself increments host revision or aborts the old signal. clear/pause do not read pages, navigate, or touch annotations.
- Existing executeReadingCommand preserved unchanged, confirmed by full prefix comparison against base plus 15 unchanged legacy tests.

## Actual TDD and verification

All commands ran from the worktree above, with no external input beyond deterministic fixtures. Raw stdout/stderr is saved in the named log, with literal EXIT appended.

| Command | Literal result | Exit | Raw log under evidence/document-command-task1 |
| --- | --- | --- | --- |
| `npx vitest run tests/document-commands.test.ts` (initial missing executor) | `Test Files  1 failed (1)` / `Tests  87 failed (87)` / `TypeError: runDocumentCommand is not a function` | 1 | TASK1-RED.txt |
| `npx vitest run tests/document-commands.test.ts tests/reading-commands.test.ts` (initial implementation) | `Test Files  2 passed (2)` / `Tests  102 passed (102)` | 0 | TASK1-GREEN.txt |
| `npx vitest run tests/document-commands.test.ts` (getter regression RED) | `Test Files  1 failed (1)` / `Tests  3 failed | 92 passed (95)` | 1 | TASK1-GETTER-RED.txt |
| `npx vitest run tests/document-commands.test.ts tests/reading-commands.test.ts` (snapshot fix) | `Test Files  2 passed (2)` / `Tests  110 passed (110)` | 0 | TASK1-FINAL-FOCUSED.txt |
| `npm test` (full suite, once) | `Test Files  23 passed (23)` / `Tests  250 passed (250)` | 0 | TASK1-FULL-UNIT.txt |
| `npm run build` (once) | `> tsc --noEmit && node scripts/build.mjs` / `✓ 36 modules transformed.` / `✓ built in 381ms` | 0 | TASK1-BUILD.txt |

Getter regression root cause: parser/host-block checker reread accessor properties after validation, allowing request identity, page and document source changes. Three independently observed RED failures covered this; fix only captures primitives once before validation/execution. Initial malformed-host fixture table row wrapping was corrected so arrays remain array values rather than Vitest argument rows.

Full test run emits Node's experimental SQLite warning (same as parent baseline). Build emits Vite's existing >500kB chunk-size advisory. Neither command failed; warnings were not hidden or thresholds changed. `git diff --cached --check` initially found a new trailing blank line in the test file; removed that whitespace-only EOF line, reran the check successfully, then committed. No executable content changed after full-suite/build verification.

Legacy check exact script semantics: Python subprocess reads `git show 1c0179091940e8b55c4701dd1ee552df18998d43:src/renderer/reading-commands.ts`, normalizes CRLF, asserts current source starts with that entire original source. Literal output: `Legacy executeReadingCommand prefix unchanged from base 1c0179091940e8b55c4701dd1ee552df18998d43: PASS`; exit 0; TASK1-LEGACY-COMPATIBILITY.txt.

## Remaining boundaries / risks

- These are deterministic executor/port tests, not actual reading-frame navigation integration. Task 2 must provide real ports, monotonic host revision updates and isCurrent checks immediately at deferred effects.
- Abort prevents late effects/results after host promises settle; readPage has no AbortSignal port and is not forcibly interrupted.
- Port methods must honor their guard before the real effect. Executor does not invent transactional rollback for a host that effects and then throws.
- Fresh review and parent-owned rollback-copy verification remain with parent. No rollback claim is made here; committed executor remains changed.
- No EXE build, release, push, model call or Task 2 work ran.
